import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { readConfig } from '../config.mjs';
import { loadObligations, obligationState, pendingObligations } from '../release/obligations.mjs';
import { tagCommit } from '../release/git.mjs';
import { StoreRefusal, StoreUnreachable, storeClient } from './client.mjs';
import { filesOnly, storeDeclaration } from './config.mjs';
import { exportProject } from './export.mjs';
import { moveToStore } from './move.mjs';
import { accountCommit, closeRelease, finishRelease, finishability, openRelease, settle } from './cycle.mjs';
import { accountState, localStanding, storeStanding } from './gate.mjs';
import { actionsOf } from './shape.mjs';
import { checkStore } from './check.mjs';
import { commitsWithoutATicket } from './commits.mjs';

// REQ-STORE-008
export function reportFailure(failure, heading = null) {
  if (!(failure instanceof StoreRefusal) && !(failure instanceof StoreUnreachable)) throw failure;
  if (heading !== null) console.error(heading);
  console.error(`- ${failure.message}`);
  process.exitCode = 1;
}

function refused(heading, problems) {
  console.error(heading);
  for (const problem of problems) console.error(`- ${problem}`);
  process.exitCode = 1;
}

// REQ-RELEASE-035, REQ-STORE-012
function debts(obligations, state, isCore) {
  return pendingObligations(obligations, state, isCore).map(({ obligation }) => {
    const current = obligationState(obligation, state);
    const where = `обязательство ядра ${obligation.id} (${obligation.requirement}, ядро ${obligation.since})`;
    if (current.status === 'overdue') return `Долг перед ядром: ${where} просрочено, срок ${obligation.dueReleases} выпуск(ов), прошло ${current.elapsed}`;
    if (current.status === 'new') return `Долг перед ядром: ${where} ещё не взято в работу; задачу заведёт команда выпуска с ключом записи`;
    const deferred = current.deferral === undefined ? '' : `, отложено: ${current.deferral.reason ?? 'причина не записана'}`;
    return `Долг перед ядром: ${where} не закрыто, остаётся выпусков ${current.remaining}${deferred}`;
  });
}

// REQ-STORE-023
async function statusReport(root, context) {
  const { config, client } = context;
  await settle(root, context);
  const open = await client.openRelease();
  const { obligations, isCore } = await loadObligations(root);
  const report = {
    release: null, tag: null, composition: [], actions: [], problems: [], reminders: [],
    debts: debts(obligations, accountState(open), isCore),
  };
  if (open.release === null) return report;
  const state = await storeStanding(root, { ...context, retagging: true });
  const { id, status: standing } = state.release;
  report.release = { id, status: standing };
  report.tag = state.tag;
  report.composition = state.composition.map((ticket) => ({
    id: ticket.metadata.get('id'), title: ticket.title, status: ticket.metadata.get('status'), fields: ticket.fields,
  }));
  report.actions = actionsOf(state.composition, state.release.actions ?? []);
  report.reminders = state.reminders;
  if (standing === 'in_progress') report.problems = (await finishability(root, context)).problems;
  else if (standing === 'draft') {
    report.problems = [...(await localStanding(root, config)).problems, ...state.problems];
    if (await tagCommit(root, state.tag) !== null) report.problems.push(`Тег ${state.tag} уже существует: номер не переиспользуется`);
  }
  return report;
}

