import assert from 'node:assert/strict';
import test from 'node:test';
import { validateReleases } from './release-model.mjs';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { updateReleaseIndex } from './releases-index.mjs';

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

test('принимает согласованный состав и неназначенные задачи', () => {
  assert.deepEqual(check(), []);
  assert.deepEqual(validateReleases([ticket({ release: 'unassigned' })]), []);
});

test('ловит назначение в обе стороны и несуществующий выпуск', () => {
  assert(check(release(), ticket({ release: 'unassigned' })).some(e => e.includes('не назначен')));
  assert(validateReleases([ticket()]).some(e => e.includes('не существует')));
  const r = release();
  r.content = r.content.replace('| [TICKET-TEST](../tickets/test.md) | Необходима для результата |', '');
  assert(check(r).some(e => e.includes('отсутствует в составе')));
});

test('проверяет путь ссылки, повторные строки и принадлежность двум выпускам', () => {
  const r = release();
  r.content = r.content.replace('../tickets/test.md', '../tickets/wrong.md');
  assert(check(r).some(e => e.includes('не указывает')));
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
