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
import { parseFrontMatter, validateTicket } from '../lib/docs/ticket-model.mjs';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';

const CLI = path.join(path.dirname(path.dirname(fileURLToPath(import.meta.url))), 'bin', 'conventions.mjs');

async function conventions(root, ...args) {
  try {
    const { stdout } = await promisify(execFile)(process.execPath, [CLI, ...args, '--root', root]);
    return { code: 0, output: stdout };
  } catch (error) {
    return { code: error.code, output: `${error.stdout}${error.stderr}` };
  }
}

const DAY = new Date('2026-09-12T00:00:00Z');
const RELEASE_FILE = 'docs/releases/RELEASE-2026-09-11.md';

function ticket(id, { status = 'done', sections = '' } = {}) {
  return `---\nid: ${id}\ntype: ticket\nstatus: ${status}\nscope: quality\nauthority: supporting\n`
    + `priority: P2\nrelease: unassigned\n---\n\n# ${id}\n\nРабота потребителя.\n${sections}`;
}

const BEFORE = '\n## До развёртывания\n\n- Включить флаг `orders.v2` в настройке среды\n';
const AFTER = '\n## После развёртывания\n\n- Удалить прежнюю очередь `orders-v1`\n- Снять\n  временный маршрут\n';

const ticketErrors = (body, status = 'backlog') => {
  const file = status === 'done' ? 'docs/tickets/closed/example.md' : 'docs/tickets/example.md';
  const content = ticket('TICKET-EXAMPLE', { status }).replace('Работа потребителя.\n', `Работа потребителя.\n${body}`);
  return validateTicket(file, content, parseFrontMatter(content));
};

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

async function criteria(root) {
  const document = await readFile(path.join(root, RELEASE_FILE), 'utf8');
  const start = document.indexOf('## Критерии выхода');
  const end = document.indexOf('\n## ', start + 1);
  return document.slice(start, end === -1 ? undefined : end).split('\n').filter((line) => line.startsWith('- ['));
}

async function closedWithActions(consumer) {
  const root = consumer.root;
  const a = `${PREFIX}-QUAL-601`;
  const b = `${PREFIX}-QUAL-602`;
  const c = `${PREFIX}-QUAL-603`;
  await writeFile(path.join(root, `docs/tickets/closed/${a}-work.md`), ticket(a, { sections: BEFORE + AFTER }));
  await writeFile(path.join(root, `docs/tickets/closed/${b}-work.md`), ticket(b));
  await writeFile(path.join(root, `docs/tickets/${c}-work.md`), ticket(c, { status: 'backlog', sections: BEFORE }));
  await summaries(root);
  await commit(consumer, `${a} ${b} ${c} работа`);
  assert.equal((await openNext(root, { scheme: 'date', today: DAY })).opened, true);
  await summaries(root);
  const verified = await commit(consumer, `${a} состав выпуска записан`);
  await receipt(root, verified);
  const closed = await closeRelease(root, { scheme: 'date' });
  assert.equal(closed.closed, true, JSON.stringify(closed.problems));
  await summaries(root);
  await commit(consumer, `${a} первый шаг закрытия записан`);
  return { a, b, c };
}

// CORE-DOC-026
test('раздел действий развёртывания без пунктов или с текстом вне пунктов отвергается', () => {
  assert.deepEqual(ticketErrors(BEFORE + AFTER), []);
  assert.deepEqual(ticketErrors(''), []);
  const empty = ticketErrors('\n## До развёртывания\n\n');
  assert.ok(empty.some((error) => error.includes('До развёртывания')), empty.join('\n'));
  const emptyLast = ticketErrors('\n## После развёртывания\n');
  assert.ok(emptyLast.some((error) => error.includes('После развёртывания')), emptyLast.join('\n'));
  const prose = ticketErrors('\n## После развёртывания\n\nНужно кое-что сделать.\n');
  assert.ok(prose.some((error) => error.includes('После развёртывания')), prose.join('\n'));
});

