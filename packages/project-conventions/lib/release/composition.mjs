import {
  openRelease, replaceMetadata, replaceSection, sectionLines, ticketId, tickets, writeDocument,
} from './documents.mjs';

// REQ-RELEASE-029
export async function cancelRelease(root, { reason }) {
  const release = await openRelease(root);
  if (release === null) return { cancelled: false, problems: ['Открытого выпуска нет: отменять нечего'] };
  if (reason === undefined || reason.trim() === '') {
    return { cancelled: false, problems: ['Отмена выпуска требует причины: --reason "<причина>"'] };
  }
  const id = release.metadata.get('id');
  const content = replaceSection(
    replaceMetadata(release.content, { status: 'cancelled' }),
    '## Результат',
    [`Выпуск отменён, ничего не выпущено: ${reason.trim()}`],
  );
  await writeDocument(release.file, content);
  // REQ-RELEASE-044
  const composition = (await tickets(root)).filter((ticket) => ticket.metadata.get('release') === id);
  for (const ticket of composition) {
    await writeDocument(ticket.file, replaceMetadata(ticket.content, { release: 'unassigned' }));
  }
  return { cancelled: true, id, file: release.file, released: composition.map(ticketId) };
}
// REQ-RELEASE-033
export async function dropFromComposition(root, { ticketId: name, reason }) {
  if (!reason || !reason.trim()) {
    return { dropped: false, problems: ['Снятие задачи из состава требует причины: ключ --reason'] };
  }
  const release = await openRelease(root);
  if (release === null) {
    return { dropped: false, problems: ['Открытого выпуска нет: снимать задачу не из чего'] };
  }
  const id = release.metadata.get('id');
  const ticket = (await tickets(root)).find((item) => ticketId(item) === name);
  if (ticket === undefined) {
    return { dropped: false, problems: [`Задачи ${name} в проекте нет`] };
  }
  if ((ticket.metadata.get('release') ?? 'unassigned') !== id) {
    return { dropped: false, problems: [`Задача ${name} не отнесена к ${id}: снимать её из состава нечего`] };
  }
  if (ticket.metadata.has('obligation')) {
    return {
      dropped: false,
      problems: [`Задача ${name} материализует обязательство ядра: обязательство переносится командой release defer с причиной (REQ-RELEASE-014)`],
    };
  }

  const kept = sectionLines(release.content, '## Состав')
    .filter((line) => !(line.startsWith('| [') && line.includes(`[${name}]`)));
  const rows = kept.filter((line) => line.startsWith('| [')).length === 0
    ? ['Обязательств ядра к исполнению нет; состав наполняется по факту закрытия задач.']
    : kept;
  let content = replaceSection(release.content, '## Состав', rows);
  content = replaceSection(content, '## Не входит', [
    ...sectionLines(content, '## Не входит').filter((line) => line.trim().length > 0),
    '',
    `- ${name} — снята из состава: ${reason.trim()}`,
  ]);
  await writeDocument(release.file, content);
  await writeDocument(ticket.file, replaceMetadata(ticket.content, { release: 'unassigned' }));
  return { dropped: true, id, ticket: name };
}
