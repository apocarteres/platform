import { mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import {
  RELEASES_DIR, TICKETS_DIR, compositionTickets, nextReleaseId, openRelease, releaseTag, releases,
  replaceMetadata, replaceSection, sectionLines, ticketId, ticketLinkTarget, tickets,
  unassignedTerminalTickets, writeDocument,
} from './documents.mjs';
import {
  loadObligations, obligationState, overdueObligations, pendingObligations, readState, writeState,
} from './obligations.mjs';
import { attested, readReceipt } from './receipt.mjs';
import { terminalStatuses } from '../docs/ticket-model.mjs';
import { createTag, headCommit, tagExists, workingTreeClean } from './git.mjs';

// REQ-RELEASE-001, REQ-RELEASE-002, REQ-RELEASE-003, REQ-RELEASE-009, REQ-RELEASE-014, REQ-RELEASE-028
export async function closability(root, { scheme }) {
  const problems = [];
  const release = await openRelease(root);
  if (release === null) problems.push('Открытого выпуска нет: откройте выпуск командой release open');
  if (!await workingTreeClean(root)) problems.push('Рабочее дерево не чисто: тег утверждал бы одно состояние, а помечал другое');
  const commit = await headCommit(root);
  const receipt = await readReceipt(root, commit);
  if (receipt === null) problems.push(`Нет расписки о пройденном verify для ${commit.slice(0, 8)}`);
  else if (!attested(receipt)) problems.push(`Расписка для ${commit.slice(0, 8)} не содержит признака прогона: наборы заявлены, но не наблюдались`);
  const composition = release === null
    ? []
    : await compositionTickets(root, release.metadata.get('id'));
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
      const obligation = ticket.metadata.get('obligation');
      const reason = obligation === undefined
        ? (ticket.metadata.get('priority') === 'unassigned'
          ? 'Закрыта в этом выпуске'
          : `Закрыта в этом выпуске, приоритет ${ticket.metadata.get('priority')}`)
        : `Обязательство ядра \`${obligation}\`, закрыто в этом выпуске`;
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
    `Прогон наблюдён командой \`${receipt.run.command}\` с кодом возврата ${receipt.run.exitCode}.`,
    '',
    'Развёртывание выполняется этим тегом: REQ-RELEASE-016.',
  ];
}

