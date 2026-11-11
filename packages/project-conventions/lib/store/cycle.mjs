import { releaseTag, shipsResult, ticketId } from '../release/documents.mjs';
import { loadObligations, pendingObligations } from '../release/obligations.mjs';
import { commitSubject, createTag, headCommit, moveTag, tagCommit, tagMessage } from '../release/git.mjs';
import { inRolloutOrder } from '../release/rollout.mjs';
import { accountState, compositionOf, localStanding, storeStanding } from './gate.mjs';
import { actionsOf, asDocument, fieldsDigest, manifestComposition, manifestMessage, manifestOf, ticketFields } from './shape.mjs';

// REQ-STORE-012
function obligationRequest(obligation) {
  return {
    id: obligation.id,
    title: obligation.title,
    area: obligation.area ?? 'OPS',
    scope: obligation.ticket.scope,
    priority: obligation.ticket.priority,
    due: obligation.dueReleases,
    body: [
      '## Проблема', '', obligation.ticket.problem, '',
      '## Основание', '',
      `Обязательство ядра \`${obligation.id}\`, требование \`${obligation.requirement}\`, объявлено в версии ядра ${obligation.since}. Срок исполнения: ${obligation.dueReleases} выпуск(ов) потребителя.`, '',
      '## Требуется', '', ...obligation.ticket.required.map((item, index) => `${index + 1}. ${item}`), '',
      '## Критерии приёмки', '', ...obligation.ticket.acceptance.map((item) => `- ${item}`), '',
    ].join('\n'),
  };
}

// REQ-STORE-012, REQ-STORE-018
export async function settle(root, { config, client }) {
  const done = { fields: false, taken: [] };
  if (!client.canWrite()) return done;
  const working = await client.working();
  const fields = ticketFields(config);
  const digest = fieldsDigest(fields);
  if (working.fieldsDigest !== digest && (working.fieldsDigest !== null || Object.keys(fields).length > 0)) {
    await client.operate('defineFields', { fields }, `defineFields:${digest}`);
    done.fields = true;
  }
  const open = await client.openRelease();
  if (open.release === null || open.release.status !== 'draft') return done;
  const { obligations, isCore } = await loadObligations(root);
  const state = accountState(open);
  const documents = working.tickets.map(asDocument);
  const untaken = pendingObligations(obligations, state, isCore).filter(({ obligation }) => {
    const carried = documents.some((ticket) => ticket.metadata.get('obligation') === obligation.id
      && (ticket.metadata.get('release') === open.release.id || shipsResult(ticket)));
    return !carried || state.seen[obligation.id] === undefined;
  });
  if (untaken.length > 0) {
    await client.operate('takeObligations', { obligations: untaken.map(({ obligation }) => obligationRequest(obligation)) });
    done.taken = untaken.map(({ obligation }) => obligation.id);
  }
  return done;
}

const receiptOf = (receipt) => ({
  completedAt: receipt.completedAt, checks: receipt.checks, command: receipt.run.command, exitCode: receipt.run.exitCode,
});

const closeArguments = (manifest, tag) => ({
  commit: manifest.commit,
  tag,
  composition: manifest.composition.map((one) => one.id),
  actions: manifest.actions,
  receipt: manifest.receipt,
  ...(manifest.reason === undefined ? {} : { reason: manifest.reason }),
});

// REQ-STORE-011
async function replayed(root, { client, release, tag }) {
  const manifest = manifestOf(await tagMessage(root, tag));
  const tagged = await tagCommit(root, tag);
  if (manifest === null || manifest.release !== release.id || manifest.commit !== tagged) return null;
  if (manifest.commit === release.result?.commit) return null;
  const operation = manifest.reason === undefined ? 'closeRelease' : 'recloseRelease';
  await client.operate(operation, closeArguments(manifest, tag), `${operation}:${release.id}:${manifest.commit}`);
  return manifest;
}

