import assert from 'node:assert/strict';
import test from 'node:test';
import path from 'node:path';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { PREFIX, referenceConsumer } from './reference-consumer.mjs';
import { closability, openNext } from '../lib/release/cycle.mjs';
import { receiptFor, writeReceipt } from '../lib/release/receipt.mjs';
import { codeTree } from '../lib/release/git.mjs';
import { updateTicketIndexes } from '../lib/docs/tickets-index.mjs';
import { refreshCompositionLinks, updateReleaseIndex } from '../lib/docs/releases-index.mjs';
import { documentationProblems } from '../lib/docs/documentation.mjs';

const DAY = new Date('2026-09-12T00:00:00Z');

function doneTicket(id, body = 'Работа потребителя.') {
  return `---\nid: ${id}\ntype: ticket\nstatus: done\nscope: quality\nauthority: supporting\n`
    + `priority: P2\nrelease: unassigned\n---\n\n# ${id}\n\n${body}\n`;
}

async function head(consumer) {
  const { stdout } = await consumer.git('rev-parse', 'HEAD');
  return stdout.trim();
}

async function commit(consumer, message) {
  await consumer.git('add', '-A');
  await consumer.git('commit', '--quiet', '-m', message);
  return head(consumer);
}

async function summaries(root) {
  await updateTicketIndexes(root, { check: false });
  await refreshCompositionLinks(root, { check: false });
  await updateReleaseIndex(root, { check: false });
}

async function released(consumer, id) {
  const root = consumer.root;
  await writeFile(path.join(root, `docs/tickets/closed/${id}-work.md`), doneTicket(id));
  await summaries(root);
  await commit(consumer, `${id} работа по задаче состава`);
  assert.equal((await openNext(root, { scheme: 'date', today: DAY })).opened, true);
  await summaries(root);
  const { errors } = await documentationProblems(root, {});
  assert.deepEqual(errors, [], `заготовка оставляет документы согласованными: ${errors.join('\n')}`);
  const commitWithTheCode = await commit(consumer, `${id} состав выпуска записан`);
  await writeReceipt(root, {
    commit: commitWithTheCode,
    completedAt: DAY,
    checks: ['verify'],
    run: { command: 'mise run check', exitCode: 0 },
  });
  return commitWithTheCode;
}

const missingReceipt = (problems) => problems.filter((problem) => problem.startsWith('Нет расписки'));
const carried = (problems) => problems.filter((problem) => problem.startsWith('Расписка перенесена'));

// REQ-RELEASE-045
test('служебная правка документов расписку не обесценивает', async () => {
  const consumer = await referenceConsumer();
  const root = consumer.root;
  const id = `${PREFIX}-QUAL-400`;
  try {
    const verified = await released(consumer, id);

    await writeFile(path.join(root, `docs/tickets/closed/${id}-work.md`), doneTicket(id, 'Учтено записью выпуска.'));
    const service = await commit(consumer, `${id} служебная правка документа`);
    assert.notEqual(service, verified, 'коммит новый');
    assert.equal(await codeTree(root, service), await codeTree(root, verified), 'дерево кода то же');

    const found = await receiptFor(root, service, { treeOf: (sha) => codeTree(root, sha) });
    assert.equal(found.carriedFrom, verified, 'расписка найдена по дереву кода');

    const state = await closability(root, { scheme: 'date' });
    assert.deepEqual(missingReceipt(state.problems), [], state.problems.join('\n'));
    assert.deepEqual(carried(state.problems), [], 'документы согласованы, переносу нечего возразить');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

// REQ-RELEASE-045
test('правка кода расписку обесценивает', async () => {
  const consumer = await referenceConsumer();
  const root = consumer.root;
  const id = `${PREFIX}-QUAL-401`;
  try {
    const verified = await released(consumer, id);

    await mkdir(path.join(root, 'src/main/java/net/example/inventory'), { recursive: true });
    await writeFile(path.join(root, 'src/main/java/net/example/inventory/Later.java'),
      'package net.example.inventory;\n\npublic final class Later {\n}\n');
    const changed = await commit(consumer, `${id} правка кода после расписки`);
    assert.notEqual(await codeTree(root, changed), await codeTree(root, verified), 'дерево кода другое');

    const found = await receiptFor(root, changed, { treeOf: (sha) => codeTree(root, sha) });
    assert.equal(found.receipt, null, 'расписка не переносится на другой код');

    const state = await closability(root, { scheme: 'date' });
    assert.equal(missingReceipt(state.problems).length, 1, state.problems.join('\n'));
    assert.match(missingReceipt(state.problems)[0], /release status/, 'отказ называет порядок');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

// REQ-RELEASE-045
test('перенесённая расписка требует согласованных документов', async () => {
  const consumer = await referenceConsumer();
  const root = consumer.root;
  const id = `${PREFIX}-QUAL-402`;
  try {
    const verified = await released(consumer, id);

    const stray = `${PREFIX}-QUAL-403`;
    await writeFile(path.join(root, `docs/tickets/${stray}-work.md`),
      doneTicket(stray).replace('status: done', 'status: in_progress'));
    const service = await commit(consumer, `${id} задача добавлена без сводки`);
    assert.equal(await codeTree(root, service), await codeTree(root, verified), 'дерево кода то же');

    const state = await closability(root, { scheme: 'date' });
    assert.deepEqual(missingReceipt(state.problems), [], 'расписка перенесена, а не потеряна');
    const complaint = carried(state.problems);
    assert.equal(complaint.length, 1, state.problems.join('\n'));
    assert.match(complaint[0], new RegExp(verified.slice(0, 8)), 'отказ называет, откуда перенесена');
    assert.match(complaint[0], /документы менялись/);
    assert.ok(state.problems.some((problem) => problem.includes(stray)), 'названо само расхождение');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

// REQ-RELEASE-045
test('дерево кода не читает документы и состояние обязательств', async () => {
  const consumer = await referenceConsumer();
  const root = consumer.root;
  try {
    const before = await codeTree(root, await head(consumer));

    await mkdir(path.join(root, '.conventions'), { recursive: true });
    await writeFile(path.join(root, '.conventions/obligations.json'), '{"releaseCount":7}\n');
    await writeFile(path.join(root, 'docs/REQUIREMENTS.md'),
      `${await readFile(path.join(root, 'docs/REQUIREMENTS.md'), 'utf8')}\nДописано.\n`);
    const after = await codeTree(root, await commit(consumer, `${PREFIX}-QUAL-404 документы и состояние`));

    assert.equal(after, before, 'ни docs/, ни .conventions/ в дерево кода не входят');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
