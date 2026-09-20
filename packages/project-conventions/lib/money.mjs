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

// REQ-CODE-DESIGN-008
const RUST_BINARY_TYPES = /\b([A-Za-z_]\w*)\s*:\s*(?:&\s*)?(?:f32|f64)\b/g;

// REQ-CODE-DESIGN-008
function moneyName(name, names) {
  const lowered = name.toLowerCase();
  return names.some((money) => lowered.includes(money.toLowerCase()));
}

export function findMoneyFloats(source, names = MONEY_NAMES, extension = '.java') {
  // REQ-CODE-DESIGN-008
  const pattern = extension === '.rs' ? RUST_BINARY_TYPES : BINARY_TYPES;
  const found = [];
  // REQ-QUALITY-013
  for (const [offset, line] of codeLines(source, { lifetimes: extension === '.rs' }).entries()) {
    for (const match of line.matchAll(pattern)) {
      if (moneyName(match[1], names)) found.push({ line: offset + 1, text: match[0].trim() });
    }
  }
  return found;
}

export async function findMoneyViolations(root, config) {
  const names = [...MONEY_NAMES, ...(config.moneyNames ?? [])];
  const violations = new Map();
  for (const file of await collectSourceFiles(root, config)) {
    // REQ-CODE-DESIGN-008
    const extension = path.extname(file);
    if (extension !== '.java' && extension !== '.rs') continue;
    const found = findMoneyFloats(await readFile(path.join(root, file), 'utf8'), names, extension);
    if (found.length > 0) violations.set(file, found);
  }
  return violations;
}
