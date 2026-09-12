import assert from 'node:assert/strict';
import test from 'node:test';
import { validateReleases } from '../lib/docs/release-model.mjs';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { updateReleaseIndex } from '../lib/docs/releases-index.mjs';

const releaseId = 'RELEASE-TEST';
const ticketId = 'TICKET-TEST';
function release(overrides = {}, body) {
  return { file: 'docs/releases/RELEASE-TEST.md',
    metadata: new Map(Object.entries({ id: releaseId, type: 'release', status: 'draft', 'opened-on': '2026-09-05', ...overrides })),
    content: body ?? `# Тестовый выпуск

## Цель
Проверить результат.

## Состав
| Задача | Причина включения |
|---|---|
| [TICKET-TEST](../tickets/test.md) | Необходима для результата |

## Критерии выхода
- [ ] Сценарий проверен

## Не входит
Изменения агента.
` };
}
function ticket(overrides = {}) {
  return { file: 'docs/tickets/test.md', content: '# Задача',
    metadata: new Map(Object.entries({ id: ticketId, type: 'ticket', status: 'backlog', release: releaseId, ...overrides })) };
}
const check = (r = release(), t = ticket()) => validateReleases([r, t]);

// REQ-RELEASE-031
function shipped(overrides = {}) {
  const document = release({ status: 'released', 'released-on': '2026-09-06', commit: 'a'.repeat(40), ...overrides });
  document.content = document.content
    .replace('- [ ] Сценарий проверен', '- [x] Сценарий проверен — тест завершился успешно') + '\n## Результат\nРазвёрнуто.\n';
  return document;
}

test('принимает согласованный состав и неназначенные задачи', () => {
  assert.deepEqual(check(), []);
  assert.deepEqual(validateReleases([ticket({ release: 'unassigned' })]), []);
});

test('ловит назначение в обе стороны и несуществующий выпуск', () => {
  assert(check(release(), ticket({ release: 'unassigned' })).some(e => e.includes('не назначен')));
  assert(validateReleases([ticket()]).some(e => e.includes('не существует')));
  const r = shipped();
  r.content = r.content.replace('| [TICKET-TEST](../tickets/test.md) | Необходима для результата |', '| [TICKET-OTHER](../tickets/other.md) | Обязательство |');
  const other = ticket({ id: 'TICKET-OTHER', status: 'done' });
  other.file = 'docs/tickets/other.md';
  assert(validateReleases([r, other, ticket({ status: 'done' })]).some(e => e.includes('отсутствует в составе')));
});

test('проверяет путь ссылки, повторные строки и принадлежность двум выпускам', () => {
  const r = shipped();
  r.content = r.content.replace('../tickets/test.md', '../tickets/wrong.md');
  assert(check(r, ticket({ status: 'done' })).some(e => e.includes('не указывает')));
  const open = release({ status: 'in_progress' });
  open.content = open.content.replace('../tickets/test.md', '../tickets/closed/test.md');
  assert.deepEqual(check(open, ticket({ status: 'done' })), [], 'до закрытия устаревшая ссылка чинится командой сводки');
  const twice = release();
  twice.content = twice.content.replace('## Критерии выхода', '| [TICKET-TEST](../tickets/test.md) | Повтор |\n\n## Критерии выхода');
  assert(check(twice).some(e => e.includes('повторяется')));
  const second = release({ id: 'RELEASE-SECOND' });
  second.file = 'docs/releases/RELEASE-SECOND.md';
  assert(validateReleases([release(), second, ticket()]).some(e => e.includes('несколько выпусков')));
});

test('открытые вопросы допустимы в черновике и блокируют начало выпуска', () => {
  assert.deepEqual(check(release(), ticket({ questions: 'open' })), []);
  assert(check(release({ status: 'in_progress' }), ticket({ questions: 'open' })).some(e => e.includes('открытые вопросы')));
});

test('выпуск требует выполненные задачи, критерии, дату, коммит и результат', () => {
  const invalid = check(release({ status: 'released' }));
  for (const message of ['не выполнена', 'released-on', 'SHA', 'Результат', 'подтверждение']) assert(invalid.some(e => e.includes(message)), message);
  const r = release({ status: 'released', 'released-on': '2026-09-06', commit: 'a'.repeat(40) });
  r.content = r.content.replace('- [ ] Сценарий проверен', '- [x] Сценарий проверен — тест завершился успешно');
  r.content += '\n## Результат\nРазвёрнуто на dev, проверен указанный коммит.\n';
  assert.deepEqual(check(r, ticket({ status: 'done' })), []);
  assert(check(r, ticket({ status: 'cancelled' })).some(e => e.includes('не выполнена')));
  r.metadata.set('released-on', '2026-09-04');
  assert(check(r, ticket({ status: 'done' })).some(e => e.includes('предшествует')));
});

test('проверяет даты, имя файла, пустые и повторяющиеся разделы', () => {
  assert(check(release({ 'opened-on': '2026-02-30' })).some(e => e.includes('существующую дату')));
  assert(check(release({ commit: 'a'.repeat(40) })).some(e => e.includes('только для выпущенного')));
  const r = release(); r.file = 'docs/releases/wrong.md';
  assert(check(r).some(e => e.includes('имя файла')));
  const duplicate = release(); duplicate.content += '\n## Цель\nДругая цель.\n';
  assert(check(duplicate).some(e => e.includes('повторяется')));
  assert(check(release({}, '# Пусто\n')).some(e => e.includes('Состав')));
});

