import assert from 'node:assert/strict';
import test from 'node:test';
import path from 'node:path';
import { readFile, rm, writeFile } from 'node:fs/promises';
import { PREFIX, referenceConsumer } from './reference-consumer.mjs';
import { closeRelease, finishRelease, markDeploymentAction, openNext, recloseRelease } from '../lib/release/cycle.mjs';
import { writeReceipt } from '../lib/release/receipt.mjs';
import { headCommit } from '../lib/release/git.mjs';
import { updateTicketIndexes } from '../lib/docs/tickets-index.mjs';
import { refreshCompositionLinks, updateReleaseIndex } from '../lib/docs/releases-index.mjs';
import { checkDocumentation } from '../lib/docs/check-docs.mjs';

const DAY = new Date('2026-09-12T00:00:00Z');
const RELEASE_FILE = 'docs/releases/RELEASE-2026-09-11.md';
const id = (number) => `${PREFIX}-QUAL-${number}`;

function ticket(name, { status = 'done', dependsOn, sections = '', extra = '' } = {}) {
  const closed = ['done', 'cancelled', 'superseded'].includes(status);
  const body = `---\nid: ${name}\ntype: ticket\nstatus: ${status}\nscope: quality\nauthority: supporting\n`
    + `priority: P2\nrelease: unassigned\n${dependsOn ? `depends-on: ${dependsOn}\n` : ''}${extra}---\n\n# ${name}\n\nРабота.\n${sections}`
    + (status === 'cancelled' ? '\n## Почему не делаем\n\nПостановка опровергнута.\n' : '');
  return { name, file: `docs/tickets/${closed ? 'closed/' : ''}${name}-work.md`, body };
}

async function put(root, ...tickets) {
  for (const one of tickets) await writeFile(path.join(root, one.file), one.body);
}

async function summaries(root) {
  await updateTicketIndexes(root, { check: false });
  await refreshCompositionLinks(root, { check: false });
  await updateReleaseIndex(root, { check: false });
}

async function commit(consumer, message) {
  await summaries(consumer.root);
  await consumer.git('add', '-A');
  await consumer.git('commit', '--quiet', '-m', message);
  return headCommit(consumer.root);
}

async function receipt(root, sha) {
  await writeReceipt(root, {
    commit: sha, completedAt: DAY, checks: ['verify'], run: { command: 'mise run check', exitCode: 0 },
  });
}

async function attemptClose(consumer, ...tickets) {
  const root = consumer.root;
  await put(root, ...tickets);
  await commit(consumer, `${tickets[0].name} работа`);
  assert.equal((await openNext(root, { scheme: 'date', today: DAY })).opened, true);
  await receipt(root, await commit(consumer, `${tickets[0].name} состав выпуска записан`));
  return closeRelease(root, { scheme: 'date' });
}

async function section(root, heading) {
  const document = await readFile(path.join(root, RELEASE_FILE), 'utf8');
  const start = document.indexOf(heading);
  const end = document.indexOf('\n## ', start + 1);
  return document.slice(start, end === -1 ? undefined : end).split('\n');
}

async function withConsumer(body) {
  const consumer = await referenceConsumer();
  try {
    await body(consumer);
  } finally {
    await rm(consumer.root, { recursive: true, force: true });
  }
}

// REQ-RELEASE-050
test('закрытие отказывает, если задача состава зависит от невыпущенной задачи вне состава, и называет обе', () => withConsumer(async (consumer) => {
  const closed = await attemptClose(consumer,
    ticket(id(701), { dependsOn: id(702) }),
    ticket(id(702), { status: 'backlog' }));
  assert.equal(closed.closed, false);
  assert.match(closed.problems.join('\n'), new RegExp(`${id(701)}[^\\n]*${id(702)}`));
}));

// REQ-RELEASE-050
test('зависимость от задачи состава или от задачи прежнего выпуска закрытие не держит', () => withConsumer(async (consumer) => {
  const closed = await attemptClose(consumer,
    ticket(id(711), { dependsOn: `${id(712)}, ${id('001')}` }),
    ticket(id(712)));
  assert.equal(closed.closed, true, JSON.stringify(closed.problems));
}));

// REQ-RELEASE-050
test('зависимость от отменённой или заменённой задачи — отказ, называющий обе', () => withConsumer(async (consumer) => {
  const closed = await attemptClose(consumer,
    ticket(id(721), { dependsOn: id(722) }),
    ticket(id(722), { status: 'cancelled' }),
    ticket(id(723), { dependsOn: id(724) }),
    ticket(id(724), { status: 'superseded', extra: `superseded-by: ${id(725)}\n` }),
    ticket(id(725)));
  assert.equal(closed.closed, false);
  const problems = closed.problems.join('\n');
  assert.match(problems, new RegExp(`${id(721)}[^\\n]*${id(722)}`));
  assert.match(problems, new RegExp(`${id(723)}[^\\n]*${id(724)}`));
}));

