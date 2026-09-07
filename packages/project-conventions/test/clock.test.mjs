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
