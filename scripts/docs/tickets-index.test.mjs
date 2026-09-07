import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import test from 'node:test';
import { parseFrontMatter, validateTicket } from './ticket-model.mjs';
import { updateTicketIndexes } from './tickets-index.mjs';

const ticket = (overrides = {}, body = '# Задача\n') => {
  const fields = { id: 'TICKET-EXAMPLE', type: 'ticket', status: 'backlog', scope: 'testing',
    authority: 'supporting', priority: 'P2', release: 'unassigned', ...overrides };
  return '---\n' + Object.entries(fields).filter(([, value]) => value !== undefined)
    .map(([key, value]) => `${key}: ${value}`).join('\n') + '\n---\n\n' + body;
};
const errors = (fields, body, file = 'docs/tickets/example.md') => {
  const content = ticket(fields, body);
  return validateTicket(file, content, parseFrontMatter(content));
};

test('проверяет приоритет и запрещает начало без назначенного приоритета', () => {
  for (const priority of [undefined, 'P4', '2']) assert(errors({ priority }).length);
  assert.deepEqual(errors({ priority: 'unassigned' }), []);
  assert(errors({ priority: 'unassigned', status: 'in_progress' }).length);
});

test('ловит неправильное расположение завершённых и открытых задач', () => {
  assert(errors({ status: 'done' }).length);
  assert(errors({}, undefined, 'docs/tickets/closed/example.md').length);
  assert.deepEqual(errors({ status: 'done' }, undefined, 'docs/tickets/closed/example.md'), []);
  assert.deepEqual(errors({ status: 'done' }, undefined, 'docs/tickets/features/plan/step.md'), []);
});

test('отменённая задача обязана объяснить, почему её не делают', () => {
  const closed = 'docs/tickets/closed/example.md';
  assert(errors({ status: 'cancelled' }, '# Задача\n', closed).some((error) => error.includes('Почему не делаем')));
  assert.deepEqual(errors({ status: 'cancelled' }, '# Задача\n\n## Почему не делаем\n\nПремисса опровергнута.\n', closed), []);
});

test('открытые вопросы блокируют выполнение и закрытие, но допускают ожидание', () => {
  const body = '# Задача\n\n## Открытые вопросы\n\nВыбор контракта.\n';
  assert(errors({}, body).length);
  assert(errors({ questions: 'open' }).length);
  assert(errors({ questions: 'unknown' }, body).length);
  for (const status of ['in_progress', 'done']) assert(errors({ questions: 'open', status }, body).length);
  assert.deepEqual(errors({ questions: 'open', status: 'blocked' }, body), []);
  assert.deepEqual(errors({ questions: 'resolved', status: 'in_progress' }, body), []);
});

test('поля задач запрещены другим документам; текстовый приоритет не дублирует шапку', () => {
  assert(errors({ type: 'reference' }).length);
  assert(errors({}, '# Задача\n\nПриоритет: P1.\n').length);
});

async function fixture(action) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'platform-tickets-'));
  const put = async (file, content) => {
    const absolute = path.join(root, 'docs/tickets', file);
    await mkdir(path.dirname(absolute), { recursive: true });
    await writeFile(absolute, content);
  };
  try {
    await mkdir(path.join(root, 'docs/tickets/closed'), { recursive: true });
    await put('example.md', ticket());
    await put('closed/done.md', ticket({ id: 'TICKET-DONE', status: 'done' }));
    await action(root, put);
  } finally { await rm(root, { recursive: true, force: true }); }
}

test('сводки учитывают приоритет, закрытые задачи и вложенные планы', async () => {
  await fixture(async (root, put) => {
    await put('features/plan/step.md', ticket({ id: 'TICKET-FIRST', priority: 'P0' }, '# Первый этап\n'));
    assert.deepEqual(await updateTicketIndexes(root), []);
    const open = await readFile(path.join(root, 'docs/tickets/INDEX.md'), 'utf8');
    assert(open.includes('Всего: 2.'));
    assert(open.indexOf('Первый этап') < open.indexOf('[Задача]'));
    assert(!open.includes('done.md'));
    const closed = await readFile(path.join(root, 'docs/tickets/closed/INDEX.md'), 'utf8');
    assert(closed.includes('Всего: 1.'));
    assert(closed.includes('(done.md)'));
    assert.deepEqual(await updateTicketIndexes(root, { check: true }), []);
  });
});

test('проверка обнаруживает ручное изменение, новый тикет и смену приоритета без записи', async () => {
  await fixture(async (root, put) => {
    await updateTicketIndexes(root);
    const file = path.join(root, 'docs/tickets/INDEX.md');
    const original = await readFile(file, 'utf8');
    await writeFile(file, original + 'Ручная правка\n');
    assert((await updateTicketIndexes(root, { check: true })).length);
    assert.equal(await readFile(file, 'utf8'), original + 'Ручная правка\n');
    await updateTicketIndexes(root);
    await put('new.md', ticket({ id: 'TICKET-NEW' }));
    assert((await updateTicketIndexes(root, { check: true })).length);
    await updateTicketIndexes(root);
    await put('example.md', ticket({ priority: 'P0' }));
    assert((await updateTicketIndexes(root, { check: true })).length);
  });
});

test('ошибка метаданных и повторный идентификатор не перезаписывают сводки', async () => {
  await fixture(async (root, put) => {
    await updateTicketIndexes(root);
    const file = path.join(root, 'docs/tickets/INDEX.md');
    const original = await readFile(file, 'utf8');
    await put('duplicate.md', ticket());
    assert((await updateTicketIndexes(root)).some(error => error.includes('идентификатор')));
    assert.equal(await readFile(file, 'utf8'), original);
    await put('duplicate.md', ticket({ id: 'TICKET-NEW', status: 'bad' }));
    assert((await updateTicketIndexes(root)).some(error => error.includes('статус')));
    assert.equal(await readFile(file, 'utf8'), original);
  });
});
