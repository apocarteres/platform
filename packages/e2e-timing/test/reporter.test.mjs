import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import TimingReporter, { collectSteps } from '../lib/reporter.mjs';

function fakeClock(...values) {
  let i = 0;
  return { now: () => values[Math.min(i++, values.length - 1)] };
}

function testCase(id, file = '/repo/e2e/layout/board.spec.ts') {
  return {
    id,
    parent: { project: () => ({ name: 'desktop', testDir: '/repo/e2e' }) },
    location: { file },
    titlePath: () => ['', 'desktop', 'layout/board.spec.ts', 'доска', 'перетаскивание'],
  };
}

const step = (title, duration, steps = [], category = 'test.step') => ({ title, duration, steps, category });

test('шаги — только test.step, вложенные через ›', () => {
  const out = collectSteps([step('вход', 100, [step('форма', 40), step('hook', 5, [], 'hook')]), step('expect', 1, [], 'expect')]);
  assert.deepEqual(out, [{ title: 'вход', duration: 100 }, { title: 'вход › форма', duration: 40 }]);
});

test('повтор складывает время, итог и шаги — последней попытки; файл — от testDir', () => {
  const dir = mkdtempSync(join(tmpdir(), 'e2e-timing-'));
  const file = join(dir, 'sub', 'part.json');
  const r = new TimingReporter({ file, clock: fakeClock(1000, 1000, 5000) });
  r.onBegin();
  r.onTestEnd(testCase('a'), { duration: 300, retry: 0, status: 'failed', steps: [step('первый', 10)] });
  r.onTestEnd(testCase('a'), { duration: 200, retry: 1, status: 'passed', steps: [step('второй', 20)] });
  r.onEnd({ status: 'passed' });
  const part = JSON.parse(readFileSync(file, 'utf8'));
  assert.equal(part.started, '1970-01-01T00:00:01.000Z');
  assert.equal(part.duration, 4000);
  assert.equal(part.status, 'passed');
  assert.deepEqual(part.tests, [{
    file: 'layout/board.spec.ts', title: 'доска › перетаскивание', project: 'desktop',
    duration: 500, retries: 1, status: 'passed', steps: [{ title: 'второй', duration: 20 }],
  }]);
});

test('без файла репортёр ничего не пишет', () => {
  const r = new TimingReporter({ file: '', clock: fakeClock(0) });
  r.onEnd({ status: 'passed' });
  assert.equal(r.printsToStdio(), false);
  assert.equal(existsSync(''), false);
});
