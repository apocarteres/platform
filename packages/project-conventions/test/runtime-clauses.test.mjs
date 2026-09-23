import assert from 'node:assert/strict';
import test from 'node:test';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { environmentWithoutGit } from '../lib/release/git.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const CORE = path.resolve(here, '../../..');
const SELF = path.relative(CORE, fileURLToPath(import.meta.url));

// REQ-QUALITY-017
const RUNTIME_DOCUMENTS = ['docs/requirements/deployment.md', 'docs/requirements/api-errors.md', 'docs/requirements/client-modals.md'];

// REQ-QUALITY-017
const CONSUMER_SIDE = {
  'REQ-DEPLOYMENT-001': 'исполняется скриптом развёртывания потребителя; ядро его не запускает',
  'REQ-DEPLOYMENT-003': 'исполняется скриптом развёртывания потребителя; ядро его не запускает',
  'REQ-DEPLOYMENT-004': 'проверка предпосылок — шаг скрипта потребителя; ядро даёт для неё conventions deps, чья проверка ссылается на REQ-BUILD-013',
  'REQ-DEPLOYMENT-005': 'резервная копия снимается на машине потребителя его средствами',
  'REQ-DEPLOYMENT-007': 'операции подготовки данных принадлежат предметной области потребителя',
  'REQ-DEPLOYMENT-008': 'идемпотентность — свойство скрипта потребителя; ядро его не запускает',
  'REQ-DEPLOYMENT-009': 'выбор разворачиваемого коммита делает скрипт потребителя; расписку ядро проверяет в REQ-RELEASE',
  'REQ-DEPLOYMENT-010': 'способ вызова развёртывания выбирает потребитель; вход проверяется правилом по REQ-DEPLOYMENT-019',
  'REQ-DEPLOYMENT-014': 'признак машины назначения принадлежит потребителю; поставлено без проверки намеренно, с записанной причиной',
};

// REQ-QUALITY-017
function citations() {
  const listed = execFileSync('git', ['-C', CORE, 'grep', '--untracked', '-l', '-E', 'REQ-(DEPLOYMENT|API|CLIENT-MODAL)-[0-9]+', '--',
    'packages/*/test/*', 'packages/*/src/*.test.ts', 'platform-*/src/test/*'], { env: environmentWithoutGit(), encoding: 'utf8' });
  return listed.split('\n').filter((file) => file.length > 0 && file !== SELF);
}

// REQ-QUALITY-017
test('положение о поведении при работе выходит с проверкой либо с записанной причиной, почему ядро его не запускает', async () => {
  const cited = new Set();
  for (const file of citations()) {
    for (const match of (await readFile(path.join(CORE, file), 'utf8')).matchAll(/REQ-(?:DEPLOYMENT|API|CLIENT-MODAL)-\d+/g)) cited.add(match[0]);
  }
  const clauses = [];
  for (const document of RUNTIME_DOCUMENTS) {
    const text = await readFile(path.join(CORE, document), 'utf8');
    clauses.push(...[...text.matchAll(/<a id="(REQ-[A-Z-]+-\d+)"><\/a>/g)].map((match) => match[1]));
  }
  const bare = clauses.filter((id) => !cited.has(id) && CONSUMER_SIDE[id] === undefined);
  assert.deepEqual(bare, [], 'положение без проверки и без причины: сначала запуск, потом текст');

  const stale = Object.keys(CONSUMER_SIDE).filter((id) => cited.has(id) || !clauses.includes(id));
  assert.deepEqual(stale, [], 'причина записана для положения, у которого проверка уже есть или которого нет');
  for (const [id, reason] of Object.entries(CONSUMER_SIDE)) assert.ok(reason.trim().length > 20, `${id}: причина названа по существу`);
});
