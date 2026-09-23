import { readConfig } from '../config.mjs';
import { feedbackChannel, feedbackLine } from '../feedback.mjs';
import { systemNow } from '../now.mjs';
import { updateTicketIndexes } from '../docs/tickets-index.mjs';
import { refreshCompositionLinks, updateReleaseIndex } from '../docs/releases-index.mjs';
import {
  accountCommit, adoptCycle, cancelRelease, closeRelease, closability, dropFromComposition,
  finishability, finishRelease, openNext, recloseRelease, satisfyObligation,
} from '../release/cycle.mjs';
import { declaredObligations, obligationState, readState, writeState } from '../release/obligations.mjs';
import { tagCommit } from '../release/git.mjs';

// REQ-CODE-DESIGN-009
export function releaseScheme(config) {
  return config.release?.scheme ?? 'date';
}

// REQ-ADOPTION-019
async function nameTheDoor(root) {
  const line = feedbackLine(await feedbackChannel(root));
  if (line !== null) console.error(line);
}

// REQ-RELEASE-010, REQ-RELEASE-034, REQ-RELEASE-038
export async function releaseStatus(root) {
  try {
    await reportReleaseStatus(root);
  } catch (failure) {
    console.error(`Состояние выпуска прочитать не удалось: ${failure.message}`);
    process.exitCode = 1;
  }
}

async function reportReleaseStatus(root) {
  const config = await readConfig(root);
  const scheme = releaseScheme(config);
  const state = await closability(root, { scheme });
  if (state.release === null) {
    console.log('Открытого выпуска нет: работа идёт по задачам, коммиты ложатся в main.');
    console.log('Выпуск открывается командой release open --tickets A,B.');
    return;
  }
  const id = state.release.metadata.get('id');
  console.log(`Открытый выпуск: ${id}, тег при закрытии: ${state.tag}`);
  console.log(`Задач в составе: ${state.composition.length}`);
  const tagged = await tagCommit(root, state.tag);
  if (tagged !== null) {
    const ready = await finishability(root, { scheme });
    console.log(`Первый шаг закрытия выполнен: тег ${state.tag} на коммите ${tagged.slice(0, 8)}.`);
    if (ready.problems.length === 0) {
      console.log('Недостаёт завершающего шага: release finish --note "<чем выполнен>".');
      return;
    }
    console.log('Завершить выпуск нельзя:');
    for (const problem of ready.problems) console.log(`- ${problem}`);
    return;
  }
  if (state.problems.length === 0) {
    console.log('Первый шаг закрытия можно выполнять: release close.');
    return;
  }
  console.log('Выпуск закрыть нельзя:');
  for (const problem of state.problems) console.log(`- ${problem}`);
}

// REQ-RELEASE-030
function missingReleaseNumber(scheme, version) {
  if (scheme !== 'semver' || version) return false;
  console.error('Схема semver: номер выпуска задаётся ключом --version X.Y.Z');
  process.exitCode = 2;
  return true;
}

// REQ-RELEASE-001
export async function releaseClose(root) {
  const config = await readConfig(root);
  const scheme = releaseScheme(config);
  const result = await closeRelease(root, { scheme });
  if (!result.closed) {
    console.error('Выпуск закрыть нельзя:');
    for (const problem of result.problems) console.error(`- ${problem}`);
    // REQ-ADOPTION-019
    await nameTheDoor(root);
    process.exitCode = 1;
    return;
  }
  console.log(`Первый шаг закрытия ${result.id} выполнен: коммит ${result.commit.slice(0, 8)}, задач в составе ${result.composition.length}.`);
  console.log(`Тег выпуска: ${result.tag}`);
  console.log('Выпуск ещё не закрыт: отметьте завершающий шаг командой release finish --note "<чем выполнен>".');
}

// REQ-RELEASE-034
export async function releaseFinish(root, note) {
  const config = await readConfig(root);
  const result = await finishRelease(root, { scheme: releaseScheme(config), today: systemNow(), note });
  if (!result.finished) {
    console.error('Выпуск не завершён:');
    for (const problem of result.problems) console.error(`- ${problem}`);
    process.exitCode = 1;
    return;
  }
  console.log(`Выпуск ${result.id} закрыт: тег ${result.tag}, коммит ${result.commit.slice(0, 8)}.`);
  console.log(`Завершающий шаг: ${result.note}`);
}

// REQ-RELEASE-007
export function ticketList(value) {
  return (value ?? '').split(',').map((name) => name.trim()).filter((name) => name.length > 0);
}

export async function releaseOpen(root, version, names) {
  const config = await readConfig(root);
  const scheme = releaseScheme(config);
  // REQ-RELEASE-030
  if (missingReleaseNumber(scheme, version)) return;
  const result = await openNext(root, { scheme, version, today: systemNow(), tickets: names });
  if (!result.opened) {
    console.error('Выпуск не открыт:');
    for (const problem of result.problems) console.error(`- ${problem}`);
    process.exitCode = 1;
    return;
  }
  console.log(`Открыт выпуск ${result.id}, тег при закрытии: ${result.tag}.`);
  for (const ticket of result.named ?? []) console.log(`- в состав указана задача ${ticket}`);
  for (const ticket of result.created) console.log(`- обязательство материализовано задачей ${ticket}`);
  // REQ-RELEASE-019
  for (const entry of result.unclaimed ?? []) {
    console.log(`- задача ${entry.ticket} названа как работа по обязательству ${entry.obligation}, но его не объявляет:`
      + ` добавьте поле obligation: ${entry.obligation} либо закройте командой release satisfy`);
  }
}

