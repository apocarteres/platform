import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { INSTALLED_DOCS_PATH } from './agents.mjs';

export const TERMS_DIR = 'docs/terms';
export const DEFINITIONS_FILE = 'DEFINITIONS.md';
export const ALIAS_FILE = 'ALIAS.md';

const SKIP_DIRECTORIES = new Set(['node_modules', 'target', 'dist', 'build', 'coverage', '.git']);
const FENCE = /^\s*```/;
const QUOTE = /^\s*>/;
const INLINE_CODE = /`[^`]*`/g;

// REQ-TERMS-001
function tableRows(text) {
  const rows = [];
  for (const line of text.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed.startsWith('|') || /^\|[\s:|-]+\|$/.test(trimmed)) continue;
    const cells = trimmed.slice(1, -1).split('|').map((cell) => cell.trim());
    if (cells.length < 2 || cells[0] === '' || /^(Термин|Запрещено)$/.test(cells[0])) continue;
    rows.push(cells);
  }
  return rows;
}

async function readTable(root, directory, file) {
  try {
    return tableRows(await readFile(path.join(root, directory, file), 'utf8'));
  } catch (error) {
    if (error.code === 'ENOENT') return [];
    throw error;
  }
}

// REQ-TERMS-001, REQ-TERMS-002
export async function dictionary(root) {
  const directories = [TERMS_DIR, path.join(INSTALLED_DOCS_PATH, 'terms')];
  const alias = [];
  const definitions = [];
  for (const directory of directories) {
    for (const [word, replacement, reason] of await readTable(root, directory, ALIAS_FILE)) {
      alias.push({ word, replacement, reason, source: directory });
    }
    for (const [term, meaning] of await readTable(root, directory, DEFINITIONS_FILE)) {
      definitions.push({ term, meaning, source: directory });
    }
  }
  return { alias, definitions };
}

// REQ-TERMS-003
export function collisions({ definitions }) {
  const byTerm = new Map();
  const found = [];
  for (const entry of definitions) {
    const key = entry.term.toLowerCase();
    const earlier = byTerm.get(key);
    if (earlier === undefined) {
      byTerm.set(key, entry);
      continue;
    }
    if (earlier.meaning !== entry.meaning) {
      found.push(`«${entry.term}» определён и в ${earlier.source}, и в ${entry.source} по-разному`);
    }
  }
  return found;
}

// REQ-TERMS-009
export function readableLines(text) {
  const lines = [];
  let fenced = false;
  text.split('\n').forEach((line, index) => {
    if (FENCE.test(line)) {
      fenced = !fenced;
      return;
    }
    if (fenced || QUOTE.test(line)) return;
    lines.push({ number: index + 1, text: line.replace(INLINE_CODE, ' ') });
  });
  return lines;
}

async function markdownFiles(root) {
  const found = [];
  const walk = async (current) => {
    let entries;
    try {
      entries = await readdir(path.join(root, current), { withFileTypes: true });
    } catch (error) {
      if (error.code === 'ENOENT') return;
      throw error;
    }
    for (const entry of entries) {
      const next = path.posix.join(current, entry.name);
      if (entry.isDirectory()) {
        if (SKIP_DIRECTORIES.has(entry.name)) continue;
        // REQ-TERMS-010
        if (next === TERMS_DIR) continue;
        await walk(next);
      } else if (entry.name.endsWith('.md')) {
        found.push(next);
      }
    }
  };
  await walk('docs');
  return found;
}

function occurrences(lines, word) {
  const pattern = new RegExp(`(?<![А-Яа-яЁёA-Za-z])${word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'giu');
  const found = [];
  for (const line of lines) {
    for (const match of line.text.matchAll(pattern)) {
      found.push({ line: line.number, column: match.index + 1, text: match[0] });
    }
  }
  return found;
}

async function scan(root, entries, name) {
  const violations = new Map();
  if (entries.length === 0) return violations;
  for (const file of await markdownFiles(root)) {
    const lines = readableLines(await readFile(path.join(root, file), 'utf8'));
    const items = [];
    for (const entry of entries) {
      for (const place of occurrences(lines, entry[name])) {
        items.push({ ...place, replacement: entry.replacement ?? entry.term, message: entry.reason ?? '' });
      }
    }
    if (items.length > 0) violations.set(file, items);
  }
  return violations;
}

// REQ-TERMS-004
export async function findForbiddenWords(root) {
  return scan(root, (await dictionary(root)).alias, 'word');
}

// REQ-TERMS-004
export async function findLongWordings(root) {
  const { definitions } = await dictionary(root);
  return scan(root, definitions.filter((entry) => entry.meaning.split(' ').length <= 3), 'meaning');
}
