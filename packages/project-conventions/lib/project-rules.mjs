import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { SOURCE_EXTENSIONS, collectSourceFiles } from './comments.mjs';
import { codeLines } from './clock.mjs';

const KNOWN_FIELDS = new Set([
  'id', 'document', 'text', 'summary', 'scope', 'extensions', 'forbid', 'where', 'require', 'message', 'allow',
]);

export function validate(entries, builtInIds) {
  const errors = [];
  const seen = new Set();
  for (const [index, entry] of entries.entries()) {
    const where = `.conventions.json: правило ${entry?.id ?? `№${index + 1}`}`;
    if (!entry || typeof entry !== 'object') {
      errors.push(`${where}: определение должно быть объектом`);
      continue;
    }
    for (const field of Object.keys(entry)) {
      if (!KNOWN_FIELDS.has(field)) errors.push(`${where}: неизвестное поле ${field}`);
    }
    if (!entry.id) errors.push(`${where}: требуется id`);
    else if (builtInIds.has(entry.id)) errors.push(`${where}: идентификатор занят правилом платформы`);
    else if (seen.has(entry.id)) errors.push(`${where}: идентификатор повторяется`);
    else seen.add(entry.id);
    if (!entry.message) errors.push(`${where}: требуется message`);
    if (!entry.document || !entry.text) errors.push(`${where}: требуются document и text со ссылкой на нормативный документ проекта`);
    const hasForbid = typeof entry.forbid === 'string';
    const hasRequire = typeof entry.require === 'string' && typeof entry.where === 'string';
    if (hasForbid === hasRequire) {
      errors.push(`${where}: задайте либо forbid, либо пару where и require`);
    }
    for (const field of ['forbid', 'where', 'require']) {
      if (typeof entry[field] === 'string') {
        try {
          new RegExp(entry[field]);
        } catch (error) {
          errors.push(`${where}: поле ${field} не является регулярным выражением: ${error.message}`);
        }
      }
    }
    for (const field of ['scope', 'extensions', 'allow']) {
      if (entry[field] !== undefined && !Array.isArray(entry[field])) {
        errors.push(`${where}: поле ${field} должно быть списком`);
      }
    }
  }
  return errors;
}

function matches(file, entry) {
  const extensions = entry.extensions ?? [...SOURCE_EXTENSIONS];
  if (!extensions.includes(path.extname(file))) return false;
  if (entry.scope && !entry.scope.some((prefix) => file === prefix || file.startsWith(`${prefix}/`))) return false;
  return !(entry.allow ?? []).includes(file);
}

export function toRule(entry) {
  const forbid = typeof entry.forbid === 'string' ? new RegExp(entry.forbid) : null;
  const where = forbid ? null : new RegExp(entry.where);
  const required = forbid ? null : new RegExp(entry.require);
  return {
    id: entry.id,
    document: entry.document,
    file: entry.text,
    summary: entry.summary ?? entry.message,
    title: entry.message,
    project: true,
    async find(root, config) {
      const violations = new Map();
      for (const file of await collectSourceFiles(root, config)) {
        if (!matches(file, entry)) continue;
        const source = await readFile(path.join(root, file), 'utf8');
        const found = [];
        for (const [offset, line] of codeLines(source).entries()) {
          const broken = forbid ? forbid.test(line) : where.test(line) && !required.test(line);
          if (broken) found.push({ line: offset + 1, text: line.trim().slice(0, 70) });
        }
        if (found.length > 0) violations.set(file, found);
      }
      return violations;
    },
  };
}
