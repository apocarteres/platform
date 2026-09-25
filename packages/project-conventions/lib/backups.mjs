import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { CONFIG_FILE } from './config.mjs';

// REQ-BACKUPS-001
export const KINDS = ['database', 'files', 'other'];

// REQ-BACKUPS-001
const SET_FIELDS = new Set(['kind', 'every', 'keep', 'store', 'receipt', 'timer']);

// REQ-BACKUPS-001
const SECTION_FIELDS = new Set(['sets', 'restoreEvery', 'restoreRecord']);

// REQ-BACKUPS-003
const SAME_HOST = new Set(['local', 'localhost', 'host', 'same-host', 'disk']);

// REQ-BACKUPS-001
const CREDENTIAL = /pass|secret|token|key|user|login|credential/i;

// REQ-BACKUPS-007
export const RESTORE_EVERY = '90d';

// REQ-BACKUPS-006
export const GRACE = 1.5;

const NAME = /^[a-z][a-z0-9-]*$/;
const DURATION = /^(\d+)([mhd])$/;
const UNIT = { m: 60 * 1000, h: 60 * 60 * 1000, d: 24 * 60 * 60 * 1000 };

// REQ-BACKUPS-001
export function durationOf(value) {
  const found = typeof value === 'string' ? DURATION.exec(value) : null;
  if (found === null || Number(found[1]) === 0) return null;
  return Number(found[1]) * UNIT[found[2]];
}

// REQ-BACKUPS-001, REQ-BACKUPS-003, REQ-BACKUPS-008
function setProblems(name, declared) {
  const problems = [];
  const where = `копия ${name}`;
  if (!NAME.test(name)) problems.push(`имя копии «${name}»: строчные буквы, цифры и дефис`);
  for (const field of Object.keys(declared ?? {})) {
    if (SET_FIELDS.has(field)) continue;
    problems.push(CREDENTIAL.test(field)
      ? `${where}: поле ${field} похоже на учётные данные — они приходят из окружения хоста, а не из репозитория`
      : `${where}: неизвестное поле ${field}; поля — ${[...SET_FIELDS].join(', ')}`);
  }
  if (!KINDS.includes(declared?.kind)) problems.push(`${where}: вид kind — ${KINDS.join(', ')}`);
  const every = durationOf(declared?.every);
  if (every === null) problems.push(`${where}: расписание every — срок вида 24h или 7d`);
  const keep = durationOf(declared?.keep);
  if (keep === null) {
    problems.push(`${where}: срок хранения keep — срок вида 90d; бессрочного хранения нет: в копиях персональные данные`);
  } else if (every !== null && keep < every) {
    problems.push(`${where}: копия хранится меньше, чем снимается следующая, — keep не короче every`);
  }
  if (typeof declared?.store !== 'string' || declared.store.trim().length === 0) {
    problems.push(`${where}: внешнее хранилище store не названо`);
  } else if (SAME_HOST.has(declared.store.trim().toLowerCase())) {
    problems.push(`${where}: хранилище «${declared.store}» — тот же хост; копия уходит во внешнее хранилище`);
  }
  if (typeof declared?.receipt !== 'string' || !path.isAbsolute(declared.receipt)) {
    problems.push(`${where}: квитанция receipt — абсолютный путь на хосте`);
  }
  if (declared?.timer !== undefined && (typeof declared.timer !== 'string' || declared.timer.trim().length === 0)) {
    problems.push(`${where}: таймер timer называет юнит, а не пустое значение`);
  }
  return problems;
}

// REQ-BACKUPS-001, REQ-BACKUPS-007
export function backups(config) {
  const declared = config.backups ?? null;
  if (declared === null) return { declared: false, sets: [], problems: [] };
  const problems = [];
  for (const field of Object.keys(declared)) {
    if (!SECTION_FIELDS.has(field)) problems.push(`раздел backups: неизвестное поле ${field}`);
  }
  const entries = Object.entries(declared.sets ?? {});
  if (entries.length === 0) problems.push('раздел backups: копии не объявлены — перечислите их в sets');
  for (const [name, one] of entries) problems.push(...setProblems(name, one));
  const restoreEvery = durationOf(declared.restoreEvery ?? RESTORE_EVERY);
  if (restoreEvery === null) problems.push('раздел backups: restoreEvery — срок вида 90d');
  if (typeof declared.restoreRecord !== 'string' || !path.isAbsolute(declared.restoreRecord)) {
    problems.push('раздел backups: restoreRecord — абсолютный путь на хосте, где записана проверка восстановления');
  }
  return {
    declared: true,
    sets: entries.map(([name, one]) => ({
      name,
      kind: one?.kind,
      every: durationOf(one?.every),
      keep: durationOf(one?.keep),
      store: one?.store,
      receipt: one?.receipt,
      timer: one?.timer ?? null,
    })),
    restoreEvery,
    restoreRecord: declared.restoreRecord,
    problems,
  };
}

