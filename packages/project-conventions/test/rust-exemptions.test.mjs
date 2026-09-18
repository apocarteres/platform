import assert from 'node:assert/strict';
import test from 'node:test';
import os from 'node:os';
import path from 'node:path';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { findDeclaredExemptions, findRustExemptions } from '../lib/rust-exemptions.mjs';
import { COUNT, SET, compare, counts } from '../lib/baseline.mjs';

// REQ-QUALITY-007
test('послабления собираются из объявлений, а не из текста комментариев и строк', () => {
  const source = [
    '#![allow(clippy::too_many_arguments)]',
    '',
    '/// Работа.',
    '#[allow(clippy::unwrap_used, clippy::panic)]',
    'pub fn a() {}',
    '',
    '// #[allow(clippy::in_comment)]',
    'let s = "#[allow(clippy::in_string)]";',
  ].join('\n');

  const found = findDeclaredExemptions(source).map((item) => item.text);

  assert.deepEqual(found, ['clippy::too_many_arguments', 'clippy::unwrap_used', 'clippy::panic']);
});

// REQ-QUALITY-007
test('правило читает только Rust и собирает послабления по файлам', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'exempt-'));
  await mkdir(path.join(root, 'src'), { recursive: true });
  await writeFile(path.join(root, 'src/lib.rs'), '#![allow(clippy::unwrap_used)]\n\n/// Работа.\npub fn a() {}\n');
  await writeFile(path.join(root, 'src/App.java'), 'class App { /* #[allow(clippy::x)] */ }\n');
  try {
    const found = await findRustExemptions(root, { sources: ['src'] });

    assert.deepEqual([...found.keys()], ['src/lib.rs'], 'послабления Rust ищутся только в Rust');
    assert.deepEqual(found.get('src/lib.rs').map((item) => item.text), ['clippy::unwrap_used']);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

// REQ-QUALITY-007
test('множество засеивается один раз, растёт отказом и убывает улучшением', () => {
  const seeded = new Map([['src/lib.rs', [
    { line: 1, text: 'clippy::too_many_arguments', key: 'clippy::too_many_arguments' },
  ]]]);
  const baseline = counts(seeded, SET);
  assert.deepEqual(baseline, { 'src/lib.rs': ['clippy::too_many_arguments'] });

  const same = compare(seeded, baseline, SET);
  assert.deepEqual(same.exceeded, [], 'засеянное множество проходит');

  const grown = new Map([['src/lib.rs', [
    ...seeded.get('src/lib.rs'),
    { line: 2, text: 'clippy::unwrap_used', key: 'clippy::unwrap_used' },
  ]]]);
  const refused = compare(grown, baseline, SET);
  assert.equal(refused.exceeded.length, 1);
  assert.deepEqual(refused.exceeded[0].items.map((item) => item.text), ['clippy::unwrap_used'],
    'назван новый lint, а не число');

  const cleaned = compare(new Map(), baseline, SET);
  assert.equal(cleaned.improved.length, 1, 'снятое послабление видно как улучшение');
});

// REQ-QUALITY-007
test('счёт этой работы не выражает, поэтому единица и объявлена множеством', () => {
  const before = new Map([['src/lib.rs', [
    { line: 1, text: 'clippy::a', key: 'clippy::a' },
    { line: 2, text: 'clippy::b', key: 'clippy::b' },
  ]]]);
  const after = new Map([['src/lib.rs', [
    { line: 1, text: 'clippy::a', key: 'clippy::a' },
    { line: 2, text: 'clippy::c', key: 'clippy::c' },
  ]]]);

  assert.deepEqual(compare(after, counts(before, COUNT), COUNT).exceeded, [],
    'по счёту подмена послабления незаметна: было два, стало два');
  assert.equal(compare(after, counts(before, SET), SET).exceeded.length, 1,
    'по множеству подмена видна: clippy::c не засеивался');
});
