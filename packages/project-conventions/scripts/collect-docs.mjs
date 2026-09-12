#!/usr/bin/env node
import { copyFile, mkdir, rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DELIVERED_DOCUMENTS } from '../lib/documents.mjs';
import { ALIAS_FILE, DEFINITIONS_FILE, TERMS_DIR } from '../lib/terms.mjs';
import { RULES } from '../lib/rules.mjs';

const packageRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const source = path.resolve(packageRoot, '..', '..', 'docs', 'requirements');
const terms = path.resolve(packageRoot, '..', '..', TERMS_DIR);
const target = path.join(packageRoot, 'docs');

await rm(target, { recursive: true, force: true });
await mkdir(target, { recursive: true });
const missing = RULES.filter((rule) => !DELIVERED_DOCUMENTS.includes(rule.file));
if (missing.length > 0) {
  console.error(`Правило ссылается на недоставляемый документ: ${missing.map((rule) => rule.file).join(', ')}`);
  process.exitCode = 1;
} else {
  for (const document of DELIVERED_DOCUMENTS) {
    await copyFile(path.join(source, document), path.join(target, document));
  }
  // REQ-TERMS-001
  await mkdir(path.join(target, 'terms'), { recursive: true });
  for (const document of ['RULES.md', DEFINITIONS_FILE, ALIAS_FILE]) {
    await copyFile(path.join(terms, document), path.join(target, 'terms', document));
  }
  console.log(`Нормативные тексты собраны: ${DELIVERED_DOCUMENTS.length}, словарь доставлен.`);
}
