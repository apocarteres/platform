import assert from 'node:assert/strict';
import test from 'node:test';
import path from 'node:path';
import os from 'node:os';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { chmod, copyFile, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const run = promisify(execFile);
const here = path.dirname(fileURLToPath(import.meta.url));
const CORE = path.resolve(here, '../../..');

const RECORDING_NPM = `#!/usr/bin/env bash
echo "$(basename "$PWD") $*" >> "$NPM_CALLS"
if [ "$1" = "ci" ]; then mkdir -p node_modules && echo '{}' > node_modules/.package-lock.json; fi
`;

async function sandbox() {
  const root = await mkdtemp(path.join(os.tmpdir(), 'web-sh-'));
  await mkdir(path.join(root, 'scripts'), { recursive: true });
  await mkdir(path.join(root, 'bin'), { recursive: true });
  await mkdir(path.join(root, 'packages'), { recursive: true });
  await copyFile(path.join(CORE, 'scripts/web.sh'), path.join(root, 'scripts/web.sh'));
  await writeFile(path.join(root, 'bin/npm'), RECORDING_NPM);
  await chmod(path.join(root, 'bin/npm'), 0o755);
  await writeFile(path.join(root, 'mise.toml'), '[tools]\nnode = "22"\nnpm = "10"\n');
  await mkdir(path.join(root, 'packages/project-conventions/node_modules/yaml'), { recursive: true });
  await symlink(path.join(CORE, 'packages/project-conventions/bin'), path.join(root, 'packages/project-conventions/bin'));
  const pkg = async (name, scripts) => {
    await mkdir(path.join(root, 'packages', name, 'node_modules'), { recursive: true });
    await writeFile(path.join(root, 'packages', name, 'package.json'), JSON.stringify({ name, scripts, devDependencies: { tool: '1.0.0' } }));
    await writeFile(path.join(root, 'packages', name, 'package-lock.json'), JSON.stringify({ name, lockfileVersion: 3 }));
  };
  const calls = path.join(root, 'npm-calls.log');
  const web = (...args) => run(path.join(root, 'scripts/web.sh'), args, {
    env: { ...process.env, PATH: `${path.join(root, 'bin')}:${process.env.PATH}`, NPM_CALLS: calls },
  });
  const made = async () => (await readFile(calls, 'utf8').catch(() => '')).split('\n').filter((line) => line !== '');
  return { root, pkg, web, made };
}

// CORE-OPS-117
test('web.sh ставит зависимости по отпечатку файла блокировки, а не по наличию node_modules', async () => {
  const box = await sandbox();
  try {
    await box.pkg('first', { test: 'true' });
    await box.web('install');
    assert.deepEqual(await box.made(), ['first ci --silent'], 'каталог node_modules от прежнего файла блокировки установку не отменяет');
    await box.web('install');
    assert.deepEqual(await box.made(), ['first ci --silent'], 'при прежнем отпечатке ставить нечего');
    await writeFile(path.join(box.root, 'packages/first/package-lock.json'), JSON.stringify({ name: 'first', lockfileVersion: 3, changed: true }));
    await box.web('install');
    assert.deepEqual(await box.made(), ['first ci --silent', 'first ci --silent']);
  } finally {
    await rm(box.root, { recursive: true, force: true });
  }
});

// CORE-OPS-129
test('web.sh --only и --except ограничивают пакеты, install сценария не выполняет', async () => {
  const box = await sandbox();
  try {
    await box.pkg('first', { test: 'true' });
    await box.pkg('second', { test: 'true' });
    await box.web('install');
    const ran = async () => (await box.made()).filter((line) => line.includes(' run '));
    assert.deepEqual(await ran(), []);
    await box.web('test', '--only', 'first');
    assert.deepEqual(await ran(), ['first run --silent test']);
    await box.web('test', '--except', 'first');
    assert.deepEqual(await ran(), ['first run --silent test', 'second run --silent test']);
    await assert.rejects(box.web('test', '--unknown'), /неизвестный аргумент/);
  } finally {
    await rm(box.root, { recursive: true, force: true });
  }
});
