#!/usr/bin/env node
import { copyFile, mkdir, rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { RULES } from '../lib/rules.mjs';

const packageRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const source = path.resolve(packageRoot, '..', '..', 'docs', 'requirements');
const target = path.join(packageRoot, 'docs');

await rm(target, { recursive: true, force: true });
await mkdir(target, { recursive: true });
for (const rule of RULES) {
  await copyFile(path.join(source, rule.file), path.join(target, rule.file));
}
console.log(`Нормативные тексты собраны: ${RULES.length}.`);
