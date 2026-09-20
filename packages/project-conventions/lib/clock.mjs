import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { LIFETIME_LANGUAGES, collectSourceFiles, lifetimeAt } from './comments.mjs';

const JAVA_CALLS = [
  'Instant.now(', 'LocalDate.now(', 'LocalDateTime.now(', 'LocalTime.now(',
  'OffsetDateTime.now(', 'ZonedDateTime.now(', 'Year.now(', 'YearMonth.now(',
  'System.currentTimeMillis(', 'Clock.systemUTC(',
  'Clock.systemDefaultZone(', 'Clock.system(',
];
// REQ-CODE-CLOCK-008
const SCRIPT_CALLS = ['Date.now('];
const BARE_DATE = /(^|[^.\w])new Date\s*\(\s*\)/;
// REQ-CODE-CLOCK-006
const LITERAL = '_';

export function codeLines(source, { lifetimes = false } = {}) {
  const lines = [''];
  let index = 0;
  const push = (character) => {
    if (character === '\n') lines.push('');
    else lines[lines.length - 1] += character;
  };
  while (index < source.length) {
    const current = source[index];
    if (source.startsWith('"""', index)) {
      push(LITERAL);
      index += 3;
      while (index < source.length && !source.startsWith('"""', index)) {
        if (source[index] === '\n') push('\n');
        index += 1;
      }
      index += 3;
    // REQ-QUALITY-013
    } else if (lifetimes && current === "'" && lifetimeAt(source, index)) {
      push(current);
      index += 1;
    } else if (current === '"' || current === "'" || current === '`') {
      const quote = current;
      push(LITERAL);
      index += 1;
      while (index < source.length) {
        if (source[index] === '\\') {
          index += 2;
        } else if (source[index] === quote) {
          index += 1;
          break;
        // REQ-CODE-CLOCK-009
        } else if (quote === '`' && source[index] === '$' && source[index + 1] === '{') {
          push(' ');
          index += 2;
          let depth = 1;
          while (index < source.length && depth > 0) {
            const inside = source[index];
            if (inside === '{') depth += 1;
            else if (inside === '}') depth -= 1;
            if (depth > 0) push(inside === '\n' ? '\n' : inside);
            index += 1;
          }
          push(' ');
        } else {
          if (source[index] === '\n') push('\n');
          index += 1;
        }
      }
    } else if (current === '/' && source[index + 1] === '/') {
      while (index < source.length && source[index] !== '\n') index += 1;
    } else if (current === '/' && source[index + 1] === '*') {
      index += 2;
      while (index < source.length && !(source[index] === '*' && source[index + 1] === '/')) {
        push(source[index] === '\n' ? '\n' : ' ');
        index += 1;
      }
      index += 2;
    } else {
      push(current);
      index += 1;
    }
  }
  return lines;
}

// REQ-RUST-CLOCK-006
export function findClockCalls(source, extension) {
  if (extension === '.rs') return [];
  const calls = extension === '.java' ? JAVA_CALLS : SCRIPT_CALLS;
  const found = [];
  // REQ-QUALITY-013
  for (const [offset, line] of codeLines(source, { lifetimes: LIFETIME_LANGUAGES.has(extension) }).entries()) {
    for (const call of calls) {
      if (line.includes(call)) found.push({ line: offset + 1, text: call.slice(0, -1) });
    }
    if (BARE_DATE.test(line)) found.push({ line: offset + 1, text: 'new Date()' });
  }
  return found;
}

export async function findSystemClockUses(root, config) {
  const allowed = new Set(config.clockAllowlist ?? []);
  const violations = new Map();
  for (const file of await collectSourceFiles(root, config)) {
    if (allowed.has(file)) continue;
    const source = await readFile(path.join(root, file), 'utf8');
    const uses = findClockCalls(source, path.extname(file));
    if (uses.length > 0) violations.set(file, uses);
  }
  return violations;
}
