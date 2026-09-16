import assert from 'node:assert/strict';
import test from 'node:test';
import { COUNT, SET, compare, counts, grewOver, sizeOf } from '../lib/baseline.mjs';

const found = (file, ...texts) => new Map([[file, texts.map((text, index) => ({ line: index + 1, text }))]]);

// REQ-QUALITY-007
test('единица счёта роняет проверку, когда находок стало больше', () => {
  const { exceeded, improved } = compare(found('a.java', 'одна', 'две'), { 'a.java': 1 });

  assert.equal(exceeded.length, 1);
  assert.equal(exceeded[0].actual, 2);
  assert.equal(exceeded[0].allowed, 1);
  assert.deepEqual(improved, []);
});

// REQ-QUALITY-007
test('единица множества не роняет проверку, когда находки переместились, а послабления те же', () => {
  const seeded = { 'модуль': ['пакет.один', 'пакет.два'] };

  const { exceeded, improved } = compare(found('модуль', 'пакет.два', 'пакет.один'), seeded, SET);

  assert.deepEqual(exceeded, [], 'порядок и число находок внутри разобранной части ограничителя не касаются');
  assert.deepEqual(improved, []);
});

// REQ-QUALITY-007
test('единица множества роняет проверку на новом послаблении', () => {
  const seeded = { 'модуль': ['пакет.один'] };

  const { exceeded } = compare(found('модуль', 'пакет.один', 'пакет.новый'), seeded, SET);

  assert.equal(exceeded.length, 1);
  assert.deepEqual(exceeded[0].items.map((item) => item.text), ['пакет.новый'],
    'названо ровно то послабление, которого не было');
});

// REQ-QUALITY-007
test('единица множества видит улучшение, когда послабление снято', () => {
  const seeded = { 'модуль': ['пакет.один', 'пакет.два'] };

  const { exceeded, improved } = compare(found('модуль', 'пакет.один'), seeded, SET);

  assert.deepEqual(exceeded, []);
  assert.equal(improved.length, 1);
  assert.equal(improved[0].allowed, 2);
  assert.equal(improved[0].actual, 1);
});

// REQ-QUALITY-007
test('счёт находок не может выразить снятия послабления, поэтому единица и понадобилась', () => {
  const marked = found('модуль', 'пакет.один', 'пакет.два');
  const afterWork = found('модуль', 'пакет.один', 'пакет.два');

  const byCount = compare(afterWork, counts(marked, COUNT), COUNT);
  const bySet = compare(found('модуль', 'пакет.один'), counts(marked, SET), SET);

  assert.deepEqual(byCount.improved, [], 'счёт стоит на месте: работа не видна');
  assert.equal(bySet.improved.length, 1, 'множество убыло: работа видна');
});

// REQ-QUALITY-007
test('засев записывает единицу, объявленную разбором', () => {
  const violations = found('модуль', 'пакет.два', 'пакет.один', 'пакет.два');

  assert.deepEqual(counts(violations, COUNT), { 'модуль': 3 });
  assert.deepEqual(counts(violations, SET), { 'модуль': ['пакет.два', 'пакет.один'] },
    'множество без повторов и в устойчивом порядке');
  assert.deepEqual(counts(violations), { 'модуль': 3 }, 'по умолчанию — счёт');
});

// REQ-QUALITY-007
test('подъём ограничителя различает рост счёта и новое послабление', () => {
  assert.equal(grewOver(3, 2), true);
  assert.equal(grewOver(2, 2), false);
  assert.deepEqual(grewOver(['a', 'b'], ['a']), ['b']);
  assert.deepEqual(grewOver(['a'], ['a', 'b']), []);
  assert.deepEqual(grewOver(['a'], undefined), ['a'], 'разбор без засева объявляет все свои послабления');
  assert.equal(sizeOf(['a', 'b']), 2);
  assert.equal(sizeOf(4), 4);
  assert.equal(sizeOf(undefined), 0);
});
