import assert from 'node:assert/strict';
import test from 'node:test';
import { inspectBlock, manifest, replaceBlock } from '../lib/agents.mjs';

const fragment = '## Комментарии\n\n- Правило.';

test('блок вставляется после front matter и заменяется на месте', () => {
  const original = '---\napply: always\n---\n\n## Проектное\n\n- Своё правило.\n';
  const first = replaceBlock(original, '1.0.0', fragment);
  assert.match(first, /^---\napply: always\n---\n\n<!-- conventions:begin v1\.0\.0 -->/);
  assert.match(first, /## Проектное/);
  const second = replaceBlock(first, '1.1.0', `${fragment}\n- Ещё правило.`);
  assert.equal(second.match(/conventions:begin/g).length, 1);
  assert.match(second, /Ещё правило/);
  assert.match(second, /## Проектное/);
});

test('состояние блока различает устаревшую версию и ручную правку', () => {
  const synced = replaceBlock('---\na: b\n---\n', '1.0.0', fragment);
  assert.equal(inspectBlock(synced, '1.0.0', fragment).state, 'current');
  assert.equal(inspectBlock(synced, '1.1.0', fragment).state, 'outdated');
  assert.equal(inspectBlock(synced.replace('Правило.', 'Правило изменено.'), '1.0.0', fragment).state, 'edited');
  assert.equal(inspectBlock('# Без блока\n', '1.0.0', fragment).state, 'missing');
});

test('манифест указывает, где читать правила, и ничего не пересказывает', () => {
  const block = manifest('1.2.3');
  assert.match(block, /node_modules\/@apocarteres\/project-conventions\/docs/);
  assert.match(block, /conventions-check/);
  assert.doesNotMatch(block, /REQ-CODE-CLOCK/);
  assert.doesNotMatch(block, /Instant\.now/);
  assert(block.split('\n').length <= 5, block);
});

test('правила проекта упоминаются только когда они есть', () => {
  assert.doesNotMatch(manifest('1.0.0'), /\.conventions\.json/);
  const withProject = manifest('1.0.0', 'docs/requirements', [{ project: true, file: 'x.md' }]);
  assert.match(withProject, /\.conventions\.json/);
});
