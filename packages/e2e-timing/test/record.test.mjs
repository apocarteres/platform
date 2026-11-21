import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { HISTORY, appendHistory, buildRecord, deployFor, label, parsePhases, standName, summary } from '../lib/record.mjs';

const meta = { repository: 'o/r', commit: 'c1', branch: 'main', runner: 'Worker-3', machine: 'bad\nlabel', stand: 'qa1', workers: 3 };
const part = (started, duration, status, tests) => ({ started, duration, status, tests });
const t = (title, duration, steps = []) => ({ file: 'a.spec.ts', title, project: 'p', duration, retries: 0, status: 'passed', steps });

test('запись формата 1: поля, метки, начало, сумма, итог', () => {
  const rec = buildRecord([
    part('2026-11-21T03:00:05.000Z', 1000, 'passed', [t('x', 600, [{ title: 's', duration: 50 }])]),
    part('2026-11-21T03:00:01.000Z', 2000, 'failed', [t('y', 900)]),
  ], meta);
  assert.deepEqual(Object.keys(rec), ['format', 'repository', 'commit', 'branch', 'runner', 'machine', 'stand',
    'workers', 'started', 'duration', 'status', 'tests', 'steps', 'deploy']);
  assert.equal(rec.format, 1);
  assert.equal(rec.runner, 'Worker-3');
  assert.equal(rec.machine, '');
  assert.equal(rec.started, '2026-11-21T03:00:01.000Z');
  assert.equal(rec.duration, 3000);
  assert.equal(rec.status, 'failed');
  assert.deepEqual(rec.steps, [{ test: 'a.spec.ts › x', title: 's', duration: 50 }]);
  assert.equal('steps' in rec.tests[0], false);
  assert.equal(rec.deploy, null);
});

test('частей нет — записи нет', () => {
  assert.equal(buildRecord([], meta), null);
});

test('фазы подъёма стека — выкатка без задач', () => {
  const phases = parsePhases('сборка\t12.5\nстек docker\t30\nмусор\nбез\tчисла\n');
  const rec = buildRecord([part('2026-11-21T03:00:00.000Z', 1, 'passed', [])], meta, { phases, phasesStarted: '2026-11-21T02:59:00Z' });
  assert.deepEqual(rec.deploy, { started: '2026-11-21T02:59:00Z', duration: 42.5, status: 'passed', phases, tasks: [] });
});

test('выкатка из файла — только того же коммита', () => {
  const dep = { commit: 'c1', stand: 'qa1', started: 's', duration: 9, status: 'passed', phases: [], tasks: [{ name: 'x' }] };
  assert.deepEqual(deployFor(dep, 'c1'), { started: 's', duration: 9, status: 'passed', phases: [], tasks: [{ name: 'x' }] });
  assert.equal(deployFor(dep, 'c2'), null);
  assert.equal(deployFor({}, ''), null);
});

test('имя стенда и метки проверяются', () => {
  assert.equal(standName('qa-kvm'), 'qa-kvm');
  assert.throws(() => standName('../x'));
  assert.equal(label(' cy1 '), 'cy1');
  assert.equal(label('x'.repeat(65)), '');
});

test('история: прошлая запись, битая строка пропускается, хранятся последние HISTORY', () => {
  const dir = join(mkdtempSync(join(tmpdir(), 'e2e-timing-')), 'qa1');
  assert.equal(appendHistory(dir, '{"n":0}'), null);
  writeFileSync(join(dir, 'e2e-timing.jsonl'), '{"n":0}\nне json\n');
  assert.deepEqual(appendHistory(dir, '{"n":1}'), { n: 0 });
  for (let i = 2; i < HISTORY + 10; i++) appendHistory(dir, `{"n":${i}}`);
  const lines = readFileSync(join(dir, 'e2e-timing.jsonl'), 'utf8').trim().split('\n');
  assert.equal(lines.length, HISTORY);
  assert.equal(lines.at(-1), `{"n":${HISTORY + 9}}`);
});

test('сводка: отличие от прошлого прогона, долгие тесты и шаги, подготовка стенда', () => {
  const rec = buildRecord([part('s', 12000, 'passed', [t('x', 6000, [{ title: 'вход', duration: 2000 }]), t('y', 1000)])], meta,
    { phases: [{ name: 'сборка', duration: 30 }] });
  const prev = { duration: 10000, tests: [{ project: 'p', file: 'a.spec.ts', title: 'x', duration: 5000 }],
    steps: [{ test: 'a.spec.ts › x', title: 'вход', duration: 2500 }] };
  const text = summary(rec, prev);
  assert.match(text, /прогон: 12\.0 с \(\+2\.0 с, \+20%\), тестов 2, стенд qa1/);
  assert.match(text, /подготовка стенда: 30 с — сборка 30 с/);
  assert.match(text, /6\.0 с \(\+1\.0 с, \+20%\) {2}a\.spec\.ts › x \[p\]/);
  assert.match(text, /2\.0 с \(−0\.5 с, −20%\) {2}вход — a\.spec\.ts › x/);
  assert.ok(text.indexOf('› x [p]') < text.indexOf('› y [p]'));
  assert.match(summary(rec, null), /прошлого полного прогона на стенде нет/);
  assert.doesNotMatch(summary(rec, null, { full: false }), /прошлого/);
});
