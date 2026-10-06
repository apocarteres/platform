import assert from 'node:assert/strict';
import test from 'node:test';
import path from 'node:path';
import os from 'node:os';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { chmod, copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { environmentWithoutGit } from '../lib/release/git.mjs';

const run = promisify(execFile);
const here = path.dirname(fileURLToPath(import.meta.url));
const CORE = path.resolve(here, '../../..');
const RUNNER = 'scripts/verify-runner/runner.sh';

const FAKE_DOCKER = `#!/usr/bin/env bash
echo "$*" >> "$DOCKER_CALLS"
case "$1 $2" in
  "context show") echo test ;;
  "run --rm") echo 999 ;;
  "inspect -f")
    case "$3" in
      *HostConfig.Init*) echo "$CONTAINER_INIT" ;;
      *State.Running*) echo true ;;
    esac ;;
esac
[ "$1 $2" = "exec -i" ] && cat >/dev/null
exit 0
`;

async function sandbox(init) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'verify-runner-'));
  await mkdir(path.join(root, 'scripts/verify-runner'), { recursive: true });
  await mkdir(path.join(root, 'bin'));
  await copyFile(path.join(CORE, RUNNER), path.join(root, RUNNER));
  await writeFile(path.join(root, 'scripts/verify-runner/Dockerfile'), 'FROM scratch\n');
  await writeFile(path.join(root, 'bin/docker'), FAKE_DOCKER);
  await chmod(path.join(root, 'bin/docker'), 0o755);
  const git = (...args) => run('git', ['-C', root, ...args], { env: environmentWithoutGit() });
  await git('init', '--quiet');
  await git('config', 'user.email', 'test@example.test');
  await git('config', 'user.name', 'Test');
  await git('add', '-A');
  await git('commit', '--quiet', '-m', 'состояние');
  const env = {
    ...environmentWithoutGit(),
    PATH: `${path.join(root, 'bin')}:${process.env.PATH}`,
    DOCKER_CALLS: path.join(root, 'docker-calls.log'),
    CONTAINER_INIT: init,
  };
  return {
    root,
    async runner(...args) {
      try {
        const { stdout, stderr } = await run('bash', [path.join(root, RUNNER), ...args], { env });
        return { code: 0, output: `${stdout}${stderr}` };
      } catch (error) {
        return { code: error.code, output: `${error.stdout}${error.stderr}` };
      }
    },
    async calls() {
      return (await readFile(env.DOCKER_CALLS, 'utf8')).trim().split('\n');
    },
    stop: () => rm(root, { recursive: true, force: true }),
  };
}

// CORE-OPS-110
test('сборочный контейнер создаётся с init: осиротевшие процессы собирает PID 1', async () => {
  const one = await sandbox('true');
  try {
    const prepared = await one.runner('prepare');
    assert.equal(prepared.code, 0, prepared.output);
    const create = (await one.calls()).find((call) => call.startsWith('create '));
    assert.ok(create !== undefined, 'контейнер не создавался');
    assert.match(create, /(^| )--init( |$)/, create);
  } finally {
    await one.stop();
  }
});

// CORE-OPS-110
test('контейнер без init — отказ прогона с подсказкой пересоздать, до перезапуска контейнера', async () => {
  for (const init of ['false', '<nil>']) {
    const one = await sandbox(init);
    try {
      const refused = await one.runner('verify');
      assert.equal(refused.code, 1, refused.output);
      assert.match(refused.output, /без init.*mise run verify-runner-prepare/);
      assert.equal((await one.calls()).some((call) => call.startsWith('restart ') || call.startsWith('exec ')), false,
        'прогон начался в контейнере без init');
    } finally {
      await one.stop();
    }
  }
});

// CORE-OPS-110
test('контейнер с init — прогон идёт', async () => {
  const one = await sandbox('true');
  try {
    const passed = await one.runner('verify');
    assert.equal(passed.code, 0, passed.output);
    assert.ok((await one.calls()).some((call) => call.startsWith('restart ')));
  } finally {
    await one.stop();
  }
});
