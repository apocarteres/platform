import assert from 'node:assert/strict';
import test from 'node:test';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { PREFIX, referenceConsumer } from './reference-consumer.mjs';
import { writeReceipt } from '../lib/release/receipt.mjs';

const run = promisify(execFile);
const cli = path.join(path.dirname(path.dirname(fileURLToPath(import.meta.url))), 'bin', 'conventions.mjs');

async function conventions(root, ...args) {
  try {
    const { stdout, stderr } = await run(process.execPath, [cli, ...args, '--root', root]);
    return { code: 0, output: `${stdout}${stderr}` };
  } catch (failure) {
    return { code: failure.code, output: `${failure.stdout ?? ''}${failure.stderr ?? ''}` };
  }
}

const DAY = new Date('2026-09-12T00:00:00Z');
const STATE = '.conventions/obligations.json';

// REQ-RELEASE-048, REQ-QUALITY-004
test('закрытие называет файлы своего коммита, а отправка без счётчика выпусков отказывает и называет его', async () => {
  const consumer = await referenceConsumer();
  const root = consumer.root;
  const id = `${PREFIX}-QUAL-310`;
  try {
    await writeFile(path.join(root, `docs/tickets/closed/${id}-work.md`),
      `---\nid: ${id}\ntype: ticket\nstatus: done\nscope: quality\nauthority: supporting\n`
      + `priority: P2\nrelease: unassigned\n---\n\n# ${id}\n\nРабота потребителя.\n`);
    assert.equal((await conventions(root, 'tickets-index')).code, 0);
    await consumer.git('add', '-A');
    await consumer.git('commit', '--quiet', '-m', `${id} работа по задаче состава`);
    assert.equal((await conventions(root, 'release', 'open', '--tickets', id)).code, 0);
    await consumer.git('add', '-A');
    await consumer.git('commit', '--quiet', '-m', `${id} состав выпуска записан`);
    const opened = (await consumer.git('rev-parse', 'HEAD')).stdout.trim();
    await writeReceipt(root, { commit: opened, completedAt: DAY, checks: ['verify'], run: { command: 'mise run check', exitCode: 0 } });
    assert.equal((await conventions(root, 'release', 'close')).code, 0);

    const finished = await conventions(root, 'release', 'finish', '--note', 'развёртывание');
    assert.equal(finished.code, 0, finished.output);
    assert.match(finished.output, /В коммит закрытия входят:[^\n]*\.conventions\/obligations\.json/, finished.output);
    assert.match(finished.output, /В коммит закрытия входят:[^\n]*docs\/releases\//, finished.output);

    await consumer.git('add', 'docs');
    await consumer.git('commit', '--quiet', '-m', 'Выпуск закрыт\n\nRelease-cycle: close');
    const forgotten = await conventions(root, 'commits', '--range', `${opened}..HEAD`);
    assert.notEqual(forgotten.code, 0, 'счётчик выпусков вне коммита не должен уходить незамеченным');
    assert.ok(forgotten.output.includes(STATE), forgotten.output);

    await consumer.git('add', STATE);
    await consumer.git('commit', '--quiet', '-m', 'Счётчик выпуска\n\nRelease-cycle: close');
    const whole = await conventions(root, 'commits', '--range', `${opened}..HEAD`);
    assert.equal(whole.code, 0, whole.output);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

// REQ-QUALITY-004, REQ-RELEASE-048
test('отправка отказывает и на впервые созданном файле состояния, которого ещё нет в истории', async () => {
  const consumer = await referenceConsumer();
  const root = consumer.root;
  try {
    const head = (await consumer.git('rev-parse', 'HEAD')).stdout.trim();
    const clean = await conventions(root, 'commits', '--range', `${head}..HEAD`);
    assert.equal(clean.code, 0, clean.output);

    await mkdir(path.join(root, '.conventions'), { recursive: true });
    await writeFile(path.join(root, STATE), '{"releaseCount": 1}\n');
    const fresh = await conventions(root, 'commits', '--range', `${head}..HEAD`);
    assert.notEqual(fresh.code, 0, fresh.output);
    assert.ok(fresh.output.includes(STATE), fresh.output);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
