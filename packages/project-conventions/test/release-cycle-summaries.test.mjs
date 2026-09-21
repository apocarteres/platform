import assert from 'node:assert/strict';
import test from 'node:test';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { readFile, rm, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { PREFIX, referenceConsumer } from './reference-consumer.mjs';
import { writeReceipt } from '../lib/release/receipt.mjs';

const run = promisify(execFile);
const cli = path.join(path.dirname(path.dirname(fileURLToPath(import.meta.url))), 'bin', 'conventions.mjs');

async function conventions(root, ...args) {
  try {
    const { stdout } = await run(process.execPath, [cli, ...args, '--root', root]);
    return { code: 0, output: stdout };
  } catch (failure) {
    return { code: failure.code, output: `${failure.stdout ?? ''}${failure.stderr ?? ''}` };
  }
}

const DAY = new Date('2026-09-12T00:00:00Z');

function doneTicket(id) {
  return `---\nid: ${id}\ntype: ticket\nstatus: done\nscope: quality\nauthority: supporting\n`
    + `priority: P2\nrelease: unassigned\n---\n\n# ${id}\n\nРабота потребителя.\n`;
}

async function withDoneTicket(consumer, id) {
  await writeFile(path.join(consumer.root, `docs/tickets/closed/${id}-work.md`), doneTicket(id));
  await consumer.git('add', '-A');
  await consumer.git('commit', '--quiet', '-m', `${id} работа по задаче состава`);
  const indexed = await conventions(consumer.root, 'tickets-index');
  assert.equal(indexed.code, 0, indexed.output);
}

async function releaseOf(root, id) {
  const content = await readFile(path.join(root, `docs/tickets/closed/${id}-work.md`), 'utf8');
  return /^release: (.+)$/m.exec(content)[1];
}

// REQ-RELEASE-043
test('после открытия и закрытия выпуска проверка документации проходит без ручной пересборки сводок', async () => {
  const consumer = await referenceConsumer();
  const root = consumer.root;
  const id = `${PREFIX}-QUAL-300`;
  try {
    await withDoneTicket(consumer, id);
    const before = await conventions(root, 'docs-check');
    assert.equal(before.code, 0, `до цикла документы согласованы: ${before.output}`);

    const opened = await conventions(root, 'release', 'open', '--tickets', id);
    assert.equal(opened.code, 0, opened.output);
    const afterOpen = await conventions(root, 'docs-check');
    assert.equal(afterOpen.code, 0, `открытие сводки не оставило устаревшими: ${afterOpen.output}`);

    await consumer.git('add', '-A');
    await consumer.git('commit', '--quiet', '-m', `${id} состав выпуска записан`);
    const { stdout } = await consumer.git('rev-parse', 'HEAD');
    await writeReceipt(root, {
      commit: stdout.trim(),
      completedAt: DAY,
      checks: ['verify'],
      run: { command: 'mise run check', exitCode: 0 },
    });
    const closed = await conventions(root, 'release', 'close');
    assert.equal(closed.code, 0, closed.output);
    const afterClose = await conventions(root, 'docs-check');
    assert.equal(afterClose.code, 0, `закрытие сводки не оставило устаревшими: ${afterClose.output}`);

    const finished = await conventions(root, 'release', 'finish', '--note', 'развёртывание');
    assert.equal(finished.code, 0, finished.output);
    const afterFinish = await conventions(root, 'docs-check');
    assert.equal(afterFinish.code, 0, `завершение сводки не оставило устаревшими: ${afterFinish.output}`);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

// REQ-RELEASE-043
test('после снятия задачи из состава проверка документации проходит', async () => {
  const consumer = await referenceConsumer();
  const root = consumer.root;
  const id = `${PREFIX}-QUAL-301`;
  try {
    await withDoneTicket(consumer, id);
    assert.equal((await conventions(root, 'release', 'open', '--tickets', id)).code, 0);

    const dropped = await conventions(root, 'release', 'drop', id, '--reason', 'работа отложена');
    assert.equal(dropped.code, 0, dropped.output);
    const after = await conventions(root, 'docs-check');
    assert.equal(after.code, 0, `снятие сводки не оставило устаревшими: ${after.output}`);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

// REQ-RELEASE-044
test('отмена выпуска возвращает задачи состава без выпуска, и следующий выпуск берёт их снова', async () => {
  const consumer = await referenceConsumer();
  const root = consumer.root;
  const first = `${PREFIX}-QUAL-302`;
  const second = `${PREFIX}-QUAL-303`;
  try {
    await withDoneTicket(consumer, first);
    await withDoneTicket(consumer, second);
    const opened = await conventions(root, 'release', 'open', '--tickets', `${first},${second}`);
    assert.equal(opened.code, 0, opened.output);
    assert.notEqual(await releaseOf(root, first), 'unassigned', 'задача отнесена к открытому выпуску');

    const cancelled = await conventions(root, 'release', 'cancel', '--reason', 'тег невыкатываемый');
    assert.equal(cancelled.code, 0, cancelled.output);
    assert.equal(await releaseOf(root, first), 'unassigned');
    assert.equal(await releaseOf(root, second), 'unassigned');
    assert.match(cancelled.output, new RegExp(`задача ${first} вновь без выпуска`));

    const again = await conventions(root, 'release', 'open', '--tickets', `${first},${second}`);
    assert.equal(again.code, 0, `следующий выпуск открывается с теми же задачами: ${again.output}`);
    const after = await conventions(root, 'docs-check');
    assert.equal(after.code, 0, after.output);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