// CORE-DOC-026
test('первый шаг закрытия переносит действия задач состава в критерии выхода флажками по обе стороны завершающего шага', async () => {
  const consumer = await referenceConsumer();
  try {
    const { a, b, c } = await closedWithActions(consumer);
    const lines = await criteria(consumer.root);
    const finishing = lines.findIndex((line) => line.includes('Завершающий шаг'));
    const before = lines.findIndex((line) => line.includes('До развёртывания') && line.includes('orders.v2'));
    const after = lines.filter((line) => line.includes('После развёртывания'));
    assert.ok(before !== -1 && before < finishing, lines.join('\n'));
    assert.match(lines[before], new RegExp(`^- \\[ \\] До развёртывания, \\[${a}\\]\\([^)]+\\): Включить флаг`));
    assert.equal(after.length, 2, lines.join('\n'));
    assert.ok(lines.indexOf(after[0]) > finishing, lines.join('\n'));
    assert.match(after[1], /: Снять временный маршрут$/);
    assert.ok(!lines.some((line) => line.includes(b)), 'задача без разделов ничего не добавляет');
    assert.ok(!lines.some((line) => line.includes(c)), 'задача вне состава ничего не добавляет');
  } finally {
    await rm(consumer.root, { recursive: true, force: true });
  }
});

