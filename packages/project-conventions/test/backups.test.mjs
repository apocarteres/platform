import assert from 'node:assert/strict';
import test from 'node:test';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { backups, checkBackups, findBackupProblems, writeReceipt, writeRestored } from '../lib/backups.mjs';
import { deployment } from '../lib/components.mjs';

const NOW = new Date('2026-09-25T12:00:00Z');
const HOUR = 60 * 60 * 1000;

function declared(host, extra = {}) {
  return {
    backups: {
      sets: {
        database: { kind: 'database', every: '24h', keep: '90d', store: 'storage-box', receipt: path.join(host, 'database.json'),
          timer: 'shop-db-backup.timer' },
        files: { kind: 'files', every: '24h', keep: '30d', store: 'storage-box', receipt: path.join(host, 'files.json') },
      },
      restoreRecord: path.join(host, 'restored.json'),
      ...extra,
    },
  };
}

async function host() {
  return mkdtemp(path.join(os.tmpdir(), 'backups-'));
}

async function dump(dir, content = 'дамп базы') {
  const file = path.join(dir, 'dump.sql.gz');
  await writeFile(file, content);
  return file;
}

const on = async () => true;

// REQ-BACKUPS-001
test('объявление без раздела молчит, полное объявление принимается', () => {
  assert.deepEqual(backups({}), { declared: false, sets: [], problems: [] });
  const section = backups(declared('/var/lib/shop/backups'));
  assert.deepEqual(section.problems, []);
  assert.equal(section.sets.length, 2);
  assert.equal(section.restoreEvery, 90 * 24 * HOUR, 'проверка восстановления по умолчанию — раз в 90 дней');
});

// REQ-BACKUPS-001, REQ-BACKUPS-003, REQ-BACKUPS-008
test('объявление называет каждый изъян: вид, расписание, бессрочное хранение, тот же хост, квитанция, учётные данные', () => {
  const problems = backups({ backups: { sets: { Base: {
    kind: 'tape', every: 'daily', keep: 'forever', store: 'local', receipt: 'relative.json', password: 'x', extra: 1,
  } }, restoreRecord: 'relative' } }).problems;
  for (const expected of [/имя копии «Base»/, /вид kind/, /расписание every/, /бессрочного хранения нет/, /тот же хост/,
    /абсолютный путь/, /password похоже на учётные данные/, /неизвестное поле extra/, /restoreRecord/]) {
    assert.ok(problems.some((problem) => expected.test(problem)), `${expected}: ${problems.join('; ')}`);
  }
  assert.match(backups({ backups: { restoreRecord: '/r' } }).problems[0], /копии не объявлены/);
  const same = backups({ backups: { sets: { db: { kind: 'database', every: '1d', keep: '7d', store: ' Local ', receipt: '/r.json' } },
    restoreRecord: '/r' } }).problems;
  assert.ok(same.some((problem) => /тот же хост/.test(problem)), 'имя хоста узнаётся без учёта регистра и пробелов');
  const short = backups({ backups: { sets: { db: { kind: 'database', every: '7d', keep: '1d', store: 's', receipt: '/r.json' } },
    restoreRecord: '/r' } }).problems;
  assert.ok(short.some((problem) => /keep не короче every/.test(problem)));
});

