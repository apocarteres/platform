import assert from 'node:assert/strict';
import test from 'node:test';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { STACKS, stackProblems } from '../lib/stack.mjs';
import { catalogueProblems, loadObligations } from '../lib/release/obligations.mjs';
import { environmentWithoutGit } from '../lib/release/git.mjs';

const run = promisify(execFile);
const cli = path.join(path.dirname(path.dirname(fileURLToPath(import.meta.url))), 'bin', 'conventions.mjs');

// REQ-ADOPTION-028
async function project(config, files = {}) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'stack-'));
  await writeFile(path.join(root, '.conventions.json'), JSON.stringify(config));
  for (const [name, content] of Object.entries(files)) {
    await mkdir(path.dirname(path.join(root, name)), { recursive: true });
    await writeFile(path.join(root, name), content);
  }
  const git = (...args) => run('git', ['-C', root, ...args], { env: environmentWithoutGit() });
  await git('init', '--quiet');
  await git('add', '-A');
  return root;
}

// REQ-ADOPTION-028
test('стек проекта — из известного перечня; неизвестное значение названо', async () => {
  assert.deepEqual(STACKS, ['java', 'angular', 'rust']);
  const root = await project({ sources: ['.'], stack: ['java', 'cobol'] });
  try {
    assert.deepEqual(await stackProblems(root, { stack: ['java', 'cobol'] }),
      ['.conventions.json: стек cobol неизвестен; известны java, angular, rust']);
    assert.deepEqual(await stackProblems(root, {}), [], 'без объявления сверять не с чем');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

// REQ-ADOPTION-028
test('сверка: файл сборки стека, который проект не объявил, — отказ; уйти от обязательств молчанием нельзя', async () => {
  const root = await project({ sources: ['.'], stack: [] }, {
    'service/pom.xml': '<project/>', 'web/angular.json': '{}', 'agent/Cargo.toml': '[package]', 'node_modules/x/pom.xml': '<project/>',
  });
  try {
    assert.deepEqual(await stackProblems(root, { stack: [] }), [
      '.conventions.json: найден service/pom.xml, а стек java не объявлен в stack',
      '.conventions.json: найден web/angular.json, а стек angular не объявлен в stack',
      '.conventions.json: найден agent/Cargo.toml, а стек rust не объявлен в stack',
    ]);
    assert.deepEqual(await stackProblems(root, { stack: ['java', 'angular', 'rust'] }), []);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

// REQ-RELEASE-013
test('каталог: поле stack — перечень известных стеков', () => {
  const base = { id: 'x', title: 't', requirement: 'R', level: 'директива', since: '1.0.0', dueReleases: 1, slug: 's', area: 'OPS',
    ticket: { scope: 's', priority: 'P1', problem: 'p', required: [], acceptance: [] } };
  assert.deepEqual(catalogueProblems([{ ...base, stack: ['java'] }]), []);
  assert.deepEqual(catalogueProblems([{ ...base, stack: 'java' }]), ['x: stack не перечень известных стеков']);
  assert.deepEqual(catalogueProblems([{ ...base, stack: ['cobol'] }]), ['x: stack не перечень известных стеков']);
});

// REQ-ADOPTION-028
test('обязательство чужого стека к проекту не относится; без объявления стека — все, как прежде', async () => {
  const catalogue = await readFile(new URL('../obligations.json', import.meta.url), 'utf8');
  const all = JSON.parse(catalogue).obligations;
  const rulesOnly = await project({ sources: ['.'], stack: [] });
  const java = await project({ sources: ['.'], stack: ['java'] }, { 'pom.xml': '<project/>' });
  const silent = await project({ sources: ['.'] });
  try {
    const none = await loadObligations(rulesOnly);
    assert.ok(none.obligations.every((one) => one.stack === undefined), 'проекту без стека — только общие');
    assert.ok(none.notApplicable.some((one) => one.id === 'java-25'));
    assert.ok(none.notApplicable.some((one) => one.id === 'modal-escape'));
    assert.ok(none.obligations.some((one) => one.id === 'release-cycle'));

    const withJava = await loadObligations(java);
    assert.ok(withJava.obligations.some((one) => one.id === 'java-25'));
    assert.ok(withJava.notApplicable.some((one) => one.id === 'bundle-budgets'));

    assert.equal((await loadObligations(silent)).obligations.length, all.length);
  } finally {
    for (const root of [rulesOnly, java, silent]) await rm(root, { recursive: true, force: true });
  }
});

// REQ-ADOPTION-028
test('каталог ядра размечен: обязательства Java и Angular не достаются проекту только с правилами', async () => {
  const all = JSON.parse(await readFile(new URL('../obligations.json', import.meta.url), 'utf8')).obligations;
  const of = (id) => all.find((one) => one.id === id)?.stack;
  for (const id of ['java-25', 'java-modules', 'data-access', 'liquibase-migrations', 'wiring-check', 'core-auth']) {
    assert.deepEqual(of(id), ['java'], id);
  }
  for (const id of ['modal-escape', 'modal-actions', 'modal-busy-backdrop', 'client-update', 'defer-error', 'bundle-budgets',
    'static-archive', 'unknown-path']) {
    assert.deepEqual(of(id), ['angular'], id);
  }
  for (const id of ['release-cycle', 'local-quality-gates', 'ticket-prefix', 'commit-ticket-id', 'backups', 'telemetry']) {
    assert.equal(of(id), undefined, id);
  }
});

// REQ-ADOPTION-028
test('check отказывает на необъявленном стеке, obligations показывает неотносящиеся', async () => {
  const root = await project({ sources: ['.'], stack: [] }, { 'pom.xml': '<project/>', 'AGENTS.md': '# x\n' });
  try {
    await run(process.execPath, [cli, 'sync', '--root', root]);
    const checked = await run(process.execPath, [cli, 'check', '--root', root]).then(() => null, (error) => error);
    assert.notEqual(checked, null);
    assert.match(`${checked.stdout}${checked.stderr}`, /найден pom\.xml, а стек java не объявлен/);

    await writeFile(path.join(root, '.conventions.json'), JSON.stringify({ sources: ['.'], stack: [] }));
    await rm(path.join(root, 'pom.xml'));
    const { stdout } = await run(process.execPath, [cli, 'obligations', '--root', root]);
    assert.match(stdout, /java-25 .*не относится: стек java не объявлен/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
