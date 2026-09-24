import assert from 'node:assert/strict';
import test from 'node:test';
import os from 'node:os';
import path from 'node:path';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { extractComments, findProseComments } from '../lib/comments.mjs';
import { findMoneyFloats, findMoneyViolations } from '../lib/money.mjs';
import { findNamingViolations } from '../lib/naming.mjs';
import { findClockCalls } from '../lib/clock.mjs';

async function project(files) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'rust-rules-'));
  for (const [name, content] of Object.entries(files)) {
    await mkdir(path.join(root, path.dirname(name)), { recursive: true });
    await writeFile(path.join(root, name), content);
  }
  return root;
}

const DOCUMENTED = [
  '//! Расчёт заказа.',
  '',
  '/// Возвращает цену с налогом.',
  '/// Ставка берётся из настройки.',
  'pub fn total(price: u64) -> u64 {',
  '    price * 12 / 10',
  '}',
  '',
].join('\n');

// REQ-CODE-COMMENTS-001
test('документация элемента Rust пояснительным комментарием не считается', async () => {
  const root = await project({ 'src/lib.rs': DOCUMENTED });
  try {
    assert.deepEqual([...await findProseComments(root, { sources: ['.'] })], [],
      'язык требует документацию у открытых элементов; правило, объявляющее её нарушением, воюет с языком');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

// REQ-CODE-COMMENTS-001
test('пояснение внутри тела Rust правило по-прежнему ловит', async () => {
  const root = await project({
    'src/lib.rs': DOCUMENTED.replace('    price * 12 / 10',
      '    // здесь мы прибавляем налог, потому что так надо\n    price * 12 / 10'),
  });
  try {
    const found = [...await findProseComments(root, { sources: ['.'] })];

    assert.equal(found.length, 1, 'молчащее правило хуже отсутствующего');
    assert.match(found[0][1][0].text, /прибавляем налог/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

// REQ-CODE-COMMENTS-001
test('в Java звёздочный комментарий документацией не объявлен: разбор языка не смешан', () => {
  const javadoc = '/** Возвращает цену. */\nclass A {}\n';

  const asJava = extractComments(javadoc);
  const asRust = extractComments(javadoc, { documented: true });

  assert.equal(asJava[0].documentation, false, 'звёздочный комментарий Java документацией не объявлен');
  assert.equal(asRust[0].documentation, true);
});

// REQ-CODE-DESIGN-008
test('денежная величина на плавающей арифметике ловится в объявлениях Rust', () => {
  const cases = {
    'pub struct Order {\n    pub price: f64,\n}\n': 1,
    'let total_amount: f32 = 0.0;': 1,
    'fn charge(fee: f64) {}': 1,
    'fn apply(rate: &f64) {}': 1,
    'pub struct P { pub ratio: f64 }': 0,
    'pub struct O { pub price: i64 }': 0,
    'let s = "price: f64";': 0,
    '// price: f64 когда-то был тут\nlet x = 1;': 0,
  };

  for (const [source, expected] of Object.entries(cases)) {
    assert.equal(findMoneyFloats(source, undefined, '.rs').length, expected, source);
  }
});

// REQ-CODE-DESIGN-008
test('правило денежных величин читает Rust и Java, каждый своим синтаксисом', async () => {
  const root = await project({
    'src/lib.rs': 'pub struct Order {\n    pub price: f64,\n}\n',
    'src/Order.java': 'class Order { double price; }\n',
  });
  try {
    const found = [...await findMoneyViolations(root, { sources: ['.'] })].map(([file]) => file).sort();

    assert.deepEqual(found, ['src/Order.java', 'src/lib.rs'],
      'до этой задачи правило отбрасывало всё, кроме .java, и на Rust молчало');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

// REQ-RUST-NAMING-002
test('суффикс -er в Rust правилом не рассматривается: это норма стандартной библиотеки', async () => {
  const declaration = 'pub enum Fetcher {\n    Opened,\n}\n';
  const rust = await project({ 'src/lib.rs': `//! Учёт.\n\n/// Состояние учёта.\n${declaration}` });
  const java = await project({ 'src/Fetcher.java': declaration.replace('pub enum', 'enum') });
  try {
    assert.deepEqual([...await findNamingViolations(rust, { sources: ['.'] })], [],
      'Reader, Builder и Parser принадлежат языку; правило Java заставило бы расходиться с ним');

    const inJava = [...await findNamingViolations(java, { sources: ['.'] })];
    assert.equal(inJava.length, 1,
      'то же объявление в Java правило ловит: значит проверка различает язык, а не молчит вообще');
    assert.equal(inJava[0][1][0].text, 'Fetcher');
  } finally {
    await rm(rust, { recursive: true, force: true });
    await rm(java, { recursive: true, force: true });
  }
});

// REQ-RUST-CLOCK-006
test('свой разбор часов в Rust не лезет: там работает настройка clippy', () => {
  const source = 'let at = std::time::SystemTime::now();';

  assert.deepEqual(findClockCalls(source, '.rs'), [],
    'иначе к .rs применился бы набор вызовов JavaScript и правило проверяло бы не то');
  assert.equal(findClockCalls('Instant.now();', '.java').length, 1, 'Java по-прежнему проверяется');
});

// REQ-QUALITY-013
test('время жизни не ослепляет правило денежных величин и правило комментариев', async () => {
  const money = 'pub fn name<\'a>(v: &\'a str) -> &\'a str {\n    v\n}\n\npub struct Order {\n    pub price: f64,\n}\n';
  assert.equal(findMoneyFloats(money, undefined, '.rs').length, 1,
    'объявление после нечётного числа кавычек обязано быть видно');

  const root = await project({
    'src/lib.rs': [
      '//! Проба.',
      '',
      '/// Отдаёт имя.',
      "pub fn name(v: &'static str) -> &'static str {",
      '    // здесь мы берём значение как есть, потому что иначе не собирается',
      '    v',
      '}',
    ].join('\n'),
  });
  try {
    const found = [...await findProseComments(root, { sources: ['.'] })];

    assert.equal(found.length, 1, 'пояснение после времени жизни обязано быть видно');
    assert.match(found[0][1][0].text, /берём значение как есть/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
