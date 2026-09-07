#!/usr/bin/env node
import { readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseFrontMatter } from './ticket-model.mjs';

export async function updateReleaseIndex(root, { check = false } = {}) {
  const directory = path.join(root, 'docs/releases');
  const rows = [];
  const labels = { draft: 'Черновик', in_progress: 'В работе', blocked: 'Заблокирован', released: 'Выпущен', cancelled: 'Отменён' };
  for (const name of (await readdir(directory)).sort()) {
    if (!name.endsWith('.md')) continue;
    const content = await readFile(path.join(directory, name), 'utf8');
    const metadata = parseFrontMatter(content)?.metadata;
    if (metadata?.get('type') !== 'release') continue;
    const title = /^# (.+)$/m.exec(content)?.[1] ?? metadata.get('id');
    rows.push(`| [${title.replaceAll('|', '&#124;')}](${encodeURIComponent(name)}) | ${labels[metadata.get('status')]} | ${metadata.get('opened-on')} | ${metadata.get('released-on') ?? '—'} |`);
  }
  const expected = [
    '---', 'id: IDX-RELEASES', 'type: index', 'status: active', 'scope: planning, release', 'authority: navigation', '---', '',
    '# Выпуски проекта', '',
    'Сгенерировано командой `mise run releases-index`. Вручную не редактировать.', '',
    '[Правила](RULES.md) · [Шаблон](TEMPLATE.md) · [Задачи](../tickets/INDEX.md)', '',
    '| Выпуск | Статус | Открыт | Выпущен |', '|---|---|---|---|', ...rows, '',
    ...(rows.length ? [] : ['Выпуски пока не запланированы. Существующим задачам выпуск не назначен.', ''])
  ].join('\n');
  const file = path.join(directory, 'INDEX.md');
  if (!check) { await writeFile(file, expected); return []; }
  let actual;
  try { actual = await readFile(file, 'utf8'); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  return actual === expected ? [] : ['docs/releases/INDEX.md: сводка устарела; выполните mise run releases-index'];
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  const errors = await updateReleaseIndex(process.cwd(), { check: process.argv.includes('--check') });
  if (errors.length) { console.error(errors.join('\n')); process.exitCode = 1; }
  else console.log('Сводка выпусков согласована.');
}
