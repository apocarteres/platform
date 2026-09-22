import assert from 'node:assert/strict';
import test from 'node:test';
import os from 'node:os';
import path from 'node:path';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { DEPLOY_USAGE, ENTRY, deployCall, deployLines, deployUsage, findMissingDeployEntry } from '../lib/deploy-entry.mjs';
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
    ['env=production', 'components=backend,frontend', 'untagged-reason=']);
  assert.deepEqual(deployLines(deployCall(DECLARED, ['--env', 'qa', '--only', 'frontend'])),
    ['env=qa', 'components=frontend', 'untagged-reason=']);
  assert.match(DEPLOY_USAGE, /^scripts\/deploy\.sh --env <среда>/);
});

// REQ-DEPLOYMENT-021
const WITH_OWN = {
  deployment: {
    ...DECLARED.deployment,
    arguments: {
      commit: { value: true, summary: 'собрать названный коммит, а не HEAD' },
      'build-only': { summary: 'собрать и не ставить' },
    },
  },
};

// REQ-DEPLOYMENT-021
test('объявленные ключи проекта разбираются ядром и печатаются рядом', () => {
  assert.deepEqual(
    deployLines(deployCall(WITH_OWN, ['--env', 'qa', '--commit', '90ef6874', '--build-only'])),
    ['env=qa', 'components=backend,frontend', 'untagged-reason=', 'commit=90ef6874', 'build-only=yes'],
  );

  assert.deepEqual(
    deployLines(deployCall(WITH_OWN, ['--env', 'qa'])),
    ['env=qa', 'components=backend,frontend', 'untagged-reason=', 'commit=', 'build-only='],
    'объявленный ключ печатается всегда: разбор у скрипта не ветвится',
  );
});

// REQ-DEPLOYMENT-021
test('причина развёртывания непомеченного принадлежит ядру', () => {
  assert.deepEqual(
    deployLines(deployCall(DECLARED, ['--env', 'production', '--untagged-reason', 'срочное исправление'])),
    ['env=production', 'components=backend,frontend', 'untagged-reason=срочное исправление'],
    'ключ есть без объявления проектом',
  );
  assert.match(deployCall({
    deployment: { ...DECLARED.deployment, arguments: { 'untagged-reason': { value: true, summary: 'своё' } } },
  }, ['--env', 'qa']).problems[0], /принадлежит ядру/);
});

// REQ-DEPLOYMENT-021
test('необъявленный ключ отвергается, а форма вызова строится из объявления', () => {
  assert.match(deployCall(WITH_OWN, ['--env', 'qa', '--nope']).problems[0], /неизвестный ключ: --nope/);
  assert.match(deployCall(DECLARED, ['--env', 'qa', '--commit', 'a']).problems[0], /неизвестный ключ: --commit/,
    'без объявления ключа нет');

  const form = deployUsage({
    arguments: [
      { name: 'commit', value: true, summary: 'собрать названный коммит' },
      { name: 'build-only', value: false, summary: 'собрать и не ставить' },
    ],
  });
  assert.match(form, /\[--commit <значение>\] \[--build-only\]/);
  assert.match(form, /\n {2}--commit — собрать названный коммит/, 'пояснение печатается');
  assert.equal(deployUsage({ arguments: [] }), DEPLOY_USAGE, 'без ключей форма прежняя');
});

// REQ-DEPLOYMENT-021
test('объявление ключа проверяется', () => {
  const problemsOfArguments = (args) => deployment({
    deployment: { ...DECLARED.deployment, arguments: args },
  }).problems;

  assert.deepEqual(problemsOfArguments({ commit: { value: true, summary: 'коммит' } }), []);
  assert.match(problemsOfArguments({ commit: { value: true } })[0], /без пояснения/);
  assert.match(problemsOfArguments({ '--commit': { value: true, summary: 'к' } })[0], /имя ключа/);
  assert.match(problemsOfArguments({ commit: { value: 'yes', summary: 'к' } })[0], /да или нет/);
  assert.match(problemsOfArguments({ env: { value: true, summary: 'к' } })[0], /принадлежит ядру/);
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
