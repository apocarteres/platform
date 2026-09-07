import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { collectSourceFiles } from './comments.mjs';
import { codeLines } from './clock.mjs';

// REQ-CODE-DESIGN-008
export const MONEY_NAMES = [
  'price', 'amount', 'balance', 'total', 'sum', 'cost', 'fee', 'tax', 'money', 'payment',
  'discount', 'credit', 'debit', 'refund', 'invoice', 'salary', 'rate',
];

const BINARY_TYPES = /\b(?:double|float|Double|Float)\s+([A-Za-z_]\w*)/g;

export function findMoneyFloats(source, names = MONEY_NAMES) {
  const found = [];
  for (const [offset, line] of codeLines(source).entries()) {
    for (const match of line.matchAll(BINARY_TYPES)) {
      const name = match[1].toLowerCase();
      if (names.some((money) => name.includes(money.toLowerCase()))) {
        found.push({ line: offset + 1, text: match[0] });
      }
    }
  }
  return found;
}

export async function findMoneyViolations(root, config) {
  const names = [...MONEY_NAMES, ...(config.moneyNames ?? [])];
  const violations = new Map();
  for (const file of await collectSourceFiles(root, config)) {
    if (path.extname(file) !== '.java') continue;
    const found = findMoneyFloats(await readFile(path.join(root, file), 'utf8'), names);
    if (found.length > 0) violations.set(file, found);
  }
  return violations;
}
