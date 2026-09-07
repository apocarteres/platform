import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { SOURCE_EXTENSIONS, collectSourceFiles } from './comments.mjs';

// REQ-CODE-DESIGN-009
export const DEFAULT_FILE_LINES = 800;
export const SIZE_EXTENSIONS = new Set([...SOURCE_EXTENSIONS, '.html', '.scss', '.css', '.py', '.rb', '.rs']);

// REQ-CODE-DESIGN-010
const TESTS = /(?:\.spec\.ts|\.test\.mjs|\.test\.js|Test\.java|Tests\.java|IT\.java|_test\.rs)$/;

export async function findOversizedFiles(root, config) {
  const limit = config.fileLines ?? DEFAULT_FILE_LINES;
  const violations = new Map();
  for (const file of await collectSourceFiles(root, config, SIZE_EXTENSIONS)) {
    if (TESTS.test(file)) continue;
    const lines = (await readFile(path.join(root, file), 'utf8')).split('\n');
    if (lines.length <= limit) continue;
    const overflow = lines.slice(limit).map((text, offset) => ({
      line: limit + offset + 1,
      text: text.trim().slice(0, 80),
    }));
    violations.set(file, overflow);
  }
  return violations;
}
