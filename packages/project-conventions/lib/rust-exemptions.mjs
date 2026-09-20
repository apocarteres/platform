import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { collectSourceFiles } from './comments.mjs';
import { codeLines } from './clock.mjs';

// REQ-QUALITY-007
const DECLARATION = /#!?\[(?:allow|expect)\s*\(\s*([^)]*)\)\s*\]/g;

// REQ-QUALITY-007
const LINT = /(?:clippy::)?[a-z][a-z0-9_]*/g;

// REQ-QUALITY-007
export function findDeclaredExemptions(source) {
  const found = [];
  // REQ-QUALITY-013
  for (const [offset, line] of codeLines(source, { lifetimes: true }).entries()) {
    for (const declaration of line.matchAll(DECLARATION)) {
      for (const lint of declaration[1].match(LINT) ?? []) {
        if (lint === 'reason') continue;
        found.push({ line: offset + 1, text: lint, key: lint });
      }
    }
  }
  return found;
}

// REQ-QUALITY-007
export async function findRustExemptions(root, config) {
  const violations = new Map();
  for (const file of await collectSourceFiles(root, config)) {
    if (path.extname(file) !== '.rs') continue;
    const found = findDeclaredExemptions(await readFile(path.join(root, file), 'utf8'));
    if (found.length > 0) violations.set(file, found);
  }
  return violations;
}
