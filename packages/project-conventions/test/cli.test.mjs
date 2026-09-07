import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const run = promisify(execFile);
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
  for (const [name, content] of Object.entries(files)) {
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
    await run('git', ['-C', root, 'init', '--quiet']);
    const adopted = await conventions(root, 'release', 'adopt');
    assert.equal(adopted.code, 0, adopted.output);
    assert.match(adopted.output, /Открыт первый выпуск RELEASE-/);
    assert.match(await readFile(path.join(root, 'docs/releases/INDEX.md'), 'utf8'), /IDX-RELEASES/);
    assert.match(await readFile(path.join(root, 'docs/tickets/INDEX.md'), 'utf8'), /adopt-sample-2026-09-07\.md/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
