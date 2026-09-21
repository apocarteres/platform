import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { collectSourceFiles } from './comments.mjs';
import { codeLines } from './clock.mjs';

// REQ-QUALITY-015
const ORDER_SENSITIVE = /@ConditionalOn(?:Bean|SingleCandidate)\b/g;

// REQ-QUALITY-015
const AUTO_CONFIGURATION = /@AutoConfiguration\b/;

export function findOrderSensitiveConditions(source) {
  const lines = codeLines(source);
  if (!AUTO_CONFIGURATION.test(lines.join('\n'))) return [];
  const found = [];
  for (const [offset, line] of lines.entries()) {
    for (const match of line.matchAll(ORDER_SENSITIVE)) {
      found.push({ line: offset + 1, text: match[0] });
    }
  }
  return found;
}

export async function findOrderSensitiveWiring(root, config) {
  const violations = new Map();
  for (const file of await collectSourceFiles(root, config)) {
    if (path.extname(file) !== '.java') continue;
    const found = findOrderSensitiveConditions(await readFile(path.join(root, file), 'utf8'));
    if (found.length > 0) violations.set(file, found);
  }
  return violations;
}
