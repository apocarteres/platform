import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { OUTSIDE_THE_CODE, trackedFiles } from './git.mjs';
import { RECEIPT_DIR } from './receipt.mjs';

// REQ-RELEASE-051
const PART_KEYS = new Set(['command', 'paths', 'except']);
const PART_NAME = /^[a-z][a-z0-9-]*$/;

const prefixes = (value) => Array.isArray(value) && value.every((one) => typeof one === 'string' && one !== '');

// REQ-RELEASE-051
export function partsDeclaration(config) {
  const declared = config.verify?.parts;
  if (declared === undefined) return { parts: [], problems: ['Части набора не объявлены: verify.parts в .conventions.json'] };
  const problems = [];
  if (declared === null || typeof declared !== 'object' || Array.isArray(declared) || Object.keys(declared).length === 0) {
    return { parts: [], problems: ['verify.parts — непустой объект: имя части → её команда и пути'] };
  }
  const parts = [];
  for (const [name, part] of Object.entries(declared)) {
    const where = `verify.parts.${name}`;
    if (!PART_NAME.test(name)) problems.push(`${where}: имя части — строчные латинские буквы, цифры и дефис`);
    if (part === null || typeof part !== 'object' || Array.isArray(part)) {
      problems.push(`${where}: часть — объект с полем command`);
      continue;
    }
    for (const key of Object.keys(part).filter((one) => !PART_KEYS.has(one))) problems.push(`${where}: неизвестный ключ ${key}`);
    if (typeof part.command !== 'string' || part.command.trim() === '') problems.push(`${where}: command — непустая строка с командой части`);
    if (part.paths !== undefined && (!prefixes(part.paths) || part.paths.length === 0)) problems.push(`${where}: paths — непустой перечень путей от корня репозитория`);
    if (part.except !== undefined && !prefixes(part.except)) problems.push(`${where}: except — перечень путей от корня репозитория`);
    if (part.except !== undefined && part.paths === undefined) problems.push(`${where}: except без paths не действует`);
    parts.push({ name, command: part.command, paths: part.paths ?? null, except: part.except ?? [] });
  }
  return { parts: problems.length === 0 ? parts : [], problems };
}

const longest = (list, file) => Math.max(-1, ...list.filter((prefix) => file.startsWith(prefix)).map((prefix) => prefix.length));

function owns(part, file) {
  if (part.paths === null) return false;
  const own = longest(part.paths, file);
  return own >= 0 && own >= longest(part.except, file);
}

// REQ-RELEASE-051
export function partTrees(entries, parts) {
  const bounded = parts.filter((part) => part.paths !== null);
  const shared = entries
    .filter((entry) => !OUTSIDE_THE_CODE.some((prefix) => entry.file.startsWith(prefix)))
    .filter((entry) => !bounded.some((part) => owns(part, entry.file)));
  const trees = new Map();
  for (const part of parts) {
    if (part.paths === null) {
      trees.set(part.name, null);
      continue;
    }
    const lines = [...shared, ...entries.filter((entry) => owns(part, entry.file))].map((entry) => entry.line).sort();
    trees.set(part.name, createHash('sha256').update(`${part.command}\n${lines.join('\n')}`).digest('hex'));
  }
  return trees;
}

const partFile = (root, name, tree) => path.join(root, RECEIPT_DIR, 'parts', name, `${tree}.json`);

async function keptPart(root, name, tree) {
  try {
    const kept = JSON.parse(await readFile(partFile(root, name, tree), 'utf8'));
    return kept?.tree === tree && kept?.exitCode === 0 && typeof kept?.command === 'string' ? kept : null;
  } catch (error) {
    if (error.code === 'ENOENT' || error instanceof SyntaxError) return null;
    throw error;
  }
}

// REQ-RELEASE-027
export function runInShell(part, root, print = (line) => console.log(line)) {
  return new Promise((resolve) => {
    const child = spawn(part.command, { cwd: root, shell: true, stdio: ['ignore', 'pipe', 'pipe'] });
    for (const stream of [child.stdout, child.stderr]) {
      let rest = '';
      stream.setEncoding('utf8');
      stream.on('data', (chunk) => {
        const lines = (rest + chunk).split('\n');
        rest = lines.pop();
        for (const line of lines) print(`[${part.name}] ${line}`);
      });
      stream.on('end', () => {
        if (rest !== '') print(`[${part.name}] ${rest}`);
      });
    }
    child.on('error', (error) => {
      print(`[${part.name}] ${String(error.message ?? error)}`);
      resolve(1);
    });
    child.on('close', (code, signal) => resolve(signal === null ? code ?? 1 : 1));
  });
}

// REQ-RELEASE-051
export async function runParts(root, { parts, commit, fresh = false, now, run = runInShell }) {
  const trees = partTrees(await trackedFiles(root, commit), parts);
  return Promise.all(parts.map(async (part) => {
    const tree = trees.get(part.name);
    if (tree !== null && !fresh) {
      const kept = await keptPart(root, part.name, tree);
      if (kept !== null && kept.command === part.command) {
        return { name: part.name, tree, command: part.command, exitCode: 0, carriedFrom: kept.commit, completedAt: kept.completedAt, seconds: 0 };
      }
    }
    const started = now().getTime();
    const exitCode = await run(part, root);
    const finished = now();
    const outcome = {
      name: part.name, tree, command: part.command, exitCode, carriedFrom: null,
      completedAt: finished.toISOString(), seconds: Math.round((finished.getTime() - started) / 1000),
    };
    if (exitCode === 0 && tree !== null) {
      const file = partFile(root, part.name, tree);
      await mkdir(path.dirname(file), { recursive: true });
      await writeFile(file, `${JSON.stringify({ part: part.name, tree, commit, command: part.command, exitCode, completedAt: outcome.completedAt }, null, 2)}\n`);
    }
    return outcome;
  }));
}
