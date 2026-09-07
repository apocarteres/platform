#!/usr/bin/env node
import { readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { parseFrontMatter } from './ticket-model.mjs';

// REQ-RELEASE-007, REQ-RELEASE-008
export async function refreshCompositionLinks(root, { check = false } = {}) {
  const { tickets, replaceSection, sectionLines, ticketId, writeDocument } = await import('../release/documents.mjs');
  const directory = path.join(root, 'docs/releases');
  const byId = new Map((await tickets(root)).map((ticket) => [ticketId(ticket), ticket]));
  const errors = [];
  for (const name of (await readdir(directory)).sort()) {
    if (!name.endsWith('.md')) continue;
    const file = path.join(directory, name);
    const content = await readFile(file, 'utf8');
    const metadata = parseFrontMatter(content)?.metadata;
    if (metadata?.get('type') !== 'release' || metadata.get('status') === 'released') continue;
    let changed = false;
    const rows = sectionLines(content, '## Состав').map((line) => {
      const match = /^\|\s*\[([A-Z][A-Z0-9-]*)\]\(([^)\s]+)\)\s*\|(.*)$/.exec(line);
      if (match === null) return line;
      const [, id, href, rest] = match;
      const ticket = byId.get(id);
      if (ticket === undefined) return line;
      const target = path.relative(directory, ticket.file).split(path.sep).join('/');
      if (target === href) return line;
      changed = true;
      return `| [${id}](${target}) |${rest}`;
    });
    if (!changed) continue;
    if (check) {
      errors.push(`docs/releases/${name}: ссылки состава устарели; выполните mise run releases-index`);
      continue;
    }
    await writeDocument(file, replaceSection(content, '## Состав', rows));
  }
  return errors;
}

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
