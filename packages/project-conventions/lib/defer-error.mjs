import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { collectSourceFiles } from './comments.mjs';
import { TEMPLATES } from './modal-escape.mjs';

// REQ-CLIENT-UPDATE-009
const DEFER = /@defer\b/g;

// REQ-CLIENT-UPDATE-009
const FOLLOWER = /^\s*@(placeholder|loading|error)\b/;

// REQ-CLIENT-UPDATE-009
function skipSpace(source, at) {
  while (at < source.length && /\s/.test(source[at])) at += 1;
  return at;
}

// REQ-CLIENT-UPDATE-009
function balanced(source, at, open, close) {
  let depth = 0;
  let quote = null;
  for (let index = at; index < source.length; index += 1) {
    const char = source[index];
    if (quote !== null) {
      if (char === quote) quote = null;
      continue;
    }
    if (char === '"' || char === "'") quote = char;
    else if (char === open) depth += 1;
    else if (char === close) {
      depth -= 1;
      if (depth === 0) return index + 1;
    }
  }
  return -1;
}

// REQ-CLIENT-UPDATE-009
function afterParameters(source, at) {
  const start = skipSpace(source, at);
  return source[start] === '(' ? balanced(source, start, '(', ')') : start;
}

// REQ-CLIENT-UPDATE-009
function afterBlock(source, at) {
  if (at === -1) return -1;
  const start = skipSpace(source, at);
  return source[start] === '{' ? balanced(source, start, '{', '}') : -1;
}

// REQ-CLIENT-UPDATE-009
export function defersWithoutError(source) {
  const found = [];
  for (const match of source.matchAll(DEFER)) {
    let at = afterBlock(source, afterParameters(source, match.index + match[0].length));
    if (at === -1) continue;
    let handled = false;
    for (let next = FOLLOWER.exec(source.slice(at)); next !== null; next = FOLLOWER.exec(source.slice(at))) {
      if (next[1] === 'error') handled = true;
      at = afterBlock(source, afterParameters(source, at + next[0].length));
      if (at === -1) break;
    }
    if (handled) continue;
    const line = source.slice(0, match.index).split('\n').length;
    found.push({ line, text: `блок @defer без @error — отказ загрузки куска показывает пустоту: ${source.slice(match.index, match.index + 60).replace(/\s+/g, ' ')}` });
  }
  return found;
}

// REQ-CLIENT-UPDATE-009
export async function findDefersWithoutError(root, config) {
  const violations = new Map();
  for (const file of await collectSourceFiles(root, config, TEMPLATES)) {
    const found = defersWithoutError(await readFile(path.join(root, file), 'utf8'));
    if (found.length > 0) violations.set(file, found);
  }
  return violations;
}
