import assert from 'node:assert/strict';
import test from 'node:test';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { findExpandDebts, findUnlabelledMigrations, labelOf, withoutDowntime } from '../lib/migrations.mjs';
import { environmentWithoutGit } from '../lib/release/git.mjs';

const run = promisify(execFile);

// REQ-DEPLOYMENT-026
const DIRECTORY = 'src/main/resources/db/migration';

// REQ-DEPLOYMENT-026
const config = (extra = {}) => ({ deployment: { withoutDowntime: { migrations: DIRECTORY, ...extra } } });

// REQ-DEPLOYMENT-027
async function repository() {
  const root = await mkdtemp(path.join(os.tmpdir(), 'migrations-'));
  const git = (...args) => run('git', ['-C', root, ...args], { env: environmentWithoutGit() });
  await git('init', '--quiet');
  await git('config', 'user.email', 'test@example.test');
  await git('config', 'user.name', 'Test');
  let released = 0;
  return {
    root,
    async migration(name, label) {
      await mkdir(path.join(root, DIRECTORY), { recursive: true });
      await writeFile(path.join(root, DIRECTORY, name), `${label === null ? '' : `-- migration: ${label}\n`}select 1;\n`);
    },
    async release(status = 'released') {
      await git('add', '-A');
      await git('commit', '--quiet', '--allow-empty', '-m', 'состояние');
      const commit = (await git('rev-parse', 'HEAD')).stdout.trim();
      released += 1;
      await mkdir(path.join(root, 'docs/releases'), { recursive: true });
      await writeFile(path.join(root, `docs/releases/RELEASE-2026-09-${released}.md`),
        `---\nid: RELEASE-2026-09-${released}\ntype: release\nstatus: ${status}\ncommit: ${commit}\n---\n\n# Выпуск\n`);
    },
    stop: () => rm(root, { recursive: true, force: true }),
  };
}

// REQ-DEPLOYMENT-026
test('метка читается из первой непустой строки перехода', () => {
  assert.deepEqual(labelOf('\n-- migration: expand\nalter table x add column y int;'), { kind: 'expand', target: null });
  assert.deepEqual(labelOf('-- migration: contract V12\n'), { kind: 'contract', target: 'V12' });
  assert.equal(labelOf('alter table x;\n-- migration: additive'), null, 'метка не на первой строке — не метка');
});

// REQ-DEPLOYMENT-025, REQ-DEPLOYMENT-027
test('объявление без каталога и с бессрочным долгом отказывает с названной причиной', () => {
  assert.equal(withoutDowntime({}).declared, false);
  assert.match(withoutDowntime({ deployment: { withoutDowntime: {} } }).problems[0], /migrations не назван/);
  assert.match(withoutDowntime(config({ expandReleases: 0 })).problems[0], /целое число выпусков от 1; бессрочного долга нет/);
  assert.match(withoutDowntime(config({ expandReleases: 1.5 })).problems[0], /бессрочного долга нет/);
  assert.equal(withoutDowntime(config({ expandReleases: 1 })).problems.length, 0);
});

// REQ-DEPLOYMENT-026
test('переход без метки, с неизвестной меткой и с неверной парой называется', async () => {
  const one = await repository();
  try {
    await one.migration('V1__stock.sql', 'additive');
    await one.migration('V2__rename.sql', 'expand');
    await one.migration('V3__bare.sql', null);
    await one.migration('V4__odd.sql', 'sometimes');
    await one.migration('V5__drop.sql', 'contract');
    await one.migration('V6__drop.sql', 'contract V9');
    await one.migration('V7__drop.sql', 'contract V1');
    const found = await findUnlabelledMigrations(one.root, config());
    const text = (name) => found.get(`${DIRECTORY}/${name}`)?.[0].text;
    assert.equal(found.has(`${DIRECTORY}/V1__stock.sql`), false);
    assert.equal(found.has(`${DIRECTORY}/V2__rename.sql`), false);
    assert.match(text('V3__bare.sql'), /переход без метки: первая строка -- migration: additive \| expand \| contract \| breaking/);
    assert.match(text('V4__odd.sql'), /метка sometimes неизвестна/);
    assert.match(text('V5__drop.sql'), /contract не называет закрываемый expand/);
    assert.match(text('V6__drop.sql'), /contract называет V9, а такого перехода нет/);
    assert.match(text('V7__drop.sql'), /V1__stock\.sql, а это не expand/);
    assert.equal((await findUnlabelledMigrations(one.root, {})).size, 0, 'без объявления правило молчит');
  } finally {
    await one.stop();
  }
});

// REQ-DEPLOYMENT-027
test('contract раньше выпуска со своим expand отказывает, после выпуска — проходит', async () => {
  const one = await repository();
  try {
    await one.migration('V2__rename.sql', 'expand');
    await one.migration('V3__drop.sql', 'contract V2');
    assert.match((await findUnlabelledMigrations(one.root, config())).get(`${DIRECTORY}/V3__drop.sql`)[0].text,
      /contract раньше выпуска с .*V2__rename\.sql/);

    await rm(path.join(one.root, DIRECTORY, 'V3__drop.sql'));
    await one.release();
    await one.migration('V3__drop.sql', 'contract V2__rename');
    assert.equal((await findUnlabelledMigrations(one.root, config())).size, 0);
  } finally {
    await one.stop();
  }
});

// REQ-DEPLOYMENT-027
test('долг expand напоминает, пока срок идёт, и роняет проверку, когда срок вышел', async () => {
  const one = await repository();
  try {
    await one.migration('V1__stock.sql', 'additive');
    await one.release();
    await one.migration('V2__rename.sql', 'expand');
    assert.match((await findExpandDebts(one.root, config())).advisories[0], /ещё не выпущен/, 'выпуск до перехода в счёт не идёт');
    await one.release('in_progress');
    assert.match((await findExpandDebts(one.root, config())).advisories[0], /ещё не выпущен/, 'невыпущенный выпуск в счёт не идёт');

    await one.release();
    let debts = await findExpandDebts(one.root, config());
    assert.deepEqual(debts.problems, []);
    assert.match(debts.advisories[0], /V2__rename\.sql ждёт парного contract, остаётся выпусков 2/);

    await one.release();
    assert.match((await findExpandDebts(one.root, config())).advisories[0], /остаётся выпусков 1/);

    await one.release();
    debts = await findExpandDebts(one.root, config());
    assert.deepEqual(debts.advisories, []);
    assert.match(debts.problems[0], /просрочена: .*V2__rename\.sql .*срок 2\. Выпустите переход с первой строкой -- migration: contract V2/);

    assert.equal((await findExpandDebts(one.root, config({ expandReleases: 3 }))).problems.length, 0, 'проект задаёт свой срок');

    await one.migration('V3__drop.sql', 'contract V2');
    debts = await findExpandDebts(one.root, config());
    assert.deepEqual([...debts.problems, ...debts.advisories], [], 'парный contract закрывает долг');
  } finally {
    await one.stop();
  }
});