function criteriaLines(receipt, tag, obligations) {
  return [
    `- [x] Набор \`verify\` пройден на выпускаемом коммите — расписка ${receipt.completedAt}, наборы: ${receipt.checks.join(', ')}, прогон \`${receipt.run.command}\``,
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

// REQ-RELEASE-019
export async function satisfyObligation(root, { obligationId, ticketId: evidenceId }) {
  const { obligations } = await loadObligations(root);
  const obligation = obligations.find((item) => item.id === obligationId);
  if (obligation === undefined) return { satisfied: false, problems: [`Ядро не объявляет обязательства ${obligationId}`] };

  const all = await tickets(root);
  const evidence = all.find((ticket) => ticketId(ticket) === evidenceId);
  if (evidence === undefined) {
    return { satisfied: false, problems: [`Задачи ${evidenceId} в проекте нет: обязательство закрывается ссылкой на существующую задачу`] };
  }
  if (!terminalStatuses.has(evidence.metadata.get('status'))) {
    return { satisfied: false, problems: [`Задача ${evidenceId} не завершена: обязательство закрывается только выполненной работой`] };
  }

  const materialized = all.find((ticket) => ticket.metadata.get('obligation') === obligationId);
  const removed = [];
  if (materialized !== undefined && !terminalStatuses.has(materialized.metadata.get('status'))) {
    await rm(materialized.file);
    removed.push(ticketId(materialized));
  }

  const release = await openRelease(root);
  if (release !== null && removed.length > 0) {
    const kept = sectionLines(release.content, '## Состав')
      .filter((line) => line.startsWith('| [') && !removed.some((id) => line.includes(id)));
    const body = kept.length === 0
      ? ['Обязательств ядра к исполнению нет; состав наполняется по факту закрытия задач.']
      : ['| Задача | Причина включения |', '|---|---|', ...kept];
    await writeDocument(release.file, replaceSection(release.content, '## Состав', body));
  }

  const state = await readState(root);
  state.closed ??= {};
  state.closed[obligationId] = {
    release: release?.metadata.get('id') ?? 'до цикла выпусков',
    ticket: evidenceId,
  };
  delete state.deferred?.[obligationId];
  await writeState(root, state);
  return { satisfied: true, removed, evidence: evidenceId };
}

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
  return { cancelled: true, id, file: release.file };
}

// REQ-RELEASE-020
export async function adoptCycle(root, { scheme, version, today }) {
  const existing = await releases(root);
  if (existing.length > 0) {
    return { adopted: false, problems: ['В проекте уже есть выпуски: принятие цикла выполняется один раз'] };
  }
  const before = await unassignedTerminalTickets(root);
  for (const ticket of before) {
    await writeDocument(ticket.file, replaceMetadata(ticket.content, { release: 'before-cycle' }));
  }
  const opened = await openNext(root, { scheme, version, today });
  return { adopted: opened.opened, ...opened, stamped: before.map(ticketId) };
}

export async function openNext(root, { scheme, version, today }) {
  const existing = await releases(root);
  const already = await openRelease(root);
  if (already !== null) {
    return { opened: false, problems: [`Выпуск ${already.metadata.get('id')} уже открыт: открытый выпуск всегда ровно один`] };
  }
  const { id, tag, number } = nextReleaseId(existing, scheme, today, version);
  // REQ-RELEASE-005
  if (existing.some((release) => release.metadata.get('id') === id)) {
    return {
      opened: false,
      problems: [`Выпуск ${id} уже существует: номер не переиспользуется, задайте следующий номер`],
    };
  }
  const state = await readState(root);
  const { obligations, isCore } = await loadObligations(root);
  const pending = pendingObligations(obligations, state, isCore);

  // REQ-RELEASE-013
  const obligationTickets = new Map((await tickets(root))
    .filter((ticket) => ticket.metadata.get('obligation') !== undefined)
    .map((ticket) => [ticket.metadata.get('obligation'), ticket]));
  const created = [];
  const carried = [];
  state.seen ??= {};
  for (const entry of pending) {
    if (state.seen[entry.obligation.id] === undefined) state.seen[entry.obligation.id] = state.releaseCount ?? 0;
    const already = obligationTickets.get(entry.obligation.id);
    if (already !== undefined) {
      // REQ-RELEASE-021
      if (!terminalStatuses.has(already.metadata.get('status'))) {
        carried.push({ ticket: already, obligation: entry.obligation });
      }
      continue;
    }
    const ticket = obligationTicket(entry.obligation, id, today);
    const file = path.join(root, TICKETS_DIR, `${entry.obligation.slug}-${ticket.date}.md`);
    created.push({ ...ticket, file, obligation: entry.obligation });
  }

  const planned = [
    ...created.map((ticket) => `| [${ticket.id}](../tickets/${path.basename(ticket.file)}) | Обязательство ядра \`${ticket.obligation.id}\`, срок ${ticket.obligation.dueReleases} выпуск(ов) |`),
    ...carried.map((entry) => `| [${ticketId(entry.ticket)}](${ticketLinkTarget(root, entry.ticket)}) | Обязательство ядра \`${entry.obligation.id}\`, перенесено из предыдущего выпуска |`),
  ];
  const rows = planned.length === 0
    ? ['Обязательств ядра к исполнению нет; состав наполняется по факту закрытия задач.']
    : ['| Задача | Причина включения |', '|---|---|', ...planned];

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
    'Правила выпуска — `REQ-RELEASE` в поставке пакета правил. [Каталог](INDEX.md)',
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

  // REQ-QUALITY-005
  const file = path.join(root, RELEASES_DIR, `${id}.md`);
  await mkdir(path.join(root, RELEASES_DIR), { recursive: true });
  for (const directory of [TICKETS_DIR, `${TICKETS_DIR}/closed`]) {
    await mkdir(path.join(root, directory), { recursive: true });
  }
  await writeFile(file, document);
  for (const ticket of created) await writeFile(ticket.file, ticket.content);
  for (const entry of carried) {
    await writeDocument(entry.ticket.file, replaceMetadata(entry.ticket.content, { release: id }));
  }
  await writeState(root, state);
  return {
    opened: true, id, tag, file,
    created: created.map((ticket) => ticket.id),
    carried: carried.map((entry) => ticketId(entry.ticket)),
  };
}

export { obligationState, readState };
