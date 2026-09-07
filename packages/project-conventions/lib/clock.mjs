import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { collectSourceFiles } from './comments.mjs';

const JAVA_CALLS = [
  'Instant.now(', 'LocalDate.now(', 'LocalDateTime.now(', 'LocalTime.now(',
  'OffsetDateTime.now(', 'ZonedDateTime.now(', 'Year.now(', 'YearMonth.now(',
  'System.currentTimeMillis(', 'System.nanoTime(', 'Clock.systemUTC(',
  'Clock.systemDefaultZone(', 'Clock.system(',
];
const SCRIPT_CALLS = ['Date.now(', 'performance.now(', 'process.hrtime('];
const BARE_DATE = /(^|[^.\w])new Date\s*\(\s*\)/;
// REQ-CODE-CLOCK-006
const LITERAL = '_';

export function codeLines(source) {
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

export function findClockCalls(source, extension) {
  const calls = extension === '.java' ? JAVA_CALLS : SCRIPT_CALLS;
  const found = [];
  for (const [offset, line] of codeLines(source).entries()) {
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
