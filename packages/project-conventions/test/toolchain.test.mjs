import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { findToolchainMismatches, miseTools, rangeAccepts } from '../lib/toolchain.mjs';

async function project(files) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'toolchain-'));
  for (const [name, content] of Object.entries(files)) {
    const target = path.join(root, name);
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, content);
  }
  return root;
}

const MISE = '[tools]\njava = "21.0.2"\nnode = "22.22.3"\n\n[tasks.check]\nrun = "true"\n';

test('версии читаются только из раздела инструментов', () => {
  const tools = miseTools(MISE);
  assert.deepEqual([...tools], [['java', '21.0.2'], ['node', '22.22.3']]);
});

test('диапазон engines проверяется на включение точной версии', () => {
  assert.equal(rangeAccepts('^22.0.0', '22.22.3'), true);
  assert.equal(rangeAccepts('^22.0.0', '24.1.0'), false);
  assert.equal(rangeAccepts('>=20.11.0', '22.22.3'), true);
  assert.equal(rangeAccepts('~22.22.0', '22.22.3'), true);
  assert.equal(rangeAccepts('~22.21.0', '22.22.3'), false);
  assert.equal(rangeAccepts('20.x || >=22', '22.22.3'), true);
  assert.equal(rangeAccepts('22.22.3', '22.22.3'), true);
  assert.equal(rangeAccepts('22.22.4', '22.22.3'), false);
});

test('согласованные отражения версий проверку проходят', async () => {
  const root = await project({
    'mise.toml': MISE,
    '.nvmrc': '22.22.3\n',
    '.node-version': '22.22.3\n',
    'frontend/package.json': JSON.stringify({ engines: { node: '^22.0.0' } }),
    'backend/pom.xml': '<project><properties><java.version>21</java.version></properties></project>',
  });
  try {
    assert.deepEqual(await findToolchainMismatches(root), []);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('каждое расхождение отражения названо отдельно', async () => {
  const root = await project({
    'mise.toml': MISE,
    '.nvmrc': '22.11.0\n',
    '.tool-versions': 'node 24.20.0\n',
    'frontend/package.json': JSON.stringify({ engines: { node: '^20.0.0' } }),
    'backend/pom.xml': '<project><properties><java.version>17</java.version></properties></project>',
  });
  try {
    const problems = await findToolchainMismatches(root);
    assert.equal(problems.length, 4, problems.join('\n'));
    assert.ok(problems.some((problem) => problem.startsWith('.nvmrc: 22.11.0')));
    assert.ok(problems.some((problem) => problem.includes('.tool-versions: node 24.20.0')));
    assert.ok(problems.some((problem) => problem.includes('engines.node "^20.0.0"')));
    assert.ok(problems.some((problem) => problem.includes('<java.version>17')));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('отсутствие mise.toml названо отказом, отражений без него не ищется', async () => {
  const root = await project({ '.nvmrc': '22.22.3\n' });
  try {
    const problems = await findToolchainMismatches(root);
    assert.equal(problems.length, 1);
    assert.match(problems[0], /mise\.toml отсутствует/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('цель компиляции, закреплённая свойством release, сходится с mise.toml', async () => {
  const root = await project({
    'mise.toml': MISE,
    'backend/pom.xml': '<project><properties><maven.compiler.release>21</maven.compiler.release></properties></project>',
  });
  try {
    assert.deepEqual(await findToolchainMismatches(root), []);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('расхождение свойства release с mise.toml названо отказом', async () => {
  const root = await project({
    'mise.toml': MISE,
    'backend/pom.xml': '<project><properties><maven.compiler.release>25</maven.compiler.release></properties></project>',
  });
  try {
    const problems = await findToolchainMismatches(root);
    assert.equal(problems.length, 1, problems.join('\n'));
    assert.match(problems[0], /<maven\.compiler\.release>25<\/maven\.compiler\.release> против java = 21\.0\.2/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('расхождение цели компиляции в конфигурации плагина названо отказом', async () => {
  const root = await project({
    'mise.toml': MISE,
    'backend/pom.xml': [
      '<project><build><plugins><plugin>',
      '<artifactId>maven-compiler-plugin</artifactId>',
      '<configuration><release>17</release></configuration>',
      '</plugin></plugins></build></project>',
    ].join(''),
  });
  try {
    const problems = await findToolchainMismatches(root);
    assert.equal(problems.length, 1, problems.join('\n'));
    assert.match(problems[0], /<release>17<\/release> в maven-compiler-plugin против java = 21\.0\.2/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('несогласованные объявления цели компиляции в одном манифесте названы отказом', async () => {
  const root = await project({
    'mise.toml': MISE,
    'backend/pom.xml': [
      '<project><properties>',
      '<maven.compiler.source>21</maven.compiler.source>',
      '<maven.compiler.target>17</maven.compiler.target>',
      '</properties></project>',
    ].join(''),
  });
  try {
    const problems = await findToolchainMismatches(root);
    assert.equal(problems.length, 1, problems.join('\n'));
    assert.match(problems[0], /объявлена по-разному/);
    assert.match(problems[0], /<maven\.compiler\.source>21<\/maven\.compiler\.source>/);
    assert.match(problems[0], /<maven\.compiler\.target>17<\/maven\.compiler\.target>/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('подстановка свойства не считается отдельным объявлением цели компиляции', async () => {
  const root = await project({
    'mise.toml': MISE,
    'backend/pom.xml': [
      '<project><properties>',
      '<java.version>21</java.version>',
      '<maven.compiler.release>${java.version}</maven.compiler.release>',
      '</properties></project>',
    ].join(''),
  });
  try {
    assert.deepEqual(await findToolchainMismatches(root), []);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('манифест без объявления цели компиляции отказа не даёт', async () => {
  const root = await project({
    'mise.toml': MISE,
    'backend/pom.xml': '<project><artifactId>backend</artifactId></project>',
  });
  try {
    assert.deepEqual(await findToolchainMismatches(root), []);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
