import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { environmentWithoutGit } from '../lib/release/git.mjs';

const run = promisify(execFile);
const git = (...args) => run('git', args, { env: environmentWithoutGit() });
const cli = path.join(path.dirname(path.dirname(fileURLToPath(import.meta.url))), 'bin', 'conventions.mjs');

async function conventions(root, ...args) {
  try {
    const { stdout } = await run(process.execPath, [cli, ...args, '--root', root]);
    return { code: 0, output: stdout };
  } catch (error) {
    return { code: error.code, output: `${error.stdout}${error.stderr}` };
  }
}

async function project(files) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'conventions-'));
  // REQ-BUILD-003
  const withToolchain = { 'mise.toml': '[tools]\nnode = "22.22.3"\n', ...files };
  for (const [name, content] of Object.entries(withToolchain)) {
    const target = path.join(root, name);
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, content);
  }
  return root;
}

test('sync записывает блок, check принимает результат', async () => {
  const root = await project({ 'AGENTS.md': '---\napply: always\n---\n\n## Своё\n', 'src/A.java': 'class A {}\n' });
  try {
    assert.equal((await conventions(root, 'sync')).code, 0);
    assert.match(await readFile(path.join(root, 'AGENTS.md'), 'utf8'), /conventions:begin/);
    const checked = await conventions(root, 'check');
    assert.equal(checked.code, 0, checked.output);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('новый пояснительный комментарий отклоняется, ссылка на документ проходит', async () => {
  const root = await project({ 'AGENTS.md': '---\na: b\n---\n', 'src/A.java': 'class A {}\n' });
  try {
    await conventions(root, 'sync');
    await writeFile(path.join(root, 'src', 'A.java'), '// Кеширует каталоги\nclass A {}\n');
    const failed = await conventions(root, 'check');
    assert.equal(failed.code, 1);
    assert.match(failed.output, /src\/A\.java:1: Кеширует каталоги/);

    await writeFile(path.join(root, 'src', 'A.java'), '// ADR-0003\nclass A {}\n');
    const passed = await conventions(root, 'check');
    assert.equal(passed.code, 0, passed.output);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('храповик фиксирует существующие комментарии и не даёт им расти', async () => {
  const root = await project({ 'AGENTS.md': '---\na: b\n---\n', 'src/A.java': '// Старое пояснение\nclass A {}\n' });
  try {
    await conventions(root, 'sync');
    const seeded = await conventions(root, 'baseline');
    assert.equal(seeded.code, 0, seeded.output);
    assert.match(seeded.output, /создан/);
    const afterBaseline = await conventions(root, 'check');
    assert.equal(afterBaseline.code, 0, afterBaseline.output);

    await writeFile(path.join(root, 'src', 'A.java'), '// Старое пояснение\nclass A {}\n// Новое пояснение\n');
    assert.equal((await conventions(root, 'check')).code, 1);
    const raise = await conventions(root, 'baseline');
    assert.equal(raise.code, 1);
    assert.match(raise.output, /только явно/);
    assert.equal((await conventions(root, 'baseline', '--allow-growth')).code, 0);
    assert.equal((await conventions(root, 'check')).code, 0);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('обращение к системным часам отклоняется, перечень исключений его снимает', async () => {
  const root = await project({ 'AGENTS.md': '---\na: b\n---\n', 'src/Clock.java': 'class Clock {}\n' });
  try {
    await conventions(root, 'sync');
    await writeFile(path.join(root, 'src', 'Clock.java'), 'class Clock {\n  Instant t = Instant.now();\n}\n');
    const failed = await conventions(root, 'check');
    assert.equal(failed.code, 1);
    assert.match(failed.output, /src\/Clock\.java:2: Instant\.now/);

    await writeFile(path.join(root, '.conventions.json'), JSON.stringify({ sources: ['.'], clockAllowlist: ['src/Clock.java'] }));
    const allowed = await conventions(root, 'check');
    assert.equal(allowed.code, 0, allowed.output);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('устаревшая версия блока в AGENTS.md отклоняется', async () => {
  const root = await project({ 'AGENTS.md': '---\na: b\n---\n' });
  try {
    await conventions(root, 'sync');
    const agents = await readFile(path.join(root, 'AGENTS.md'), 'utf8');
    await writeFile(path.join(root, 'AGENTS.md'), agents.replace(/conventions:begin v[\w.]+/, 'conventions:begin v0.0.1'));
    const failed = await conventions(root, 'check');
    assert.equal(failed.code, 1);
    assert.match(failed.output, /conventions sync/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('подключение нового правила засеивается без ключа, рост существующего нет', async () => {
  const root = await project({ 'AGENTS.md': '---\na: b\n---\n', 'src/A.java': '// Пояснение\nclass A {}\n' });
  try {
    await conventions(root, 'sync');
    assert.equal((await conventions(root, 'baseline')).code, 0);
    await writeFile(path.join(root, '.conventions/baseline.json'),
      JSON.stringify({ version: 2, rules: { comments: { 'src/A.java': 1 } } }));
    await writeFile(path.join(root, 'src', 'A.java'), '// Пояснение\nclass AgentPlanHasher {}\n');
    const adopted = await conventions(root, 'baseline');
    assert.equal(adopted.code, 0, adopted.output);
    await writeFile(path.join(root, 'src', 'A.java'), '// Пояснение\nclass AgentPlanHasher {\n  // Второе пояснение\n}\n');
    const grown = await conventions(root, 'baseline');
    assert.equal(grown.code, 1);
    assert.match(grown.output, /comments/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('настройка, под которую не попадает ни один файл, подключением не считается', async () => {
  const root = await project({
    'AGENTS.md': '---\na: b\n---\n',
    'src/A.java': 'class A {}\n',
    '.conventions.json': '{"sources": []}\n',
  });
  try {
    await conventions(root, 'sync');
    const empty = await conventions(root, 'check');
    assert.equal(empty.code, 1, empty.output);
    assert.match(empty.output, /не применяются ни к одному файлу/);

    await writeFile(path.join(root, '.conventions.json'), '{"sources": ["src"]}\n');
    const applied = await conventions(root, 'check');
    assert.equal(applied.code, 0, applied.output);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('принятие цикла работает в репозитории без каталогов документации', async () => {
  const root = await project({
    'AGENTS.md': '---\na: b\n---\n',
    'src/A.java': 'class A {}\n',
    '.conventions.json': '{"sources": ["src"], "release": {"scheme": "date"}}\n',
    'node_modules/@apocarteres/project-conventions/obligations.json': JSON.stringify({
      obligations: [{
        id: 'sample',
        title: 'Пример',
        requirement: 'REQ-QUALITY-001',
        level: 'директива',
        since: '0.25.0',
        dueReleases: 1,
        slug: 'adopt-sample',
        ticket: {
          scope: 'quality', priority: 'P2', problem: 'Проект не соответствует требованию ядра.',
          required: ['Сделать.'], acceptance: ['Сделано.'],
        },
      }],
    }),
  });
  try {
    await git('-C', root, 'init', '--quiet');
    const adopted = await conventions(root, 'release', 'adopt');
    assert.equal(adopted.code, 0, adopted.output);
    assert.match(adopted.output, /Открыт первый выпуск RELEASE-/);
    assert.match(await readFile(path.join(root, 'docs/releases/INDEX.md'), 'utf8'), /IDX-RELEASES/);
    assert.match(await readFile(path.join(root, 'docs/tickets/INDEX.md'), 'utf8'), /adopt-sample-\d{4}-\d{2}-\d{2}\.md/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('расхождение закреплённых версий роняет проверку правил', async () => {
  const root = await project({
    'AGENTS.md': '---\na: b\n---\n',
    'src/A.java': 'class A {}\n',
    '.node-version': '22.11.0\n',
  });
  try {
    await conventions(root, 'sync');
    const failed = await conventions(root, 'check');
    assert.equal(failed.code, 1, failed.output);
    assert.match(failed.output, /\.node-version: 22\.11\.0 против node = 22\.22\.3/);

    await writeFile(path.join(root, '.node-version'), '22.22.3\n');
    const passed = await conventions(root, 'check');
    assert.equal(passed.code, 0, passed.output);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('денежная величина на double и длинный файл роняют проверку правил', async () => {
  const root = await project({
    'AGENTS.md': '---\na: b\n---\n',
    'src/Billing.java': 'class Billing {\n  private double totalPrice;\n}\n',
    '.conventions.json': '{"sources": ["src"], "fileLines": 2}\n',
  });
  try {
    await conventions(root, 'sync');
    const failed = await conventions(root, 'check');
    assert.equal(failed.code, 1, failed.output);
    assert.match(failed.output, /src\/Billing\.java: денежных величин на double или float 1/);
    assert.match(failed.output, /src\/Billing\.java: строк сверх предела 2/);

    assert.equal((await conventions(root, 'baseline')).code, 0);
    const ratcheted = await conventions(root, 'check');
    assert.equal(ratcheted.code, 0, ratcheted.output);

    await writeFile(path.join(root, 'src', 'Billing.java'), 'class Billing {\n  private double totalPrice;\n  private float feeAmount;\n}\n');
    const grown = await conventions(root, 'check');
    assert.equal(grown.code, 1, 'храповик не даёт нарушениям расти');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

async function repository() {
  const root = await project({ '.gitignore': 'target/\n' });
  await git('-C', root, 'init', '--quiet');
  await git('-C', root, 'config', 'user.email', 'test@example.test');
  await git('-C', root, 'config', 'user.name', 'Test');
  await git('-C', root, 'add', '-A');
  await git('-C', root, 'commit', '--quiet', '-m', 'состояние');
  return root;
}

async function receipt(root, ...args) {
  try {
    const { stdout } = await run(process.execPath, [cli, 'receipt', '--root', root, ...args]);
    return { code: 0, output: stdout };
  } catch (error) {
    return { code: error.code, output: `${error.stdout}${error.stderr}` };
  }
}

async function receipts(root) {
  try {
    return await readdir(path.join(root, 'target', 'verify'));
  } catch (error) {
    if (error.code === 'ENOENT') return [];
    throw error;
  }
}

// REQ-RELEASE-028
test('расписка не пишется по справке, неизвестному аргументу и пустому перечню наборов', async () => {
  const root = await repository();
  try {
    const helped = await receipt(root, '--help');
    assert.equal(helped.code, 0, helped.output);
    assert.match(helped.output, /conventions receipt --checks/);
    assert.deepEqual(await receipts(root), [], 'справка файлов не создаёт');

    const positional = await receipt(root, 'check', 'verify');
    assert.equal(positional.code, 2, positional.output);
    assert.match(positional.output, /неизвестный аргумент: check/);

    const empty = await receipt(root, '--checks', '', '--', process.execPath, '-e', '');
    assert.equal(empty.code, 2, empty.output);
    assert.match(empty.output, /--checks требует непустой перечень наборов/);

    const commandless = await receipt(root, '--checks', 'verify');
    assert.equal(commandless.code, 2, commandless.output);
    assert.match(commandless.output, /команда набора обязательна/);

    assert.deepEqual(await receipts(root), [], 'ни один отказ файла не создал');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

// REQ-RELEASE-027
test('расписка появляется только после наблюдённого прогона и несёт его признак', async () => {
  const root = await repository();
  try {
    const failed = await receipt(root, '--checks', 'check,verify', '--', process.execPath, '-e', 'process.exit(3)');
    assert.equal(failed.code, 3, failed.output);
    assert.match(failed.output, /код возврата 3/);
    assert.deepEqual(await receipts(root), [], 'отказ набора расписки не оставляет');

    const passed = await receipt(root, '--checks', 'check,verify', '--', process.execPath, '-e', '');
    assert.equal(passed.code, 0, passed.output);
    const files = await receipts(root);
    assert.equal(files.length, 1, passed.output);
    const written = JSON.parse(await readFile(path.join(root, 'target', 'verify', files[0]), 'utf8'));
    assert.deepEqual(written.checks, ['check', 'verify']);
    assert.equal(written.run.exitCode, 0);
    assert.match(written.run.command, /-e/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
