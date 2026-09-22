import assert from 'node:assert/strict';
import test from 'node:test';
import path from 'node:path';
import { rm, writeFile } from 'node:fs/promises';
import { PREFIX, referenceConsumer } from './reference-consumer.mjs';
import { closeRelease, finishRelease, openNext, recloseRelease } from '../lib/release/cycle.mjs';
import { writeReceipt } from '../lib/release/receipt.mjs';
import { headCommit, tagCommit } from '../lib/release/git.mjs';
import { updateTicketIndexes } from '../lib/docs/tickets-index.mjs';
import { refreshCompositionLinks, updateReleaseIndex } from '../lib/docs/releases-index.mjs';

const DAY = new Date('2026-09-12T00:00:00Z');
const TAG = '2026.09.11';

function doneTicket(id, body = 'Работа потребителя.') {
  return `---\nid: ${id}\ntype: ticket\nstatus: done\nscope: quality\nauthority: supporting\n`
    + `priority: P2\nrelease: unassigned\n---\n\n# ${id}\n\n${body}\n`;
}

async function summaries(root) {
  await updateTicketIndexes(root, { check: false });
  await refreshCompositionLinks(root, { check: false });
  await updateReleaseIndex(root, { check: false });
}

async function commit(consumer, message) {
  await consumer.git('add', '-A');
  await consumer.git('commit', '--quiet', '-m', message);
  return headCommit(consumer.root);
}

async function receipt(root, sha) {
  await writeReceipt(root, {
    commit: sha, completedAt: DAY, checks: ['verify'], run: { command: 'mise run check', exitCode: 0 },
  });
}

async function closedFirstStep(consumer, id) {
  const root = consumer.root;
  await writeFile(path.join(root, `docs/tickets/closed/${id}-work.md`), doneTicket(id));
  await summaries(root);
  await commit(consumer, `${id} работа по задаче состава`);
  assert.equal((await openNext(root, { scheme: 'date', today: DAY })).opened, true);
  await summaries(root);
  const verified = await commit(consumer, `${id} состав выпуска записан`);
  await receipt(root, verified);
  const closed = await closeRelease(root, { scheme: 'date' });
  assert.equal(closed.closed, true, JSON.stringify(closed.problems));
  return verified;
}

// REQ-RELEASE-046
test('тег переносится на исправленный коммит, номер выпуска остаётся прежним', async () => {
  const consumer = await referenceConsumer();
  const root = consumer.root;
  const id = `${PREFIX}-QUAL-500`;
  try {
    const first = await closedFirstStep(consumer, id);
    assert.equal(await tagCommit(root, TAG), first);

    await writeFile(path.join(root, 'src/main/java/net/example/inventory/Fix.java'),
      'package net.example.inventory;\n\npublic final class Fix {\n}\n');
    const fixed = await commit(consumer, `${id} исправление, найденное раскатом`);
    await receipt(root, fixed);

    const again = await recloseRelease(root, { scheme: 'date', reason: 'раскат нашёл дефект входа' });
    assert.equal(again.reclosed, true, JSON.stringify(again.problems));
    assert.equal(again.from, first);
    assert.equal(again.to, fixed);
    assert.equal(await tagCommit(root, TAG), fixed, 'тег переехал');

    const document = await readRelease(root);
    assert.match(document, /## Переносы тега/);
    assert.match(document, new RegExp(`\\| ${first.slice(0, 8)} \\| ${fixed.slice(0, 8)} \\| раскат нашёл дефект входа \\|`));
    assert.match(document, new RegExp(fixed.slice(0, 8)), 'результат называет новый коммит');

    await summaries(root);
    await commit(consumer, `${id} перенос записан`);
    const finished = await finishRelease(root, { scheme: 'date', today: DAY, note: 'раскат' });
    assert.equal(finished.finished, true, JSON.stringify(finished.problems));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

async function readRelease(root) {
  const { readFile } = await import('node:fs/promises');
  return readFile(path.join(root, 'docs/releases/RELEASE-2026-09-11.md'), 'utf8');
}

// REQ-RELEASE-046
test('перенос требует причины, выполненного первого шага и нового коммита', async () => {
  const consumer = await referenceConsumer();
  const root = consumer.root;
  const id = `${PREFIX}-QUAL-501`;
  try {
    const early = await recloseRelease(root, { scheme: 'date', reason: 'рано' });
    assert.match(early.problems[0], /Открытого выпуска нет/);

    const first = await closedFirstStep(consumer, id);

    const noReason = await recloseRelease(root, { scheme: 'date', reason: '  ' });
    assert.match(noReason.problems[0], /требует причины/);

    const sameCommit = await recloseRelease(root, { scheme: 'date', reason: 'нечего переносить' });
    assert.match(sameCommit.problems[0], /уже на текущем коммите/);
    assert.equal(await tagCommit(root, TAG), first, 'отказ тег не трогает');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

// REQ-RELEASE-046
test('без выполненного первого шага перенос отказывает и называет верную команду', async () => {
  const consumer = await referenceConsumer();
  const root = consumer.root;
  try {
    assert.equal((await openNext(root, { scheme: 'date', today: DAY })).opened, true);
    await summaries(root);
    await commit(consumer, `${PREFIX}-QUAL-502 выпуск открыт`);

    const early = await recloseRelease(root, { scheme: 'date', reason: 'первый шаг не выполнен' });
    assert.equal(early.reclosed, false);
    assert.match(early.problems[0], /Первый шаг закрытия .* ещё не выполнен/);
    assert.match(early.problems[0], /release close/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

// REQ-RELEASE-046
test('перенос без расписки на новом коммите отказывает', async () => {
  const consumer = await referenceConsumer();
  const root = consumer.root;
  const id = `${PREFIX}-QUAL-503`;
  try {
    const first = await closedFirstStep(consumer, id);
    await writeFile(path.join(root, 'src/main/java/net/example/inventory/Other.java'),
      'package net.example.inventory;\n\npublic final class Other {\n}\n');
    await commit(consumer, `${id} правка без расписки`);

    const refused = await recloseRelease(root, { scheme: 'date', reason: 'правка' });
    assert.equal(refused.reclosed, false);
    assert.ok(refused.problems.some((problem) => problem.startsWith('Нет расписки')), refused.problems.join('\n'));
    assert.equal(await tagCommit(root, TAG), first, 'отказ тег не трогает');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