// REQ-RELEASE-033
export async function releaseDrop(root, name, reason) {
  if (!name) {
    console.error('conventions release drop <TICKET-ID> --reason "<причина>"');
    process.exitCode = 2;
    return;
  }
  const result = await dropFromComposition(root, { ticketId: name, reason });
  if (!result.dropped) {
    for (const problem of result.problems) console.error(`- ${problem}`);
    process.exitCode = 1;
    return;
  }
  console.log(`Задача ${result.ticket} снята из состава ${result.id}; причина записана в границы выпуска.`);
}

// REQ-RELEASE-046
export async function releaseReclose(root, reason) {
  const config = await readConfig(root);
  const result = await recloseRelease(root, { scheme: releaseScheme(config), reason });
  if (!result.reclosed) {
    console.error('Тег не перенесён:');
    for (const problem of result.problems) console.error(`- ${problem}`);
    process.exitCode = 1;
    return;
  }
  console.log(`Тег ${result.tag} перенесён: ${result.from.slice(0, 8)} → ${result.to.slice(0, 8)}.`);
  console.log('Выпуск ещё не закрыт: отметьте завершающий шаг командой release finish --note "<чем выполнен>".');
  console.log('Если тег уже был отправлен — отправьте его заново с замещением: выпуск ещё никуда не вышел.');
}

// REQ-RELEASE-029
export async function releaseCancel(root, reason) {
  const result = await cancelRelease(root, { reason });
  if (!result.cancelled) {
    console.error('Выпуск не отменён:');
    for (const problem of result.problems) console.error(`- ${problem}`);
    process.exitCode = 1;
    return;
  }
  console.log(`Выпуск ${result.id} отменён; следующий откройте явным номером: release open --version X.Y.Z.`);
  // REQ-RELEASE-044
  for (const ticket of result.released) console.log(`- задача ${ticket} вновь без выпуска: следующий выпуск подберёт её сам`);
}

export async function releaseAdopt(root, version) {
  const config = await readConfig(root);
  const scheme = releaseScheme(config);
  // REQ-RELEASE-030
  if (missingReleaseNumber(scheme, version)) return;
  const result = await adoptCycle(root, { scheme, version, today: systemNow() });
  if (!result.adopted) {
    console.error('Цикл выпусков не принят:');
    for (const problem of result.problems) console.error(`- ${problem}`);
    process.exitCode = 1;
    return;
  }
  console.log(`Закрытых задач помечено как выпущенные до цикла: ${result.stamped.length}`);
  console.log(`Открыт первый выпуск ${result.id}, тег при закрытии: ${result.tag}.`);
  for (const ticket of result.created) console.log(`- обязательство материализовано задачей ${ticket}`);
}

// REQ-RELEASE-043
export async function summariesAfterTheCycle(root) {
  const problems = [
    ...await updateTicketIndexes(root, { check: false }),
    ...await refreshCompositionLinks(root, { check: false }),
    ...await updateReleaseIndex(root, { check: false }),
  ];
  for (const problem of problems) console.error(`- ${problem}`);
  if (problems.length > 0) {
    process.exitCode = 1;
    return;
  }
  console.log('Сводки задач и выпусков собраны.');
}

export async function releaseSatisfy(root, id, ticketId) {
  if (!id || !ticketId) {
    console.error('conventions release satisfy <обязательство> --ticket <TICKET-ID>');
    process.exitCode = 2;
    return;
  }
  const result = await satisfyObligation(root, { obligationId: id, ticketId });
  if (!result.satisfied) {
    for (const problem of result.problems) console.error(`- ${problem}`);
    process.exitCode = 1;
    return;
  }
  console.log(`Обязательство ${id} закрыто задачей ${result.evidence}`);
  for (const removed of result.removed) console.log(`- задача-заготовка ${removed} удалена: работа уже выполнена`);
}

export async function releaseDefer(root, id, reason) {
  if (!id || !reason) {
    console.error('conventions release defer <обязательство> --reason "<причина>"');
    process.exitCode = 2;
    return;
  }
  const declared = await declaredObligations(root);
  const obligation = declared.find((item) => item.id === id);
  if (obligation === undefined) {
    console.error(`Ядро не объявляет обязательства ${id}`);
    process.exitCode = 1;
    return;
  }
  const state = await readState(root);
  const current = obligationState(obligation, state);
  if (current.status === 'overdue') {
    console.error(`Обязательство ${id} просрочено: перенос невозможен, срок истёк`);
    process.exitCode = 1;
    return;
  }
  state.deferred ??= {};
  state.deferred[id] = { reason, recordedAt: systemNow().toISOString().slice(0, 10) };
  await writeState(root, state);
  console.log(`Обязательство ${id} перенесено: ${reason}`);
}




// REQ-RELEASE-041
export async function releaseAccount(root, sha, reason) {
  const result = await accountCommit(root, { sha, reason });
  if (!result.accounted) {
    for (const problem of result.problems) console.error(`- ${problem}`);
    process.exitCode = 1;
    return;
  }
  console.log(`Коммит ${result.sha} учтён в выпуске ${result.release}: закрытие он больше не держит`);
}
