import assert from 'node:assert/strict';
import test from 'node:test';
import path from 'node:path';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const CORE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const read = (relative) => readFile(path.join(CORE, relative), 'utf8');

// REQ-QUALITY-002
test('набор check ядра содержит статический разбор каждого своего языка', async () => {
  const tasks = await read('mise.toml');
  const check = /\[tasks\.check\][\s\S]*?\n\]/.exec(tasks)?.[0];
  assert.ok(check, 'набор check объявлен');

  assert.match(check, /mise run web-lint/, 'разбор TypeScript и JavaScript входит в check');
  assert.match(check, /mise run java-test/, 'сборка Java входит в check, а разбор Java идёт компилятором');
  assert.match(tasks, /\[tasks\.web-lint\][\s\S]*?scripts\/web\.sh lint/, 'задача разбора объявлена');
});

// REQ-QUALITY-002
test('разбор Java роняет сборку на предупреждениях и включает разбор исходников', async () => {
  const parent = await read('pom.xml');

  assert.match(parent, /<arg>-Werror<\/arg>/, 'предупреждение компилятора роняет сборку');
  assert.match(parent, /<arg>-Xlint:all[^<]*<\/arg>/, 'разбор компилятора включён целиком');
  assert.match(parent, /-Xplugin:ErrorProne/, 'разбор исходников подключён');
  assert.match(parent, /<artifactId>error_prone_core<\/artifactId>/, 'разбор исходников объявлен зависимостью');
});

// REQ-QUALITY-002
test('у каждого npm-пакета ядра объявлен разбор, а не только у одного', async () => {
  const packages = ['packages/http', 'packages/project-conventions'];

  for (const directory of packages) {
    const manifest = JSON.parse(await read(`${directory}/package.json`));
    assert.equal(manifest.scripts?.lint, 'eslint .', `${directory}: разбор объявлен командой пакета`);
    const config = await read(`${directory}/eslint.config.mjs`);
    assert.match(config, /REQ-QUALITY-002/, `${directory}: настройка названа требованием`);
  }
});

// REQ-QUALITY-002
test('разбор TypeScript пользуется типами, а не только текстом', async () => {
  const config = await read('packages/http/eslint.config.mjs');

  assert.match(config, /recommendedTypeChecked/, 'разбор с типами включён');
  assert.match(config, /projectService/, 'разбору выдан проект, иначе типовые правила молчат');
});
