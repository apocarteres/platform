import assert from 'node:assert/strict';
import test from 'node:test';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { MANIFEST, acceptManifest, buildManifest, writeManifest } from '../lib/manifest.mjs';
import { deployment } from '../lib/components.mjs';
import { buildLimits } from '../lib/build-limits.mjs';
import { environmentWithoutGit } from '../lib/release/git.mjs';

const run = promisify(execFile);
const cli = path.join(path.dirname(path.dirname(fileURLToPath(import.meta.url))), 'bin', 'conventions.mjs');

const CONFIG = {
  deployment: {
    environments: ['production', 'staging'],
    builtElsewhere: ['production'],
    components: { server: { artifact: 'target/app.jar' }, client: { artifact: 'target/web.tgz' } },
  },
};

// REQ-DEPLOYMENT-031
async function machine(tag = 'v1.0.0') {
  const root = await mkdtemp(path.join(os.tmpdir(), 'build-machine-'));
  const git = (...args) => run('git', ['-C', root, ...args], { env: environmentWithoutGit() });
  await git('init', '--quiet');
  await git('config', 'user.email', 'test@example.test');
  await git('config', 'user.name', 'Test');
  await writeFile(path.join(root, '.conventions.json'), JSON.stringify(CONFIG));
  await git('add', '-A');
  await git('commit', '--quiet', '-m', 'состояние');
  if (tag !== null) await git('tag', tag);
  const put = async (file, content) => {
    await mkdir(path.dirname(path.join(root, file)), { recursive: true });
    await writeFile(path.join(root, file), content);
  };
  await put('target/app.jar', 'сервер');
  await put('target/web.tgz', 'клиент');
  return { root, git, put, stop: () => rm(root, { recursive: true, force: true }) };
}

// REQ-DEPLOYMENT-031
async function shipped(from, options = {}) {
  const built = await buildManifest(from.root, CONFIG, { environment: 'production', ...options });
  assert.equal(built.written, true, built.reason);
  const file = path.join(from.root, 'incoming/manifest.json');
  await writeManifest(from.root, built.manifest, file);
  return file;
}

// REQ-DEPLOYMENT-031
test('собранное на машине сборки принимается сверкой: тот же коммит, тег, среда и суммы', async () => {
  const one = await machine();
  try {
    const file = await shipped(one);
    const accepted = await acceptManifest(one.root, CONFIG, { file, environment: 'production' });
    assert.deepEqual(accepted.problems, []);
    const written = JSON.parse(await readFile(path.join(one.root, MANIFEST), 'utf8'));
    assert.equal(written.releaseTag, 'v1.0.0');
    assert.deepEqual(written.components.map((component) => component.name), ['server', 'client']);

    await one.put('target/app.jar', 'сервер, подменённый в пути');
    const tampered = await acceptManifest(one.root, CONFIG, { file, environment: 'production' });
    assert.equal(tampered.problems.length, 1, tampered.problems.join('\n'));
    assert.match(tampered.problems[0], /server: target\/app\.jar — сумма [0-9a-f]{12}…, в манифесте [0-9a-f]{12}…/);
  } finally {
    await one.stop();
  }
});

// REQ-DEPLOYMENT-031
test('чужой коммит, среда без машины сборки, непомеченное и необъявленное — отказ', async () => {
  const one = await machine();
  try {
    const file = await shipped(one);
    const staging = await acceptManifest(one.root, CONFIG, { file, environment: 'staging' });
    assert.ok(staging.problems.some((problem) => /среда staging не объявлена в deployment\.builtElsewhere/.test(problem)), staging.problems.join('\n'));

    await one.put('note.md', 'дальше');
    await one.git('add', '-A');
    await one.git('commit', '--quiet', '-m', 'следующий');
    const moved = await acceptManifest(one.root, CONFIG, { file, environment: 'production' });
    assert.ok(moved.problems.some((problem) => /собрано из коммита [0-9a-f]{8}, а здесь [0-9a-f]{8}/.test(problem)), moved.problems.join('\n'));
  } finally {
    await one.stop();
  }

  const bare = await machine(null);
  try {
    const file = await shipped(bare, { reason: 'стенд' });
    const untagged = await acceptManifest(bare.root, CONFIG, { file, environment: 'production' });
    assert.ok(untagged.problems.some((problem) => /без тега выпуска/.test(problem)), untagged.problems.join('\n'));

    const forged = JSON.parse(await readFile(file, 'utf8'));
    forged.components.push({ name: 'agent', artifact: 'target/agent', sha256: 'f'.repeat(64) });
    await writeFile(file, JSON.stringify(forged));
    const unknown = await acceptManifest(bare.root, CONFIG, { file, environment: 'production' });
    assert.ok(unknown.problems.some((problem) => /составляющая agent не объявлена/.test(problem)), unknown.problems.join('\n'));
  } finally {
    await bare.stop();
  }
});

// REQ-DEPLOYMENT-031
test('машина сборки объявляется для объявленной среды', () => {
  assert.deepEqual(deployment(CONFIG).problems, []);
  const wrong = deployment({ deployment: { ...CONFIG.deployment, builtElsewhere: ['prod'] } });
  assert.ok(wrong.problems.some((problem) => /builtElsewhere: среда prod не объявлена/.test(problem)), wrong.problems.join('\n'));
});

// REQ-BUILD-015
test('пределы сборки берутся из окружения машины; без них — ничего', () => {
  assert.deepEqual(buildLimits({}), { prefix: [], problems: [] });
  assert.deepEqual(buildLimits({ CONVENTIONS_BUILD_CPUS: '2', CONVENTIONS_BUILD_NICE: '10' }).prefix,
    ['taskset', '-c', '0-1', 'nice', '-n', '10']);
  assert.deepEqual(buildLimits({ CONVENTIONS_BUILD_NICE: '5' }).prefix, ['nice', '-n', '5']);
  const wrong = buildLimits({ CONVENTIONS_BUILD_CPUS: 'half', CONVENTIONS_BUILD_NICE: '40' }).problems;
  assert.ok(wrong.some((problem) => /CONVENTIONS_BUILD_CPUS — целое число ядер/.test(problem)), wrong.join('\n'));
  assert.ok(wrong.some((problem) => /CONVENTIONS_BUILD_NICE — от 0 до 19/.test(problem)), wrong.join('\n'));
});

async function hasTaskset() {
  try {
    await run('taskset', ['--version']);
    return true;
  } catch {
    return false;
  }
}

// REQ-BUILD-015
test('команда сборки под пределом видит заданное число ядер', { skip: !(await hasTaskset()) && 'taskset есть только в Linux' }, async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'build-limits-'));
  try {
    const { stdout } = await run(process.execPath, [cli, 'build', '--root', root, '--', 'nproc'],
      { env: { ...process.env, CONVENTIONS_BUILD_CPUS: '1', CONVENTIONS_BUILD_NICE: '5' } });
    assert.equal(stdout.trim().split('\n').at(-1), '1');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

// REQ-BUILD-015
test('предел ядер без taskset — отказ, а не сборка без предела', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'build-limits-'));
  try {
    const failed = await run(process.execPath, [cli, 'build', '--root', root, '--', 'true'],
      { env: { ...process.env, CONVENTIONS_BUILD_CPUS: '1', PATH: path.dirname(process.execPath) } })
      .then(() => null, (error) => error);
    assert.notEqual(failed, null, 'сборка прошла без предела');
    assert.match(`${failed.stdout}${failed.stderr}`, /taskset/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
