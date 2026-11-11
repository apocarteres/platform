import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { environmentWithoutGit } from '../lib/release/git.mjs';
import { partTrees, partsDeclaration } from '../lib/release/verify-parts.mjs';

const run = promisify(execFile);
const cli = path.join(path.dirname(path.dirname(fileURLToPath(import.meta.url))), 'bin', 'conventions.mjs');

const PARTS = {
  checks: { command: 'echo run >> "$RUNS/checks"' },
  rules: { paths: ['rules/'], command: 'echo run >> "$RUNS/rules" && test ! -f rules/broken' },
  web: { paths: ['web/', 'rules/configs/'], except: ['web/notes/'], command: 'echo run >> "$RUNS/web"' },
  java: { paths: ['java/', 'pom.xml'], command: 'echo run >> "$RUNS/java"' },
};

async function project() {
  const root = await mkdtemp(path.join(os.tmpdir(), 'verify-parts-'));
  const runs = await mkdtemp(path.join(os.tmpdir(), 'verify-parts-runs-'));
  const git = async (...args) => (await run('git', ['-C', root, ...args], { env: environmentWithoutGit() })).stdout.trim();
  const put = async (file, content) => {
    await mkdir(path.dirname(path.join(root, file)), { recursive: true });
    await writeFile(path.join(root, file), content);
  };
  const commit = async (message) => {
    await git('add', '-A');
    await git('commit', '--quiet', '-m', message);
    return git('rev-parse', 'HEAD');
  };
  await git('init', '--quiet', '-b', 'main');
  await git('config', 'user.email', 'test@example.test');
  await git('config', 'user.name', 'Test');
  await put('.gitignore', 'target/\n');
  await put('.conventions.json', JSON.stringify({ sources: ['rules'], verify: { parts: PARTS } }));
  await put('rules/lib.mjs', 'export const one = 1;\n');
  await put('rules/configs/lint.mjs', 'export default [];\n');
  await put('web/app.ts', 'export const app = 1;\n');
  await put('web/notes/readme.txt', 'заметка\n');
  await put('java/Main.java', 'class Main {}\n');
  await put('pom.xml', '<project/>\n');
  await put('build.toml', 'tools = 1\n');
  await put('docs/note.md', '# Заметка\n');
  await commit('Начало');
  const receipt = async (...args) => {
    try {
      const { stdout, stderr } = await run(process.execPath, [cli, 'receipt', '--checks', 'verify', '--parts', ...args, '--root', root], {
        env: { ...environmentWithoutGit(), RUNS: runs },
      });
      return { code: 0, stdout, stderr };
    } catch (failure) {
      return { code: failure.code, stdout: failure.stdout, stderr: failure.stderr };
    }
  };
  const counts = async () => Object.fromEntries(await Promise.all(Object.keys(PARTS).map(async (name) => {
    const text = await readFile(path.join(runs, name), 'utf8').catch(() => '');
    return [name, text.split('\n').filter(Boolean).length];
  })));
  return {
    root, git, put, commit, receipt, counts,
    stop: async () => {
      await rm(root, { recursive: true, force: true });
      await rm(runs, { recursive: true, force: true });
    },
  };
}

test('verify.parts: неизвестный ключ, пустая команда и except без paths — отказ с названием части', () => {
  assert.match(partsDeclaration({}).problems.join(), /не объявлены/);
  const bad = partsDeclaration({ verify: { parts: { Rules: { command: '' }, web: { command: 'x', except: ['a/'] }, java: { command: 'x', depends: [] } } } });
  const text = bad.problems.join('\n');
  assert.match(text, /verify\.parts\.Rules: имя части/);
  assert.match(text, /verify\.parts\.Rules: command/);
  assert.match(text, /verify\.parts\.web: except без paths/);
  assert.match(text, /verify\.parts\.java: неизвестный ключ depends/);
  assert.deepEqual(bad.parts, []);
  assert.deepEqual(partsDeclaration({ verify: { parts: PARTS } }).problems, []);
});

