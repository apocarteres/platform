import assert from 'node:assert/strict';
import test from 'node:test';
import { classify, extractComments } from '../lib/comments.mjs';

test('ссылка на документ допустима, пояснение нет', () => {
  for (const allowed of ['ADR-0003', 'см. ADR-0009', 'REQ-PUBLISHING-004', 'MOD-013, ARC-017', 'REQ-PERSISTENCE', 'OPS-003', 'docs/tickets/RULES.md', '[ADR-0002](../docs/decisions/ADR-0002.md)']) {
    assert.equal(classify(allowed), 'reference', allowed);
  }
  for (const forbidden of ['Зачем тип, а не исключение', 'TODO: починить', 'ADR-0003 объясняет выбор sealed-типа', 'Кеширует каталоги', 'HTTP-запрос уходит в очередь']) {
    assert.equal(classify(forbidden), 'prose', forbidden);
  }
});

test('машинные директивы комментариями не считаются', () => {
  for (const directive of ['eslint-disable-next-line no-console', 'noinspection SqlResolve', '@ts-expect-error', 'prettier-ignore']) {
    assert.equal(classify(directive), 'directive', directive);
  }
});

test('комментарии внутри строк и текстовых блоков не находятся', () => {
  const source = [
    'var url = "https://example.com/path";',
    'var pattern = \'/* not a comment */\';',
    'var query = """',
    '  select 1 -- ok',
    '  /* still inside the text block */',
    '  """;',
    '// настоящий комментарий',
  ].join('\n');
  const comments = extractComments(source);
  assert.equal(comments.length, 1);
  assert.equal(comments[0].text, 'настоящий комментарий');
  assert.equal(comments[0].line, 7);
});

test('соседние строчные комментарии считаются одним', () => {
  const comments = extractComments('// первая\n// вторая\ncode();\n// отдельная');
  assert.equal(comments.length, 2);
  assert.equal(comments[0].text, 'первая вторая');
});

test('javadoc разбирается целиком, номер строки указывает на начало', () => {
  const comments = extractComments('class A {\n  /**\n   * Пояснение.\n   */\n  void run() {}\n}');
  assert.equal(comments.length, 1);
  assert.equal(comments[0].line, 2);
  assert.equal(classify(comments[0].text), 'prose');
});

test('регулярное выражение с экранированной косой чертой комментарием не считается', () => {
  assert.deepEqual(extractComments("found.push(name.replace(/^\\.\\//, ''));"), []);
  assert.deepEqual(extractComments('const re = /[/]/.test(value);'), []);
  assert.deepEqual(extractComments('const share = total / count / 2;'), []);
  assert.equal(extractComments('const re = /https?:\\/\\/[a-z]+/; // ADR-0003').length, 1, 'комментарий после выражения виден');
  assert.equal(extractComments('const x = a / b; // пояснение').length, 1);
});
