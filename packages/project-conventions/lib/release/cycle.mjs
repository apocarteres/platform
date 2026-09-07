import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import {
  RELEASES_DIR, TICKETS_DIR, nextReleaseId, openRelease, releaseTag, releases, replaceMetadata,
  replaceSection, ticketId, ticketLinkTarget, tickets, unassignedTerminalTickets, writeDocument,
} from './documents.mjs';
import {
  loadObligations, obligationState, overdueObligations, pendingObligations, readState, writeState,
} from './obligations.mjs';
import { readReceipt } from './receipt.mjs';
import { createTag, headCommit, tagExists, workingTreeClean } from './git.mjs';

// REQ-RELEASE-001, REQ-RELEASE-002, REQ-RELEASE-003, REQ-RELEASE-009, REQ-RELEASE-014
export async function closability(root, { scheme }) {
  const problems = [];
  const release = await openRelease(root);
  if (release === null) problems.push('Открытого выпуска нет: откройте выпуск командой release open');
  if (!await workingTreeClean(root)) problems.push('Рабочее дерево не чисто: тег утверждал бы одно состояние, а помечал другое');
  const commit = await headCommit(root);
  const receipt = await readReceipt(root, commit);
  if (receipt === null) problems.push(`Нет расписки о пройденном verify для ${commit.slice(0, 8)}`);
  const composition = await unassignedTerminalTickets(root);
  if (composition.length === 0) problems.push('Состав пуст: нечего выпускать');
  const state = await readState(root);
  const { obligations, isCore } = await loadObligations(root);
  for (const entry of overdueObligations(obligations, state, isCore)) {
    problems.push(`Обязательство ${entry.obligation.id} просрочено: срок ${entry.obligation.dueReleases} выпуск(ов), прошло ${entry.state.elapsed}`);
  }
  const tag = release === null ? null : releaseTag(release.metadata.get('id'), scheme);
  if (tag !== null && await tagExists(root, tag)) problems.push(`Тег ${tag} уже существует: номер не переиспользуется`);
  return { problems, release, commit, receipt, composition, state, obligations, isCore, tag };
}

function compositionRows(root, composition) {
  return [
    '| Задача | Причина включения |',
    '|---|---|',
    ...composition.map((ticket) => {
      const reason = ticket.metadata.get('priority') === 'unassigned'
        ? 'Закрыта в этом выпуске'
        : `Закрыта в этом выпуске, приоритет ${ticket.metadata.get('priority')}`;
      return `| [${ticketId(ticket)}](${ticketLinkTarget(root, ticket)}) | ${reason} |`;
    }),
  ];
}

function resultLines(receipt, commit, tag) {
  return [
    `Выпущено с коммита \`${commit}\`, тег \`${tag}\`.`,
    '',
    `Расписка о проверках получена ${receipt.completedAt}; выполненные наборы: ${receipt.checks.join(', ')}.`,
    '',
    'Развёртывание выполняется этим тегом: REQ-RELEASE-016.',
  ];
}

function criteriaLines(receipt, tag, obligations) {
  return [
    `- [x] Набор \`verify\` пройден на выпускаемом коммите — расписка ${receipt.completedAt}, наборы: ${receipt.checks.join(', ')}`,
    `- [x] Тег выпуска создан на проверенном коммите — \`${tag}\``,
    `- [x] Обязательства ядра этого выпуска закрыты или перенесены записью с причиной — ${obligations}`,
  ];
}

function obligationsSummary(closed, deferred, isCore) {
  if (isCore) return 'ядро не объявляет обязательств самому себе';
  const parts = [];
  if (closed.length > 0) parts.push(`закрыты: ${closed.join(', ')}`);
  if (deferred.length > 0) parts.push(`перенесены: ${deferred.join(', ')}`);
  return parts.length === 0 ? 'обязательств к исполнению в этом выпуске не было' : parts.join('; ');
}

// REQ-RELEASE-001, REQ-RELEASE-005
export async function closeRelease(root, { scheme, today }) {
  const state = await closability(root, { scheme });
  if (state.problems.length > 0) return { closed: false, problems: state.problems };
  const { release, commit, receipt, composition, tag } = state;
  const id = release.metadata.get('id');

  let content = replaceMetadata(release.content, {
    status: 'released',
    'released-on': today.toISOString().slice(0, 10),
    commit,
  });
  content = replaceSection(content, '## Состав', compositionRows(root, composition));
  content = replaceSection(content, '## Результат', resultLines(receipt, commit, tag));
  const closedNow = state.obligations
    .filter((obligation) => composition.some((item) => (item.metadata.get('obligation') ?? '') === obligation.id))
    .map((obligation) => obligation.id);
  const deferredNow = Object.keys(state.state.deferred ?? {});
  content = replaceSection(
    content,
    '## Критерии выхода',
    criteriaLines(receipt, tag, obligationsSummary(closedNow, deferredNow, state.isCore)),
  );
  const writes = [{ file: release.file, content }];

  for (const ticket of composition) {
    writes.push({ file: ticket.file, content: replaceMetadata(ticket.content, { release: id }) });
  }

  const obligationState_ = state.state;
  obligationState_.releaseCount = (obligationState_.releaseCount ?? 0) + 1;
  obligationState_.closed ??= {};
  obligationState_.seen ??= {};
  for (const obligation of state.obligations) {
    const ticket = composition.find((item) => (item.metadata.get('obligation') ?? '') === obligation.id);
    if (ticket !== undefined) {
      obligationState_.closed[obligation.id] = { release: id, ticket: ticketId(ticket) };
      delete obligationState_.deferred?.[obligation.id];
    }
  }
  // REQ-RELEASE-005
  await createTag(root, tag, commit, `Выпуск ${id}`);
  for (const write of writes) await writeDocument(write.file, write.content);
  await writeState(root, obligationState_);

  return { closed: true, id, tag, commit, composition: composition.map(ticketId) };
}

