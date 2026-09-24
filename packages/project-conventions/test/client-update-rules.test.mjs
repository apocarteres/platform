import assert from 'node:assert/strict';
import test from 'node:test';
import os from 'node:os';
import path from 'node:path';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { findClientsWithoutUpdate, runtimeDependencies } from '../lib/client-update.mjs';
import { defersWithoutError } from '../lib/defer-error.mjs';
import { findUnguardedBudgets } from '../lib/bundle-budgets.mjs';

// REQ-CLIENT-UPDATE-008
async function project(files) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'client-update-'));
  for (const [file, content] of Object.entries(files)) {
    await mkdir(path.join(root, path.dirname(file)), { recursive: true });
    await writeFile(path.join(root, file), content);
  }
  return root;
}

// REQ-CLIENT-UPDATE-008, REQ-BUILD-014
const workspace = (budgets, projectType = 'application') => `${JSON.stringify({
  projects: {
    inventory: {
      projectType,
      root: '',
      sourceRoot: 'src',
      architect: { build: { configurations: { production: { budgets } } } },
    },
  },
}, null, 2)}\n`;

// REQ-CLIENT-UPDATE-008
const CONFIG = "import { provideHttpClient, withInterceptors } from '@angular/common/http';\n"
  + "import { appUpdateInterceptor, provideAppUpdate } from '@apocarteres/app-update';\n\n"
  + 'export const config = { providers: [\n'
  + '  provideHttpClient(withInterceptors([appUpdateInterceptor])),\n'
  + '  provideAppUpdate({ apiVersion: 1, available: Banner, required: Blocker }),\n] };\n';

// REQ-CLIENT-UPDATE-008
const pom = (dependencies) => `<project>\n  <dependencies>\n${dependencies.map(([artifact, scope]) => '    <dependency>\n'
  + `      <artifactId>${artifact}</artifactId>\n${scope ? `      <scope>${scope}</scope>\n` : ''}    </dependency>\n`).join('')}  </dependencies>\n</project>\n`;

// REQ-CLIENT-UPDATE-008
test('приложение без объявления или без перехватчика называется с тем, чего не хватает', async () => {
  const root = await project({
    'frontend/angular.json': workspace([]),
    'frontend/src/app/app.config.ts': CONFIG.replace('provideHttpClient(withInterceptors([appUpdateInterceptor])),\n', ''),
  });
  try {
    const found = await findClientsWithoutUpdate(root, {});
    const [item] = found.get('frontend/angular.json');
    assert.match(item.text, /приложение inventory .*нет appUpdateInterceptor/);
    assert.doesNotMatch(item.text, /нет provideAppUpdate/);
    await writeFile(path.join(root, 'frontend/src/app/app.config.ts'), CONFIG);
    assert.equal((await findClientsWithoutUpdate(root, {})).size, 0);
    await writeFile(path.join(root, 'frontend/src/app/app.config.ts'), 'export const config = { providers: [] };\n');
    assert.match((await findClientsWithoutUpdate(root, {})).get('frontend/angular.json')[0].text,
      /нет provideAppUpdate\(\{ apiVersion, available, required \}\) и appUpdateInterceptor/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

// REQ-CLIENT-UPDATE-008
test('библиотека Angular механизма не объявляет, объявление вне исходников приложения не засчитывается', async () => {
  const root = await project({
    'lib/angular.json': workspace([], 'library'),
    'lib/src/index.ts': 'export {};\n',
    'app/angular.json': workspace([]),
    'app/src/main.ts': 'export {};\n',
    'app/tools/sample.ts': CONFIG,
  });
  try {
    const found = await findClientsWithoutUpdate(root, {});
    assert.deepEqual([...found.keys()], ['app/angular.json']);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

// REQ-CLIENT-UPDATE-008
test('служба на веб-слое Spring без starter-а называется, тестовая зависимость веб-слоя службой не делает', async () => {
  const root = await project({
    'pom.xml': pom([['spring-boot-starter-web']]),
    'library/pom.xml': pom([['spring-webmvc'], ['spring-boot-starter-web', 'test']]),
    'webmvc/pom.xml': pom([['spring-boot-starter-webmvc'], ['platform-api-version', 'test']]),
  });
  try {
    const found = await findClientsWithoutUpdate(root, {});
    assert.deepEqual([...found.keys()].sort(), ['pom.xml', 'webmvc/pom.xml']);
    assert.match(found.get('pom.xml')[0].text, /spring-boot-starter-web без platform-api-version/);
    assert.equal(found.get('pom.xml')[0].line, 3);
    await writeFile(path.join(root, 'pom.xml'), pom([['spring-boot-starter-web'], ['platform-api-version']]));
    assert.deepEqual([...(await findClientsWithoutUpdate(root, {})).keys()], ['webmvc/pom.xml']);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
  assert.deepEqual(runtimeDependencies(pom([['a'], ['b', 'test'], ['c', 'runtime']])).map((one) => one.artifact), ['a', 'c']);
});

// REQ-CLIENT-UPDATE-009
test('@defer без @error находится, с @error после других блоков — нет', () => {
  assert.equal(defersWithoutError('@defer (on viewport) { <app-chart/> } @placeholder { … } @error { <p apcrChunkFailure>нет</p> }').length, 0);
  assert.equal(defersWithoutError('@defer { <a/> } @loading (minimum 1s) { … } @placeholder { … } @error { нет }').length, 0);

  const bare = defersWithoutError('<section>\n  @defer (on idle) { <app-chart [data]="{ a: 1 }"/> } @placeholder { … }\n</section>\n');
  assert.equal(bare.length, 1);
  assert.equal(bare[0].line, 2);
  assert.match(bare[0].text, /блок @defer без @error/);
});

// REQ-CLIENT-UPDATE-009
test('@error вложенного блока не засчитывается внешнему, скобки в строках не сбивают разбор', () => {
  const nested = defersWithoutError('@defer { @defer { <b/> } @error { нет } } @placeholder { … }');
  assert.equal(nested.length, 1, 'внешний блок без собственного @error');
  assert.equal(nested[0].line, 1);
  assert.equal(defersWithoutError('@defer (when ready("}")) { <p title="}">x</p> } @error { нет }').length, 0);
  assert.equal(defersWithoutError('<p>текст про @defer без блока</p>').length, 0, 'упоминание без блока — не блок');
});

// REQ-BUILD-014
test('бюджет начального пакета с порогом ошибки проходит, без него или с порогом предупреждения — нет', async () => {
  const root = await project({ 'frontend/angular.json': workspace([{ type: 'initial', maximumError: '800kb' }]) });
  try {
    assert.equal((await findUnguardedBudgets(root)).size, 0);

    await writeFile(path.join(root, 'frontend/angular.json'), workspace([{ type: 'initial', maximumWarning: '700kb', maximumError: '1mb' }]));
    const warned = (await findUnguardedBudgets(root)).get('frontend/angular.json');
    assert.equal(warned.length, 1);
    assert.match(warned[0].text, /бюджет initial с maximumWarning — превышение порога предупреждения сборку не роняет/);

    await writeFile(path.join(root, 'frontend/angular.json'), workspace([{ type: 'anyComponentStyle', maximumError: '8kb' }]));
    assert.match((await findUnguardedBudgets(root)).get('frontend/angular.json')[0].text, /без бюджета начального пакета с maximumError/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
