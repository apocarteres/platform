import assert from 'node:assert/strict';
import test from 'node:test';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { promisify } from 'node:util';
import { appendJournal, buildManifest, journalLine, writeManifest } from '../lib/manifest.mjs';
import { environmentWithoutGit } from '../lib/release/git.mjs';

const run = promisify(execFile);
const CONFIG = {
  deployment: {
    environments: ['qa', 'prod'],
    components: {
      backend: { artifact: 'backend/target/app.jar' },
      frontend: { artifact: 'frontend/dist/index.html' },
    },
  },
};

async function project({ tag = null } = {}) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'manifest-'));
  await mkdir(path.join(root, 'backend/target'), { recursive: true });
  await mkdir(path.join(root, 'frontend/dist'), { recursive: true });
  await writeFile(path.join(root, 'backend/target/app.jar'), 'сервер\n');
  await writeFile(path.join(root, 'frontend/dist/index.html'), '<html>клиент</html>\n');
  const git = (...args) => run('git', ['-C', root, ...args], { env: environmentWithoutGit() });
  await git('init', '--quiet');
  await git('config', 'user.email', 't@t');
  await git('config', 'user.name', 't');
  await git('commit', '--quiet', '--allow-empty', '-m', 'OPS-001 состояние');
  if (tag !== null) await git('tag', tag);
  return root;
}

// REQ-DEPLOYMENT-002
test('манифест собирается по объявленным составляющим, а не по именам в коде', async () => {
  const root = await project({ tag: 'v1.0.0' });
  try {
    const built = await buildManifest(root, CONFIG, { environment: 'prod' });

    assert.equal(built.written, true, built.reason);
    assert.deepEqual(built.manifest.components.map((one) => one.name), ['backend', 'frontend']);
    assert.match(built.manifest.components[0].sha256, /^[0-9a-f]{64}$/);
    assert.equal(built.manifest.releaseTag, 'v1.0.0');
    assert.equal(built.manifest.untaggedReason, null);
    assert.equal(built.manifest.environment, 'prod');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

// REQ-DEPLOYMENT-002
test('непомеченный коммит требует названной причины, а не проходит молча', async () => {
  const root = await project();
  try {
    const refused = await buildManifest(root, CONFIG, { environment: 'prod' });
    assert.equal(refused.written, false);
    assert.match(refused.reason, /не помечен тегом/);

    const withReason = await buildManifest(root, CONFIG, { environment: 'prod', reason: 'срочное исправление' });
    assert.equal(withReason.written, true, withReason.reason);
    assert.equal(withReason.manifest.releaseTag, null);
    assert.equal(withReason.manifest.untaggedReason, 'срочное исправление');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

// REQ-DEPLOYMENT-002, REQ-DEPLOYMENT-015
test('неизвестная среда и неизвестная составляющая названы отказом', async () => {
  const root = await project({ tag: 'v1.0.0' });
  try {
    const environment = await buildManifest(root, CONFIG, { environment: 'staging' });
    assert.match(environment.reason, /среда staging не объявлена; объявлены: qa, prod/);

    const component = await buildManifest(root, CONFIG, { environment: 'prod', only: ['backend', 'агент'] });
    assert.match(component.reason, /составляющие не объявлены: агент/);

    const missing = await buildManifest(root, { deployment: { environments: ['prod'], components: {
      backend: { artifact: 'нет/такого.jar' } } } }, { environment: 'prod' });
    assert.match(missing.reason, /backend: артефакта нет/, 'манифест не пишется по несобранному');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

// REQ-DEPLOYMENT-002
test('манифест ложится файлом, журнал — строкой и вне каталога исходников', async () => {
  const root = await project({ tag: 'v1.0.0' });
  const journal = path.join(root, '..', `journal-${path.basename(root)}.log`);
  try {
    const built = await buildManifest(root, CONFIG, { environment: 'prod' });
    const file = await writeManifest(root, built.manifest);
    const written = JSON.parse(await readFile(file, 'utf8'));
    assert.equal(written.commit, built.manifest.commit);

    await appendJournal(journal, built.manifest);
    await appendJournal(journal, built.manifest);
    const lines = (await readFile(journal, 'utf8')).trim().split('\n');

    assert.equal(lines.length, 2, 'журнал дополняется, а не переписывается');
    assert.match(lines[0], /env=prod commit=[0-9a-f]{40} tag=v1\.0\.0 components=backend,frontend/);
  } finally {
    await rm(root, { recursive: true, force: true });
    await rm(journal, { force: true });
  }
});

// REQ-DEPLOYMENT-002
test('строка журнала различает тег и объявленную причину его отсутствия', () => {
  const base = { environment: 'prod', commit: 'abc', createdAt: '2026-09-21T00:00:00.000Z', components: [{ name: 'backend' }] };

  assert.match(journalLine({ ...base, releaseTag: 'v1.0.0', untaggedReason: null }), /tag=v1\.0\.0/);
  assert.match(journalLine({ ...base, releaseTag: null, untaggedReason: 'срочно' }), /tag=none exception=срочно/);
});

// REQ-RELEASE-013
test('негодный каталог обязательств называется отказом, а не трассировкой', async () => {
  const { catalogueProblems, loadObligations } = await import('../lib/release/obligations.mjs');
  const complete = {
    id: 'x', title: 'т', requirement: 'REQ-X-001', level: 'директива', since: '1.0.0',
    dueReleases: 1, slug: 'adopt-x', area: 'OPS',
    ticket: { scope: 'a', priority: 'P1', problem: 'п', required: [], acceptance: [] },
  };

  assert.deepEqual(catalogueProblems([complete]), []);
  assert.deepEqual(catalogueProblems([{ ...complete, ticket: { ...complete.ticket, acceptance: undefined } }]),
    ['x: нет поля ticket.acceptance']);
  assert.deepEqual(catalogueProblems([{ ...complete, area: undefined }]), ['x: нет поля area']);
  assert.deepEqual(catalogueProblems([{ ...complete, ticket: { ...complete.ticket, required: 'строка' } }]),
    ['x: ticket.required не перечень']);
  assert.deepEqual(catalogueProblems([{ ticket: {} }]).length, 13, 'пустое обязательство названо по всем полям сразу');

  const root = await mkdtemp(path.join(os.tmpdir(), 'catalogue-'));
  try {
    await mkdir(path.join(root, 'node_modules/@apocarteres/project-conventions'), { recursive: true });
    await writeFile(path.join(root, 'node_modules/@apocarteres/project-conventions/obligations.json'),
      JSON.stringify({ obligations: [{ ...complete, ticket: { ...complete.ticket, acceptance: undefined } }] }));

    await assert.rejects(() => loadObligations(root), (failure) => {
      assert.match(failure.message, /Каталог обязательств .* не принят/);
      assert.match(failure.message, /нет поля ticket\.acceptance/);
      return true;
    });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
