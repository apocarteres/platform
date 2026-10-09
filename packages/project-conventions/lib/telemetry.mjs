import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { CONFIG_FILE } from './config.mjs';
import { durationOf } from './backups.mjs';

// REQ-TELEMETRY-001
const SECTION_FIELDS = new Set(['nodes', 'prometheus', 'loki', 'logsWithin']);

// REQ-TELEMETRY-001
const CREDENTIAL = /pass|secret|token|key|user|login|credential/i;

// REQ-TELEMETRY-001
export const LOGS_WITHIN = '1h';

// REQ-TELEMETRY-003
const TIMEOUT_MS = 10000;

const NAME = /^[a-z][a-z0-9-]*$/;
const ADDRESS = /^https?:\/\/\S+$/;
const MINUTE = 60 * 1000;

// REQ-TELEMETRY-001
export function telemetry(config) {
  const declared = config.telemetry ?? null;
  if (declared === null) return { declared: false, nodes: [], problems: [] };
  const problems = [];
  for (const field of Object.keys(declared)) {
    if (SECTION_FIELDS.has(field)) continue;
    problems.push(CREDENTIAL.test(field)
      ? `раздел telemetry: поле ${field} похоже на учётные данные — они приходят из окружения, а не из репозитория`
      : `раздел telemetry: неизвестное поле ${field}; поля — ${[...SECTION_FIELDS].join(', ')}`);
  }
  const nodes = Array.isArray(declared.nodes) ? declared.nodes : [];
  if (nodes.length === 0) problems.push('раздел telemetry: узлы не объявлены — перечислите их в nodes');
  const seen = new Set();
  for (const node of nodes) {
    if (typeof node !== 'string' || !NAME.test(node)) problems.push(`имя узла «${node}»: строчные буквы, цифры и дефис`);
    else if (seen.has(node)) problems.push(`узел ${node} объявлен дважды`);
    seen.add(node);
  }
  for (const receiver of ['prometheus', 'loki']) {
    if (typeof declared[receiver] !== 'string' || !ADDRESS.test(declared[receiver])) {
      problems.push(`раздел telemetry: ${receiver} — адрес http или https`);
    }
  }
  const logsWithin = durationOf(declared.logsWithin ?? LOGS_WITHIN);
  if (logsWithin === null) problems.push('раздел telemetry: logsWithin — срок вида 1h или 30m');
  return {
    declared: true,
    nodes: [...seen].filter((node) => typeof node === 'string'),
    prometheus: declared.prometheus,
    loki: declared.loki,
    logsWithin,
    problems,
  };
}

async function lineOfTheSection(root) {
  try {
    const lines = (await readFile(path.join(root, CONFIG_FILE), 'utf8')).split('\n');
    const found = lines.findIndex((line) => line.includes('"telemetry"'));
    return found === -1 ? 1 : found + 1;
  } catch {
    return 1;
  }
}

// REQ-TELEMETRY-001
export async function findTelemetryProblems(root, config) {
  const { declared, problems } = telemetry(config);
  if (!declared || problems.length === 0) return new Map();
  const line = await lineOfTheSection(root);
  return new Map([[CONFIG_FILE, problems.map((text) => ({ line, text }))]]);
}

// REQ-TELEMETRY-003
async function vector(name, base, path, query) {
  const url = `${base.replace(/\/+$/, '')}${path}?query=${encodeURIComponent(query)}`;
  let response;
  try {
    response = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
  } catch (failure) {
    return { refused: `${name} ${base} не ответил: ${failure.cause?.code ?? failure.message}` };
  }
  if (!response.ok) return { refused: `${name} ${base} не ответил: HTTP ${response.status}` };
  try {
    const body = await response.json();
    if (body?.status !== 'success' || !Array.isArray(body?.data?.result)) throw new Error('не вектор');
    return { result: body.data.result };
  } catch {
    return { refused: `${name} ${base} ответил не результатом запроса` };
  }
}

const minutes = (milliseconds) => `${Math.round(milliseconds / MINUTE)}m`;

// REQ-TELEMETRY-002, REQ-TELEMETRY-003
export async function checkTelemetry(section) {
  const problems = [];
  const refused = new Set();
  for (const node of section.nodes) {
    if (!refused.has('prometheus')) {
      const metrics = await vector('Prometheus', section.prometheus, '/api/v1/query', `up{node="${node}"}`);
      if (metrics.refused) {
        problems.push(metrics.refused);
        refused.add('prometheus');
      } else if (metrics.result.length === 0) {
        problems.push(`узел ${node}: Prometheus его не опрашивает — цели с меткой node="${node}" нет`);
      } else if (!metrics.result.some((sample) => sample.value?.[1] === '1')) {
        problems.push(`узел ${node}: Prometheus опрашивает его, но узел не отвечает (up = 0)`);
      }
    }
    if (!refused.has('loki')) {
      const window = minutes(section.logsWithin);
      const logs = await vector('Loki', section.loki, '/loki/api/v1/query', `count_over_time({node="${node}"}[${window}])`);
      if (logs.refused) {
        problems.push(logs.refused);
        refused.add('loki');
      } else if (!logs.result.some((sample) => Number(sample.value?.[1]) > 0)) {
        problems.push(`узел ${node}: в Loki нет его журнала за последние ${Math.round(section.logsWithin / MINUTE)} мин`);
      }
    }
  }
  return problems;
}

// REQ-TELEMETRY-004
export function alertRules(section, kind) {
  if (kind === 'prometheus') {
    const absent = section.nodes.map((node) => [
      '      - alert: TelemetryNodeAbsent',
      `        expr: absent(up{node="${node}"})`,
      '        for: 5m',
      `        labels: { severity: critical, node: "${node}" }`,
      `        annotations: { summary: "Узел ${node} пропал из опроса Prometheus" }`,
    ].join('\n'));
    return [
      'groups:',
      '  - name: telemetry-nodes',
      '    rules:',
      '      - alert: TelemetryNodeDown',
      `        expr: up{node=~"${section.nodes.join('|')}"} == 0`,
      '        for: 5m',
      '        labels: { severity: critical }',
      '        annotations: { summary: "Узел {{ $labels.node }} не отвечает" }',
      ...absent,
      '',
    ].join('\n');
  }
  if (kind === 'loki') {
    const window = minutes(section.logsWithin);
    const silent = section.nodes.map((node) => [
      '      - alert: TelemetryNodeSilent',
      `        expr: absent_over_time({node="${node}"}[${window}])`,
      `        labels: { severity: warning, node: "${node}" }`,
      `        annotations: { summary: "Узел ${node} не пишет журнал дольше ${window}" }`,
    ].join('\n'));
    return ['groups:', '  - name: telemetry-logs', '    rules:', ...silent, ''].join('\n');
  }
  return null;
}
