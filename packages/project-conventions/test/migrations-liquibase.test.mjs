import assert from 'node:assert/strict';
import test from 'node:test';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { findExpandDebts, findUnlabelledMigrations, unreleasedMigrations } from '../lib/migrations.mjs';
import { environmentWithoutGit } from '../lib/release/git.mjs';

const run = promisify(execFile);

// REQ-DEPLOYMENT-026
const MASTER = 'src/main/resources/db/changelog/master.yaml';

// REQ-DEPLOYMENT-026
const config = () => ({ deployment: { withoutDowntime: { migrations: MASTER } } });

function changeSet(id, labels) {
  const lines = ['  - changeSet:', `      id: ${id}`, '      author: project'];
  if (labels !== null) lines.push(`      labels: ${labels}`);
  lines.push('      changes:', '        - sql:', '            sql: select 1');
  return lines.join('\n');
}

function changelog(...entries) {
  return `databaseChangeLog:\n${entries.join('\n')}\n`;
}

// REQ-DEPLOYMENT-027
async function repository() {
  const root = await mkdtemp(path.join(os.tmpdir(), 'liquibase-labels-'));
  const git = (...args) => run('git', ['-C', root, ...args], { env: environmentWithoutGit() });
  await git('init', '--quiet');
  await git('config', 'user.email', 'test@example.test');
  await git('config', 'user.name', 'Test');
  let released = 0;
  return {
    root,
    async put(file, content) {
      await mkdir(path.dirname(path.join(root, file)), { recursive: true });
      await writeFile(path.join(root, file), content);
    },
    async release() {
      await git('add', '-A');
      await git('commit', '--quiet', '--allow-empty', '-m', 'состояние');
      const commit = (await git('rev-parse', 'HEAD')).stdout.trim();
      released += 1;
      await mkdir(path.join(root, 'docs/releases'), { recursive: true });
      await writeFile(path.join(root, `docs/releases/RELEASE-2026-09-${released}.md`),
        `---\nid: RELEASE-2026-09-${released}\ntype: release\nstatus: released\ncommit: ${commit}\n---\n\n# Выпуск\n`);
    },
    stop: () => rm(root, { recursive: true, force: true }),
  };
}

// REQ-DEPLOYMENT-026
test('метки читаются из labels наборов журнала, журналы ядра из пути классов не читаются', async () => {
  const one = await repository();
  try {
    await one.put(MASTER, changelog(
      '  - include:\n      file: classpath:platform/changelog/platform-auth.yaml',
      '  - include:\n      file: project/stock.yaml\n      relativeToChangelogFile: true',
      '  - includeAll:\n      path: src/main/resources/db/changelog/later/',
    ));
    await one.put('src/main/resources/db/changelog/project/stock.yaml', changelog(
      changeSet('project:001-stock', 'additive'),
      changeSet('project:002-rename', 'expand'),
      changeSet('project:003-bare', null),
      changeSet('project:004-odd', 'sometimes'),
    ));
    await one.put('src/main/resources/db/changelog/later/drops.yaml', changelog(
      changeSet('project:005-drop', 'contract'),
      changeSet('project:006-drop', 'contract, closes-project:009-none'),
      changeSet('project:007-drop', 'contract, closes-project:001-stock'),
    ));
    const found = await findUnlabelledMigrations(one.root, config());
    const text = (file, id) => found.get(`src/main/resources/db/changelog/${file}#${id}`)?.[0].text;
    assert.deepEqual([...found.keys()].sort(), [
      'src/main/resources/db/changelog/later/drops.yaml#project:005-drop',
      'src/main/resources/db/changelog/later/drops.yaml#project:006-drop',
      'src/main/resources/db/changelog/later/drops.yaml#project:007-drop',
      'src/main/resources/db/changelog/project/stock.yaml#project:003-bare',
      'src/main/resources/db/changelog/project/stock.yaml#project:004-odd',
    ]);
    assert.match(text('project/stock.yaml', 'project:003-bare'), /набор без метки: labels — additive \| expand \| contract, closes-<набор> \| breaking/);
    assert.match(text('project/stock.yaml', 'project:004-odd'), /метки sometimes нет среди additive, expand, contract, breaking/);
    assert.match(text('later/drops.yaml', 'project:005-drop'), /contract не называет закрываемый expand: labels — contract, closes-<набор>/);
    assert.match(text('later/drops.yaml', 'project:006-drop'), /contract называет project:009-none, а такого набора нет/);
    assert.match(text('later/drops.yaml', 'project:007-drop'), /project:001-stock, а это не expand/);
  } finally {
    await one.stop();
  }
});

// REQ-DEPLOYMENT-027
test('contract раньше выпуска с набором expand отказывает; выпуск засчитывается набору, а не файлу журнала', async () => {
  const one = await repository();
  try {
    await one.put(MASTER, changelog(changeSet('project:001-stock', 'additive')));
    await one.release();
    await one.put(MASTER, changelog(changeSet('project:001-stock', 'additive'), changeSet('project:002-rename', 'expand'),
      changeSet('project:003-drop', 'contract, closes-project:002-rename')));
    assert.match((await findUnlabelledMigrations(one.root, config())).get(`${MASTER}#project:003-drop`)[0].text,
      /contract раньше выпуска с набором project:002-rename/);
    assert.deepEqual((await unreleasedMigrations(one.root, config())).lines, [
      `migration=${MASTER}#project:002-rename kind=expand`,
      `migration=${MASTER}#project:003-drop kind=contract`,
      'order=switch',
    ], 'файл журнала уже выходил, а наборы — нет');

    await one.put(MASTER, changelog(changeSet('project:001-stock', 'additive'), changeSet('project:002-rename', 'expand')));
    await one.release();
    assert.match((await findExpandDebts(one.root, config())).advisories[0], /project:002-rename ждёт парного contract/);
    await one.put(MASTER, changelog(changeSet('project:001-stock', 'additive'), changeSet('project:002-rename', 'expand'),
      changeSet('project:003-drop', 'contract, closes-project:002-rename')));
    assert.equal((await findUnlabelledMigrations(one.root, config())).size, 0);
    assert.deepEqual((await findExpandDebts(one.root, config())).advisories, [], 'парный contract закрывает долг');
  } finally {
    await one.stop();
  }
});

// REQ-DEPLOYMENT-026
test('журнала нет или он не YAML — отказ называет, что указать', async () => {
  const one = await repository();
  try {
    assert.match([...(await findUnlabelledMigrations(one.root, config())).values()][0][0].text,
      /журнала переходов .*master\.yaml нет/);
    await one.put(MASTER, changelog('  - include:\n      file: project/old.xml\n      relativeToChangelogFile: true'));
    await one.put('src/main/resources/db/changelog/project/old.xml', '<databaseChangeLog/>\n');
    assert.match([...(await findUnlabelledMigrations(one.root, config())).values()][0][0].text, /old\.xml: журнал не YAML/);
  } finally {
    await one.stop();
  }
});
