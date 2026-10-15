import assert from 'node:assert/strict';
import test from 'node:test';
import os from 'node:os';
import path from 'node:path';
import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, rm } from 'node:fs/promises';
import { codeTree, environmentWithoutGit, uncommitted } from '../lib/release/git.mjs';

const run = promisify(execFile);
const LINE_BUDGET = 1024 * 1024;

function feed(root, args, input) {
  return new Promise((resolve, reject) => {
    const child = spawn('git', ['-C', root, ...args], { env: environmentWithoutGit(), stdio: ['pipe', 'pipe', 'inherit'] });
    let out = '';
    child.stdout.on('data', (chunk) => { out += chunk; });
    child.on('error', reject);
    child.on('close', (code) => (code === 0 ? resolve(out.trim()) : reject(new Error(`git ${args.join(' ')}: ${code}`))));
    child.stdin.end(input);
  });
}

// CORE-OPS-116
async function repositoryWithALargeTree() {
  const root = await mkdtemp(path.join(os.tmpdir(), 'large-tree-'));
  const env = { env: environmentWithoutGit() };
  await run('git', ['-C', root, 'init', '--quiet'], env);
  const blob = await feed(root, ['hash-object', '-w', '--stdin'], 'x\n');
  const entries = [];
  for (let index = 0; index < 14000; index += 1) {
    entries.push(`100644 ${blob}\tcatalog/controller/extension/module/very/long/consumer/path/file-${index}.php`);
  }
  await feed(root, ['update-index', '--index-info'], `${entries.join('\n')}\n`);
  const tree = await feed(root, ['write-tree'], '');
  const commit = await feed(root, ['-c', 'user.name=t', '-c', 'user.email=t@t', 'commit-tree', tree, '-m', 'large'], '');
  return { root, commit };
}

test('дерево кода крупного репозитория считается без отказа буфера', async () => {
  const { root, commit } = await repositoryWithALargeTree();
  try {
    const listing = await feed(root, ['ls-tree', '-r', '--full-tree', commit], '');
    assert.ok(listing.length > LINE_BUDGET, 'проба превышает буфер execFile по умолчанию');
    assert.match(await codeTree(root, commit), /^[0-9a-f]{64}$/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('незафиксированные файлы крупного репозитория читаются без отказа буфера', async () => {
  const { root } = await repositoryWithALargeTree();
  try {
    const status = await feed(root, ['status', '--porcelain', '-z', '--untracked-files=all'], '');
    assert.ok(status.length > LINE_BUDGET, 'проба превышает буфер execFile по умолчанию');
    const found = await uncommitted(root, ['catalog/']);
    assert.equal(found.length, 14000);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
