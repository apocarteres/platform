import { randomUUID } from 'node:crypto';
import { StoreRefusal } from './client.mjs';
import { fieldsDigest, ticketFields } from './shape.mjs';

// REQ-STORE-017
const RELEASE_STATUSES = ['draft', 'closing', 'in_progress', 'blocked'];
const TERMINAL = ['cancelled', 'superseded'];
const NO_SUCH = 'CONVENTIONS-STORE-CHECK-0';

// REQ-TICKETS-007
const statuses = new Set(['backlog', 'in_progress', 'blocked', 'done', 'cancelled', 'superseded']);

const isList = (value) => Array.isArray(value);

// REQ-STORE-006
function ticketProblems(ticket) {
  const where = `задача ${ticket?.id ?? '(без id)'}`;
  const problems = [];
  if (typeof ticket?.id !== 'string' || ticket.id === '') problems.push(`${where}: id — непустая строка`);
  if (!statuses.has(ticket?.status)) problems.push(`${where}: status ${JSON.stringify(ticket?.status)} не из словаря ядра (REQ-TICKETS-007)`);
  for (const key of ['aliases', 'dependsOn', 'related']) {
    if (!isList(ticket?.[key])) problems.push(`${where}: ${key} — перечень`);
  }
  if (ticket?.sections === null || typeof ticket?.sections !== 'object') problems.push(`${where}: sections — объект`);
  if (ticket?.fields === null || typeof ticket?.fields !== 'object') problems.push(`${where}: fields — объект`);
  if (typeof ticket?.title !== 'string') problems.push(`${where}: title — строка`);
  return problems;
}

// REQ-STORE-005, REQ-STORE-017
async function reads(client, config) {
  const problems = [];
  const notes = [];
  const open = await client.openRelease();
  const working = await client.working();
  if (!isList(working.tickets) || !isList(working.referenced)) problems.push('рабочий набор: tickets и referenced — перечни');
  if (working.revision === '') problems.push('рабочий набор: revision — непустая строка');
  for (const ticket of [...working.tickets, ...working.referenced]) problems.push(...ticketProblems(ticket));
  for (const ticket of working.tickets) {
    if (TERMINAL.includes(ticket.status)) problems.push(`рабочий набор: задача ${ticket.id} в статусе ${ticket.status} — отменённых и заменённых в наборе нет`);
    if (ticket.status === 'done' && ticket.release !== null && ticket.release !== open.release?.id) {
      problems.push(`рабочий набор: выполненная задача ${ticket.id} отнесена к ${ticket.release}, а этот выпуск не открыт — вышедших задач в наборе нет`);
    }
  }
  const before = client.requests.length;
  await client.working();
  if (client.requests[before]?.status !== 304) problems.push('рабочий набор: повтор с If-None-Match отвечает 304, пока набор не менялся');
  if (working.fieldsDigest !== null && !/^[0-9a-f]{64}$/.test(working.fieldsDigest)) problems.push('рабочий набор: fieldsDigest — SHA-256 в шестнадцатеричной записи либо null');
  const digest = fieldsDigest(ticketFields(config));
  if (working.fieldsDigest !== null && working.fieldsDigest !== digest) {
    notes.push('определения полей проекта в хранилище расходятся с .conventions.json: их опубликует первая команда выпуска с ключом записи');
  }

  const sample = working.tickets[0] ?? null;
  const aliased = working.tickets.find((ticket) => (ticket.aliases ?? []).length > 0) ?? null;
  const asked = [NO_SUCH, ...(sample === null ? [] : [sample.id]), ...(aliased === null ? [] : [aliased.aliases[0]])];
  const found = await client.lookup(asked);
  if (!found.missing.includes(NO_SUCH)) problems.push(`поиск: несуществующий номер ${NO_SUCH} назван в missing`);
  if (sample !== null && !found.tickets.some((ticket) => ticket.id === sample.id)) problems.push(`поиск: задача ${sample.id} находится по номеру`);
  if (aliased !== null && !found.tickets.some((ticket) => ticket.id === aliased.id)) {
    problems.push(`поиск: задача ${aliased.id} находится по псевдониму ${aliased.aliases[0]}`);
  }
  if (sample === null) notes.push('рабочий набор пуст: поиск по номеру и псевдониму проверен только на несуществующем номере');

  if (!Number.isInteger(open.releasedCount) || open.releasedCount < 0) problems.push('открытый выпуск: releasedCount — целое от 0');
  if (!isList(open.obligations)) problems.push('открытый выпуск: obligations — перечень');
  for (const record of isList(open.obligations) ? open.obligations : []) {
    if (typeof record?.id !== 'string') problems.push('открытый выпуск: запись учёта обязательства несёт id');
  }
  if (open.release !== null) {
    if (typeof open.release.id !== 'string' || !/^RELEASE-/.test(open.release.id)) problems.push('открытый выпуск: id вида RELEASE-…');
    if (!RELEASE_STATUSES.includes(open.release.status)) problems.push(`открытый выпуск: status ${JSON.stringify(open.release.status)} — ${RELEASE_STATUSES.join(', ')}`);
    for (const key of ['named', 'dropped', 'accounted', 'actions', 'retagged']) {
      if (!isList(open.release[key])) problems.push(`открытый выпуск: ${key} — перечень`);
    }
  }
  return { problems, notes, open };
}

