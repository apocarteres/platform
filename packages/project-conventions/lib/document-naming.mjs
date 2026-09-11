import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { parseFrontMatter } from './docs/ticket-model.mjs';

// REQ-NAMING-002
export const TICKET_AREAS = ['ARC', 'API', 'DATA', 'FEAT', 'SEC', 'PERF', 'QUAL', 'TEST', 'OPS', 'DOC'];

const SLUG = '[a-z0-9]+(?:-[a-z0-9]+)*';
const GENERIC = new Set(['INDEX.md', 'RULES.md', 'TEMPLATE.md']);

export async function documents(root, directory = 'docs') {
  const found = [];
  const walk = async (current) => {
    let entries;
    try {
      entries = await readdir(path.join(root, current), { withFileTypes: true });
    } catch (error) {
      if (error.code === 'ENOENT' || error.code === 'ENOTDIR') return;
      throw error;
    }
    for (const entry of entries) {
      const relative = path.posix.join(current, entry.name);
      if (entry.isDirectory()) await walk(relative);
      else if (entry.name.endsWith('.md')) found.push(relative);
    }
  };
  await walk(directory);
  return found.sort();
}

// REQ-NAMING-005, REQ-NAMING-006
// REQ-NAMING-012
export function ticketIdPattern(areas, prefix) {
  const head = prefix ? `${prefix}-` : '';
  return { head, shape: `${head}<ОБЛАСТЬ>-<NNN>` };
}

export function nameIssue(file, metadata, areas, prefix = null) {
  const name = path.posix.basename(file);
  const id = metadata.get('id') ?? '';
  const type = metadata.get('type') ?? '';
  if (GENERIC.has(name)) return null;

  // REQ-NAMING-011
  if (type === 'ticket' && /\/features\/[^/]+\//.test(`/${file}`)) {
    const stage = new RegExp(`^(\\d{2})-${SLUG}\\.md$`).exec(name);
    if (stage === null) return 'имя файла этапа плана должно быть <NN>-<слаг>.md';
    const expected = new RegExp('^([A-Z]{2,5})-(\\d{2})$').exec(id);
    if (expected === null) return `идентификатор этапа плана должен быть <ПЛАН>-<NN>, получен ${id}`;
    if (expected[2] !== stage[1]) return `номер этапа в имени файла ${stage[1]} не совпадает с идентификатором ${id}`;
    return null;
  }

  if (type === 'ticket') {
    // REQ-NAMING-012
    const { head, shape } = ticketIdPattern(areas, prefix);
    const expected = new RegExp(`^${head}(${areas.join('|')})-(\\d{3})-${SLUG}\\.md$`);
    const match = expected.exec(name);
    if (match === null) {
      return `имя файла задачи должно быть ${shape}-<слаг>.md, область из перечня: ${areas.join(', ')}`;
    }
    const expectedId = `${head}${match[1]}-${match[2]}`;
    if (id !== expectedId) return `идентификатор ${id} не совпадает с именем файла: ожидается ${expectedId}`;
    return null;
  }

  if (type === 'decision') {
    if (!new RegExp(`^ADR-\\d{4}-${SLUG}\\.md$`).test(name)) return 'имя файла решения должно быть ADR-NNNN-<слаг>.md';
    const expectedId = name.slice(0, 8);
    if (id !== expectedId) return `идентификатор ${id} не совпадает с именем файла: ожидается ${expectedId}`;
    return null;
  }

  // REQ-NAMING-006
  if (type === 'requirement' || type === 'runbook') {
    const prefix = type === 'requirement' ? 'REQ-' : 'RUN-';
    if (!id.startsWith(prefix)) return `идентификатор должен начинаться с ${prefix}`;
    if (!new RegExp(`^${SLUG}\\.md$`).test(name) && name !== 'REQUIREMENTS.md') {
      return 'имя файла должно быть слагом из строчных латинских букв, цифр и дефисов';
    }
    return null;
  }

  if (type === 'release') {
    if (name !== `${id}.md`) return `имя файла выпуска должно совпадать с идентификатором: ${id}.md`;
    return null;
  }

  return null;
}

export async function findNamingIssues(root, config) {
  const areas = [...TICKET_AREAS, ...(config.ticketAreas ?? [])];
  // REQ-NAMING-012
  const prefix = config.ticketPrefix ?? null;
  const violations = new Map();
  for (const file of await documents(root)) {
    const parsed = parseFrontMatter(await readFile(path.join(root, file), 'utf8'));
    if (parsed?.metadata === undefined) continue;
    const issue = nameIssue(file, parsed.metadata, areas, prefix);
    if (issue !== null) violations.set(file, [{ line: 1, text: issue }]);
  }
  return violations;
}