// REQ-RELEASE-001, REQ-RELEASE-046, REQ-STORE-010, REQ-STORE-011
export async function closeRelease(root, context, { reason = null } = {}) {
  const { config, client, scheme } = context;
  const retagging = reason !== null;
  const local = await localStanding(root, config);
  if (local.problems.length > 0) return { closed: false, problems: local.problems, reminders: [] };
  const { commit, receipt } = local;
  let open = await client.openRelease();
  if (open.release === null) {
    return { closed: false, problems: ['Открытого выпуска нет: откройте выпуск командой release open или на доске хранилища'], reminders: [] };
  }
  const id = open.release.id;
  const tag = releaseTag(id, scheme);
  if (open.release.status === 'closing') {
    const manifest = await replayed(root, { client, release: open.release, tag });
    if (manifest !== null) {
      return { closed: true, replayed: true, id, tag, commit: manifest.commit, composition: manifest.composition.map((one) => one.id), reminders: [] };
    }
    await client.operate('unfreezeRelease', { reason: 'Повтор команды закрытия: тега с манифестом этого закрытия нет' });
    open = await client.openRelease();
  }
  const tagged = await tagCommit(root, tag);
  if (retagging) {
    if (tagged === null || open.release.status !== 'in_progress') {
      return { closed: false, problems: [`Первый шаг закрытия ${id} ещё не выполнен: тега ${tag} нет.`
        + ' Выпуск закрывается командой release close, а перезакрывается только после неё'], reminders: [] };
    }
    if (tagged === commit) {
      return { closed: false, problems: [`Тег ${tag} уже на текущем коммите: переносить некуда.`
        + ' Правка, ради которой переносят тег, ещё не зафиксирована'], reminders: [] };
    }
  } else {
    if (open.release.status !== 'draft') {
      return { closed: false, problems: [`Первый шаг закрытия ${id} уже выполнен (${open.release.status}):`
        + ' завершите выпуск командой release finish либо перенесите тег командой release reclose'], reminders: [] };
    }
    await settle(root, context);
  }

  await client.operate('freezeRelease', {});
  let frozen = true;
  const thaw = async (why) => {
    if (!frozen) return;
    frozen = false;
    await client.operate('unfreezeRelease', { reason: why });
  };
  try {
    const state = await storeStanding(root, { ...context, retagging });
    if (state.problems.length > 0) {
      await thaw('Проверки закрытия не пройдены');
      return { closed: false, problems: state.problems, reminders: state.reminders };
    }
    const composition = inRolloutOrder(state.composition.filter(shipsResult));
    const manifest = {
      release: id,
      commit,
      revision: state.working.revision,
      composition: manifestComposition(composition),
      actions: actionsOf(composition, state.release.actions ?? []),
      receipt: receiptOf(receipt),
      ...(retagging ? { reason: reason.trim(), from: tagged } : {}),
    };
    try {
      if (retagging) await moveTag(root, tag, commit, manifestMessage(manifest));
      else await createTag(root, tag, commit, manifestMessage(manifest));
    } catch (failure) {
      await thaw('Тег выпуска не поставлен');
      throw failure;
    }
    frozen = false;
    const operation = retagging ? 'recloseRelease' : 'closeRelease';
    try {
      await client.operate(operation, closeArguments(manifest, tag), `${operation}:${id}:${commit}`);
    } catch (failure) {
      failure.message = `Тег ${tag} поставлен, а запись в хранилище не дошла: ${failure.message}.`
        + ' Повторите команду — она доведёт запись по манифесту тега и второго тега не поставит';
      throw failure;
    }
    return {
      closed: true, id, tag, commit, from: tagged, composition: manifest.composition.map((one) => one.id), reminders: state.reminders,
      actions: manifest.actions,
    };
  } catch (failure) {
    try {
      await thaw('Команда закрытия прервана ошибкой');
    } catch {
      failure.message += '. Заморозку выпуска снять не удалось: повторите команду либо снимите её на доске хранилища';
    }
    throw failure;
  }
}