// REQ-RELEASE-010, REQ-RELEASE-038
async function status(root, context, json) {
  if (json) {
    console.log(JSON.stringify(await statusReport(root, context), null, 2));
    return;
  }
  const { config, client } = context;
  await settle(root, context);
  const open = await client.openRelease();
  const { obligations, isCore } = await loadObligations(root);
  for (const debt of debts(obligations, accountState(open), isCore)) console.log(debt);
  if (open.release === null) {
    console.log('Открытого выпуска нет: работа идёт по задачам, коммиты ложатся в main.');
    console.log('Выпуск открывается командой release open --tickets A,B или на доске хранилища.');
    return;
  }
  const state = await storeStanding(root, { ...context, retagging: true });
  console.log(`Открытый выпуск: ${state.release.id} (${state.release.status}), тег при закрытии: ${state.tag}`);
  console.log(`Задач в составе: ${state.composition.length}`);
  for (const reminder of state.reminders) console.log(`Напоминание: ${reminder}`);
  if (state.release.status === 'closing') {
    console.log('Выпуск заморожен закрытием: повторите release close — команда доведёт закрытие либо снимет заморозку.');
    return;
  }
  const tagged = await tagCommit(root, state.tag);
  if (state.release.status === 'in_progress') {
    const ready = await finishability(root, context);
    console.log(`Первый шаг закрытия выполнен: тег ${state.tag}${tagged === null ? ' (локально его нет: git fetch --tags)' : ` на коммите ${tagged.slice(0, 8)}`}.`);
    if (ready.problems.length === 0) {
      console.log('Недостаёт завершающего шага: release finish --note "<чем выполнен>".');
      return;
    }
    console.log('Завершить выпуск нельзя:');
    for (const problem of ready.problems) console.log(`- ${problem}`);
    return;
  }
  const problems = [...(await localStanding(root, config)).problems, ...state.problems];
  if (tagged !== null) problems.push(`Тег ${state.tag} уже существует: номер не переиспользуется`);
  if (problems.length === 0) {
    console.log('Первый шаг закрытия можно выполнять: release close.');
    return;
  }
  console.log('Выпуск закрыть нельзя:');
  for (const problem of problems) console.log(`- ${problem}`);
}

async function close(root, context, reason) {
  const retagging = reason !== undefined;
  if (retagging && (!reason || !reason.trim())) {
    refused('Тег не перенесён:', ['Перенос тега требует причины: ключ --reason']);
    return;
  }
  const result = await closeRelease(root, context, retagging ? { reason } : {});
  for (const reminder of result.reminders ?? []) console.log(`Напоминание: ${reminder}`);
  if (!result.closed) {
    refused(retagging ? 'Тег не перенесён:' : 'Выпуск закрыть нельзя:', result.problems);
    return;
  }
  if (result.replayed) console.log(`Закрытие ${result.id} доведено по манифесту тега ${result.tag}: второй тег не ставился.`);
  else if (retagging) console.log(`Тег ${result.tag} перенесён: ${result.from.slice(0, 8)} → ${result.commit.slice(0, 8)}.`);
  else console.log(`Первый шаг закрытия ${result.id} выполнен: коммит ${result.commit.slice(0, 8)}, задач в составе ${result.composition.length}.`);
  console.log(`Тег выпуска: ${result.tag} — отправьте его: git push origin ${result.tag}${retagging ? ' --force' : ''}`);
  console.log('Выпуск ещё не закрыт: отметьте завершающий шаг командой release finish --note "<чем выполнен>".');
}

async function finish(root, context, note) {
  const result = await finishRelease(root, context, { note });
  if (!result.finished) {
    refused('Выпуск не завершён:', result.problems);
    return;
  }
  console.log(`Выпуск ${result.id} закрыт: тег ${result.tag}, коммит ${result.commit.slice(0, 8)}.`);
  console.log(`Завершающий шаг: ${result.note}`);
}

async function open(root, context, version, tickets) {
  const result = await openRelease(root, context, { version, tickets });
  if (!result.opened) {
    refused('Выпуск не открыт:', result.problems);
    return;
  }
  console.log(`Открыт выпуск ${result.id}, тег при закрытии: ${result.tag}.`);
  for (const ticket of result.named) console.log(`- в состав указана задача ${ticket}`);
  for (const id of result.taken) console.log(`- обязательство ${id} взято в работу: задача заведена в хранилище`);
}

// REQ-STORE-008
const THIN = {
  drop: ({ first, valueOf }) => ['dropTicket', { ticket: first ?? '', reason: valueOf('--reason') ?? '' },
    (answer) => `Задача ${first} снята из состава ${answer.release?.id ?? 'выпуска'}; причина записана в выпуске.`],
  cancel: ({ valueOf }) => ['cancelRelease', { reason: valueOf('--reason') ?? '' },
    (answer) => `Выпуск ${answer.release?.id ?? ''} отменён; его задачи вновь без выпуска.`],
  mark: ({ first, valueOf }) => ['markAction', {
    ticket: first ?? '', step: valueOf('--step') ?? '', item: Number(valueOf('--item') ?? 1), done: true, note: valueOf('--note') ?? '',
  }, () => `Действие задачи ${first} отмечено: ${valueOf('--note')}`],
  defer: ({ first, valueOf }) => ['deferObligation', { id: first ?? '', reason: valueOf('--reason') ?? '' },
    () => `Обязательство ${first} перенесено: ${valueOf('--reason')}`],
  satisfy: ({ first, valueOf }) => ['satisfyObligation', { id: first ?? '', ticket: valueOf('--ticket') ?? '' },
    () => `Обязательство ${first} закрыто задачей ${valueOf('--ticket')}`],
};