async function refusal(client, operation, args, code) {
  try {
    await client.operate(operation, args);
  } catch (failure) {
    if (!(failure instanceof StoreRefusal)) throw failure;
    return failure.code === code ? null : `${operation}: ожидался отказ ${code}, получен ${failure.code}`;
  }
  return `${operation}: ожидался отказ ${code}, а операция принята`;
}

// REQ-STORE-007, REQ-STORE-009, REQ-STORE-017
async function operations(client) {
  const problems = [];
  const push = (problem) => {
    if (problem !== null) problems.push(problem);
  };
  const key = `store-check:${randomUUID()}`;
  const first = await client.operate('openRelease', { tickets: [] }, key);
  const id = first.release?.id ?? (await client.openRelease()).release?.id ?? null;
  if (id === null) return ['openRelease: ответ несёт открытый выпуск с id'];
  try {
    const again = await client.operate('openRelease', { tickets: [] }, key);
    if ((again.release?.id ?? id) !== id) problems.push('openRelease: повтор с тем же Idempotency-Key возвращает первый ответ');
    push(await refusal(client, 'openRelease', { tickets: [] }, 'release-already-open'));
    push(await refusal(client, 'dropTicket', { ticket: NO_SUCH, reason: 'проверка контракта' }, 'ticket-missing'));
    push(await refusal(client, 'accountCommit', { sha: '0'.repeat(40), subject: 'проверка контракта', reason: '' }, 'reason-required'));
    await client.operate('freezeRelease', {});
    if ((await client.openRelease()).release?.status !== 'closing') problems.push('freezeRelease: выпуск переходит в closing');
    push(await refusal(client, 'cancelRelease', { reason: 'проверка контракта' }, 'release-closing'));
    await client.operate('unfreezeRelease', { reason: 'Проверка контракта: store --check' });
    if ((await client.openRelease()).release?.status !== 'draft') problems.push('unfreezeRelease: выпуск возвращается в статус до заморозки');
    push(await refusal(client, 'cancelRelease', { reason: '' }, 'reason-required'));
  } finally {
    const current = (await client.openRelease()).release;
    if (current?.status === 'closing') await client.operate('unfreezeRelease', { reason: 'Проверка контракта: store --check' });
    if (current !== null) await client.operate('cancelRelease', { reason: 'Проверка контракта: store --check' });
  }
  if ((await client.openRelease()).release !== null) problems.push('cancelRelease: открытого выпуска после отмены нет');
  const taken = await refusal(client, 'openRelease', { id, tickets: [] }, 'release-id-taken');
  if (taken !== null) {
    problems.push(taken);
    if ((await client.openRelease()).release !== null) await client.operate('cancelRelease', { reason: 'Проверка контракта: store --check' });
  }
  return problems;
}

// REQ-STORE-017
export async function checkStore({ client, config, withOperations = false }) {
  const read = await reads(client, config);
  const result = { problems: read.problems, notes: read.notes, operations: false };
  if (!withOperations) return result;
  if (!client.canWrite()) {
    result.problems.push('проверка операций требует ключа записи: задайте переменную из store.writeKeyEnv');
    return result;
  }
  if (read.open.release !== null) {
    result.problems.push(`проверка операций выполняется между выпусками, а выпуск ${read.open.release.id} открыт`);
    return result;
  }
  result.problems.push(...await operations(client));
  result.operations = true;
  return result;
}
