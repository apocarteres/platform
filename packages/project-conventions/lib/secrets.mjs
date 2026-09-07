import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { collectSourceFiles } from './comments.mjs';

// REQ-CONFIG-002
export const SENSITIVE_LEAVES = ['password', 'passwd', 'secret', 'token', 'credentials', 'credential'];
export const SENSITIVE_KEY_OWNERS = ['api', 'private', 'secret', 'access', 'encryption', 'site', 'auth'];
const CONFIG_EXTENSIONS = new Set(['.properties', '.yml', '.yaml']);
const FROM_ENVIRONMENT = /^\$\{[^}]+\}$/;

export function sensitiveKey(key, extra = []) {
  const segments = key.toLowerCase().split(/[-_.]/).filter(Boolean);
  const leaf = segments.at(-1);
  if (extra.some((name) => name.toLowerCase() === key.toLowerCase())) return true;
  if (SENSITIVE_LEAVES.includes(leaf)) return true;
  return leaf === 'key' && SENSITIVE_KEY_OWNERS.includes(segments.at(-2) ?? '');
}

function literal(value) {
  const trimmed = value.trim();
  if (trimmed === '' || trimmed === '""' || trimmed === "''") return false;
  return !FROM_ENVIRONMENT.test(trimmed);
}

export function findLiteralSecrets(source, file, extra = []) {
  const found = [];
  const yaml = !file.endsWith('.properties');
  for (const [offset, raw] of source.split('\n').entries()) {
    const line = raw.replace(/\r$/, '');
    if (/^\s*[#!]/.test(line)) continue;
    const match = yaml
      ? /^\s*([A-Za-z0-9_.-]+)\s*:\s*(.*)$/.exec(line)
      : /^\s*([A-Za-z0-9_.-]+)\s*[=:]\s*(.*)$/.exec(line);
    if (match === null) continue;
    const [, key, value] = match;
    if (!sensitiveKey(key, extra) || !literal(value)) continue;
    found.push({ line: offset + 1, text: `${key} задан литеральным значением` });
  }
  return found;
}

export async function findConfigSecrets(root, config) {
  const extra = config.secretKeys ?? [];
  const violations = new Map();
  for (const file of await collectSourceFiles(root, config, CONFIG_EXTENSIONS)) {
    const found = findLiteralSecrets(await readFile(path.join(root, file), 'utf8'), file, extra);
    if (found.length > 0) violations.set(file, found);
  }
  return violations;
}