// REQ-STORE-001, REQ-STORE-008
export async function externalRelease(root, store, subcommand, request) {
  if (subcommand === 'adopt' || subcommand === 'full-run') {
    console.error(filesOnly(`release ${subcommand}`));
    process.exitCode = 1;
    return;
  }
  const config = await readConfig(root);
  const context = { config, store, client: storeClient(store), scheme: config.release?.scheme ?? 'date' };
  const { first, valueOf } = request;
  try {
    if (subcommand === 'status') await status(root, context, request.json === true);
    else if (subcommand === 'close') await close(root, context, undefined);
    else if (subcommand === 'reclose') await close(root, context, valueOf('--reason') ?? '');
    else if (subcommand === 'finish') await finish(root, context, valueOf('--note'));
    else if (subcommand === 'open') await open(root, context, valueOf('--version'), request.tickets);
    else if (subcommand === 'account') {
      const result = await accountCommit(root, context, { sha: first, reason: valueOf('--reason') });
      if (!result.accounted) refused('Коммит не учтён:', result.problems);
      else console.log(`Коммит ${result.sha} учтён в открытом выпуске: закрытие он больше не держит`);
    } else {
      const [operation, args, told] = THIN[subcommand](request);
      console.log(told(await context.client.operate(operation, args)));
    }
  } catch (failure) {
    reportFailure(failure, 'Хранилище отказало:');
  }
}

// REQ-QUALITY-004, REQ-STORE-014
export async function externalCommits(root, store, range, strict) {
  const config = await readConfig(root);
  let result;
  try {
    result = await commitsWithoutATicket(root, range, { config, store, client: storeClient(store), strict });
  } catch (failure) {
    console.error(`Коммиты прочитать не удалось: ${failure.message}`);
    process.exitCode = 1;
    return;
  }
  if (result.warnings.length > 0) {
    console.error(`Предупреждение: ${result.unreachable ?? 'хранилище недоступно'}. Номера задач не проверены:`);
    for (const line of result.warnings) console.error(`- ${line}`);
    console.error('Проверку повторит CI командой conventions commits --strict.');
  }
  if (result.found.length === 0) {
    console.log(range === null ? 'Все коммиты называют задачу.' : `Все коммиты диапазона ${range} называют задачу.`);
    return;
  }
  console.error('Коммиты без заведённой задачи:');
  for (const commit of result.found) {
    if (commit.standing === 'задача не заведена') {
      console.error(`- ${commit.sha.slice(0, 8)}: называет ${commit.named}, а задачи нет в хранилище: «${commit.subject}»`);
    } else if (commit.standing === 'номер не проверен') {
      console.error(`- ${commit.sha.slice(0, 8)}: называет ${commit.named}, а хранилище недоступно (${result.unreachable}): «${commit.subject}»`);
    } else console.error(`- ${commit.sha.slice(0, 8)}: не называет задачу: «${commit.subject}»`);
  }
  console.error('Пока коммит не отправлен, сообщение правится: git commit --amend либо интерактивное перебазирование.');
  console.error('После отправки правка сообщения переписала бы общую историю: такой коммит учитывается');
  console.error('в открытом выпуске командой release account <хеш> --reason "<причина>" (REQ-RELEASE-041).');
  process.exitCode = 1;
}

