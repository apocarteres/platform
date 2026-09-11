import { mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import {
  RELEASES_DIR, TICKETS_DIR, compositionTickets, nextReleaseId, openRelease, releaseTag, releases, shipsResult,
  replaceMetadata, replaceSection, sectionLines, ticketId, ticketLinkTarget, tickets,
  unassignedDoneTickets, writeDocument,
} from './documents.mjs';
import {
  loadObligations, obligationState, overdueObligations, pendingObligations, readState, writeState,
} from './obligations.mjs';
import { attested, readReceipt } from './receipt.mjs';
import { commitsInRange, cycleCommit, ticketOf } from './commits.mjs';
import { TICKET_AREAS } from '../document-naming.mjs';
import { readConfig } from '../config.mjs';
import { createTag, headCommit, tagCommit, tagExists, workingTreeClean } from './git.mjs';

// REQ-RELEASE-001, REQ-RELEASE-002, REQ-RELEASE-003, REQ-RELEASE-009, REQ-RELEASE-014, REQ-RELEASE-028
export async function closability(root, { scheme }) {
  const problems = [];
  const config = await readConfig(root);
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
  // REQ-RELEASE-031, REQ-RELEASE-008
  for (const ticket of composition.filter((item) => !shipsResult(item) && !item.metadata.has('obligation'))) {
    problems.push(`Задача ${ticketId(ticket)} состава не выполнена (${ticket.metadata.get('status')}): выполните её либо снимите из состава командой release drop с причиной`);
  }
  const state = await readState(root);
  const { obligations, isCore } = await loadObligations(root);
  for (const entry of overdueObligations(obligations, state, isCore)) {
    problems.push(`Обязательство ${entry.obligation.id} просрочено: срок ${entry.obligation.dueReleases} выпуск(ов), прошло ${entry.state.elapsed}`);
  }
  const tag = release === null ? null : releaseTag(release.metadata.get('id'), scheme);
  if (tag !== null && await tagExists(root, tag)) problems.push(`Тег ${tag} уже существует: номер не переиспользуется`);
  // REQ-RELEASE-036
  problems.push(...await commitProblems(root, { scheme, config, composition, existing: await releases(root) }));
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

// REQ-RELEASE-001, REQ-RELEASE-034
function criteriaLines(receipt, tag, obligations, finishing = null) {
  return [
    `- [x] Набор \`verify\` пройден на выпускаемом коммите — расписка ${receipt.completedAt}, наборы: ${receipt.checks.join(', ')}, прогон \`${receipt.run.command}\``,
    `- [x] Тег выпуска создан на проверенном коммите — \`${tag}\``,
    `- [x] Обязательства ядра этого выпуска закрыты или перенесены записью с причиной — ${obligations}`,
    finishing === null
      ? '- [ ] Завершающий шаг выполнен — развёртывание в производственную среду или публикация артефактов'
      : `- [x] Завершающий шаг выполнен — ${finishing}`,
  ];
}

function obligationsSummary(closed, deferred, isCore) {
  if (isCore) return 'ядро не объявляет обязательств самому себе';
  const parts = [];
  if (closed.length > 0) parts.push(`закрыты: ${closed.join(', ')}`);
  if (deferred.length > 0) parts.push(`перенесены: ${deferred.join(', ')}`);
  return parts.length === 0 ? 'обязательств к исполнению в этом выпуске не было' : parts.join('; ');
}

// REQ-RELEASE-036
async function commitProblems(root, { scheme, config, composition, existing }) {
  const baseline = config.commitRuleSince ?? null;
  // REQ-RELEASE-036
  if (baseline === null) return [];
  const since = await previousReleaseTag(root, existing, scheme);
  const commits = await commitsInRange(root, since);
  const beyondBaseline = await withoutOlderThan(root, commits, baseline);

  const areas = [...TICKET_AREAS, ...(config.ticketAreas ?? [])];
  const prefix = config.ticketPrefix ?? null;
  const members = new Set(composition.map(ticketId));
  const problems = [];
  for (const commit of beyondBaseline) {
    if (cycleCommit(commit)) continue;
    const ticket = ticketOf(commit, areas, prefix);
    if (ticket === null) {
      problems.push(`Коммит ${commit.sha.slice(0, 8)} не называет задачу: «${commit.subject}»`);
      continue;
    }
    if (!members.has(ticket)) {
      problems.push(`Коммит ${commit.sha.slice(0, 8)} относится к задаче ${ticket} вне состава выпуска: «${commit.subject}»`);
    }
  }
  return problems;
}

async function previousReleaseTag(root, existing, scheme) {
  const released = existing
    .filter((release) => release.metadata.get('status') === 'released')
    .map((release) => releaseTag(release.metadata.get('id'), scheme));
  for (const tag of released.reverse()) {
    if (await tagExists(root, tag)) return tag;
  }
  return null;
}

async function withoutOlderThan(root, commits, baseline) {
  const reachable = await commitsInRange(root, baseline);
  const allowed = new Set(reachable.map((commit) => commit.sha));
  return commits.filter((commit) => allowed.has(commit.sha));
}

// REQ-RELEASE-001, REQ-RELEASE-005
export async function closeRelease(root, { scheme, today }) {
  const state = await closability(root, { scheme });
  if (state.problems.length > 0) return { closed: false, problems: state.problems };
  const { release, commit, receipt, composition, tag } = state;
  const id = release.metadata.get('id');

  // REQ-RELEASE-001
  let content = replaceMetadata(release.content, { status: 'in_progress' });
  // REQ-RELEASE-021, REQ-RELEASE-031
  content = replaceSection(content, '## Состав', compositionRows(root, composition.filter(shipsResult)));
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

  // REQ-RELEASE-005
  await createTag(root, tag, commit, `Выпуск ${id}`);
  for (const write of writes) await writeDocument(write.file, write.content);

  return { closed: true, id, tag, commit, composition: composition.map(ticketId) };
}

// REQ-RELEASE-001, REQ-RELEASE-034
export async function finishability(root, { scheme }) {
  const problems = [];
  const release = await openRelease(root);
  if (release === null) {
    return { problems: ['Незавершённого выпуска нет: закройте выпуск командой release close'], release: null };
  }
  const id = release.metadata.get('id');
  const tag = releaseTag(id, scheme);
  const commit = await tagCommit(root, tag);
  if (commit === null) {
    problems.push(`Тега ${tag} нет: сначала выполните первый шаг закрытия командой release close`);
  }
  const composition = await compositionTickets(root, id);
  for (const ticket of composition.filter((item) => !shipsResult(item) && !item.metadata.has('obligation'))) {
    problems.push(`Задача ${ticketId(ticket)} состава не выполнена (${ticket.metadata.get('status')})`);
  }
  const state = await readState(root);
  const { obligations, isCore } = await loadObligations(root);
  return { problems, release, id, tag, commit, composition, state, obligations, isCore };
}

export async function finishRelease(root, { scheme, today, note }) {
  if (!note || !note.trim()) {
    return { finished: false, problems: ['Завершающий шаг записывается с указанием, чем он выполнен: ключ --note'] };
  }
  const state = await finishability(root, { scheme });
  if (state.problems.length > 0) return { finished: false, problems: state.problems };
  const { release, id, tag, commit, composition } = state;

  let content = replaceMetadata(release.content, {
    status: 'released',
    'released-on': today.toISOString().slice(0, 10),
    commit,
  });
  const closedNow = state.obligations
    .filter((obligation) => composition.some((item) => (item.metadata.get('obligation') ?? '') === obligation.id && shipsResult(item)))
    .map((obligation) => obligation.id);
  const deferredNow = Object.keys(state.state.deferred ?? {});
  const receipt = await readReceipt(root, commit);
  content = replaceSection(
    content,
    '## Критерии выхода',
    receipt === null
      ? sectionLines(content, '## Критерии выхода')
        .map((line) => line.startsWith('- [ ] Завершающий шаг') ? `- [x] Завершающий шаг выполнен — ${note.trim()}` : line)
      : criteriaLines(receipt, tag, obligationsSummary(closedNow, deferredNow, state.isCore), note.trim()),
  );

  const obligationState_ = state.state;
  obligationState_.releaseCount = (obligationState_.releaseCount ?? 0) + 1;
  obligationState_.closed ??= {};
  obligationState_.seen ??= {};
  for (const obligation of state.obligations) {
    // REQ-RELEASE-019
    const ticket = composition.find((item) => (item.metadata.get('obligation') ?? '') === obligation.id && shipsResult(item));
    if (ticket !== undefined) {
      obligationState_.closed[obligation.id] = { release: id, ticket: ticketId(ticket) };
      delete obligationState_.deferred?.[obligation.id];
    }
  }
  await writeDocument(release.file, content);
  await writeState(root, obligationState_);
  return { finished: true, id, tag, commit, note: note.trim() };
}

// REQ-NAMING-001, REQ-NAMING-003, REQ-NAMING-012
export function nextTicketId(existing, area, prefix) {
  const head = prefix ? `${prefix}-${area}` : area;
  const taken = existing
    .map((id) => new RegExp(`^${head}-(\\d{3})$`).exec(id))
    .filter((match) => match !== null)
    .map((match) => Number(match[1]));
  const next = taken.length === 0 ? 1 : Math.max(...taken) + 1;
  return `${head}-${String(next).padStart(3, '0')}`;
}

function obligationTicket(obligation, releaseId, id) {
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
  return { id, slug: obligation.slug, content: lines.join('\n') };
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
  // REQ-RELEASE-019
  if (!shipsResult(evidence)) {
    const status = evidence.metadata.get('status');
    return {
      satisfied: false,
      problems: [`Задача ${evidenceId} не выполнена (${status}): обязательство закрывается только выполненной работой`],
    };
  }

  const materialized = all.find((ticket) => ticket.metadata.get('obligation') === obligationId);
  const removed = [];
  if (materialized !== undefined && !shipsResult(materialized)) {
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

// REQ-RELEASE-030
function releaseNumberProblem(scheme, version) {
  if (scheme !== 'semver' || version) return null;
  return 'Схема semver: номер выпуска задаётся ключом --version X.Y.Z';
}

// REQ-RELEASE-020, REQ-RELEASE-030
export async function adoptCycle(root, { scheme, version, today }) {
  const existing = await releases(root);
  if (existing.length > 0) {
    return { adopted: false, problems: ['В проекте уже есть выпуски: принятие цикла выполняется один раз'] };
  }
  const missingNumber = releaseNumberProblem(scheme, version);
  if (missingNumber !== null) return { adopted: false, problems: [missingNumber] };
  const before = await unassignedDoneTickets(root);
  for (const ticket of before) {
    await writeDocument(ticket.file, replaceMetadata(ticket.content, { release: 'before-cycle' }));
  }
  const opened = await openNext(root, { scheme, version, today });
  return { adopted: opened.opened, ...opened, stamped: before.map(ticketId) };
}

// REQ-RELEASE-007
async function namedTickets(root, names) {
  const all = await tickets(root);
  const found = [];
  const problems = [];
  for (const name of names) {
    const ticket = all.find((item) => ticketId(item) === name);
    if (ticket === undefined) {
      problems.push(`Задачи ${name} в проекте нет: в выпуск указываются существующие задачи`);
      continue;
    }
    const release = ticket.metadata.get('release') ?? 'unassigned';
    if (release !== 'unassigned') {
      problems.push(`Задача ${name} уже отнесена к ${release}: в выпуск указывается задача без выпуска`);
      continue;
    }
    found.push(ticket);
  }
  return { found, problems };
}

export async function openNext(root, { scheme, version, today, tickets: names = [] }) {
  const existing = await releases(root);
  const already = await openRelease(root);
  if (already !== null) {
    return { opened: false, problems: [`Выпуск ${already.metadata.get('id')} уже открыт: открытый выпуск всегда ровно один`] };
  }
  // REQ-RELEASE-030
  const missingNumber = releaseNumberProblem(scheme, version);
  if (missingNumber !== null) return { opened: false, problems: [missingNumber] };
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

  // REQ-NAMING-012
  const prefix = (await readConfig(root)).ticketPrefix ?? null;
  // REQ-RELEASE-013
  const allTickets = await tickets(root);
  const takenIds = allTickets.map(ticketId);
  const obligationTickets = new Map(allTickets
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
      if (!shipsResult(already)) {
        carried.push({ ticket: already, obligation: entry.obligation });
      }
      continue;
    }
    // REQ-NAMING-005, REQ-NAMING-007, REQ-NAMING-012
    const ticketId_ = nextTicketId(takenIds, entry.obligation.area ?? 'OPS', prefix);
    takenIds.push(ticketId_);
    const ticket = obligationTicket(entry.obligation, id, ticketId_);
    const file = path.join(root, TICKETS_DIR, `${ticketId_}-${entry.obligation.slug}.md`);
    created.push({ ...ticket, file, obligation: entry.obligation });
  }

  const named = await namedTickets(root, names);
  if (named.problems.length > 0) return { opened: false, problems: named.problems };

  const planned = [
    ...named.found.map((ticket) => `| [${ticketId(ticket)}](${ticketLinkTarget(root, ticket)}) | Указана при открытии выпуска |`),
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
    '- [ ] Завершающий шаг выполнен — развёртывание в производственную среду или публикация артефактов',
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
  // REQ-RELEASE-007
  for (const ticket of named.found) {
    await writeDocument(ticket.file, replaceMetadata(ticket.content, { release: id }));
  }
  for (const entry of carried) {
    await writeDocument(entry.ticket.file, replaceMetadata(entry.ticket.content, { release: id }));
  }
  await writeState(root, state);
  return {
    opened: true, id, tag, file,
    named: named.found.map(ticketId),
    created: created.map((ticket) => ticket.id),
    carried: carried.map((entry) => ticketId(entry.ticket)),
  };
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

export { obligationState, readState };
