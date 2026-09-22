import assert from 'node:assert/strict';
import test from 'node:test';
import os from 'node:os';
import path from 'node:path';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { environmentConfiguration, findUndeliveredConfiguration } from '../lib/environment-config.mjs';
import { deployment } from '../lib/components.mjs';

const WEB = 'deploy/nginx/site.conf';
const UNIT = 'deploy/service.service';

function declaring(...artifacts) {
  const components = { backend: { artifact: 'target/service.jar' } };
  for (const [index, artifact] of artifacts.entries()) {
    components[`carried${index}`] = { artifact, install: `/etc/${index}` };
  }
  return { deployment: { environments: ['production'], components } };
}

async function project(files) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'environment-'));
  for (const file of files) {
    await mkdir(path.join(root, path.dirname(file)), { recursive: true });
    await writeFile(path.join(root, file), 'настройка\n');
  }
  return root;
}

// REQ-DEPLOYMENT-020
test('настройкой среды считаются описание службы и настройка веб-сервера', () => {
  assert.equal(environmentConfiguration('deploy/clanlog.service'), 'описание службы');
  assert.equal(environmentConfiguration('ops/backup.timer'), 'описание службы');
  assert.equal(environmentConfiguration('deploy/nginx/site.conf'), 'настройка веб-сервера');
  assert.equal(environmentConfiguration('nginx.conf'), 'настройка веб-сервера');
  assert.equal(environmentConfiguration('Caddyfile'), 'настройка веб-сервера');

  assert.equal(environmentConfiguration('src/main/java/App.java'), null);
  assert.equal(environmentConfiguration('docs/runbooks/deploy.conf'), null, 'просто .conf настройкой не считается');
});

// REQ-DEPLOYMENT-020
test('необъявленная настройка среды называется, объявленная — нет', async () => {
  const root = await project([WEB, UNIT, 'src/App.java']);
  try {
    const missed = await findUndeliveredConfiguration(root, declaring());
    assert.deepEqual([...missed.keys()], ['.conventions.json']);
    const texts = missed.get('.conventions.json').map((item) => item.text);
    assert.equal(texts.length, 2, texts.join('\n'));
    assert.ok(texts.some((text) => text.includes(`настройка веб-сервера ${WEB}`)), texts.join('\n'));
    assert.ok(texts.some((text) => text.includes(`описание службы ${UNIT}`)), texts.join('\n'));
    assert.ok(texts.every((text) => text.includes('развёртывание её не повезёт')), 'отказ называет последствие');

    const half = await findUndeliveredConfiguration(root, declaring(WEB));
    assert.deepEqual(half.get('.conventions.json').map((item) => item.text.includes(UNIT)), [true]);

    const whole = await findUndeliveredConfiguration(root, declaring(WEB, UNIT));
    assert.equal(whole.size, 0, 'объявленные составляющими замечаний не дают');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

// REQ-DEPLOYMENT-020
test('без объявленного развёртывания настройки среды не спрашиваются', async () => {
  const root = await project([WEB, UNIT]);
  try {
    assert.equal((await findUndeliveredConfiguration(root, {})).size, 0);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

// REQ-DEPLOYMENT-020
test('место установки и разбор объявляются, и разбор без места отвергается', () => {
  const problemsOf = (component) => deployment({
    deployment: { environments: ['production'], components: { web: component } },
  }).problems;

  assert.deepEqual(problemsOf({ artifact: WEB, install: '/etc/nginx/site.conf', verify: 'nginx -t -c {}' }), []);
  assert.deepEqual(problemsOf({ artifact: 'target/service.jar' }), [], 'поля необязательны');

  assert.match(problemsOf({ artifact: WEB, verify: 'nginx -t -c {}' })[0], /место установки нет/);
  assert.match(problemsOf({ artifact: WEB, install: '/etc/n', verify: 'nginx -t' })[0], /нет места для пути/);
  assert.match(problemsOf({ artifact: WEB, install: '  ' })[0], /не пустое значение/);
  assert.match(problemsOf({ artifact: WEB, install: '/etc/n', verify: '' })[0], /не пустое значение/);
});
