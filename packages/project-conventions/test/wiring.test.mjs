import assert from 'node:assert/strict';
import test from 'node:test';
import os from 'node:os';
import path from 'node:path';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { findOrderSensitiveConditions, findOrderSensitiveWiring } from '../lib/wiring.mjs';

// REQ-QUALITY-015
test('условие о чужом бине находится только в автонастройке', () => {
  const inside = [
    '@AutoConfiguration',
    'class Wiring {',
    '  @Bean',
    '  @ConditionalOnBean(MeterRegistry.class)',
    '  Counter counter(MeterRegistry registry) { return null; }',
    '}',
  ].join('\n');
  const outside = inside.replace('@AutoConfiguration', '@Configuration');

  assert.deepEqual(
    findOrderSensitiveConditions(inside).map((item) => [item.line, item.text]),
    [[4, '@ConditionalOnBean']],
  );
  assert.deepEqual(findOrderSensitiveConditions(outside), []);
});

// REQ-QUALITY-015
test('замена на бин, которого не хватает, и на поставщика нарушением не считается', () => {
  const source = [
    '@AutoConfiguration',
    'class Wiring {',
    '  @Bean',
    '  @ConditionalOnMissingBean',
    '  Counter counter(ObjectProvider<MeterRegistry> registries) { return null; }',
    '}',
  ].join('\n');

  assert.deepEqual(findOrderSensitiveConditions(source), []);
});

// REQ-QUALITY-015
test('единственный кандидат сомнителен тем же порядком', () => {
  const source = '@AutoConfiguration\nclass Wiring {\n  @ConditionalOnSingleCandidate(MeterRegistry.class)\n  void a() {}\n}';

  assert.deepEqual(
    findOrderSensitiveConditions(source).map((item) => item.text),
    ['@ConditionalOnSingleCandidate'],
  );
});

// REQ-QUALITY-015
test('упоминание условия в комментарии и в строке не считается', () => {
  const source = [
    '@AutoConfiguration',
    'class Wiring {',
    '  // @ConditionalOnBean(MeterRegistry.class)',
    '  String name = "@ConditionalOnBean";',
    '}',
  ].join('\n');

  assert.deepEqual(findOrderSensitiveConditions(source), []);
});

// REQ-QUALITY-015
test('правило читает только Java и собирает находки по файлам', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'wiring-'));
  await mkdir(path.join(root, 'src'), { recursive: true });
  await writeFile(
    path.join(root, 'src/Wiring.java'),
    '@AutoConfiguration\nclass Wiring {\n  @ConditionalOnBean(MeterRegistry.class)\n  void a() {}\n}\n',
  );
  await writeFile(path.join(root, 'src/lib.rs'), '/// @AutoConfiguration @ConditionalOnBean\npub fn a() {}\n');
  try {
    const found = await findOrderSensitiveWiring(root, { sources: ['src'] });

    assert.deepEqual([...found.keys()], ['src/Wiring.java']);
    assert.deepEqual(found.get('src/Wiring.java').map((item) => item.line), [3]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
