import assert from 'node:assert/strict';
import test from 'node:test';
import os from 'node:os';
import path from 'node:path';
import { execFile, execFileSync } from 'node:child_process';
import { cp, mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { environmentWithoutGit } from '../lib/release/git.mjs';
import { findForbiddenWords } from '../lib/terms.mjs';

const run = promisify(execFile);
const here = path.dirname(fileURLToPath(import.meta.url));
const PACKAGE = path.resolve(here, '..');
const CORE = path.resolve(PACKAGE, '../..');
const cli = path.join(PACKAGE, 'bin', 'conventions.mjs');

async function conventions(root, ...args) {
  try {
    const { stdout, stderr } = await run(process.execPath, [cli, ...args, '--root', root]);
    return { code: 0, output: `${stdout}${stderr}` };
  } catch (failure) {
    return { code: failure.code, output: `${failure.stdout ?? ''}${failure.stderr ?? ''}` };
  }
}

// REQ-ADOPTION-026
async function freshProject() {
  const root = await mkdtemp(path.join(os.tmpdir(), 'adoption-pilot-'));
  const put = async (file, content) => {
    await mkdir(path.join(root, path.dirname(file)), { recursive: true });
    await writeFile(path.join(root, file), content);
  };
  const git = (...args) => execFileSync('git', ['-C', root, ...args], { env: environmentWithoutGit(), stdio: 'pipe' });
  git('init', '-q');
  git('config', 'user.email', 'pilot@example.net');
  git('config', 'user.name', 'Пилот');
  const installed = path.join(root, 'node_modules/@apocarteres/project-conventions');
  await mkdir(installed, { recursive: true });
  await cp(path.join(CORE, 'docs/requirements'), path.join(installed, 'docs'), { recursive: true });
  await cp(path.join(CORE, 'docs/terms'), path.join(installed, 'docs/terms'), { recursive: true });
  await cp(path.join(PACKAGE, 'obligations.json'), path.join(installed, 'obligations.json'));
  await put('.gitignore', 'node_modules/\ntarget/\n');
  await put('pom.xml', '<project>\n  <modelVersion>4.0.0</modelVersion>\n  <parent>\n'
    + '    <groupId>io.github.apocarteres.platform</groupId>\n    <artifactId>platform-service-parent</artifactId>\n'
    + '    <version>1.50.0</version>\n  </parent>\n  <groupId>net.example</groupId>\n  <artifactId>catalog</artifactId>\n'
    + '  <version>1.0.0</version>\n</project>\n');
  await put('src/main/java/net/example/catalog/CatalogApplication.java', 'package net.example.catalog;\n\npublic final class CatalogApplication {\n}\n');
  await put('frontend/package.json', `${JSON.stringify({ name: 'catalog-client', private: true, scripts: { build: 'ng build', lint: 'eslint .' } })}\n`);
  await put('.conventions.json', `${JSON.stringify({
    ticketPrefix: 'CAT',
    sources: ['src', 'frontend/src'],
    deployment: { environments: ['qa', 'production'], components: { backend: { artifact: 'target/catalog.jar' } } },
  })}\n`);
  await put('scripts/deploy.sh', '#!/usr/bin/env bash\nset -euo pipefail\nnpx conventions deploy-args -- "$@"\n');
  git('add', '-A');
  git('commit', '-q', '-m', 'Проект до подключения ядра');
  return { root, git };
}

// REQ-ADOPTION-026
test('проект без документации получает названный отказ, а не аварию', async () => {
  const { root } = await freshProject();
  try {
    const answer = await conventions(root, 'docs-check');
    assert.equal(answer.code, 1, answer.output);
    assert.doesNotMatch(answer.output, /ENOENT|at async|node:internal/, 'аварии со стеком нет');
    assert.match(answer.output, /docs\/INDEX\.md: входная сводка документации отсутствует/);
    assert.match(answer.output, /docs\/tickets\/INDEX\.md/, 'отказ называет, какие каталоги нужны');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

// REQ-ADOPTION-026
test('подключение не приносит потребителю текста, который запрещает словарь самого ядра', async () => {
  const { root } = await freshProject();
  try {
    const adopted = await conventions(root, 'release', 'adopt');
    assert.equal(adopted.code, 0, adopted.output);
    const created = (await readdir(path.join(root, 'docs/tickets'))).filter((name) => name.startsWith('CAT-'));
    assert.ok(created.length > 0, 'обязательства материализованы задачами');

    const forbidden = await findForbiddenWords(root);
    const inGenerated = [...forbidden.entries()].filter(([file]) => file.startsWith('docs/'));
    assert.deepEqual(inGenerated.map(([file, items]) => `${file}: ${items.map((item) => item.text).join(', ')}`), [],
      'документы, написанные командой ядра, красят проверку потребителя сразу после подключения');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

// REQ-ADOPTION-013, REQ-ADOPTION-026
test('вход развёртывания и отчёт об обновлении работают у только что подключённого проекта', async () => {
  const { root } = await freshProject();
  try {
    const call = await conventions(root, 'deploy-args', '--', '--env', 'production');
    assert.equal(call.code, 0, call.output);
    assert.match(call.output, /^env=production$/m);

    const catalogue = JSON.parse(await readFile(path.join(PACKAGE, 'obligations.json'), 'utf8')).obligations;
    const adopted = await conventions(root, 'release', 'adopt');
    const materialised = adopted.output.split('\n').filter((line) => line.includes('обязательство материализовано')).length;
    assert.equal(materialised, catalogue.length, 'подключение заводит задачами все действующие обязательства: их разбор — выпуск интеграции (REQ-ADOPTION-013)');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