// REQ-BACKUPS-001
test('правило называет изъяны объявления на строке раздела, а правильное объявление пропускает', async () => {
  const root = await host();
  try {
    await writeFile(path.join(root, '.conventions.json'), '{\n  "sources": ["."],\n  "backups": {}\n}\n');
    const found = await findBackupProblems(root, { backups: {} });
    assert.equal(found.get('.conventions.json')[0].line, 3);
    assert.equal((await findBackupProblems(root, declared('/var/lib/shop'))).size, 0);
    assert.equal((await findBackupProblems(root, {})).size, 0);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

// REQ-BACKUPS-004
test('квитанция пишется на файл копии: размер, отпечаток, хранилище; пустой и необъявленный — отказ', async () => {
  const dir = await host();
  try {
    const section = backups(declared(dir));
    const written = await writeReceipt(section, 'database', await dump(dir), NOW);
    assert.equal(written.written, true);
    const receipt = JSON.parse(await readFile(path.join(dir, 'database.json'), 'utf8'));
    assert.equal(receipt.at, NOW.toISOString());
    assert.equal(receipt.bytes, Buffer.byteLength('дамп базы'));
    assert.match(receipt.sha256, /^[0-9a-f]{64}$/);
    assert.equal(receipt.store, 'storage-box');
    assert.match((await writeReceipt(section, 'database', await dump(dir, ''), NOW)).problem, /пуст/);
    assert.match((await writeReceipt(section, 'logs', await dump(dir), NOW)).problem, /не объявлена/);
    assert.match((await writeReceipt(section, 'database', path.join(dir, 'нет.gz'), NOW)).problem, /нет/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

// REQ-BACKUPS-006, REQ-BACKUPS-007
test('сверка проходит со свежими квитанциями и проверенным восстановлением', async () => {
  const dir = await host();
  try {
    const section = backups(declared(dir));
    await writeReceipt(section, 'database', await dump(dir), new Date(NOW.getTime() - 20 * HOUR));
    await writeReceipt(section, 'files', await dump(dir), new Date(NOW.getTime() - 30 * HOUR));
    await writeRestored(section, 'восстановлено на стенде qa', new Date(NOW.getTime() - 80 * 24 * HOUR));
    assert.deepEqual(await checkBackups(section, { now: NOW, enabled: on }), []);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

// REQ-BACKUPS-006
test('сверка отказывает: копии не было, копия просрочена, пуста, ушла не туда, квитанция не читается', async () => {
  const dir = await host();
  try {
    const section = backups(declared(dir));
    await writeRestored(section, 'стенд', NOW);
    let problems = await checkBackups(section, { now: NOW, enabled: on });
    assert.ok(problems.some((problem) => /database не снималась/.test(problem)));
    await writeReceipt(section, 'database', await dump(dir), new Date(NOW.getTime() - 37 * HOUR));
    await writeFile(path.join(dir, 'files.json'), JSON.stringify({ at: NOW.toISOString(), bytes: 0, store: 'elsewhere' }));
    problems = await checkBackups(section, { now: NOW, enabled: on });
    assert.ok(problems.some((problem) => /database просрочена/.test(problem)), problems.join('; '));
    assert.ok(problems.some((problem) => /files пуста/.test(problem)));
    assert.ok(problems.some((problem) => /ушла в «elsewhere»/.test(problem)));
    await writeFile(path.join(dir, 'files.json'), '{не json');
    problems = await checkBackups(section, { now: NOW, enabled: on });
    assert.ok(problems.some((problem) => /не читается/.test(problem)));
    await writeReceipt(section, 'database', await dump(dir), new Date(NOW.getTime() - 35 * HOUR));
    problems = await checkBackups(section, { now: NOW, enabled: on });
    assert.ok(!problems.some((problem) => /database просрочена/.test(problem)), 'запас — половина расписания');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

// REQ-BACKUPS-005
test('выключенный таймер копии — отказ, даже когда квитанция свежая', async () => {
  const dir = await host();
  try {
    const section = backups(declared(dir));
    await writeReceipt(section, 'database', await dump(dir), NOW);
    await writeReceipt(section, 'files', await dump(dir), NOW);
    await writeRestored(section, 'стенд', NOW);
    const asked = [];
    const problems = await checkBackups(section, { now: NOW, enabled: async (unit) => { asked.push(unit); return false; } });
    assert.deepEqual(asked, ['shop-db-backup.timer'], 'спрашивается только объявленный таймер');
    assert.deepEqual(problems, ['копия database: таймер shop-db-backup.timer не включён — задание лежит на хосте, но не работает']);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

// REQ-BACKUPS-005
test('составляющая объявляет, что развёртывание её включает, и включают только уложенное', () => {
  const base = { environments: ['production'], components: {} };
  const of = (one) => deployment({ deployment: { ...base, components: { timer: { artifact: 'deploy/b.timer', ...one } } } });
  assert.deepEqual(of({ install: '/etc/systemd/system/b.timer', enable: true }).problems, []);
  assert.equal(of({ install: '/etc/systemd/system/b.timer', enable: true }).components[0].enable, true);
  assert.match(of({ enable: true }).problems[0], /место установки нет/);
  assert.match(of({ install: '/x', enable: 'yes' }).problems[0], /да или нет/);
});

// REQ-BACKUPS-007
test('восстановление: не проверялось или проверялось давно — отказ; запись требует пояснения', async () => {
  const dir = await host();
  try {
    const section = backups(declared(dir, { restoreEvery: '30d' }));
    await writeReceipt(section, 'database', await dump(dir), NOW);
    await writeReceipt(section, 'files', await dump(dir), NOW);
    let problems = await checkBackups(section, { now: NOW, enabled: on });
    assert.deepEqual(problems.map((problem) => /не проверялось/.test(problem)), [true]);
    await writeRestored(section, 'стенд', new Date(NOW.getTime() - 31 * 24 * HOUR));
    problems = await checkBackups(section, { now: NOW, enabled: on });
    assert.ok(problems.some((problem) => /дольше 30 сут/.test(problem)), problems.join('; '));
    assert.match((await writeRestored(section, '  ', NOW)).problem, /--note/);
    assert.equal(JSON.parse(await readFile(path.join(dir, 'restored.json'), 'utf8')).note, 'стенд');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

// REQ-BACKUPS-009
test('обязательство backups объявлено на 3 выпуска и ссылается на требование', async () => {
  const catalogue = JSON.parse(await readFile(new URL('../obligations.json', import.meta.url), 'utf8'));
  const found = catalogue.obligations.find((one) => one.id === 'backups');
  assert.equal(found.requirement, 'REQ-BACKUPS-009');
  assert.equal(found.dueReleases, 3);
});

const CLI = fileURLToPath(new URL('../bin/conventions.mjs', import.meta.url));

async function conventions(...args) {
  try {
    const { stdout, stderr } = await promisify(execFile)(process.execPath, [CLI, 'backups', ...args]);
    return { code: 0, out: stdout + stderr };
  } catch (failure) {
    return { code: failure.code, out: `${failure.stdout}${failure.stderr}` };
  }
}

// REQ-BACKUPS-004, REQ-BACKUPS-006, REQ-BACKUPS-007
test('команда: квитанция, запись восстановления и сверка на хосте; одно действие за вызов', async () => {
  const root = await host();
  try {
    const config = declared(root);
    delete config.backups.sets.database.timer;
    await writeFile(path.join(root, '.conventions.json'), JSON.stringify(config));
    const both = await conventions('--check', '--receipt', 'database', '--file', await dump(root), '--root', root);
    assert.equal(both.code, 2, 'два действия за вызов не принимаются');
    const stale = await conventions('--check', '--root', root);
    assert.equal(stale.code, 1);
    assert.match(stale.out, /database не снималась/);
    const file = await dump(root);
    assert.equal((await conventions('--receipt', 'database', '--file', file, '--root', root)).code, 0);
    assert.equal((await conventions('--receipt', 'files', '--file', file, '--root', root)).code, 0);
    assert.equal((await conventions('--restored', '--root', root)).code, 2, 'проверка восстановления без пояснения не записывается');
    assert.equal((await conventions('--restored', '--note', 'стенд qa', '--root', root)).code, 0);
    const fresh = await conventions('--check', '--root', root);
    assert.equal(fresh.code, 0, fresh.out);
    assert.match(fresh.out, /Копии в порядке: database, files/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

