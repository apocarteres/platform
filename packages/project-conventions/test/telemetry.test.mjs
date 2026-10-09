import assert from 'node:assert/strict';
import test from 'node:test';
import os from 'node:os';
import path from 'node:path';
import { createServer } from 'node:http';
import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { alertRules, checkTelemetry, findTelemetryProblems, telemetry } from '../lib/telemetry.mjs';

const run = promisify(execFile);
const cli = path.join(path.dirname(path.dirname(fileURLToPath(import.meta.url))), 'bin', 'conventions.mjs');

// REQ-TELEMETRY-002, REQ-TELEMETRY-003
async function observation({ up = {}, logs = {}, refuseLoki = false } = {}) {
  const asked = [];
  const server = createServer((request, response) => {
    const url = new URL(request.url, 'http://observation');
    const query = url.searchParams.get('query') ?? '';
    asked.push(`${url.pathname} ${query}`);
    const node = /node="([^"]+)"/.exec(query)?.[1];
    const vector = (result) => {
      response.writeHead(200, { 'content-type': 'application/json' });
      response.end(JSON.stringify({ status: 'success', data: { resultType: 'vector', result } }));
    };
    if (url.pathname === '/prometheus/api/v1/query') {
      vector(node in up ? [{ metric: { node }, value: [1, String(up[node])] }] : []);
      return;
    }
    if (url.pathname === '/loki/loki/api/v1/query') {
      if (refuseLoki) {
        response.writeHead(403).end('forbidden');
        return;
      }
      vector(node in logs && logs[node] > 0 ? [{ metric: { node }, value: [1, String(logs[node])] }] : []);
      return;
    }
    response.writeHead(404).end();
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  return {
    prometheus: `${base}/prometheus`,
    loki: `${base}/loki`,
    asked,
    stop: () => new Promise((resolve) => server.close(resolve)),
  };
}

function declared(where, extra = {}) {
  return { telemetry: { nodes: ['ledger-1', 'ledger-2'], prometheus: where.prometheus, loki: where.loki, ...extra } };
}

// REQ-TELEMETRY-001
test('без раздела молчит, полное объявление принимается, журнал по умолчанию свежее часа', () => {
  assert.deepEqual(telemetry({}), { declared: false, nodes: [], problems: [] });
  const section = telemetry(declared({ prometheus: 'https://metrics.example.test', loki: 'https://logs.example.test' }));
  assert.deepEqual(section.problems, []);
  assert.deepEqual(section.nodes, ['ledger-1', 'ledger-2']);
  assert.equal(section.logsWithin, 60 * 60 * 1000);
});

