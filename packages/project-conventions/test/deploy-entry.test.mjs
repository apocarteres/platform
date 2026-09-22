import assert from 'node:assert/strict';
import test from 'node:test';
import os from 'node:os';
import path from 'node:path';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { DEPLOY_USAGE, ENTRY, deployCall, deployLines, findMissingDeployEntry } from '../lib/deploy-entry.mjs';
import { deployment } from '../lib/components.mjs';

const DECLARED = {
  deployment: {
    environments: ['local', 'qa', 'production'],
    components: { backend: { artifact: 'target/service.jar' }, frontend: { artifact: 'dist/client' } },
  },
};

const problemsOf = (argv) => deployCall(DECLARED, argv).problems;

// REQ-DEPLOYMENT-019
test('форма вызова одна: среда ключом, составляющие по умолчанию все', () => {
  assert.deepEqual(deployLines(deployCall(DECLARED, ['--env', 'production'])),
    ['env=production', 'components=backend,frontend']);
  assert.deepEqual(deployLines(deployCall(DECLARED, ['--env', 'qa', '--only', 'frontend'])),
    ['env=qa', 'components=frontend']);
  assert.match(DEPLOY_USAGE, /^scripts\/deploy\.sh --env <среда>/);
});

// REQ-DEPLOYMENT-019
test('оба расхождения потребителей отвергаются поимённо', () => {
  const positional = problemsOf(['qa']);
  assert.equal(positional.length, 1);
  assert.match(positional[0], /довод без ключа: qa/);
  assert.match(positional[0], /а не порядком доводов/, 'отказ называет, чем позиционный довод плох');

  const missing = problemsOf([]);
  assert.equal(missing.length, 1);
  assert.match(missing[0], /умолчания у него нет/, 'умолчание среды отвергается прямо');
  assert.match(missing[0], /local, qa, production/, 'отказ называет объявленные среды');
});

// REQ-DEPLOYMENT-019
test('неизвестная среда, неизвестная составляющая и неизвестный ключ различаются', () => {
  assert.match(problemsOf(['--env', 'prod'])[0], /среда prod не объявлена/);
  assert.match(problemsOf(['--env', 'qa', '--only', 'agent'])[0], /составляющие не объявлены: agent/);
  assert.match(problemsOf(['--env', 'qa', '--only', 'agent'])[0], /объявлены: backend, frontend/);
  assert.match(problemsOf(['--environment', 'qa'])[0], /неизвестный ключ: --environment/);
  assert.match(problemsOf(['--env', 'qa', '--only', ''])[0], /без составляющих/);
});

// REQ-DEPLOYMENT-019
test('без объявления развёртывания вызов не разбирается', () => {
  assert.match(deployCall({}, ['--env', 'production']).problems[0], /развёртывание не объявлено/);
});

// REQ-DEPLOYMENT-019
test('рабочая среда называется production, её сокращения отвергаются', () => {
  const namesOf = (environments) => deployment({
    deployment: { environments, components: { backend: { artifact: 'a' } } },
  }).problems;

  assert.deepEqual(namesOf(['local', 'qa', 'production']), []);
  for (const alias of ['prod', 'prd', 'live']) {
    const problems = namesOf([alias]);
    assert.equal(problems.length, 1, alias);
    assert.match(problems[0], new RegExp(`имя среды «${alias}»`));
    assert.match(problems[0], /называется «production»/);
  }
  assert.match(namesOf(['СРЕДА'])[0], /строчные буквы/, 'прежняя проверка имени осталась');
});

// REQ-DEPLOYMENT-019
test('объявленное развёртывание требует входа, а необъявленное не требует', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'deploy-entry-'));
  try {
    await writeFile(path.join(root, '.conventions.json'),
      '{\n  "ticketPrefix": "REF",\n  "deployment": {}\n}\n');

    const missing = await findMissingDeployEntry(root, DECLARED);
    assert.deepEqual([...missing.keys()], ['.conventions.json']);
    assert.deepEqual(missing.get('.conventions.json'), [{ line: 3, text: `развёртывание объявлено, а входа ${ENTRY} нет` }]);

    assert.equal((await findMissingDeployEntry(root, {})).size, 0, 'без раздела вход не требуется');

    await mkdir(path.join(root, path.dirname(ENTRY)), { recursive: true });
    await writeFile(path.join(root, ENTRY), '#!/usr/bin/env bash\nset -euo pipefail\n');
    assert.equal((await findMissingDeployEntry(root, DECLARED)).size, 0, 'вход на месте — замечаний нет');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
