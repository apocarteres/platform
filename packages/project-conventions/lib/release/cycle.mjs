import { mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import {
  ACCOUNTED_SECTION, RELEASES_DIR, RETAGGED_SECTION, STAGE_ID, TICKETS_DIR, accountedCommits, compareReleaseIds, compositionTickets, nextReleaseId, openRelease, releaseTag, releases, shipsResult,
  replaceMetadata, replaceSection, sectionLines, ticketId, ticketLinkTarget, tickets,
  unassignedDoneTickets, withSection, writeDocument,
} from './documents.mjs';
import {
  loadObligations, obligationState, overdueObligations, pendingObligations, readState, writeState,
} from './obligations.mjs';
import { attested, receiptFor } from './receipt.mjs';
import { CYCLE_TRAILER, REVERT_LABEL, commitsInRange, cycleCommit, mergeCommit, recordCommit, revertCommit, ticketOf, ticketsOf } from './commits.mjs';
import { TICKET_AREAS } from '../document-naming.mjs';
import { readConfig } from '../config.mjs';
import { NOT_A_REPOSITORY, codeTree, createTag, headCommit, moveTag, repositoryAt, tagCommit, tagExists, workingTreeClean } from './git.mjs';

// REQ-RELEASE-001, REQ-RELEASE-002, REQ-RELEASE-003, REQ-RELEASE-009, REQ-RELEASE-014, REQ-RELEASE-028
export async function closability(root, { scheme, retagging = false }) {
  const problems = [];
  const config = await readConfig(root);
  const release = await openRelease(root);
  if (release === null) problems.push('Открытого выпуска нет: откройте выпуск командой release open');
  // REQ-RELEASE-039
  if (!await workingTreeClean(root)) {
    problems.push('Рабочее дерево не чисто: тег утверждал бы одно состояние, а помечал другое.'
      + ' Зафиксируйте изменения коммитом своей задачи либо отбросьте их');
  }
  const commit = await headCommit(root);
  // REQ-RELEASE-045
  const found = await receiptFor(root, commit, { treeOf: (sha) => codeTree(root, sha) });
  const receipt = found.receipt;
  // REQ-RELEASE-039
  if (receipt === null) {
    problems.push(`Нет расписки о пройденном verify для ${commit.slice(0, 8)}:`
      + ' запишите её командой conventions receipt --checks verify -- <команда набора>.'
      + ' Служебные правки выпуска расписку не обесценивают (REQ-RELEASE-045):'
      + ' если расписки нет вовсе, менялся код — сначала разберите всё, что называет release status, и только потом записывайте расписку');
  } else if (!attested(receipt)) {
    problems.push(`Расписка для ${commit.slice(0, 8)} не содержит признака прогона: наборы заявлены, но не наблюдались.`
      + ' Перезапишите её командой conventions receipt: заявить набор вручную контур выпуска не позволяет');
  } else if (found.carriedFrom !== null) {
    // REQ-RELEASE-045
    problems.push(...await documentsSinceTheReceipt(root, config, found.carriedFrom));
  }
  const composition = release === null
    ? []
    : await compositionTickets(root, release.metadata.get('id'));
  // REQ-RELEASE-039
  if (composition.length === 0) {
    problems.push('Состав пуст: нечего выпускать.'
      + ' Состав подбирает выполненные задачи без выпуска сам — доведите задачу до выполненного состояния');
  }
  // REQ-RELEASE-031, REQ-RELEASE-008
  for (const ticket of composition.filter((item) => !shipsResult(item) && !item.metadata.has('obligation'))) {
    problems.push(`Задача ${ticketId(ticket)} состава не выполнена (${ticket.metadata.get('status')}): выполните её либо снимите из состава командой release drop с причиной`);
  }
  const state = await readState(root);
  const { obligations, isCore } = await loadObligations(root);
  for (const entry of overdueObligations(obligations, state, isCore)) {
    // REQ-RELEASE-039
    problems.push(`Обязательство ${entry.obligation.id} просрочено: срок ${entry.obligation.dueReleases} выпуск(ов),`
      + ` прошло ${entry.state.elapsed}. Закрывается задачей с полем obligation: ${entry.obligation.id}`
      + ` либо командой release satisfy ${entry.obligation.id} --ticket <ID>; перенести просроченное нельзя`);
  }
  const tag = release === null ? null : releaseTag(release.metadata.get('id'), scheme);
  // REQ-RELEASE-039, REQ-RELEASE-046
  if (!retagging && tag !== null && await tagExists(root, tag)) {
    problems.push(`Тег ${tag} уже существует: номер не переиспользуется.`
      + ' Либо первый шаг закрытия уже выполнен — тогда завершите выпуск командой release finish,'
      + ' — либо номер занят прежним выпуском и следующий открывается с другим номером');
  }
  // REQ-RELEASE-036
  problems.push(...await commitProblems(root, {
    scheme, config, composition, existing: await releases(root),
    releaseId: release === null ? null : release.metadata.get('id'),
    // REQ-RELEASE-041
    open: release,
  }));
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

// REQ-RELEASE-036, REQ-RELEASE-042
export function commitStanding(commit, { members, cancelled, accounted, areas, prefix, stages }) {
  // REQ-RELEASE-036
  if (cycleCommit(commit) || mergeCommit(commit)) return 'обслуживает выпуск';
  // REQ-RELEASE-041
  if (accounted.some((sha) => commit.sha.startsWith(sha))) return 'учтён в выпуске';
  // REQ-RELEASE-042
  const named = ticketsOf(commit, areas, prefix, stages);
  if (named.length === 0) return 'не называет задачу';
  if (named.some((id) => members.has(id))) return 'задача состава';
  // REQ-RELEASE-031
  if (named.some((id) => cancelled.has(id))) return 'задача отменена';
  // REQ-RELEASE-040
  if (recordCommit(commit)) return 'запись о задаче';
  return 'задача вне состава';
}

// REQ-RELEASE-042
const HOLDS = new Set(['не называет задачу', 'задача вне состава']);

// REQ-RELEASE-036, REQ-RELEASE-042
async function standingContext(root, { config, composition, open }) {
  const known = await tickets(root);
  return {
    members: new Set(composition.map(ticketId)),
    // REQ-RELEASE-031
    cancelled: new Set(known
      .filter((ticket) => ['cancelled', 'superseded'].includes(ticket.metadata.get('status')))
      .map(ticketId)),
    accounted: accountedCommits(open?.content ?? '').map((row) => row.sha),
    areas: [...TICKET_AREAS, ...(config.ticketAreas ?? [])],
    prefix: config.ticketPrefix ?? null,
    stages: new Set(known.map(ticketId).filter((id) => STAGE_ID.test(id ?? ''))),
  };
}

// REQ-RELEASE-036
async function commitProblems(root, { scheme, config, composition, existing, releaseId, open = null }) {
  const baseline = config.commitRuleSince ?? null;
  // REQ-RELEASE-036
  if (baseline === null) return [];
  const since = await previousReleaseTag(root, existing, scheme);
  const commits = await commitsInRange(root, since);
  const beyondBaseline = await withoutOlderThan(root, commits, baseline);

  const context = await standingContext(root, { config, composition, open });
  const { areas, prefix, stages } = context;
  const known = await tickets(root);
  const problems = [];
  const outside = new Map();
  for (const commit of beyondBaseline) {
    const standing = commitStanding(commit, context);
    if (!HOLDS.has(standing)) continue;
    if (standing === 'не называет задачу') {
      // REQ-RELEASE-039
      problems.push(`Коммит ${commit.sha.slice(0, 8)} не называет задачу: «${commit.subject}»\n  `
        + wayOutOfAnUnnamedCommit(releaseId, prefix, commit.sha.slice(0, 8)));
      continue;
    }
    const ticket = ticketOf(commit, areas, prefix, stages);
    if (!outside.has(ticket)) outside.set(ticket, []);
    outside.get(ticket).push(commit);
  }

  // REQ-RELEASE-037
  for (const [ticket, commits] of outside) {
    if (revertCommit(commits[0], areas, prefix, stages)) continue;
    const named = commits.map(
      (commit) => `Коммит ${commit.sha.slice(0, 8)} относится к задаче ${ticket} вне состава выпуска: «${commit.subject}»`,
    );
    // REQ-RELEASE-039
    named.push(wayIntoComposition(ticket, known.find((item) => ticketId(item) === ticket) ?? null));
    problems.push(named.join('\n  '));
  }
  return problems;
}

// REQ-QUALITY-004
export async function commitsWithoutATicket(root, range) {
  // REQ-BUILD-012
  if (!await repositoryAt(root)) throw new Error(NOT_A_REPOSITORY);
  const config = await readConfig(root);
  const baseline = config.commitRuleSince ?? null;
  // REQ-RELEASE-036
  if (baseline === null) return [];
  const commits = await commitsInRange(root, range);
  const beyondBaseline = await withoutOlderThan(root, commits, baseline);
  const open = await openRelease(root);
  const composition = open === null ? [] : await compositionTickets(root, open.metadata.get('id'));
  const context = await standingContext(root, { config, composition, open });
  // REQ-QUALITY-004
  return beyondBaseline.filter((commit) => commitStanding(commit, context) === 'не называет задачу');
}

// REQ-RELEASE-041
export async function accountCommit(root, { sha, reason }) {
  if (!sha) return { accounted: false, problems: ['Учёт коммита требует его хеша'] };
  if (!reason) return { accounted: false, problems: ['Учёт коммита требует причины: ключ --reason'] };
  const release = await openRelease(root);
  if (release === null) {
    return { accounted: false, problems: ['Открытого выпуска нет: коммит учитывается в том выпуске, в чей диапазон он попал'] };
  }
  const config = await readConfig(root);
  const scheme = config.release?.scheme ?? 'date';
  const since = await previousReleaseTag(root, await releases(root), scheme);
  const found = (await commitsInRange(root, since)).find((commit) => commit.sha.startsWith(sha));
  if (found === undefined) {
    return { accounted: false, problems: [`Коммита ${sha} нет в диапазоне выпуска: учитываются коммиты, которые держат его закрытие`] };
  }
  // REQ-RELEASE-042
  const composition = await compositionTickets(root, release.metadata.get('id'));
  const context = await standingContext(root, { config, composition, open: release });
  const standing = commitStanding(found, context);
  if (standing !== 'не называет задачу' && standing !== 'задача вне состава') {
    return {
      accounted: false,
      problems: [`Коммит ${found.sha.slice(0, 8)} закрытия не держит: ${standing}. Учёт нужен только тому, кто держит`],
    };
  }
  const already = accountedCommits(release.content);
  const rows = [
    '| Коммит | Заголовок | Причина |',
    '|---|---|---|',
    ...already.map((row) => `| ${row.sha} | ${row.subject} | ${row.reason} |`),
    `| ${found.sha.slice(0, 8)} | ${found.subject.replaceAll('|', '&#124;')} | ${reason.replaceAll('|', '&#124;')} |`,
  ];
  await writeDocument(release.file, withSection(release.content, ACCOUNTED_SECTION, rows, '## Состав'));
  return { accounted: true, sha: found.sha.slice(0, 8), release: release.metadata.get('id') };
}

// REQ-RELEASE-039
function wayOutOfAnUnnamedCommit(releaseId, prefix, sha) {
  const example = prefix ? `${prefix}-OPS-001` : 'OPS-001';
  return `Выхода четыре. Коммит ещё не отправлен: назовите задачу идентификатором в начале заголовка (${example} ...);`
    + ` если коммит обслуживает сам выпуск — поставьте в тело строку ${CYCLE_TRAILER}: ${releaseId}`
    + ' (именно в тело, заголовок для этого не годится);'
    + ` если коммит отменяет прежнюю работу — метку ${REVERT_LABEL} сразу после идентификатора задачи.`
    + ` Коммит уже отправлен: учтите его в выпуске командой release account ${sha} --reason "<причина>"`
    + ' — это единственный выход, не переписывающий общую историю (REQ-RELEASE-041)';
}

// REQ-RELEASE-039
function wayIntoComposition(ticket, known) {
  const assigned = known === null ? 'unassigned' : (known.metadata.get('release') ?? 'unassigned');
  if (assigned !== 'unassigned') {
    return `Задача ${ticket} уже отнесена к ${assigned} и в состав этого выпуска не вносится (REQ-RELEASE-007): работа после её выпуска оформляется новой задачей, а ненужная — отменяется коммитом с меткой !revert`;
  }
  return `Задача ${ticket} вносится в состав так: доведите её до выполненного состояния — состав подберёт её сам (REQ-RELEASE-007), — либо отмените её коммиты коммитом с меткой !revert`;
}

// REQ-RELEASE-036
async function previousReleaseTag(root, existing, scheme) {
  const released = existing
    .filter((release) => release.metadata.get('status') === 'released')
    .map((release) => release.metadata.get('id'))
    .sort(compareReleaseIds)
    .reverse();
  for (const id of released) {
    const tag = releaseTag(id, scheme);
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
export async function closeRelease(root, { scheme }) {
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
    // REQ-RELEASE-039
    problems.push(`Задача ${ticketId(ticket)} состава не выполнена (${ticket.metadata.get('status')}):`
      + ' выполните её либо снимите из состава командой release drop с причиной');
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
  // REQ-RELEASE-045
  const receipt = (await receiptFor(root, commit, { treeOf: (sha) => codeTree(root, sha) })).receipt;
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
      // REQ-RELEASE-039
      problems.push(`Задача ${name} уже отнесена к ${release}: в выпуск указывается задача без выпуска.`
        + ' Работа после выпуска задачи оформляется новой задачей');
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
  const unclaimed = [];
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
    // REQ-RELEASE-019
    const bySlug = allTickets.find((ticket) => ticket.file.endsWith(`-${entry.obligation.slug}.md`));
    if (bySlug !== undefined) {
      unclaimed.push({ ticket: bySlug, obligation: entry.obligation });
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
    // REQ-RELEASE-019
    unclaimed: unclaimed.map((entry) => ({ ticket: ticketId(entry.ticket), obligation: entry.obligation.id })),
  };
}

// REQ-RELEASE-045
async function documentsSinceTheReceipt(root, config, carriedFrom) {
  const { documentationProblems } = await import('../docs/documentation.mjs');
  const { errors } = await documentationProblems(root, config);
  if (errors.length === 0) return [];
  return [
    `Расписка перенесена с ${carriedFrom.slice(0, 8)}: код с тех пор не менялся, а документы менялись`
    + ` и согласованными больше не являются (${errors.length}):`,
    ...errors.map((error) => `  ${error}`),
  ];
}

// REQ-RELEASE-046
export async function recloseRelease(root, { scheme, reason }) {
  if (!reason || !reason.trim()) {
    return { reclosed: false, problems: ['Перенос тега требует причины: ключ --reason'] };
  }
  const release = await openRelease(root);
  if (release === null) {
    return { reclosed: false, problems: ['Открытого выпуска нет: переносить тег не у чего'] };
  }
  const id = release.metadata.get('id');
  const tag = releaseTag(id, scheme);
  const tagged = await tagCommit(root, tag);
  if (tagged === null) {
    return {
      reclosed: false,
      problems: [`Первый шаг закрытия ${id} ещё не выполнен: тега ${tag} нет.`
        + ' Выпуск закрывается командой release close, а перезакрывается только после неё'],
    };
  }
  const head = await headCommit(root);
  if (head === tagged) {
    return {
      reclosed: false,
      problems: [`Тег ${tag} уже на текущем коммите: переносить некуда.`
        + ' Правка, ради которой переносят тег, ещё не зафиксирована'],
    };
  }
  const state = await closability(root, { scheme, retagging: true });
  if (state.problems.length > 0) return { reclosed: false, problems: state.problems };
  const { receipt, composition } = state;
  let content = replaceSection(release.content, '## Результат', resultLines(receipt, head, tag));
  const closedNow = state.obligations
    .filter((obligation) => composition.some((item) => (item.metadata.get('obligation') ?? '') === obligation.id))
    .map((obligation) => obligation.id);
  content = replaceSection(
    content,
    '## Критерии выхода',
    criteriaLines(receipt, tag, obligationsSummary(closedNow, Object.keys(state.state.deferred ?? {}), state.isCore)),
  );
  const already = retaggedRows(content);
  content = withSection(content, RETAGGED_SECTION, [
    '| Было | Стало | Причина |',
    '|---|---|---|',
    ...already,
    `| ${tagged.slice(0, 8)} | ${head.slice(0, 8)} | ${reason.trim().replaceAll('|', '&#124;')} |`,
  ], '## Результат');
  await moveTag(root, tag, head, `Выпуск ${id}`);
  await writeDocument(release.file, content);
  return { reclosed: true, id, tag, from: tagged, to: head };
}

// REQ-RELEASE-046
function retaggedRows(content) {
  if (!content.split('\n').some((line) => line.trim() === RETAGGED_SECTION)) return [];
  return sectionLines(content, RETAGGED_SECTION)
    .filter((line) => line.startsWith('| ') && !line.startsWith('| Было') && !/^\|[\s:|-]+\|$/.test(line));
}

export { obligationState, readState };
// REQ-CODE-DESIGN-009
export { cancelRelease, dropFromComposition } from './composition.mjs';