function obligationTicket(obligation, releaseId, today) {
  const date = today.toISOString().slice(0, 10);
  const id = `TICKET-${obligation.slug.toUpperCase()}-${date}`;
  const lines = [
    '---',
    `id: ${id}`,
    'type: ticket',
    'status: backlog',
    `scope: ${obligation.ticket.scope}`,
    'authority: supporting',
    `priority: ${obligation.ticket.priority}`,
    `release: ${releaseId}`,
    `obligation: ${obligation.id}`,
    `related: ${obligation.requirement.split('-').slice(0, -1).join('-')}`,
    '---',
    '',
    `# ${obligation.title}`,
    '',
    '## Проблема',
    '',
    obligation.ticket.problem,
    '',
    '## Основание',
    '',
    `Обязательство ядра \`${obligation.id}\`, требование \`${obligation.requirement}\`, объявлено в версии ядра ${obligation.since}. Срок исполнения: ${obligation.dueReleases} выпуск(ов) потребителя.`,
    '',
    '## Последствия при сохранении текущего поведения',
    '',
    'Требование ядра действует, а проект ему не соответствует: расхождение обнаруживается не проверкой, а при следующем изменении в этой области.',
    '',
    '## Требуется',
    '',
    ...obligation.ticket.required.map((item, index) => `${index + 1}. ${item}`),
    '',
    '## Критерии приёмки',
    '',
    ...obligation.ticket.acceptance.map((item) => `- ${item}`),
    '',
  ];
  return { id, slug: obligation.slug, date, content: lines.join('\n') };
}

export async function openNext(root, { scheme, version, today }) {
  const existing = await releases(root);
  const already = await openRelease(root);
  if (already !== null) {
    return { opened: false, problems: [`Выпуск ${already.metadata.get('id')} уже открыт: открытый выпуск всегда ровно один`] };
  }
  const { id, tag, number } = nextReleaseId(existing, scheme, today, version);
  const state = await readState(root);
  const { obligations, isCore } = await loadObligations(root);
  const pending = pendingObligations(obligations, state, isCore);

  // REQ-RELEASE-013
  const materialized = new Set((await tickets(root))
    .map((ticket) => ticket.metadata.get('obligation'))
    .filter((value) => value !== undefined));
  const created = [];
  state.seen ??= {};
  for (const entry of pending) {
    if (state.seen[entry.obligation.id] === undefined) state.seen[entry.obligation.id] = state.releaseCount ?? 0;
    if (materialized.has(entry.obligation.id)) continue;
    const ticket = obligationTicket(entry.obligation, id, today);
    const file = path.join(root, TICKETS_DIR, `${entry.obligation.slug}-${ticket.date}.md`);
    created.push({ ...ticket, file, obligation: entry.obligation });
  }

  const rows = created.length === 0
    ? ['Обязательств ядра к исполнению нет; состав наполняется по факту закрытия задач.']
    : [
      '| Задача | Причина включения |',
      '|---|---|',
      ...created.map((ticket) => `| [${ticket.id}](../tickets/${path.basename(ticket.file)}) | Обязательство ядра \`${ticket.obligation.id}\`, срок ${ticket.obligation.dueReleases} выпуск(ов) |`),
    ];

  const document = [
    '---',
    `id: ${id}`,
    'type: release',
    'status: draft',
    'scope: release',
    'authority: supporting',
    `opened-on: ${today.toISOString().slice(0, 10)}`,
    '---',
    '',
    `# Выпуск ${number}`,
    '',
    '[Правила](RULES.md) · [Каталог](INDEX.md)',
    '',
    '## Цель',
    '',
    'Выпустить состояние сервиса, накопленное после предыдущего выпуска, и исполнить обязательства ядра, попавшие в этот выпуск.',
    '',
    '## Состав',
    '',
    ...rows,
    '',
    '## Критерии выхода',
    '',
    '- [ ] Набор `verify` пройден на выпускаемом коммите — расписка получена командой выпуска',
    '- [ ] Тег выпуска создан на проверенном коммите — ставится командой выпуска',
    '- [ ] Обязательства ядра этого выпуска закрыты или перенесены записью с причиной',
    '',
    '## Не входит',
    '',
    'Задачи, не закрытые к моменту закрытия выпуска: они попадут в состав следующего по факту закрытия.',
    '',
    '## Результат',
    '',
    'Заполняется при закрытии из расписки о проверках.',
    '',
  ].join('\n');

  const file = path.join(root, RELEASES_DIR, `${id}.md`);
  await writeFile(file, document);
  for (const ticket of created) await writeFile(ticket.file, ticket.content);
  await writeState(root, state);
  return { opened: true, id, tag, file, created: created.map((ticket) => ticket.id) };
}

export { obligationState, readState };