test('индекс обнаруживает смену статуса без перезаписи в режиме проверки', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'platform-releases-'));
  try {
    const dir = path.join(root, 'docs/releases');
    await mkdir(dir, { recursive: true });
    assert.deepEqual(await updateReleaseIndex(root), []);
    const file = path.join(dir, 'RELEASE-TEST.md');
    const text = '---\nid: RELEASE-TEST\ntype: release\nstatus: draft\nopened-on: 2026-09-05\n---\n# Выпуск\n';
    await writeFile(file, text);
    assert((await updateReleaseIndex(root, { check: true })).length);
    await updateReleaseIndex(root);
    assert.deepEqual(await updateReleaseIndex(root, { check: true }), []);
    const before = await readFile(path.join(dir, 'INDEX.md'), 'utf8');
    await writeFile(file, text.replace('status: draft', 'status: in_progress'));
    assert((await updateReleaseIndex(root, { check: true })).length);
    assert.equal(await readFile(path.join(dir, 'INDEX.md'), 'utf8'), before);
  } finally { await rm(root, { recursive: true, force: true }); }
});

// REQ-RELEASE-036
test('сводка выпусков упорядочена номером, а не именем файла', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'platform-releases-'));
  try {
    const dir = path.join(root, 'docs/releases');
    await mkdir(dir, { recursive: true });
    for (const id of ['RELEASE-1-2-0', 'RELEASE-1-10-0', 'RELEASE-1-9-0']) {
      await writeFile(
        path.join(dir, `${id}.md`),
        `---\nid: ${id}\ntype: release\nstatus: released\nopened-on: 2026-09-05\nreleased-on: 2026-09-06\n---\n# Выпуск ${id}\n`,
      );
    }
    await updateReleaseIndex(root);
    const index = await readFile(path.join(dir, 'INDEX.md'), 'utf8');
    assert.deepEqual(
      index.split('\n').filter((line) => line.startsWith('| [Выпуск')).map((line) => /RELEASE-[\d-]+/.exec(line)[0]),
      ['RELEASE-1-2-0', 'RELEASE-1-9-0', 'RELEASE-1-10-0'],
    );
  } finally { await rm(root, { recursive: true, force: true }); }
});

// REQ-RELEASE-007, REQ-TICKETS-013
test('переезд задачи в закрытые не ломает документ открытого выпуска', () => {
  const moved = ticket({ status: 'done' });
  moved.file = 'docs/tickets/closed/test.md';

  const errors = validateReleases([release({ status: 'in_progress' }), moved]);

  assert.deepEqual(errors, [], errors.join('\n'));
});

// REQ-RELEASE-007
test('задача открытого выпуска не обязана быть в составе до закрытия', () => {
  const empty = release({ status: 'in_progress' });
  empty.content = empty.content.replace('| [TICKET-TEST](../tickets/test.md) | Необходима для результата |', '| [TICKET-OTHER](../tickets/other.md) | Обязательство ядра |');
  const other = ticket({ id: 'TICKET-OTHER' });
  other.file = 'docs/tickets/other.md';

  const errors = validateReleases([empty, other, ticket({ status: 'done' })]);

  assert.deepEqual(errors, [], errors.join('\n'));
});

// REQ-RELEASE-031
test('выпущенный выпуск по-прежнему требует задачу в составе', () => {
  const released = release({ status: 'released', 'released-on': '2026-09-06', commit: 'a'.repeat(40) });
  released.content = released.content
    .replace('| [TICKET-TEST](../tickets/test.md) | Необходима для результата |', '| [TICKET-OTHER](../tickets/other.md) | Обязательство ядра |')
    .replace('- [ ] Сценарий проверен', '- [x] Сценарий проверен — тест завершился успешно') + '\n## Результат\nРазвёрнуто.\n';
  const other = ticket({ id: 'TICKET-OTHER', status: 'done' });
  other.file = 'docs/tickets/other.md';

  const errors = validateReleases([released, other, ticket({ status: 'done' })]);

  assert(errors.some((error) => error.includes('отсутствует в составе')), errors.join('\n'));
});

// REQ-RELEASE-026
test('ссылки состава чинятся и в закрытом выпуске, перечень работ не меняется', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'platform-releases-'));
  try {
    await mkdir(path.join(root, 'docs/releases'), { recursive: true });
    await mkdir(path.join(root, 'docs/tickets/closed'), { recursive: true });
    await writeFile(
      path.join(root, 'docs/tickets/closed/CORE-QUAL-001-work.md'),
      '---\nid: CORE-QUAL-001\ntype: ticket\nstatus: done\nscope: quality\nauthority: supporting\npriority: P2\nrelease: RELEASE-1-0-0\n---\n\n# Работа\n',
    );
    const file = path.join(root, 'docs/releases/RELEASE-1-0-0.md');
    await writeFile(file, '---\nid: RELEASE-1-0-0\ntype: release\nstatus: released\nopened-on: 2026-09-05\nreleased-on: 2026-09-06\n---\n'
      + '# Выпуск\n\n## Состав\n| Задача | Причина включения |\n|---|---|\n| [CORE-QUAL-001](../tickets/CORE-QUAL-001-work.md) | Закрыта в этом выпуске |\n');

    const { refreshCompositionLinks } = await import('../lib/docs/releases-index.mjs');
    assert((await refreshCompositionLinks(root, { check: true })).length, 'устаревшая ссылка названа');
    await refreshCompositionLinks(root);

    const repaired = await readFile(file, 'utf8');
    assert.match(repaired, /\.\.\/tickets\/closed\/CORE-QUAL-001-work\.md/);
    assert.match(repaired, /\| \[CORE-QUAL-001\]\([^)]+\) \| Закрыта в этом выпуске \|/, 'причина включения не тронута');
    assert.deepEqual(await refreshCompositionLinks(root, { check: true }), []);
  } finally { await rm(root, { recursive: true, force: true }); }
});
