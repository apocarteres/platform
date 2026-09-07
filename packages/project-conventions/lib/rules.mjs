import { findProseComments } from './comments.mjs';
import { findSystemClockUses } from './clock.mjs';
import { toRule, validate } from './project-rules.mjs';
import { findNamingViolations } from './naming.mjs';
import { DIRECTIVE, RECOMMENDATION } from './levels.mjs';

export { DIRECTIVE, LEVELS, RECOMMENDATION } from './levels.mjs';

export const RULES = [
  {
    id: 'comments',
    level: DIRECTIVE,
    document: 'REQ-CODE-COMMENTS',
    file: 'code-comments.md',
    summary: 'Комментарий допустим только как ссылка на документ; пояснительный текст запрещён',
    title: 'пояснительных комментариев',
    find: findProseComments,
  },
  {
    id: 'clock',
    level: DIRECTIVE,
    document: 'REQ-CODE-CLOCK',
    file: 'code-clock.md',
    summary: 'Время только через интерфейс часов; прямое обращение к системным часам запрещено',
    title: 'обращений к системным часам',
    find: findSystemClockUses,
  },
  {
    id: 'naming-er',
    level: RECOMMENDATION,
    document: 'REQ-CODE-NAMING',
    file: 'code-naming.md',
    summary: 'Имя типа не оканчивается на -er вне перечня образцов и доменных существительных',
    title: 'имён с суффиксом -er вне перечня',
    find: findNamingViolations,
  },
];

export function projectRules(config) {
  const entries = config.rules ?? [];
  const errors = validate(entries, new Set(RULES.map((rule) => rule.id)));
  return { rules: errors.length > 0 ? [] : entries.map(toRule), errors };
}

export function allRules(config) {
  const { rules, errors } = projectRules(config);
  return { rules: [...RULES, ...rules], errors };
}