// REQ-RELEASE-049
const markCommand = (action, total) => `release mark ${action.ticket} --step ${action.step}`
  + `${total > 1 ? ` --item ${action.item}` : ''} --note "<чем подтверждено>"`;

// REQ-RELEASE-034, REQ-RELEASE-049, REQ-STORE-008
export async function finishability(root, { client, scheme }) {
  const open = await client.openRelease();
  if (open.release === null) {
    return { problems: ['Незавершённого выпуска нет: закройте выпуск командой release close'], release: null, open };
  }
  const release = open.release;
  const tag = releaseTag(release.id, scheme);
  const problems = [];
  if (release.status !== 'in_progress') {
    problems.push(`Первый шаг закрытия ${release.id} не выполнен (${release.status}): сначала release close`);
    return { problems, release, tag, open };
  }
  const working = await client.working();
  const composition = working.tickets.map(asDocument).filter((ticket) => ticket.metadata.get('release') === release.id);
  for (const ticket of composition.filter((item) => !shipsResult(item) && !item.metadata.has('obligation'))) {
    problems.push(`Задача ${ticketId(ticket)} состава не выполнена (${ticket.metadata.get('status')}):`
      + ' выполните её либо снимите из состава командой release drop с причиной');
  }
  const actions = release.actions ?? [];
  for (const action of actions.filter((one) => !one.done)) {
    const own = actions.filter((other) => other.ticket === action.ticket && other.step === action.step);
    problems.push(`Действие «${action.step === 'before' ? 'До развёртывания' : 'После развёртывания'}» задачи ${action.ticket} не отмечено: ${action.text}.`
      + ` Отметьте его командой ${markCommand(action, own.length)}`);
  }
  return { problems, release, tag, open, composition };
}

// REQ-RELEASE-034, REQ-STORE-012
export async function finishRelease(root, context, { note }) {
  if (!note || !note.trim()) {
    return { finished: false, problems: ['Завершающий шаг записывается с указанием, чем он выполнен: ключ --note'] };
  }
  const state = await finishability(root, context);
  if (state.problems.length > 0) return { finished: false, problems: state.problems };
  const { obligations } = await loadObligations(root);
  const closedObligations = obligations
    .map((obligation) => ({
      id: obligation.id,
      ticket: state.composition.find((item) => item.metadata.get('obligation') === obligation.id && shipsResult(item)),
    }))
    .filter((one) => one.ticket !== undefined)
    .map((one) => ({ id: one.id, ticket: ticketId(one.ticket) }));
  await context.client.operate('finishRelease', { note: note.trim(), closedObligations }, `finishRelease:${state.release.id}`);
  return { finished: true, id: state.release.id, tag: state.tag, commit: state.release.result?.commit ?? await headCommit(root), note: note.trim() };
}

// REQ-RELEASE-030, REQ-STORE-008
export async function openRelease(root, context, { version, tickets }) {
  const { client, scheme } = context;
  if (scheme === 'semver' && !version) {
    return { opened: false, problems: ['Схема semver: номер выпуска задаётся ключом --version X.Y.Z'] };
  }
  const answer = await client.operate('openRelease', {
    ...(scheme === 'semver' ? { id: `RELEASE-${version.replaceAll('.', '-')}` } : {}),
    tickets,
  });
  const id = answer.release?.id ?? (await client.openRelease()).release?.id;
  const settled = await settle(root, context);
  return { opened: true, id, tag: releaseTag(id, scheme), named: tickets, taken: settled.taken };
}

// REQ-RELEASE-041, REQ-STORE-008
export async function accountCommit(root, { client }, { sha, reason }) {
  const found = sha ? await commitSubject(root, sha) : null;
  if (found === null) {
    return { accounted: false, problems: [`Коммита ${sha ?? '(не указан)'} в репозитории нет: release account <хеш> --reason "<причина>"`] };
  }
  await client.operate('accountCommit', { sha: found.sha, subject: found.subject, reason: reason ?? '' });
  return { accounted: true, sha: found.sha.slice(0, 8) };
}

export { compositionOf };
