import assert from 'node:assert/strict';
import test from 'node:test';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { promisify } from 'node:util';
import { NOT_A_REPOSITORY, repositoryAt } from '../lib/release/git.mjs';
import { commitsWithoutATicket } from '../lib/release/cycle.mjs';
import { environmentWithoutGit } from '../lib/release/git.mjs';

const run = promisify(execFile);

// REQ-BUILD-012
async function unpackedTree() {
  const root = await mkdtemp(path.join(os.tmpdir(), 'unpacked-'));
  await mkdir(path.join(root, 'docs'), { recursive: true });
  await writeFile(path.join(root, '.conventions.json'), JSON.stringify({ sources: [], commitRuleSince: 'HEAD' }));
  return root;
}

// REQ-BUILD-012
async function repository() {
  const root = await unpackedTree();
  await run('git', ['-C', root, 'init', '--quiet'], { env: environmentWithoutGit() });
  await run('git', ['-C', root, 'config', 'user.email', 't@t'], { env: environmentWithoutGit() });
  await run('git', ['-C', root, 'config', 'user.name', 't'], { env: environmentWithoutGit() });
  await run('git', ['-C', root, 'add', '-A'], { env: environmentWithoutGit() });
  await run('git', ['-C', root, 'commit', '--quiet', '-m', 'OPS-001 состояние'], { env: environmentWithoutGit() });
  return root;
}

// REQ-BUILD-012
test('распакованное дерево репозиторием не считается, а настоящее считается', async () => {
  const unpacked = await unpackedTree();
  const repo = await repository();
  try {
    assert.equal(await repositoryAt(unpacked), false);
    assert.equal(await repositoryAt(repo), true);
  } finally {
    await rm(unpacked, { recursive: true, force: true });
    await rm(repo, { recursive: true, force: true });
  }
});

// REQ-BUILD-012, REQ-QUALITY-005
test('сверка коммитов на дереве без истории называет причину, а не команду git', async () => {
  const unpacked = await unpackedTree();
  try {
    await assert.rejects(
      () => commitsWithoutATicket(unpacked, null),
      (failure) => {
        assert.match(failure.message, /не репозиторий/, 'названа причина');
        assert.match(failure.message, /не их дефект/, 'сказано, что отказавшая проверка не виновата');
        assert.match(failure.message, /git bundle/, 'назван выход');
        assert.doesNotMatch(failure.message, /Command failed/, 'команда git в отказе не показывается');
        return true;
      },
    );
  } finally {
    await rm(unpacked, { recursive: true, force: true });
  }
});

// REQ-BUILD-012
test('на репозитории сверка работает, а не отказывает признаком дерева', async () => {
  const repo = await repository();
  try {
    const found = await commitsWithoutATicket(repo, null);

    assert.deepEqual(found, [], 'коммит называет задачу; признак дерева проверку не подменяет');
  } finally {
    await rm(repo, { recursive: true, force: true });
  }
});

// REQ-BUILD-012
test('отказ один и тот же, откуда бы ни пришёл', () => {
  assert.match(NOT_A_REPOSITORY, /Дерево сборки/);
  assert.match(NOT_A_REPOSITORY, /распакованным архивом/);
});
