import { releaseIdPattern } from './release-model.mjs';

export function parseFrontMatter(content) {
  const lines = content.split(/\r?\n/);
  if (lines[0] !== '---') return null;
  const closingIndex = lines.indexOf('---', 1);
  if (closingIndex === -1) return { error: 'не закрыт блок YAML front matter' };
  const metadata = new Map();
  for (const line of lines.slice(1, closingIndex)) {
    if (!line.trim()) continue;
    const match = /^([a-z][a-z0-9-]*):\s*(.*?)\s*$/.exec(line);
    if (!match) return { error: `неподдерживаемая строка front matter: ${line}` };
    if (metadata.has(match[1])) return { error: `поле ${match[1]} указано повторно` };
    metadata.set(match[1], match[2]);
  }
  return { metadata, closingIndex };
}

export const terminalStatuses = new Set(['done', 'cancelled', 'superseded']);
export const priorities = ['P0', 'P1', 'P2', 'P3', 'unassigned'];

export function validateTicket(file, content, parsed) {
  const metadata = parsed?.metadata;
  if (!metadata) return [];
  const errors = [];
  const fail = (message) => errors.push(`${file}: ${message}`);
  if (metadata.get('type') !== 'ticket') {
    for (const field of ['priority', 'questions', 'release']) {
      if (metadata.has(field)) fail(`поле ${field} допустимо только для задачи`);
    }
    return errors;
  }
  if (!priorities.includes(metadata.get('priority'))) fail('priority должен быть P0, P1, P2, P3 или unassigned');
  const release = metadata.get('release');
  const releaseValues = ['unassigned', 'before-cycle'];
  if (!releaseValues.includes(release) && !releaseIdPattern.test(release ?? '')) fail('release должен быть unassigned, before-cycle или идентификатором RELEASE-...');
  const status = metadata.get('status');
  if (['in_progress', 'blocked'].includes(status) && metadata.get('priority') === 'unassigned') {
    fail('перед началом работы требуется назначить приоритет');
  }
  const body = content.split(/\r?\n/).slice(parsed.closingIndex + 1).join('\n')
    .replace(/^```[^\n]*\n[\s\S]*?^```\s*$/gm, '');
  const header = body.split(/^## /m)[0];
  if (/^(?:\*\*)?Приоритет(?::|\*\*:)/m.test(header)) fail('приоритет должен храниться только в YAML front matter');
  const hasQuestions = /^## Открытые вопросы\s*$/m.test(body);
  const questions = metadata.get('questions');
  if (hasQuestions !== metadata.has('questions')) fail('раздел «Открытые вопросы» и поле questions должны присутствовать вместе');
  if (questions && !['open', 'resolved'].includes(questions)) fail('questions должен быть open или resolved');
  if (questions === 'open' && ['in_progress', 'done'].includes(status)) fail('работа по задаче с открытыми вопросами запрещена; выделите независимую часть отдельно');
  if (status === 'cancelled' && !/^## Почему не делаем\s*$/m.test(body)) {
    fail('отменённая задача должна содержать раздел «Почему не делаем»');
  }
  // REQ-RELEASE-032
  if (status === 'cancelled' && metadata.has('obligation')) {
    fail(`задача обязательства ${metadata.get('obligation')} не отменяется; отказ выражается переносом: release defer с причиной`);
  }
  const standalone = /^docs\/tickets\/(?:closed\/)?[^/]+\.md$/.test(file);
  if (standalone && terminalStatuses.has(status) !== file.startsWith('docs/tickets/closed/')) {
    fail('расположение задачи должно соответствовать статусу: завершённые — в closed/, открытые — в корне');
  }
  return errors;
}
