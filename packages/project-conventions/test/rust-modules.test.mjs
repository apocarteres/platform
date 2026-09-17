import assert from 'node:assert/strict';
import test from 'node:test';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { promisify } from 'node:util';

const run = promisify(execFile);

async function crates(files) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'rust-modules-'));
  for (const [name, content] of Object.entries(files)) {
    await mkdir(path.join(root, path.dirname(name)), { recursive: true });
    await writeFile(path.join(root, name), content);
  }
  return root;
}

async function build(directory) {
  try {
    await run('cargo', ['build', '--offline', '--quiet'], { cwd: directory });
    return { failed: false, output: '' };
  } catch (failure) {
    return { failed: true, output: `${failure.stdout ?? ''}${failure.stderr ?? ''}` };
  }
}

const manifest = (name, dependency) => `[package]\nname = "${name}"\nversion = "0.1.0"\nedition = "2021"\n\n`
  + `[dependencies]\n${dependency ? `${dependency} = { path = "../${dependency}" }\n` : ''}`;

// REQ-RUST-MODULES-001
test('кольцо между крейтами язык не допускает сам', async () => {
  const root = await crates({
    'one/Cargo.toml': manifest('one', 'two'),
    'one/src/lib.rs': '//! Первый.\n\n/// Значение.\n#[must_use]\npub fn a() -> u32 {\n    1\n}\n',
    'two/Cargo.toml': manifest('two', 'one'),
    'two/src/lib.rs': '//! Второй.\n\n/// Значение.\n#[must_use]\npub fn b() -> u32 {\n    2\n}\n',
  });
  try {
    const built = await build(path.join(root, 'one'));

    assert.equal(built.failed, true, 'система сборки обязана отвергнуть кольцо');
    assert.match(built.output, /cyclic package dependency/,
      'отказ называет кольцо: правила ядра здесь не нужно, оно дублировало бы этот отказ');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

// REQ-RUST-MODULES-003
test('кольцо между модулями внутри крейта язык допускает, и это место для суждения автора', async () => {
  const root = await crates({
    'Cargo.toml': manifest('cyc'),
    'src/lib.rs': '//! Крейт с кольцом модулей.\n\npub mod a;\npub mod b;\n',
    'src/a.rs': 'use crate::b;\n\n/// Значение.\n#[must_use]\npub fn one() -> u32 {\n    if false { b::two() } else { 1 }\n}\n',
    'src/b.rs': 'use crate::a;\n\n/// Значение.\n#[must_use]\npub fn two() -> u32 {\n    if false { a::one() } else { 2 }\n}\n',
  });
  try {
    const built = await build(root);

    assert.equal(built.failed, false,
      `кольцо модулей внутри крейта собирается: на этом стоит REQ-RUST-MODULES-003\n${built.output}`);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

// REQ-RUST-MODULES-002
test('обращение к чужой реализации отвергает компилятор, а не соглашение об именах', async () => {
  const root = await crates({
    'lib/Cargo.toml': manifest('inner'),
    'lib/src/lib.rs': '//! Крейт с реализацией.\n\nmod internals;\n\n/// Контракт.\n#[must_use]\n'
      + 'pub fn contract() -> u32 {\n    internals::hidden()\n}\n',
    'lib/src/internals.rs': '/// Реализация.\npub(crate) fn hidden() -> u32 {\n    7\n}\n',
    'app/Cargo.toml': manifest('app', 'lib').replace('lib = { path = "../lib" }', 'inner = { path = "../lib" }'),
    'app/src/main.rs': '//! Потребитель.\n\nfn main() {\n    println!("{}", inner::internals::hidden());\n}\n',
  });
  try {
    const contract = await build(path.join(root, 'lib'));
    assert.equal(contract.failed, false, `крейт со своей реализацией собирается\n${contract.output}`);

    const trespass = await build(path.join(root, 'app'));
    assert.equal(trespass.failed, true, 'обращение к чужой реализации обязано быть отвергнуто');
    assert.match(trespass.output, /E0603/,
      'отвергнуто именно по видимости, а не по ошибке манифеста: соглашение об имени каталога здесь не нужно');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
