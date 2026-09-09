import assert from 'node:assert/strict';
import test from 'node:test';
import { codeLines, findClockCalls } from '../lib/clock.mjs';

test('находит обращения к системным часам в java', () => {
  const source = [
    'class A {',
    '  Instant a = Instant.now();',
    '  long b = System.currentTimeMillis();',
    '  Clock c = Clock.systemUTC();',
    '}',
  ].join('\n');
  assert.deepEqual(findClockCalls(source, '.java').map((call) => call.text),
    ['Instant.now', 'System.currentTimeMillis', 'Clock.systemUTC']);
});

test('строки и комментарии обращением не считаются', () => {
  const source = [
    'class A {',
    '  String s = "Instant.now()";',
    '  // Instant.now()',
    '  /* System.currentTimeMillis() */',
    '  String block = """',
    '    Instant.now()',
    '    """;',
    '}',
  ].join('\n');
  assert.deepEqual(findClockCalls(source, '.java'), []);
});

test('в клиентском коде запрещены Date.now и new Date без аргументов', () => {
  const found = findClockCalls('const a = Date.now();\nconst b = new Date(input);\nconst c = new Date();', '.ts');
  assert.deepEqual(found.map((call) => `${call.line}:${call.text}`), ['1:Date.now', '3:new Date()']);
});

test('нумерация строк сохраняется после вырезания комментариев', () => {
  const lines = codeLines('a\n/* два\nтри */\nInstant.now()');
  assert.equal(lines.length, 4);
  assert.match(lines[3], /Instant\.now\(\)/);
});

test('строковый аргумент не превращает new Date в вызов без аргументов', () => {
  const found = findClockCalls("const a = new Date('2026-06-01T00:00:00Z');\nconst b = new Date(`${prefix}Z`);", '.ts');
  assert.deepEqual(found, []);
});

test('обращение к часам внутри строки нарушением не считается', () => {
  const found = findClockCalls('log("Instant.now() запрещён");', '.java');
  assert.deepEqual(found, []);
});

test('монотонный счётчик часами не считается', () => {
  assert.deepEqual(findClockCalls('var elapsed = System.nanoTime() - startedAt;', '.java'), []);
  assert.deepEqual(findClockCalls('const elapsed = performance.now() - startedAt;', '.ts'), []);
  assert.deepEqual(findClockCalls('const started = process.hrtime.bigint();', '.ts'), []);
  assert.equal(findClockCalls('var at = System.currentTimeMillis();', '.java').length, 1, 'настенное время остаётся запрещённым');
  assert.equal(findClockCalls('const at = Date.now();', '.ts').length, 1);
});

test('подстановка в шаблонной строке — это код, а не литерал', () => {
  assert.equal(findClockCalls('const label = `снимок ${new Date().toISOString()}`;', '.ts').length, 1);
  assert.equal(findClockCalls('const label = `снимок ${Date.now()}`;', '.ts').length, 1);
  assert.deepEqual(findClockCalls('const label = `просто текст new Date()`;', '.ts'), [], 'текст шаблона остаётся литералом');
  assert.deepEqual(findClockCalls("const ok = new Date('2026-06-01T00:00:00Z');", '.ts'), [], 'аргумент-литерал не превращает вызов в обращение к часам');
  assert.deepEqual(findClockCalls('const inner = `${fmt(new Date(value))}`;', '.ts'), []);
  assert.deepEqual(findClockCalls('const nested = `${items.map((x) => `${x.id}`).join()}`;', '.ts'), []);
});
