import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { collect, parseArgs, repositoryOf } from '../lib/cli.mjs';

const meta = () => ({ repository: 'o/r', commit: 'c1', branch: 'main' });

function setup() {
  const dir = mkdtempSync(join(tmpdir(), 'e2e-timing-'));
  const partFile = join(dir, 'part.json');
  writeFileSync(partFile, JSON.stringify({ started: '2026-11-21T03:00:00.000Z', duration: 1000, status: 'passed',
    tests: [{ file: 'a.spec.ts', title: 'x', project: 'p', duration: 1000, retries: 0, status: 'passed', steps: [] }] }));
  return { dir, partFile };
}

function run(argv, extra = {}) {
  const logs = [];
  const errors = [];
  const sent = [];
  const send = async (line) => { sent.push(line); return 'sent'; };
  return collect(argv, { log: (m) => logs.push(m), error: (m) => errors.push(m), env: {}, send, meta, ...extra })
    .then((code) => ({ code, logs, errors, sent }));
}

test('аргументы: обязательные и неизвестные', () => {
  assert.throws(() => parseArgs(['run']), /использование/);
  assert.throws(() => parseArgs(['collect', '--root', '.', '--stand', 's', '--out', 'o', '--history-dir', 'h']), /использование/);
  assert.throws(() => parseArgs(['collect', '--bogus']), /неизвестный аргумент/);
  assert.throws(() => parseArgs(['collect', '--root', '.', '--stand', 's', '--out', 'o', '--history-dir', 'h', '--workers', 'x', 'p']), /--workers/);
  const a = parseArgs(['collect', '--root', '.', '--stand', 's', '--out', 'o', '--history-dir', 'h', '--workers', '4', '--full', 'p1', 'p2']);
  assert.deepEqual([a.workers, a.full, a.parts, a.historyDir], [4, true, ['p1', 'p2'], 'h']);
});

test('ошибка аргументов — код 2', async () => {
  const r = await run(['collect']);
  assert.equal(r.code, 2);
});

test('полный прогон: запись, история стенда, отправка', async () => {
  const { dir, partFile } = setup();
  const out = join(dir, 'out', 'e2e-timing.json');
  const r = await run(['collect', '--root', dir, '--stand', 'qa1', '--out', out, '--history-dir', join(dir, 'h'), '--workers', '2', '--full', partFile]);
  assert.equal(r.code, 0);
  const rec = JSON.parse(readFileSync(out, 'utf8'));
  assert.deepEqual([rec.repository, rec.commit, rec.stand, rec.workers], ['o/r', 'c1', 'qa1', 2]);
  assert.ok(existsSync(join(dir, 'h', 'qa1', 'e2e-timing.jsonl')));
  assert.equal(r.sent.length, 1);
  assert.equal(r.logs.at(-1), 'sent');
});

test('неполный прогон: без истории и отправки; выкатка другого коммита не берётся', async () => {
  const { dir, partFile } = setup();
  const dep = join(dir, 'deploy.json');
  writeFileSync(dep, JSON.stringify({ commit: 'другой', duration: 5, phases: [], tasks: [] }));
  const out = join(dir, 'o.json');
  const r = await run(['collect', '--root', dir, '--stand', 'qa1', '--out', out, '--history-dir', join(dir, 'h'), '--deploy', dep, partFile]);
  assert.equal(r.code, 0);
  assert.equal(JSON.parse(readFileSync(out, 'utf8')).deploy, null);
  assert.equal(existsSync(join(dir, 'h')), false);
  assert.equal(r.sent.length, 0);
});

test('частей нет и сбой записи — код 0 с сообщением', async () => {
  const { dir, partFile } = setup();
  const none = await run(['collect', '--root', dir, '--stand', 'qa1', '--out', join(dir, 'o'), '--history-dir', dir, join(dir, 'нет.json')]);
  assert.equal(none.code, 0);
  assert.match(none.logs[0], /частей прогона нет/);
  const bad = await run(['collect', '--root', dir, '--stand', '../x', '--out', join(dir, 'o'), '--history-dir', dir, partFile]);
  assert.equal(bad.code, 0);
  assert.match(bad.errors[0], /запись не сделана/);
});

test('репозиторий — из адреса origin, иначе имя каталога', () => {
  assert.equal(repositoryOf('git@github.com:Org/repo.git', '/x'), 'Org/repo');
  assert.equal(repositoryOf('https://github.com/Org/repo', '/x'), 'Org/repo');
  assert.equal(repositoryOf('', '/work/tracker'), 'tracker');
});