// REQ-STORE-021, REQ-STORE-022
async function moveCommand(root, { values, withOperations, exportOnly }) {
  const config = await readConfig(root);
  if (exportOnly) {
    const exported = await exportProject(root, config);
    const out = values.get('--out');
    if (out === undefined) console.log(JSON.stringify(exported, null, 2));
    else {
      await writeFile(path.resolve(root, out), `${JSON.stringify(exported, null, 2)}\n`);
      console.log(`Выгрузка записана в ${out}: задач ${exported.tickets.length}, выпусков ${exported.releases.length}, записей учёта ${exported.obligations.length}.`);
    }
    return;
  }
  const declared = {
    kind: 'external', url: values.get('--url'), idPattern: values.get('--id-pattern'),
    ...(values.has('--read-key-env') ? { readKeyEnv: values.get('--read-key-env') } : {}),
    ...(values.has('--write-key-env') ? { writeKeyEnv: values.get('--write-key-env') } : {}),
  };
  const described = storeDeclaration({ store: declared });
  if (described.store === null) {
    console.error('Переход не выполнен:');
    for (const problem of described.problems) console.error(`- ${problem}`);
    console.error('conventions store --move --url <адрес> --id-pattern <шаблон номера> --read-key-env <ПЕРЕМЕННАЯ> --write-key-env <ПЕРЕМЕННАЯ>');
    process.exitCode = 2;
    return;
  }
  try {
    const result = await moveToStore(root, { config, declared, client: storeClient(described.store), withOperations });
    if (!result.moved) {
      console.error('Переход не выполнен:');
      for (const problem of result.problems) console.error(`- ${problem}`);
      process.exitCode = 1;
      return;
    }
    for (const note of result.notes) console.log(`Замечание: ${note}`);
    console.log(`Хранилище приняло задач ${result.tickets}, выпусков ${result.releases}; ссылок заменено ${result.links} в файлах: ${result.touched.join(', ') || 'нет'}.`);
    console.log('Каталоги docs/tickets и docs/releases и файл .conventions/obligations.json убраны, store записан в .conventions.json.');
    if (result.documentation.length > 0) {
      console.error(`Проверка документации после перехода называет (${result.documentation.length}):`);
      for (const error of result.documentation) console.error(`- ${error}`);
      process.exitCode = 1;
    }
    console.log('Зафиксируйте переход одним коммитом и добавьте в CI команду conventions commits --strict.');
  } catch (failure) {
    reportFailure(failure, 'Переход не выполнен, файлы не тронуты:');
  }
}

// REQ-STORE-017
export async function storeCommand(root, store, { check, withOperations, move = false, exportOnly = false, values = new Map(), read = {} }) {
  if (move || exportOnly) {
    await moveCommand(root, { values, withOperations, exportOnly });
    return;
  }
  // REQ-STORE-023
  const reading = ['--lookup', '--working', '--open'].filter((name) => read[name] !== undefined && read[name] !== false);
  if (store === null) {
    console.log('Проект ведёт задачи и выпуски в файлах: внешнее хранилище не объявлено (store в .conventions.json).');
    if (reading.length > 0) process.exitCode = 1;
    return;
  }
  if (reading.length > 1 || (read['--body'] === true && reading[0] !== '--lookup')) {
    console.error(reading.length > 1 ? `Чтение одно за вызов: названы ${reading.join(', ')}` : 'Ключ --body действует только с --lookup: тело задачи отдаёт поиск по номерам');
    process.exitCode = 2;
    return;
  }
  if (reading.length === 1) {
    try {
      const client = storeClient(store);
      let answer;
      if (reading[0] === '--working') answer = await client.working();
      else if (reading[0] === '--open') answer = await client.openRelease();
      else answer = await client.lookup(read['--lookup'].split(',').map((id) => id.trim()).filter(Boolean), { withBody: read['--body'] === true });
      console.log(JSON.stringify(answer, null, 2));
    } catch (failure) {
      reportFailure(failure, `Хранилище ${store.url} не прочитано:`);
    }
    return;
  }
  if (!check) {
    console.log(`Хранилище задач и выпусков: ${store.url}, номер задачи — ${store.idPattern}.`);
    return;
  }
  try {
    const result = await checkStore({ client: storeClient(store), config: await readConfig(root), withOperations });
    for (const note of result.notes) console.log(`Замечание: ${note}`);
    if (result.problems.length > 0) {
      console.error(`Хранилище ${store.url} контракт ядра не исполняет (${result.problems.length}):`);
      for (const problem of result.problems) console.error(`- ${problem}`);
      process.exitCode = 1;
      return;
    }
    console.log(`Хранилище ${store.url} исполняет контракт ядра: чтения проверены${result.operations ? ', операции и отказы проверены' : ''}.`);
    if (!result.operations) console.log('Операции и отказы проверяет ключ --operations: между выпусками он открывает и отменяет пробный выпуск.');
  } catch (failure) {
    reportFailure(failure, `Хранилище ${store.url} не проверено:`);
  }
}

// REQ-STORE-012
export async function externalObligationState(store) {
  return accountState(await storeClient(store).openRelease());
}