// REQ-TELEMETRY-001
test('объявление называет каждый изъян', async () => {
  const problems = telemetry({ telemetry: {
    nodes: ['Ledger', 'a', 'a'], prometheus: 'metrics.example.test', loki: 'ftp://logs', logsWithin: 'hourly', token: 'x', extra: 1,
  } }).problems;
  for (const expected of [/имя узла «Ledger»/, /узел a объявлен дважды/, /prometheus — адрес http/, /loki — адрес http/,
    /logsWithin — срок/, /token похоже на учётные данные/, /неизвестное поле extra/]) {
    assert.ok(problems.some((problem) => expected.test(problem)), `${expected}: ${problems.join('; ')}`);
  }
  assert.match(telemetry({ telemetry: { prometheus: 'https://m', loki: 'https://l' } }).problems[0], /узлы не объявлены/);

  const root = await mkdtemp(path.join(os.tmpdir(), 'telemetry-'));
  try {
    await writeFile(path.join(root, '.conventions.json'), '{\n  "sources": ["src"],\n  "telemetry": { "nodes": [] }\n}\n');
    const found = await findTelemetryProblems(root, { telemetry: { nodes: [] } });
    assert.equal(found.get('.conventions.json')[0].line, 3);
    assert.equal((await findTelemetryProblems(root, {})).size, 0, 'без раздела правило молчит');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

// REQ-TELEMETRY-002, REQ-TELEMETRY-003
test('проверка: каждый узел отвечает в Prometheus и пишет в Loki; молчащий узел назван', async () => {
  const where = await observation({ up: { 'ledger-1': 1, 'ledger-2': 0 }, logs: { 'ledger-1': 12 } });
  try {
    const healthy = await checkTelemetry(telemetry(declared(where, { nodes: ['ledger-1'] })));
    assert.deepEqual(healthy, []);
    assert.ok(where.asked.includes('/prometheus/api/v1/query up{node="ledger-1"}'), where.asked.join('\n'));
    assert.ok(where.asked.includes('/loki/loki/api/v1/query count_over_time({node="ledger-1"}[60m])'), where.asked.join('\n'));

    const problems = await checkTelemetry(telemetry(declared(where, { nodes: ['ledger-1', 'ledger-2', 'ledger-3'] })));
    assert.deepEqual(problems, [
      'узел ledger-2: Prometheus опрашивает его, но узел не отвечает (up = 0)',
      'узел ledger-2: в Loki нет его журнала за последние 60 мин',
      'узел ledger-3: Prometheus его не опрашивает — цели с меткой node="ledger-3" нет',
      'узел ledger-3: в Loki нет его журнала за последние 60 мин',
    ]);
  } finally {
    await where.stop();
  }
});

// REQ-TELEMETRY-003
test('недоступный приёмник называется адресом, а не превращается в молчание узлов', async () => {
  const where = await observation({ up: { 'ledger-1': 1 }, logs: { 'ledger-1': 3 }, refuseLoki: true });
  try {
    const problems = await checkTelemetry(telemetry(declared(where, { nodes: ['ledger-1'] })));
    assert.equal(problems.length, 1, problems.join('\n'));
    assert.match(problems[0], new RegExp(`Loki ${where.loki.replace(/[.]/g, '\\.')} не ответил: HTTP 403`));
  } finally {
    await where.stop();
  }
});

// REQ-TELEMETRY-004
test('правила оповещений строятся из объявления: узел не отвечает и узел молчит в журнале', () => {
  const section = telemetry(declared({ prometheus: 'https://m.example.test', loki: 'https://l.example.test' }, { logsWithin: '2h' }));
  const metrics = alertRules(section, 'prometheus');
  assert.match(metrics, /^groups:\n {2}- name: telemetry-nodes\n/);
  assert.match(metrics, /alert: TelemetryNodeDown\n\s+expr: up\{node=~"ledger-1\|ledger-2"\} == 0/);
  assert.match(metrics, /alert: TelemetryNodeAbsent\n\s+expr: absent\(up\{node="ledger-2"\}\)/);
  const logs = alertRules(section, 'loki');
  assert.match(logs, /alert: TelemetryNodeSilent\n\s+expr: absent_over_time\(\{node="ledger-1"\}\[120m\]\)/);
  assert.match(logs, /absent_over_time\(\{node="ledger-2"\}\[120m\]\)/);
  assert.equal(alertRules(section, 'grafana'), null);
});

async function conventions(root, ...args) {
  try {
    const { stdout, stderr } = await run(process.execPath, [cli, 'telemetry', ...args, '--root', root]);
    return { code: 0, output: `${stdout}${stderr}` };
  } catch (error) {
    return { code: error.code, output: `${error.stdout}${error.stderr}` };
  }
}

// REQ-TELEMETRY-003, REQ-TELEMETRY-004
test('команда: проверка отказывает с перечнем, правила печатаются, без объявления — отказ', async () => {
  const where = await observation({ up: { 'ledger-1': 1 }, logs: { 'ledger-1': 1 } });
  const root = await mkdtemp(path.join(os.tmpdir(), 'telemetry-'));
  try {
    assert.match((await conventions(root, '--check')).output, /Узлы не объявлены: добавьте раздел telemetry/);
    await writeFile(path.join(root, '.conventions.json'), JSON.stringify(declared(where)));
    const failed = await conventions(root, '--check');
    assert.equal(failed.code, 1, failed.output);
    assert.match(failed.output, /узел ledger-2: Prometheus его не опрашивает/);
    await writeFile(path.join(root, '.conventions.json'), JSON.stringify(declared(where, { nodes: ['ledger-1'] })));
    const passed = await conventions(root, '--check');
    assert.equal(passed.code, 0, passed.output);
    assert.match(passed.output, /Узлы видны: 1/);
    const rules = await conventions(root, '--alerts', 'loki');
    assert.equal(rules.code, 0, rules.output);
    assert.match(rules.output, /TelemetryNodeSilent/);
    assert.equal((await conventions(root, '--alerts', 'grafana')).code, 2);
    assert.equal((await conventions(root)).code, 2, 'действие не названо');
  } finally {
    await where.stop();
    await rm(root, { recursive: true, force: true });
  }
});

// REQ-TELEMETRY-006
test('обязательство telemetry объявлено на 3 выпуска, ссылается на требование и объявляет раздел', async () => {
  const catalogue = JSON.parse(await readFile(new URL('../obligations.json', import.meta.url), 'utf8'));
  const found = catalogue.obligations.find((one) => one.id === 'telemetry');
  assert.equal(found.requirement, 'REQ-TELEMETRY-006');
  assert.equal(found.dueReleases, 3);
  assert.equal(found.declares, 'telemetry');
});

// REQ-TELEMETRY-004
test('правило на узел несёт метку node: promtool не видит дублей, оповещения различимы по меткам', () => {
  const section = telemetry(declared({ prometheus: 'https://m.example.test', loki: 'https://l.example.test' }));
  const identities = (text) => [...text.matchAll(/- alert: (\S+)\n(?:\s+(?:expr|for): .*\n)*\s+labels: (\{[^}]*\})/g)]
    .map((match) => `${match[1]} ${match[2]}`);
  for (const kind of ['prometheus', 'loki']) {
    const found = identities(alertRules(section, kind));
    assert.equal(new Set(found).size, found.length, `${kind}: правила с одинаковым именем и метками\n${found.join('\n')}`);
  }
  assert.match(alertRules(section, 'prometheus'), /expr: absent\(up\{node="ledger-2"\}\)\n\s+for: 5m\n\s+labels: \{ severity: critical, node: "ledger-2" \}/);
  assert.match(alertRules(section, 'loki'), /labels: \{ severity: warning, node: "ledger-1" \}/);
});
