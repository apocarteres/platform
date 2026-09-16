import assert from 'node:assert/strict';
import test from 'node:test';
import os from 'node:os';
import path from 'node:path';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { findSourceSetsWithoutAnalysis } from '../lib/static-analysis.mjs';

async function project(files) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'static-analysis-'));
  for (const [name, content] of Object.entries(files)) {
    await mkdir(path.join(root, path.dirname(name)), { recursive: true });
    await writeFile(path.join(root, name), content);
  }
  return root;
}

const problems = async (root) => [...(await findSourceSetsWithoutAnalysis(root, {}))]
  .map(([file, items]) => `${file}: ${items[0].text}`);

const JAVA_SOURCE = { 'src/main/java/net/example/App.java': 'package net.example;\n\nclass App {\n}\n' };
const WITH_ANALYSIS = '<project><build><plugins><plugin>'
  + '<artifactId>maven-compiler-plugin</artifactId>'
  + '<configuration><compilerArgs><arg>-Werror</arg><arg>-Xplugin:ErrorProne</arg></compilerArgs></configuration>'
  + '</plugin></plugins></build></project>\n';

// REQ-QUALITY-002
test('модуль Java с исходниками и без разбора назван', async () => {
  const root = await project({ ...JAVA_SOURCE, 'pom.xml': '<project><artifactId>service</artifactId></project>\n' });
  try {
    assert.deepEqual(await problems(root), ['pom.xml: модуль не наследует родителя ядра и не объявляет компилятора: разбора Java нет']);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

// REQ-QUALITY-002
test('модуль Java с разбором и модуль, наследующий родителя ядра, проходят', async () => {
  const own = await project({ ...JAVA_SOURCE, 'pom.xml': WITH_ANALYSIS });
  const inherited = await project({
    ...JAVA_SOURCE,
    'pom.xml': '<project><parent><artifactId>platform-service-parent</artifactId></parent></project>\n',
  });
  try {
    assert.deepEqual(await problems(own), [], 'разбор объявлен своими руками');
    assert.deepEqual(await problems(inherited), [], 'разбор приходит наследованием от ядра');
  } finally {
    await rm(own, { recursive: true, force: true });
    await rm(inherited, { recursive: true, force: true });
  }
});

// REQ-QUALITY-002
test('компилятор без -Werror и без разбора исходников назван поимённо', async () => {
  const withoutWerror = await project({
    ...JAVA_SOURCE,
    'pom.xml': '<project><build><plugins><plugin><artifactId>maven-compiler-plugin</artifactId></plugin></plugins></build></project>\n',
  });
  const withoutErrorProne = await project({
    ...JAVA_SOURCE,
    'pom.xml': WITH_ANALYSIS.replace('<arg>-Xplugin:ErrorProne</arg>', ''),
  });
  try {
    assert.match((await problems(withoutWerror))[0], /без -Werror/);
    assert.match((await problems(withoutErrorProne))[0], /без разбора исходников/);
  } finally {
    await rm(withoutWerror, { recursive: true, force: true });
    await rm(withoutErrorProne, { recursive: true, force: true });
  }
});

// REQ-QUALITY-002
test('модуль без исходников Java разбора не требует', async () => {
  const root = await project({ 'pom.xml': '<project><artifactId>bom</artifactId><packaging>pom</packaging></project>\n' });
  try {
    assert.deepEqual(await problems(root), [], 'сводка версий ничего не компилирует');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

// REQ-QUALITY-002
test('npm-пакет с командами и без lint назван, с lint — проходит', async () => {
  const without = await project({ 'package.json': JSON.stringify({ scripts: { test: 'vitest' } }) });
  const with_ = await project({ 'package.json': JSON.stringify({ scripts: { test: 'vitest', lint: 'eslint .' } }) });
  try {
    assert.match((await problems(without))[0], /не объявляет lint/);
    assert.deepEqual(await problems(with_), []);
  } finally {
    await rm(without, { recursive: true, force: true });
    await rm(with_, { recursive: true, force: true });
  }
});

// REQ-QUALITY-002
test('крейт Rust без разбора и с разбором различаются', async () => {
  const without = await project({ 'Cargo.toml': '[package]\nname = "agent"\n' });
  const lenient = await project({ 'Cargo.toml': '[package]\nname = "agent"\n\n[lints.rust]\nwarnings = "warn"\n' });
  const complete = await project({
    'Cargo.toml': '[package]\nname = "agent"\n\n[lints.rust]\nwarnings = "deny"\n\n[lints.clippy]\nall = "deny"\n',
  });
  try {
    assert.match((await problems(without))[0], /не объявляет \[lints\.rust\]/);
    assert.match((await problems(lenient))[0], /без warnings = "deny"/);
    assert.deepEqual(await problems(complete), []);
  } finally {
    for (const root of [without, lenient, complete]) await rm(root, { recursive: true, force: true });
  }
});

// REQ-QUALITY-002
test('раздел разбора последним в файле читается целиком, а не как пустой', async () => {
  const root = await project({
    'Cargo.toml': '[package]\nname = "agent"\n\n[lints.clippy]\nall = "deny"\n\n[lints.rust]\nwarnings = "deny"\n',
  });
  try {
    assert.deepEqual(await problems(root), [],
      'после раздела нет следующего: конец файла закрывает его не хуже, чем заголовок');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

// REQ-QUALITY-002
test('правило ловит форму, на которой попались обе стороны: разбор у одного набора из нескольких', async () => {
  const root = await project({
    'backend/pom.xml': WITH_ANALYSIS,
    'backend/src/main/java/net/example/App.java': 'package net.example;\n\nclass App {\n}\n',
    'web/package.json': JSON.stringify({ scripts: { test: 'vitest' } }),
    'agent/Cargo.toml': '[package]\nname = "agent"\n\n[lints.rust]\nwarnings = "deny"\n\n[lints.clippy]\nall = "deny"\n',
  });
  try {
    const found = await problems(root);

    assert.equal(found.length, 1, `назван ровно молчащий набор:\n${found.join('\n')}`);
    assert.match(found[0], /^web\/package\.json:/, 'назван тот набор, у которого разбора нет');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