async function lineOfTheSection(root) {
  try {
    const lines = (await readFile(path.join(root, CONFIG_FILE), 'utf8')).split('\n');
    const found = lines.findIndex((line) => line.includes('"backups"'));
    return found === -1 ? 1 : found + 1;
  } catch {
    return 1;
  }
}

// REQ-BACKUPS-001
export async function findBackupProblems(root, config) {
  const { declared, problems } = backups(config);
  if (!declared || problems.length === 0) return new Map();
  const line = await lineOfTheSection(root);
  return new Map([[CONFIG_FILE, problems.map((text) => ({ line, text }))]]);
}

async function readJson(file) {
  try {
    return { value: JSON.parse(await readFile(file, 'utf8')) };
  } catch (failure) {
    return { missing: failure.code === 'ENOENT', broken: failure.code !== 'ENOENT' };
  }
}

async function digestOf(file) {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(file)) hash.update(chunk);
  return hash.digest('hex');
}

// REQ-BACKUPS-004
export async function writeReceipt(section, name, file, now) {
  const set = section.sets.find((one) => one.name === name);
  if (set === undefined) return { written: false, problem: `копия ${name} не объявлена в разделе backups` };
  let size;
  try {
    size = (await stat(file)).size;
  } catch {
    return { written: false, problem: `файла копии ${file} нет` };
  }
  if (size === 0) return { written: false, problem: `файл копии ${file} пуст — квитанция на пустую копию не пишется` };
  const receipt = { set: name, at: now.toISOString(), bytes: size, sha256: await digestOf(file), store: set.store };
  await mkdir(path.dirname(set.receipt), { recursive: true });
  await writeFile(set.receipt, `${JSON.stringify(receipt, null, 2)}\n`);
  return { written: true, receipt };
}

// REQ-BACKUPS-007
export async function writeRestored(section, note, now) {
  if (!note || !note.trim()) return { written: false, problem: 'проверка восстановления записывается с тем, чем она выполнена: ключ --note' };
  await mkdir(path.dirname(section.restoreRecord), { recursive: true });
  await writeFile(section.restoreRecord, `${JSON.stringify({ at: now.toISOString(), note: note.trim() }, null, 2)}\n`);
  return { written: true };
}

function days(milliseconds) {
  return `${Math.floor(milliseconds / UNIT.d)} сут ${Math.floor((milliseconds % UNIT.d) / UNIT.h)} ч`;
}

// REQ-BACKUPS-005, REQ-BACKUPS-006, REQ-BACKUPS-007
export async function checkBackups(section, { now, enabled }) {
  const problems = [];
  for (const set of section.sets) {
    const read = await readJson(set.receipt);
    if (read.missing) {
      problems.push(`копия ${set.name} не снималась: квитанции ${set.receipt} нет`);
    } else if (read.broken) {
      problems.push(`копия ${set.name}: квитанция ${set.receipt} не читается`);
    } else {
      const receipt = read.value;
      const at = Date.parse(receipt?.at);
      if (Number.isNaN(at)) {
        problems.push(`копия ${set.name}: в квитанции нет момента снятия`);
      } else if (now.getTime() - at > set.every * GRACE) {
        problems.push(`копия ${set.name} просрочена: последняя снята ${receipt.at}, ${days(now.getTime() - at)} назад при расписании ${days(set.every)}`);
      }
      if (!(receipt?.bytes > 0)) problems.push(`копия ${set.name} пуста`);
      if (receipt?.store !== set.store) {
        problems.push(`копия ${set.name} ушла в «${receipt?.store}», а объявлено хранилище «${set.store}»`);
      }
    }
    // REQ-BACKUPS-005
    if (set.timer !== null && !(await enabled(set.timer))) {
      problems.push(`копия ${set.name}: таймер ${set.timer} не включён — задание лежит на хосте, но не работает`);
    }
  }
  const restored = await readJson(section.restoreRecord);
  if (restored.missing) {
    problems.push(`восстановление из копии не проверялось: записи ${section.restoreRecord} нет`);
  } else if (restored.broken || Number.isNaN(Date.parse(restored.value?.at))) {
    problems.push(`запись проверки восстановления ${section.restoreRecord} не читается`);
  } else if (now.getTime() - Date.parse(restored.value.at) > section.restoreEvery) {
    problems.push(`восстановление проверялось ${restored.value.at} — дольше ${days(section.restoreEvery)} назад`);
  }
  return problems;
}