test('дерево части: свои файлы и общие; документы, исключённый путь и чужая часть его не меняют', () => {
  const { parts } = partsDeclaration({ verify: { parts: PARTS } });
  const entry = (file, hash = 'a') => ({ file, line: `100644 blob ${hash}\t${file}` });
  const base = [entry('rules/lib.mjs'), entry('rules/configs/lint.mjs'), entry('web/app.ts'), entry('web/notes/readme.txt'), entry('java/Main.java'), entry('build.toml'), entry('docs/note.md')];
  const changed = (file) => partTrees(base.map((one) => (one.file === file ? entry(file, 'b') : one)), parts);
  const before = partTrees(base, parts);
  const differs = (after) => [...before.keys()].filter((name) => before.get(name) !== after.get(name));
  assert.equal(before.get('checks'), null, 'часть без paths дерева не имеет и выполняется всегда');
  assert.deepEqual(differs(changed('rules/lib.mjs')), ['rules']);
  assert.deepEqual(differs(changed('rules/configs/lint.mjs')), ['rules', 'web'], 'файл принадлежит каждой части, назвавшей его путь');
  assert.deepEqual(differs(changed('java/Main.java')), ['java']);
  assert.deepEqual(differs(changed('build.toml')), ['rules', 'web', 'java'], 'файл вне частей — общий');
  assert.deepEqual(differs(changed('docs/note.md')), []);
  assert.deepEqual(differs(changed('web/notes/readme.txt')), ['rules', 'web', 'java'], 'исключённый из части путь становится общим');
});

test('receipt --parts: часть с прежним деревом не перезапускается, расписка коммита называет части', async () => {
  const p = await project();
  try {
    const first = await p.receipt();
    assert.equal(first.code, 0, first.stderr);
    assert.deepEqual(await p.counts(), { checks: 1, rules: 1, web: 1, java: 1 });
    const head = await p.git('rev-parse', 'HEAD');
    const written = JSON.parse(await readFile(path.join(p.root, 'target/verify', `${head}.json`), 'utf8'));
    assert.deepEqual(written.parts.map((one) => [one.name, one.carriedFrom]), [['checks', null], ['rules', null], ['web', null], ['java', null]]);
    assert.equal(written.run.exitCode, 0);

    await p.put('rules/lib.mjs', 'export const one = 2;\n');
    await p.put('docs/note.md', '# Заметка\n\nПравка.\n');
    const next = await p.commit('Правка правил');
    const second = await p.receipt();
    assert.equal(second.code, 0, second.stderr);
    assert.deepEqual(await p.counts(), { checks: 2, rules: 2, web: 1, java: 1 }, 'перезапущены часть без путей и изменённая часть');
    assert.match(second.stdout, new RegExp(`Часть java: расписка перенесена с ${head.slice(0, 8)}`));
    const carried = JSON.parse(await readFile(path.join(p.root, 'target/verify', `${next}.json`), 'utf8'));
    assert.deepEqual(carried.parts.map((one) => [one.name, one.carriedFrom]), [['checks', null], ['rules', null], ['web', head], ['java', head]]);
    const attested = await run(process.execPath, [cli, 'attested', '--root', p.root], { env: environmentWithoutGit() });
    assert.match(attested.stdout, /Расписка на .* есть: verify/);

    await p.put('build.toml', 'tools = 2\n');
    await p.commit('Правка общего файла');
    assert.equal((await p.receipt()).code, 0);
    assert.deepEqual(await p.counts(), { checks: 3, rules: 3, web: 2, java: 2 }, 'общий файл обесценивает расписки всех частей');

    assert.equal((await p.receipt('--fresh')).code, 0);
    assert.deepEqual(await p.counts(), { checks: 4, rules: 4, web: 3, java: 3 });
  } finally {
    await p.stop();
  }
});

test('receipt --parts: упавшая часть расписки не оставляет, грязное дерево и команда после -- — отказ', async () => {
  const p = await project();
  try {
    await p.put('rules/broken', 'x\n');
    const head = await p.commit('Поломка');
    const failed = await p.receipt();
    assert.notEqual(failed.code, 0);
    assert.match(failed.stderr, /Часть rules: не пройдена/);
    assert.match(failed.stderr, /Набор не пройден: rules\. Расписка не записана/);
    await assert.rejects(readFile(path.join(p.root, 'target/verify', `${head}.json`), 'utf8'));
    const again = await p.receipt();
    assert.notEqual(again.code, 0);
    assert.deepEqual(await p.counts(), { checks: 2, rules: 2, web: 1, java: 1 }, 'пройденные части перенесены, упавшая выполнена заново');

    await p.put('web/app.ts', 'export const app = 2;\n');
    const dirty = await p.receipt();
    assert.equal(dirty.code, 1);
    assert.match(dirty.stderr, /рабочее дерево не чисто/);
    await p.git('checkout', '--', 'web/app.ts');
    const extra = await p.receipt('--', 'true');
    assert.equal(extra.code, 2);
    assert.match(extra.stderr, /с --parts команда после -- не задаётся/);
  } finally {
    await p.stop();
  }
});