// CORE-DOC-026
test('завершение отказывает, пока действие не отмечено, а отмеченные действия сохраняет', async () => {
  const consumer = await referenceConsumer();
  const root = consumer.root;
  try {
    const { a } = await closedWithActions(consumer);
    const held = await finishRelease(root, { scheme: 'date', today: DAY, note: 'раскат' });
    assert.equal(held.finished, false);
    assert.match(held.problems.join('\n'), new RegExp(`${a}[^\n]*orders.v2[^\n]*release mark`));

    assert.equal((await markDeploymentAction(root, { scheme: 'date', ticketId: a, step: 'before', note: 'флаг включён 2026-09-12' })).marked, true);
    const ambiguous = await markDeploymentAction(root, { scheme: 'date', ticketId: a, step: 'after', note: 'сделано' });
    assert.equal(ambiguous.marked, false, 'два действия: без --item не угадывается');
    assert.match(ambiguous.problems.join('\n'), /--item/);
    for (const item of [1, 2]) {
      const marked = await markDeploymentAction(root, { scheme: 'date', ticketId: a, step: 'after', item, note: `пункт ${item} выполнен` });
      assert.equal(marked.marked, true, JSON.stringify(marked.problems));
    }
    const again = await markDeploymentAction(root, { scheme: 'date', ticketId: a, step: 'after', item: 1, note: 'ещё раз' });
    assert.equal(again.marked, false, 'отмеченное повторно не отмечается');
    assert.equal((await markDeploymentAction(root, { scheme: 'date', ticketId: a, step: 'later', note: 'x' })).marked, false);
    assert.equal((await markDeploymentAction(root, { scheme: 'date', ticketId: `${PREFIX}-QUAL-699`, step: 'before', note: 'x' })).marked, false);
    assert.equal((await markDeploymentAction(root, { scheme: 'date', ticketId: a, step: 'before', note: ' ' })).marked, false);

    await summaries(root);
    await commit(consumer, `${a} действия развёртывания отмечены`);
    const finished = await finishRelease(root, { scheme: 'date', today: DAY, note: 'раскат' });
    assert.equal(finished.finished, true, JSON.stringify(finished.problems));
    const lines = await criteria(root);
    assert.ok(lines.some((line) => line.startsWith('- [x] До развёртывания') && line.endsWith(' — флаг включён 2026-09-12')), lines.join('\n'));
    assert.ok(lines.some((line) => line.startsWith('- [x] После развёртывания') && line.endsWith(' — пункт 2 выполнен')), lines.join('\n'));
    await summaries(root);
    const errors = (await checkDocumentation(root)).errors;
    assert.deepEqual(errors.filter((error) => error.includes('RELEASE-2026-09-11')), [], errors.join('\n'));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

// CORE-DOC-026, REQ-RELEASE-045, REQ-RELEASE-046
test('перезакрытие сохраняет отметку действия и добавляет действия задачи, вошедшей в состав; расписка переживает коммит отметки', async () => {
  const consumer = await referenceConsumer();
  const root = consumer.root;
  const later = `${PREFIX}-QUAL-604`;
  try {
    const { a } = await closedWithActions(consumer);
    assert.equal((await markDeploymentAction(root, { scheme: 'date', ticketId: a, step: 'before', note: 'флаг включён' })).marked, true);
    await summaries(root);
    await commit(consumer, `${a} действие до развёртывания отмечено`);

    const carried = await recloseRelease(root, { scheme: 'date', reason: 'проверка переноса' });
    assert.equal(carried.reclosed, true, `расписка до отметки принимается: ${JSON.stringify(carried.problems)}`);
    assert.ok((await criteria(root)).some((line) => line.startsWith('- [x] До развёртывания') && line.endsWith(' — флаг включён')));

    await writeFile(path.join(root, `docs/tickets/closed/${later}-work.md`),
      ticket(later, { sections: '\n## До развёртывания\n\n- Заполнить справочник складов\n' }));
    await summaries(root);
    const fixed = await commit(consumer, `${later} доработка в тот же выпуск`);
    await receipt(root, fixed);
    const again = await recloseRelease(root, { scheme: 'date', reason: 'задача добавлена в неразвёрнутый выпуск' });
    assert.equal(again.reclosed, true, JSON.stringify(again.problems));
    const lines = await criteria(root);
    assert.ok(lines.some((line) => line.startsWith('- [x] До развёртывания') && line.includes(a)), lines.join('\n'));
    assert.ok(lines.some((line) => line.startsWith('- [ ] До развёртывания') && line.includes(later) && line.endsWith('Заполнить справочник складов')), lines.join('\n'));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

// CORE-DOC-026
test('отметка до первого шага закрытия отвергается', async () => {
  const consumer = await referenceConsumer();
  const root = consumer.root;
  const a = `${PREFIX}-QUAL-605`;
  try {
    await writeFile(path.join(root, `docs/tickets/closed/${a}-work.md`), ticket(a, { sections: BEFORE }));
    await summaries(root);
    await commit(consumer, `${a} работа`);
    assert.equal((await openNext(root, { scheme: 'date', today: DAY })).opened, true);
    const early = await markDeploymentAction(root, { scheme: 'date', ticketId: a, step: 'before', note: 'рано' });
    assert.equal(early.marked, false);
    assert.match(early.problems.join('\n'), /release close/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

// CORE-DOC-026, REQ-RELEASE-028
test('команда release mark отмечает действие, отказывает без номера и печатает справку', async () => {
  const consumer = await referenceConsumer();
  const root = consumer.root;
  try {
    const { a } = await closedWithActions(consumer);
    const help = await conventions(root, 'release', 'mark', '--help');
    assert.equal(help.code, 0);
    assert.match(help.output, /release mark <TICKET-ID> --step <before\|after>/);
    assert.equal((await conventions(root, 'release', 'mark', '--step', 'before', '--note', 'x')).code, 2);
    const ambiguous = await conventions(root, 'release', 'mark', a, '--step', 'after', '--note', 'сделано');
    assert.equal(ambiguous.code, 1);
    assert.match(ambiguous.output, /--item/);
    const marked = await conventions(root, 'release', 'mark', a, '--step', 'after', '--item', '2', '--note', 'маршрут снят');
    assert.equal(marked.code, 0, marked.output);
    assert.match(marked.output, /Снять временный маршрут/);
    assert.ok((await criteria(root)).some((line) => line.startsWith('- [x] После развёртывания') && line.endsWith(' — маршрут снят')));
    const status = await conventions(root, 'release', 'status');
    assert.match(status.output, new RegExp(`${a}[^\n]*orders.v2`), status.output);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
