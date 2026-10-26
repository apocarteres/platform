import assert from 'node:assert/strict';
import test from 'node:test';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { ruleExtensions } from '../lib/rules.mjs';

const run = promisify(execFile);
const cli = path.join(path.dirname(path.dirname(fileURLToPath(import.meta.url))), 'bin', 'conventions.mjs');

// REQ-ADOPTION-009
async function project(config, files) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'sources-'));
  const all = { 'mise.toml': '[tools]\nnode = "22.22.3"\n', '.conventions.json': JSON.stringify(config), ...files };
  for (const [name, content] of Object.entries(all)) {
    await mkdir(path.dirname(path.join(root, name)), { recursive: true });
    await writeFile(path.join(root, name), content);
  }
  await run(process.execPath, [cli, 'sync', '--root', root]);
  return root;
}

async function check(root) {
  try {
    const { stdout, stderr } = await run(process.execPath, [cli, 'check', '--root', root]);
    return `${stdout}${stderr}`;
  } catch (error) {
    return `${error.stdout}${error.stderr}`;
  }
}

// REQ-ADOPTION-009
test('проект без языков ядра подключается: настройка .yml — файл, к которому применяются правила', async () => {
  const root = await project({ sources: ['scripts'], stack: [] }, { 'scripts/check.yml': 'hosts: all\n' });
  try {
    assert.doesNotMatch(await check(root), /правила не применяются ни к одному файлу/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

// REQ-ADOPTION-009
test('в источниках нет ни одного файла, который проверяет хоть одно правило, — отказ называет расширения', async () => {
  const root = await project({ sources: ['scripts'], stack: [] }, { 'scripts/run.sh': '#!/bin/sh\n', 'scripts/host.j2': '{{ x }}\n' });
  try {
    const output = await check(root);
    assert.match(output, /правила не применяются ни к одному файлу/);
    assert.match(output, /\.yml/);
    assert.match(output, /\.py/);
    assert.match(output, /\.java/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

// REQ-ADOPTION-009
test('расширения правил: правила ядра и правила проекта', () => {
  const core = ruleExtensions({});
  for (const one of ['.java', '.ts', '.mjs', '.js', '.rs', '.yml', '.yaml', '.properties', '.py', '.rb', '.html', '.css', '.scss']) {
    assert.ok(core.has(one), one);
  }
  assert.equal(core.has('.sh'), false, 'ни одно правило ядра shell не читает');
  const own = ruleExtensions({ rules: [{ id: 'shell-strict', extensions: ['.sh'] }] });
  assert.ok(own.has('.sh'), 'правило проекта добавляет свои расширения');
});
