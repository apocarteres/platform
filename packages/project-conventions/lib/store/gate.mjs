import { releaseTag, shipsResult, ticketId } from '../release/documents.mjs';
import { loadObligations, overdueObligations } from '../release/obligations.mjs';
import { attested, receiptFor } from '../release/receipt.mjs';
import { commitsInRange, ticketsOf } from '../release/commits.mjs';
import { commitHolds } from '../release/commit-holds.mjs';
import { documentsSinceTheReceipt, withoutOlderThan } from '../release/cycle.mjs';
import { findExpandDebts } from '../migrations.mjs';
import { questionsAmong } from '../release/questions.mjs';
import { dependencyProblems } from '../release/rollout.mjs';
import { codeTree, headCommit, tagExists, workingTreeClean } from '../release/git.mjs';
import { previousTag } from './tags.mjs';
import { metadataDeclaration, projectFieldErrors } from '../docs/project-metadata.mjs';
import { asDocument, namesOf } from './shape.mjs';

// REQ-STORE-012
export function accountState(open) {
  const state = { releaseCount: open.releasedCount, seen: {}, closed: {}, deferred: {} };
  for (const record of open.obligations) {
    if (record.seenAtCount !== null && record.seenAtCount !== undefined) state.seen[record.id] = record.seenAtCount;
    if (record.closed) state.closed[record.id] = record.closed;
    if (record.deferred) state.deferred[record.id] = record.deferred;
  }
  return state;
}

// REQ-RELEASE-039, REQ-RELEASE-045, REQ-STORE-010
export async function localStanding(root, config) {
  const problems = [];
  if (!await workingTreeClean(root)) {
    problems.push('Рабочее дерево не чисто: тег утверждал бы одно состояние, а помечал другое.'
      + ' Зафиксируйте изменения коммитом своей задачи либо отбросьте их');
  }
  const commit = await headCommit(root);
  const found = await receiptFor(root, commit, { treeOf: (sha) => codeTree(root, sha) });
  if (found.receipt === null) {
    problems.push(`Нет расписки о пройденном verify для ${commit.slice(0, 8)}:`
      + ' запишите её командой conventions receipt --checks verify -- <команда набора>');
  } else if (!attested(found.receipt)) {
    problems.push(`Расписка для ${commit.slice(0, 8)} не содержит признака прогона: наборы заявлены, но не наблюдались.`
      + ' Перезапишите её командой conventions receipt');
  } else if (found.carriedFrom !== null) {
    problems.push(...await documentsSinceTheReceipt(root, config, found.carriedFrom));
  }
  return { problems, commit, receipt: found.receipt };
}

// REQ-RELEASE-007, REQ-STORE-005
export function compositionOf(documents, releaseId) {
  return documents.filter((ticket) => {
    const release = ticket.metadata.get('release');
    return release === releaseId || (release === 'unassigned' && shipsResult(ticket));
  });
}

// REQ-RELEASE-036, REQ-STORE-014
async function commitProblems(root, { config, store, client, scheme, tag, composition, release }) {
  const baseline = config.commitRuleSince ?? null;
  if (baseline === null) return [];
  const commits = await withoutOlderThan(root, await commitsInRange(root, await previousTag(root, scheme, tag)), baseline);
  const named = commits.flatMap((commit) => ticketsOf(commit, [], null, new Set(), store.idPattern));
  const found = named.length === 0 ? { tickets: [] } : await client.lookup(named);
  const looked = found.tickets.map(asDocument);
  const context = {
    existing: new Set(looked.flatMap(namesOf)),
    members: new Set(composition.flatMap(namesOf)),
    cancelled: new Set(looked
      .filter((ticket) => ['cancelled', 'superseded'].includes(ticket.metadata.get('status')))
      .flatMap(namesOf)),
    accounted: (release.accounted ?? []).map((row) => row.sha),
    areas: [],
    prefix: config.ticketPrefix ?? null,
    stages: new Set(),
    pattern: store.idPattern,
    records: false,
  };
  return commitHolds(commits, context, {
    releaseId: release.id,
    releaseOf: (name) => looked.find((ticket) => namesOf(ticket).includes(name))?.metadata.get('release') ?? 'unassigned',
    where: 'в хранилище',
  });
}

// REQ-RELEASE-001, REQ-STORE-008, REQ-STORE-010
export async function storeStanding(root, { config, store, client, scheme, retagging = false }) {
  const open = await client.openRelease();
  if (open.release === null) {
    return { problems: ['Открытого выпуска нет: откройте выпуск командой release open или на доске хранилища'], reminders: [], release: null, open };
  }
  const working = await client.working();
  const documents = working.tickets.map(asDocument);
  const referenced = working.referenced.map(asDocument);
  const release = open.release;
  const tag = releaseTag(release.id, scheme);
  const composition = compositionOf(documents, release.id);
  const problems = [];
  if (composition.length === 0) {
    problems.push('Состав пуст: нечего выпускать.'
      + ' Состав подбирает выполненные задачи без выпуска сам — доведите задачу до выполненного состояния');
  }
  // REQ-RELEASE-031, REQ-RELEASE-008
  for (const ticket of composition.filter((item) => !shipsResult(item) && !item.metadata.has('obligation'))) {
    problems.push(`Задача ${ticketId(ticket)} состава не выполнена (${ticket.metadata.get('status')}): выполните её либо снимите из состава командой release drop с причиной`);
  }
  // REQ-PROJECT-PROCESS-024
  const fieldErrors = projectFieldErrors(metadataDeclaration(config).fields);
  for (const ticket of composition) problems.push(...fieldErrors(`Задача ${ticketId(ticket)}`, ticket.metadata));
  const { obligations, isCore } = await loadObligations(root);
  const state = accountState(open);
  for (const entry of overdueObligations(obligations, state, isCore)) {
    problems.push(`Обязательство ${entry.obligation.id} просрочено: срок ${entry.obligation.dueReleases} выпуск(ов),`
      + ` прошло ${entry.state.elapsed}. Закрывается задачей с полем obligation: ${entry.obligation.id}`
      + ` либо командой release satisfy ${entry.obligation.id} --ticket <ID>; перенести просроченное нельзя`);
  }
  // REQ-DEPLOYMENT-027
  problems.push(...(await findExpandDebts(root, config)).problems);
  // REQ-RELEASE-047, REQ-STORE-013
  const questions = questionsAmong(documents, config);
  problems.push(...questions.problems);
  // REQ-RELEASE-050
  const released = [...new Set(referenced.filter(shipsResult).map((ticket) => ticket.metadata.get('release')))]
    .map((id) => ({ metadata: new Map([['id', id], ['status', 'released']]) }));
  problems.push(...dependencyProblems(composition, [...documents, ...referenced], released));
  // REQ-RELEASE-039, REQ-RELEASE-046
  if (!retagging && await tagExists(root, tag)) {
    problems.push(`Тег ${tag} уже существует: номер не переиспользуется.`
      + ' Либо первый шаг закрытия уже выполнен — тогда завершите выпуск командой release finish,'
      + ' — либо номер занят прежним выпуском и следующий открывается с другим номером');
  }
  problems.push(...await commitProblems(root, { config, store, client, scheme, tag, composition, release }));
  return {
    problems, reminders: questions.reminders, release, open, working, documents, composition, tag, state, obligations, isCore,
  };
}