// REQ-RELEASE-050
test('столбец «Порядок» ставит задачу после тех, от которых она зависит, при любом порядке файлов; действия идут в том же порядке; перезакрытие порядок хранит', () => withConsumer(async (consumer) => {
  const root = consumer.root;
  const later = id(731);
  const first = id(732);
  const loose = id(733);
  const closed = await attemptClose(consumer,
    ticket(later, { dependsOn: first, sections: '\n## До развёртывания\n\n- Включить новый маршрут\n' }),
    ticket(first, { sections: '\n## До развёртывания\n\n- Создать очередь\n' }),
    ticket(loose));
  assert.equal(closed.closed, true, JSON.stringify(closed.problems));

  const check = async () => {
    const rows = (await section(root, '## Состав')).filter((line) => line.startsWith('| ['));
    const step = (name) => {
      const row = rows.find((line) => line.includes(`[${name}]`));
      assert.ok(row, `${name} в составе:\n${rows.join('\n')}`);
      return Number(/\|\s*(\d+)\s*\|\s*$/.exec(row)?.[1]);
    };
    assert.equal(step(first), 1);
    assert.equal(step(loose), 1);
    assert.equal(step(later), 2);
    const steps = rows.map((line) => Number(/\|\s*(\d+)\s*\|\s*$/.exec(line)?.[1]));
    assert.deepEqual(steps, [...steps].sort((a, b) => a - b), 'строки идут по номеру шага');
    const criteria = (await section(root, '## Критерии выхода')).filter((line) => line.includes('До развёртывания'));
    assert.ok(criteria.findIndex((line) => line.includes(first)) < criteria.findIndex((line) => line.includes(later)), criteria.join('\n'));
  };
  await check();
  assert.match((await section(root, '## Состав')).join('\n'), /\| Задача \| Причина включения \| Порядок \|/);

  await commit(consumer, `${later} первый шаг закрытия записан`);
  const again = await recloseRelease(root, { scheme: 'date', reason: 'проверка порядка' });
  assert.equal(again.reclosed, true, JSON.stringify(again.problems));
  await check();

  await commit(consumer, `${later} перенос записан`);
  for (const name of [first, later]) {
    assert.equal((await markDeploymentAction(root, { scheme: 'date', ticketId: name, step: 'before', note: 'сделано' })).marked, true);
  }
  await commit(consumer, `${later} действия отмечены`);
  assert.equal((await finishRelease(root, { scheme: 'date', today: DAY, note: 'раскат' })).finished, true);
  await summaries(root);
  const errors = (await checkDocumentation(root)).errors;
  assert.deepEqual(errors.filter((error) => error.includes('RELEASE-2026-09-11')), [], errors.join('\n'));
}));

// REQ-RELEASE-050
test('перезакрытие отказывает о зависимости так же, как закрытие', () => withConsumer(async (consumer) => {
  const root = consumer.root;
  const closed = await attemptClose(consumer, ticket(id(741)));
  assert.equal(closed.closed, true, JSON.stringify(closed.problems));
  await put(root, ticket(id(742), { dependsOn: id(743) }), ticket(id(743), { status: 'backlog' }));
  await receipt(root, await commit(consumer, `${id(742)} доработка в тот же выпуск`));
  const again = await recloseRelease(root, { scheme: 'date', reason: 'задача добавлена' });
  assert.equal(again.reclosed, false);
  assert.match(again.problems.join('\n'), new RegExp(`${id(742)}[^\\n]*${id(743)}`));
}));

// REQ-TICKETS-010
test('проверка документации отвергает цикл зависимостей, а выполненную задачу с невыполненной зависимостью — нет', () => withConsumer(async (consumer) => {
  const root = consumer.root;
  await put(root,
    ticket(id(751), { status: 'backlog', dependsOn: id(752) }),
    ticket(id(752), { status: 'backlog', dependsOn: id(751) }),
    ticket(id(753), { dependsOn: id(754) }),
    ticket(id(754), { status: 'in_progress' }));
  await summaries(root);
  const errors = (await checkDocumentation(root)).errors;
  assert.ok(errors.some((error) => error.includes('цикл') && error.includes(id(751)) && error.includes(id(752))), errors.join('\n'));
  assert.ok(!errors.some((error) => error.includes(id(753))), errors.join('\n'));
}));

// REQ-RELEASE-050
test('цикл зависимостей внутри состава — отказ закрытия, а не авария', () => withConsumer(async (consumer) => {
  const closed = await attemptClose(consumer,
    ticket(id(761), { dependsOn: id(762) }),
    ticket(id(762), { dependsOn: id(761) }));
  assert.equal(closed.closed, false);
  assert.match(closed.problems.join('\n'), new RegExp(`цикл[^\\n]*${id(761)}[^\\n]*depends-on`, 'i'));
}));

// REQ-RELEASE-050
test('выполненная зависимость, чей выпуск не вышел, закрытие держит', () => withConsumer(async (consumer) => {
  await writeFile(path.join(consumer.root, 'docs/releases/RELEASE-2026-08-1.md'),
    '---\nid: RELEASE-2026-08-1\ntype: release\nstatus: cancelled\nauthority: supporting\nscope: release\nopened-on: 2026-08-01\n---\n\n'
    + '# Выпуск 2026.08.1\n\n## Цель\nВыпустить накопленное.\n\n## Состав\nСостава нет.\n\n'
    + '## Критерии выхода\n- [ ] Проверки пройдены\n\n## Не входит\nВыпуск отменён.\n');
  const stranded = ticket(id(772));
  stranded.body = stranded.body.replace('release: unassigned', 'release: RELEASE-2026-08-1');
  const closed = await attemptClose(consumer, ticket(id(771), { dependsOn: id(772) }), stranded);
  assert.equal(closed.closed, false, 'отменённый выпуск зависимость не выпустил');
  assert.match(closed.problems.join('\n'), new RegExp(`${id(771)}[^\\n]*${id(772)}[^\\n]*RELEASE-2026-08-1`));
}));
