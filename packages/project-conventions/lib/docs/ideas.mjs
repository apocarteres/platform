import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { parseFrontMatter } from './ticket-model.mjs';

// REQ-TICKETS-017
export const IDEAS_DIR = 'docs/ideas';

// REQ-TICKETS-018
export const IDEA_STATUSES = new Set(['open', 'accepted', 'rejected']);

// REQ-TICKETS-017
const WORK_FIELDS = ['priority', 'release', 'obligation'];

const labels = { open: 'Открыта', accepted: 'Принята', rejected: 'Отклонена' };
const cell = (value) => value.replaceAll('|', '&#124;').replaceAll('\n', ' ');

// REQ-TICKETS-017, REQ-TICKETS-018, REQ-TICKETS-019
export function validateIdea(file, content, parsed) {
  const metadata = parsed?.metadata;
  if (metadata?.get('type') !== 'idea') return [];
  const errors = [];
  const fail = (message) => errors.push(`${file}: ${message}`);
  if (!file.startsWith(`${IDEAS_DIR}/`)) fail(`идея лежит в ${IDEAS_DIR}/`);
  for (const field of WORK_FIELDS) {
    if (metadata.has(field)) fail(`поле ${field} у идеи недопустимо: идея не работа — заведите задачу со ссылкой на идею`);
  }
  const body = content.split(/\r?\n/).slice(parsed.closingIndex + 1).join('\n');
  const hasQuestions = /^## Открытые вопросы\s*$/m.test(body);
  const questions = metadata.get('questions');
  if (hasQuestions !== metadata.has('questions')) fail('раздел «Открытые вопросы» и поле questions должны присутствовать вместе');
  if (questions && !['open', 'resolved'].includes(questions)) fail('questions должен быть open или resolved');
  const status = metadata.get('status');
  if (status !== 'open' && questions === 'open') fail('идея с открытыми вопросами не принимается и не отклоняется: сначала ответьте на вопросы');
  if (status === 'accepted' && !metadata.has('ticket')) fail('принятая идея называет задачу, которая её исполняет: поле ticket');
  if (status !== 'accepted' && metadata.has('ticket')) fail('поле ticket есть только у принятой идеи');
  if (status === 'rejected' && !/^## Почему не делаем\s*$/m.test(body)) fail('отклонённая идея записывает причину разделом «Почему не делаем»');
  return errors;
}

// REQ-TICKETS-019
export function ideaTicketErrors(documents) {
  const tickets = new Set(documents.filter((one) => one.metadata.get('type') === 'ticket').map((one) => one.metadata.get('id')));
  return documents
    .filter((one) => one.metadata.get('type') === 'idea' && one.metadata.has('ticket') && !tickets.has(one.metadata.get('ticket')))
    .map((one) => `${one.file}: идея ссылается на неизвестную задачу ${one.metadata.get('ticket')}`);
}

// REQ-TICKETS-017
export async function buildIdeaIndex(root) {
  const directory = path.join(root, IDEAS_DIR);
  const ideas = [];
  const errors = [];
  for (const entry of (await readdir(directory, { withFileTypes: true })).filter((one) => one.isFile() && one.name.endsWith('.md'))) {
    const file = path.join(directory, entry.name);
    const content = await readFile(file, 'utf8');
    const parsed = parseFrontMatter(content);
    if (!parsed?.metadata) {
      errors.push(`${IDEAS_DIR}/${entry.name}: ${parsed?.error ?? 'отсутствуют метаданные'}`);
      continue;
    }
    if (parsed.metadata.get('type') !== 'idea') continue;
    const title = /^# (.+)$/m.exec(content)?.[1] ?? entry.name;
    ideas.push({ name: entry.name, title, id: parsed.metadata.get('id') ?? '', status: parsed.metadata.get('status'),
      questions: parsed.metadata.get('questions') === 'open', ticket: parsed.metadata.get('ticket') ?? null });
  }
  ideas.sort((one, other) => one.id.localeCompare(other.id, 'en'));
  const open = ideas.filter((idea) => idea.status === 'open').length;
  const lines = ['---', 'id: IDX-IDEAS', 'type: index', 'status: active', 'scope: planning', 'authority: navigation', '---', '',
    '# Идеи', '', 'Сгенерировано командой `mise run tickets-index`. Вручную не редактировать.', '',
    'Идея — не работа: у неё нет приоритета и выпуска, её вопросы не считаются в пороги цикла выпуска. Правила — `REQ-TICKETS` в поставке пакета правил.', '',
    `Всего: ${ideas.length}, открыто: ${open}.`, '',
    '| Идея | Статус | Вопросы | Задача |', '|---|---|---|---|'];
  for (const idea of ideas) {
    lines.push(`| [${cell(idea.title)}](${encodeURIComponent(idea.name)}) | ${labels[idea.status] ?? idea.status} | ${idea.questions ? 'открыты' : '—'} | ${idea.ticket ?? '—'} |`);
  }
  return { errors, output: lines.join('\n') + '\n', open };
}
