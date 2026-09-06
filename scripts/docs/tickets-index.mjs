#!/usr/bin/env node
import { readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseFrontMatter, priorities, terminalStatuses, validateTicket } from './ticket-model.mjs';

async function collect(directory) {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await collect(file));
    else if (entry.name.endsWith('.md')) files.push(file);
  }
  return files.sort();
}

const labels = { backlog: 'Запланирована', in_progress: 'В работе', blocked: 'Заблокирована',
  done: 'Выполнена', cancelled: 'Отменена', superseded: 'Заменена' };
const cell = (value) => value.replaceAll('|', '&#124;').replaceAll('\n', ' ');

export async function buildTicketIndexes(root) {
  const directory = path.join(root, 'docs/tickets');
  const tickets = [];
  const supporting = [];
  const errors = [];
  const ids = new Set();
  for (const file of await collect(directory)) {
    const content = await readFile(file, 'utf8');
    const relative = path.relative(root, file).split(path.sep).join('/');
    const parsed = parseFrontMatter(content);
    if (!parsed?.metadata) {
      errors.push(`${relative}: ${parsed?.error ?? 'отсутствуют метаданные'}`);
      continue;
    }
    errors.push(...validateTicket(relative, content, parsed));
    const metadata = parsed.metadata;
    if (metadata.get('type') === 'index') continue;
    const title = /^# (.+)$/m.exec(content)?.[1];
    if (!title) errors.push(`${relative}: отсутствует заголовок`);
    if (metadata.get('type') !== 'ticket') {
      if (path.dirname(file) === directory) supporting.push({ file, title });
      continue;
    }
    const id = metadata.get('id');
    if (!id || ids.has(id)) errors.push(`${relative}: отсутствующий или повторный идентификатор задачи`);
    ids.add(id);
    const status = metadata.get('status');
    if (!labels[status]) errors.push(`${relative}: неизвестный статус задачи`);
    tickets.push({ file, title, id, status, priority: metadata.get('priority'), release: metadata.get('release'), scope: metadata.get('scope') ?? '' });
  }
  if (errors.length) return { errors, outputs: new Map() };
  tickets.sort((a, b) => priorities.indexOf(a.priority) - priorities.indexOf(b.priority)
    || a.id.localeCompare(b.id, 'en'));
  const outputs = new Map();
  for (const closed of [false, true]) {
    const target = path.join(directory, closed ? 'closed/SUMMARY.md' : 'SUMMARY.md');
    const href = (file) => path.relative(path.dirname(target), file).split(path.sep).map(encodeURIComponent).join('/');
    const selected = tickets.filter((ticket) => terminalStatuses.has(ticket.status) === closed);
    const lines = ['---', `id: ${closed ? 'IDX-TICKETS-CLOSED' : 'IDX-TICKETS'}`, 'type: index',
      'status: active', 'scope: planning', 'authority: navigation', '---', '',
      `# ${closed ? 'Закрытые' : 'Открытые'} задачи`, '',
      'Сгенерировано командой `mise run tickets-index`. Вручную не редактировать.', '',
      `[Правила](${closed ? '../' : ''}RULES.md) · [${closed ? 'Открытые' : 'Закрытые'} задачи](${closed ? '../SUMMARY.md' : 'closed/SUMMARY.md'}) · [Планы функций](${closed ? '../' : ''}features/SUMMARY.md)`, '',
      `Всего: ${selected.length}. Включены самостоятельные задачи и этапы планов функций.`, '',
      '| Задача | Приоритет | Статус | Выпуск | Области |', '|---|---|---|---|---|'];
    for (const ticket of selected) lines.push(`| [${cell(ticket.title)}](${href(ticket.file)}) | ${ticket.priority === 'unassigned' ? 'Не назначен' : ticket.priority} | ${labels[ticket.status]} | ${ticket.release === 'unassigned' ? 'Не назначен' : `[${ticket.release}](${href(path.join(root, 'docs/releases', ticket.release + '.md'))})`} | ${cell(ticket.scope)} |`);
    if (!closed && supporting.length) {
      lines.push('', '## Порядок работы и контекст', '');
      for (const item of supporting) lines.push(`- [${cell(item.title)}](${href(item.file)})`);
    }
    outputs.set(target, lines.join('\n') + '\n');
  }
  return { errors, outputs };
}

export async function updateTicketIndexes(root, { check = false } = {}) {
  const { errors, outputs } = await buildTicketIndexes(root);
  if (errors.length) return errors;
  for (const [file, expected] of outputs) {
    if (check) {
      let actual;
      try { actual = await readFile(file, 'utf8'); } catch (error) { if (error.code !== 'ENOENT') throw error; }
      if (actual !== expected) errors.push(`${path.relative(root, file)}: сводка устарела; выполните mise run tickets-index`);
    } else await writeFile(file, expected);
  }
  return errors;
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  const errors = await updateTicketIndexes(process.cwd(), { check: process.argv.includes('--check') });
  if (errors.length) { console.error(errors.join('\n')); process.exitCode = 1; }
  else console.log('Сводки задач согласованы.');
}
