import { readFile, readdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { CONFIG_FILE } from '../config.mjs';
import { RELEASES_DIR, TICKETS_DIR, openRelease } from '../release/documents.mjs';
import { STATE_FILE } from '../release/obligations.mjs';
import { parseFrontMatter } from '../docs/ticket-model.mjs';
import { documentationProblems } from '../docs/documentation.mjs';
import { checkStore } from './check.mjs';
import { storeDeclaration } from './config.mjs';
import { exportProject, importRequests } from './export.mjs';

// REQ-STORE-021
const MOVED = [TICKETS_DIR, RELEASES_DIR];
const KEPT_TYPES = new Set(['ticket', 'release', 'index']);
const LINK = /\[([^\]]*)\]\(([^)\s]+)\)/g;

async function markdown(directory) {
  let entries;
  try {
    entries = await readdir(directory, { recursive: true, withFileTypes: true });
  } catch (error) {
    if (error.code === 'ENOENT') return [];
    throw error;
  }
  return entries.filter((one) => one.isFile() && one.name.endsWith('.md')).map((one) => path.join(one.parentPath, one.name)).sort();
}

const inside = (root, file) => MOVED.some((directory) => path.relative(path.join(root, directory), file).split(path.sep)[0] !== '..');

// REQ-STORE-021
function relinked(root, file, content, idOf) {
  let fenced = false;
  let replaced = 0;
  const lines = content.split('\n').map((line) => {
    if (/^\s*(```|~~~)/.test(line)) {
      fenced = !fenced;
      return line;
    }
    if (fenced) return line;
    return line.split('`').map((segment, index) => {
      if (index % 2 === 1) return segment;
      return segment.replace(LINK, (whole, text, target) => {
        if (/^[a-z][a-z0-9+.-]*:/i.test(target) || target.startsWith('#')) return whole;
        const resolved = path.resolve(path.dirname(file), decodeURIComponent(target.split('#')[0]));
        if (!inside(root, resolved)) return whole;
        replaced += 1;
        const id = idOf.get(resolved);
        if (id === undefined) return text;
        return text === id || text === `\`${id}\`` ? `\`${id}\`` : `${text} (\`${id}\`)`;
      });
    }).join('`');
  });
  return { content: lines.join('\n'), replaced };
}

// REQ-STORE-021
export async function moveToStore(root, { config, declared, client, withOperations = false }) {
  const problems = [];
  if (config.store !== undefined && config.store.kind !== 'files') {
    return { moved: false, problems: ['Проект уже ведёт задачи и выпуски во внешнем хранилище: store в .conventions.json объявлен'] };
  }
  const { store, problems: declarationProblems } = storeDeclaration({ store: declared });
  if (store === null) return { moved: false, problems: declarationProblems };
  const open = await openRelease(root);
  if (open !== null) {
    problems.push(`Выпуск ${open.metadata.get('id')} открыт: переход выполняется между выпусками — закройте или отмените его`);
  }
  const idOf = new Map();
  const strangers = [];
  for (const file of [...await markdown(path.join(root, TICKETS_DIR)), ...await markdown(path.join(root, RELEASES_DIR))]) {
    const metadata = parseFrontMatter(await readFile(file, 'utf8'))?.metadata;
    const type = metadata?.get('type');
    if (!KEPT_TYPES.has(type)) strangers.push(path.relative(root, file));
    else if (type !== 'index') idOf.set(file, metadata.get('id'));
  }
  if (strangers.length > 0) {
    problems.push(`В каталогах задач и выпусков лежат документы, которые хранилище не примет: ${strangers.join(', ')}.`
      + ' Перенесите их в другой каталог документации до перехода');
  }
  const exported = await exportProject(root, config);
  const offPattern = exported.tickets.map((ticket) => ticket.id).filter((id) => !store.pattern.test(id));
  if (offPattern.length > 0) {
    problems.push(`Номера задач не подходят под idPattern: ${offPattern.slice(0, 10).join(', ')}${offPattern.length > 10 ? ` и ещё ${offPattern.length - 10}` : ''}`);
  }
  if (problems.length > 0) return { moved: false, problems };

  const checked = await checkStore({ client, config: { ...config, store: declared }, withOperations });
  if (checked.problems.length > 0) {
    return { moved: false, problems: ['Хранилище контракт ядра не исполняет:', ...checked.problems.map((one) => `  ${one}`)] };
  }
  const acceptedReleases = new Set();
  for (const request of importRequests(exported)) {
    const answer = await client.import(request);
    for (const id of answer.releases ?? []) acceptedReleases.add(id);
  }
  const wanted = exported.tickets.map((ticket) => ticket.id);
  const found = wanted.length === 0 ? { tickets: [] } : await client.lookup(wanted);
  const present = new Set(found.tickets.map((ticket) => ticket.id));
  const missing = [
    ...wanted.filter((id) => !present.has(id)).map((id) => `задача ${id}`),
    ...exported.releases.map((release) => release.id).filter((id) => !acceptedReleases.has(id)).map((id) => `выпуск ${id}`),
  ];
  if (missing.length > 0) {
    return { moved: false, problems: [`Хранилище не подтвердило под прежним номером: ${missing.join(', ')}. Файлы не тронуты`] };
  }

  let links = 0;
  const touched = [];
  const top = (await readdir(root, { withFileTypes: true }))
    .filter((one) => one.isFile() && one.name.endsWith('.md')).map((one) => path.join(root, one.name));
  for (const file of [...top, ...await markdown(path.join(root, 'docs'))].filter((one) => !inside(root, one))) {
    const content = await readFile(file, 'utf8');
    const result = relinked(root, file, content, idOf);
    if (result.replaced === 0) continue;
    await writeFile(file, result.content);
    links += result.replaced;
    touched.push(path.relative(root, file));
  }
  for (const directory of MOVED) await rm(path.join(root, directory), { recursive: true, force: true });
  await rm(path.join(root, STATE_FILE), { force: true });
  const next = { ...config, store: declared };
  await writeFile(path.join(root, CONFIG_FILE), `${JSON.stringify(next, null, 2)}\n`);
  const documentation = await documentationProblems(root, next);
  return {
    moved: true, tickets: wanted.length, releases: exported.releases.length, links, touched, notes: checked.notes,
    documentation: documentation.errors,
  };
}
