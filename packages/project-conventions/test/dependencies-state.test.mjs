import assert from 'node:assert/strict';
import test from 'node:test';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { dependenciesUnchanged, fingerprint, recordDependencies } from '../lib/dependencies-state.mjs';

const run = promisify(execFile);
const cli = path.join(path.dirname(path.dirname(fileURLToPath(import.meta.url))), 'bin', 'conventions.mjs');
const REQUEST = { directory: 'frontend', state: 'target/deps-frontend.sha256' };

async function project({ node = '22.22.3', lock = '{"lockfileVersion":3}', installed = true } = {}) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'deps-'));
  await mkdir(path.join(root, 'frontend/node_modules'), { recursive: true });
  await writeFile(path.join(root, 'mise.toml'), `[tools]\nnode = "${node}"\nnpm = "10.9.4"\n`);
  await writeFile(path.join(root, 'frontend/package.json'), '{"name":"frontend"}');
  await writeFile(path.join(root, 'frontend/package-lock.json'), lock);
  if (installed) await writeFile(path.join(root, 'frontend/node_modules/.package-lock.json'), '{}');
  return root;
}

// REQ-BUILD-013
test('отпечаток считается от закреплённых версий, манифеста и файла блокировки', async () => {
  const base = await project();
  const otherNode = await project({ node: '22.23.0' });
  const otherLock = await project({ lock: '{"lockfileVersion":3,"packages":{}}' });
  try {
    const first = await fingerprint(base, 'frontend');

    assert.match(first.value, /^[0-9a-f]{64}$/);
    assert.notEqual((await fingerprint(otherNode, 'frontend')).value, first.value,
      'подъём версии node обязан менять отпечаток: иначе старые node_modules переживут его');
    assert.notEqual((await fingerprint(otherLock, 'frontend')).value, first.value);
    assert.equal((await fingerprint(await project(), 'frontend')).value, first.value,
      'одинаковый вход — одинаковый отпечаток');
  } finally {
    for (const root of [base, otherNode, otherLock]) await rm(root, { recursive: true, force: true });
  }
});

// REQ-BUILD-013
test('ставить нужно, пока зависимостей нет, отпечатка нет или вход изменился', async () => {
  const fresh = await project({ installed: false });
  const installed = await project();
  try {
    assert.match((await dependenciesUnchanged(fresh, REQUEST)).reason, /не установлены/);
    assert.match((await dependenciesUnchanged(installed, REQUEST)).reason, /отпечаток не записан/);

    await recordDependencies(installed, REQUEST);
    assert.equal((await dependenciesUnchanged(installed, REQUEST)).unchanged, true);

    await writeFile(path.join(installed, 'mise.toml'), '[tools]\nnode = "22.23.0"\nnpm = "10.9.4"\n');
    assert.match((await dependenciesUnchanged(installed, REQUEST)).reason, /изменились/);
  } finally {
    await rm(fresh, { recursive: true, force: true });
    await rm(installed, { recursive: true, force: true });
  }
});

// REQ-BUILD-013
test('отсутствие файла блокировки названо отказом, а не пропущено', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'deps-'));
  await mkdir(path.join(root, 'frontend'), { recursive: true });
  await writeFile(path.join(root, 'mise.toml'), '[tools]\nnode = "22.22.3"\nnpm = "10.9.4"\n');
  await writeFile(path.join(root, 'frontend/package.json'), '{"name":"frontend"}');
  try {
    const answer = await fingerprint(root, 'frontend');

    assert.match(answer.error, /нет package-lock\.json/);
    assert.match(answer.error, /состав зависимостей не закреплён/, 'названа причина, а не только отсутствие файла');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

// REQ-BUILD-013, REQ-QUALITY-008
test('команда ядра отвечает кодом возврата, а не выводом', async () => {
  const root = await project();
  const conventions = async (...args) => {
    try {
      const { stdout } = await run(process.execPath, [cli, 'deps', '--dir', 'frontend', ...args, '--root', root]);
      return { code: 0, output: stdout };
    } catch (failure) {
      return { code: failure.code, output: `${failure.stdout}${failure.stderr}` };
    }
  };
  try {
    const needed = await conventions();
    assert.equal(needed.code, 1, needed.output);
    assert.match(needed.output, /ставить нужно/);
    assert.match(needed.output, /--record/, 'назван следующий шаг');

    assert.equal((await conventions('--record')).code, 0);
    assert.match(await readFile(path.join(root, REQUEST.state), 'utf8'), /^[0-9a-f]{64}\n$/);

    const again = await conventions();
    assert.equal(again.code, 0, again.output);
    assert.match(again.output, /не менялись/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
