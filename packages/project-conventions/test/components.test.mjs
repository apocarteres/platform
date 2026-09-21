import assert from 'node:assert/strict';
import test from 'node:test';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { deployment, knownEnvironment } from '../lib/components.mjs';

const run = promisify(execFile);
const cli = path.join(path.dirname(path.dirname(fileURLToPath(import.meta.url))), 'bin', 'conventions.mjs');

const DECLARED = {
  deployment: {
    environments: ['local', 'qa', 'prod'],
    components: {
      backend: { artifact: 'backend/target/app.jar' },
      frontend: { artifact: 'frontend/dist/index.html' },
      agent: { artifact: 'target/agent.tar.gz' },
    },
  },
};

async function project(config) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'components-'));
  await writeFile(path.join(root, '.conventions.json'), JSON.stringify({ sources: [], ...config }));
  return root;
}

// REQ-DEPLOYMENT-015
test('проект объявляет составляющие сам, и перечень бывает разной длины', () => {
  const three = deployment(DECLARED);
  assert.deepEqual(three.components.map((one) => one.name), ['backend', 'frontend', 'agent']);

  const two = deployment({ deployment: { environments: ['prod'], components: {
    backend: { artifact: 'target/app.jar' }, frontend: { artifact: 'dist/index.html' },
  } } });
  assert.deepEqual(two.components.map((one) => one.name), ['backend', 'frontend'],
    'у одного проекта сервер и клиент, у другого ещё и агент; ядро перечня не задаёт');
  assert.deepEqual(two.problems, []);
});

// REQ-DEPLOYMENT-015
test('необъявленное развёртывание от неверно объявленного отличается', () => {
  assert.equal(deployment({}).declared, false, 'молчание — не ошибка: проект мог ещё не объявить');

  const broken = deployment({ deployment: { environments: [], components: { Backend: {} } } });
  assert.equal(broken.declared, true);
  assert.equal(broken.problems.length, 3);
  assert.match(broken.problems[0], /среды не объявлены/);
  assert.match(broken.problems[1], /строчные буквы/);
  assert.match(broken.problems[2], /без артефакта/);
});

// REQ-DEPLOYMENT-015, REQ-BUILD-013
test('составляющая называет артефакт, а его появление утверждает шаг сборки', () => {
  const withoutArtifact = deployment({ deployment: { environments: ['prod'], components: { backend: {} } } });

  assert.equal(withoutArtifact.problems.length, 1);
  assert.match(withoutArtifact.problems[0], /REQ-BUILD-013/, 'отказ связывает объявление с утверждением шага');
});

// REQ-DEPLOYMENT-015
test('среда узнаётся по объявленному перечню', () => {
  assert.equal(knownEnvironment(DECLARED, 'qa'), true);
  assert.equal(knownEnvironment(DECLARED, 'staging'), false);
  assert.equal(knownEnvironment({}, 'prod'), false, 'без объявления неизвестна любая');
});

// REQ-DEPLOYMENT-015
test('команда отдаёт перечень построчно, чтобы скрипт не держал его вторым местом', async () => {
  const root = await project(DECLARED);
  const conventions = async (...args) => {
    try {
      const { stdout } = await run(process.execPath, [cli, 'components', ...args, '--root', root]);
      return { code: 0, output: stdout };
    } catch (failure) {
      return { code: failure.code, output: `${failure.stdout}${failure.stderr}` };
    }
  };
  try {
    const listed = await conventions();
    assert.equal(listed.code, 0, listed.output);
    assert.deepEqual(listed.output.trim().split('\n'), ['backend', 'frontend', 'agent']);

    const environments = await conventions('--environments');
    assert.deepEqual(environments.output.trim().split('\n'), ['local', 'qa', 'prod']);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

// REQ-DEPLOYMENT-015, REQ-QUALITY-005
test('необъявленное развёртывание отказывает с образцом объявления', async () => {
  const root = await project({});
  try {
    const answer = await run(process.execPath, [cli, 'components', '--root', root])
      .then(() => ({ code: 0, output: '' }), (failure) => ({ code: failure.code, output: `${failure.stdout}${failure.stderr}` }));

    assert.equal(answer.code, 1, answer.output);
    assert.match(answer.output, /Развёртывание не объявлено/);
    assert.match(answer.output, /"deployment".*"components"/s, 'отказ показывает, что именно написать');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
