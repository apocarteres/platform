import assert from 'node:assert/strict';
import test from 'node:test';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { namesAWayOut } from './way-out.mjs';
import { PREFIX, referenceConsumer } from './reference-consumer.mjs';
import { consumerShape } from './shapes.mjs';
import { commandsOf } from '../lib/release/surface.mjs';
import * as cycle from '../lib/release/cycle.mjs';

const run = promisify(execFile);
const here = path.dirname(fileURLToPath(import.meta.url));
const cli = path.join(here, '..', 'bin', 'conventions.mjs');
const DAY = new Date('2026-09-12T00:00:00Z');

async function conventions(root, ...args) {
  try {
    const { stdout, stderr } = await run(process.execPath, [cli, ...args, '--root', root]);
    return { code: 0, output: `${stdout}${stderr}` };
  } catch (failure) {
    return { code: failure.code, output: `${failure.stdout ?? ''}${failure.stderr ?? ''}` };
  }
}

// REQ-RELEASE-039
const DEPLOYMENT_COMMANDS = ['components', 'deploy-args', 'manifest', 'deployed', 'health', 'unknown', 'static-check', 'migrations', 'upgrade-report', 'jvm-args'];

// REQ-RELEASE-039
test('каждый отказ называет выход: команду, ключ или действие', async () => {
  const refusals = [];
  const take = (scenario, problems) => {
    assert.ok(problems.length > 0, `${scenario}: сценарий обязан отказывать`);
    for (const problem of problems) refusals.push([scenario, problem]);
  };

  const plain = await referenceConsumer();
  const shape = await consumerShape('host');
  const bare = await mkdtemp(path.join(os.tmpdir(), 'not-a-repository-'));
  try {
    const root = plain.root;
    take('release close', (await cycle.closeRelease(root, { scheme: 'date' })).problems);
    take('release reclose', (await cycle.recloseRelease(root, { scheme: 'date', reason: 'x' })).problems);
    take('release reclose', (await cycle.recloseRelease(root, { scheme: 'date', reason: '' })).problems);
    take('release finish', (await cycle.finishRelease(root, { scheme: 'date', today: DAY, note: 'x' })).problems);
    take('release drop', (await cycle.dropFromComposition(root, { ticketId: 'X', reason: '' })).problems);
    take('release drop', (await cycle.dropFromComposition(root, { ticketId: 'X', reason: 'x' })).problems);
    take('release cancel', (await cycle.cancelRelease(root, { reason: 'x' })).problems);
    take('release cancel', (await cycle.cancelRelease(root, { reason: '' })).problems);
    take('release account', (await cycle.accountCommit(root, { sha: '', reason: 'x' })).problems);
    take('release account', (await cycle.accountCommit(root, { sha: 'abc', reason: '' })).problems);
    take('release account', (await cycle.accountCommit(root, { sha: 'abc', reason: 'x' })).problems);
    take('release adopt', (await cycle.adoptCycle(root, { scheme: 'date', today: DAY })).problems);
    take('release satisfy', (await cycle.satisfyObligation(root, { obligationId: 'nope', ticketId: 'X' })).problems);
    take('release open', (await cycle.openNext(root, { scheme: 'date', today: DAY, tickets: [`${PREFIX}-QUAL-777`] })).problems);
    take('release open', (await cycle.openNext(root, { scheme: 'semver', today: DAY })).problems);
    assert.equal((await cycle.openNext(root, { scheme: 'date', today: DAY })).opened, true);
    take('release open', (await cycle.openNext(root, { scheme: 'date', today: DAY })).problems);
    take('release close', (await cycle.closeRelease(root, { scheme: 'date' })).problems);
    take('release reclose', (await cycle.recloseRelease(root, { scheme: 'date', reason: 'x' })).problems);
    take('release finish', (await cycle.finishRelease(root, { scheme: 'date', today: DAY, note: 'x' })).problems);
    take('release drop', (await cycle.dropFromComposition(root, { ticketId: `${PREFIX}-QUAL-777`, reason: 'x' })).problems);
    take('release drop', (await cycle.dropFromComposition(root, { ticketId: `${PREFIX}-QUAL-001`, reason: 'x' })).problems);
    take('release account', (await cycle.accountCommit(root, { sha: 'deadbeef', reason: 'x' })).problems);

    const cliRefusal = async (scenario, where, ...args) => {
      const answer = await conventions(where, ...args);
      assert.notEqual(answer.code, 0, `${scenario}: сценарий обязан отказывать\n${answer.output}`);
      refusals.push([scenario, answer.output]);
    };
    await cliRefusal('release status', bare, 'release', 'status');
    await cliRefusal('release defer', root, 'release', 'defer', 'nope', '--reason', 'x');
    await cliRefusal('components', root, 'components');
    await cliRefusal('deploy-args', root, 'deploy-args', '--', '--env', 'production');
    await cliRefusal('deploy-args', shape.root, 'deploy-args', '--', 'production');
    await cliRefusal('deploy-args', shape.root, 'deploy-args', '--');
    await cliRefusal('deploy-args', shape.root, 'deploy-args', '--', '--env', 'prod');
    await cliRefusal('deploy-args', shape.root, 'deploy-args', '--', '--env', 'qa', '--nope');
    await cliRefusal('deploy-args', shape.root, 'deploy-args', '--', '--env', 'qa', '--only', 'agent');
    await cliRefusal('manifest', shape.root, 'manifest', '--env', 'staging');
    await cliRefusal('manifest', shape.root, 'manifest', '--env', 'qa');
    await cliRefusal('deployed', shape.root, 'deployed');
    await cliRefusal('deployed', shape.root, 'deployed', '--artifact', 'нет/такого.jar', '--installed', '/нет/такого');
    await cliRefusal('health', shape.root, 'health');
    await cliRefusal('health', shape.root, 'health', '--url', 'http://127.0.0.1:1/', '--timeout', '1');
    await cliRefusal('unknown', shape.root, 'unknown');
    await cliRefusal('static-check', shape.root, 'static-check');
    await cliRefusal('migrations', shape.root, 'migrations');
    await cliRefusal('migrations', shape.root, 'migrations', '--unreleased');
    await cliRefusal('static-check', shape.root, 'static-check', '--url', 'http://127.0.0.1:1/', '--component', 'нет');
    await cliRefusal('static-check', shape.root, 'static-check', '--url', 'http://127.0.0.1:1/', '--component', 'frontend');
    await cliRefusal('upgrade-report', shape.root, 'upgrade-report');
    await cliRefusal('upgrade-report', shape.root, 'upgrade-report', '--from', 'один');
    await cliRefusal('jvm-args', shape.root, 'jvm-args');
    await cliRefusal('jvm-args', shape.root, 'jvm-args', '--archive', 'a.jsa', '--aot', 'a.aot');
  } finally {
    await rm(plain.root, { recursive: true, force: true });
    await rm(shape.root, { recursive: true, force: true });
    await rm(bare, { recursive: true, force: true });
  }

  const silent = refusals.filter(([, text]) => !namesAWayOut(text));
  assert.deepEqual(silent.map(([scenario, text]) => `${scenario}: ${text.trim().split('\n')[0]}`), [],
    'отказ без выхода оставляет человека с запретом и без хода (REQ-RELEASE-039)');

  // REQ-RELEASE-039
  const { subcommands } = commandsOf(await readFile(cli, 'utf8'));
  const covered = new Set(refusals.map(([scenario]) => scenario));
  for (const sub of subcommands) assert.ok(covered.has(`release ${sub}`), `у подкоманды release ${sub} нет сценария отказа`);
  for (const command of DEPLOYMENT_COMMANDS) assert.ok(covered.has(command), `у команды ${command} нет сценария отказа`);
});

// REQ-RELEASE-039
test('признак выхода отличает указание от констатации', () => {
  assert.equal(namesAWayOut('Открытого выпуска нет: отменять нечего'), false);
  assert.equal(namesAWayOut('Открытого выпуска нет: откройте выпуск командой release open'), true);
  assert.equal(namesAWayOut('Перенос тега требует причины: ключ --reason'), true);
  assert.equal(namesAWayOut('Зафиксируйте изменения коммитом своей задачи'), true);
  assert.equal(namesAWayOut('Ядро не объявляет обязательства nope'), false);
});
