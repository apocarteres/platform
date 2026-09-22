import { execFile } from 'node:child_process';
import { readdir } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import { DEFAULT_EXCLUDE } from './comments.mjs';
import { deployment } from './components.mjs';
import { CONFIG_FILE } from './config.mjs';
import { environmentWithoutGit } from './release/git.mjs';

const run = promisify(execFile);

// REQ-DEPLOYMENT-020
const UNIT = /\.(?:service|socket|timer)$/;

// REQ-DEPLOYMENT-020
const WEB_SERVER = [
  (file) => path.posix.basename(file) === 'nginx.conf',
  (file) => path.posix.basename(file) === 'Caddyfile',
  (file) => file.endsWith('.conf') && `/${file}`.includes('/nginx/'),
];

// REQ-DEPLOYMENT-020
export function environmentConfiguration(file) {
  if (UNIT.test(file)) return 'описание службы';
  if (WEB_SERVER.some((looks) => looks(file))) return 'настройка веб-сервера';
  return null;
}

// REQ-DEPLOYMENT-020
async function tracked(root) {
  try {
    const { stdout } = await run('git', ['-C', root, 'ls-files', '-z'], { env: environmentWithoutGit() });
    return stdout.split('\0').filter((line) => line.length > 0);
  } catch {
    return null;
  }
}

// REQ-DEPLOYMENT-020
async function walked(root, excludes) {
  const found = [];
  const walk = async (relative) => {
    let entries;
    try {
      entries = await readdir(path.join(root, relative), { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const next = relative === '' ? entry.name : `${relative}/${entry.name}`;
      if (excludes.some((pattern) => `/${next}/`.includes(pattern))) continue;
      if (entry.isDirectory()) await walk(next);
      else found.push(next);
    }
  };
  await walk('');
  return found;
}

// REQ-DEPLOYMENT-020
export async function findUndeliveredConfiguration(root, config) {
  const declared = deployment(config);
  if (!declared.declared) return new Map();
  const excludes = [...DEFAULT_EXCLUDE, ...(config.exclude ?? [])];
  const files = (await tracked(root) ?? await walked(root, excludes))
    .filter((file) => !excludes.some((pattern) => `/${file}`.includes(pattern)));
  const delivered = new Set(declared.components.map((one) => one.artifact));
  const found = [];
  for (const file of files.sort()) {
    const kind = environmentConfiguration(file);
    if (kind === null || delivered.has(file)) continue;
    found.push({ line: 1, text: `${kind} ${file} составляющей не объявлена: развёртывание её не повезёт` });
  }
  return found.length === 0 ? new Map() : new Map([[CONFIG_FILE, found]]);
}
