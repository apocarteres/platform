import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

export const SOURCE_EXTENSIONS = new Set(['.java', '.ts', '.mjs', '.js']);
export const DEFAULT_EXCLUDE = [
  '/node_modules/', '/target/', '/dist/', '/build/', '/coverage/', '/.git/', '/generated/',
];

const DIRECTIVE = /^(noinspection|eslint-|prettier-ignore|@ts-|\/\s*<reference|globals\s|istanbul\s|c8\s|v8\s|language=|nosemgrep|checkstyle|@formatter)/i;
const DOCUMENT_ID = /\b[A-Z][A-Z0-9]*(?:-[A-Z0-9]+)+\b/g;
const DOCUMENT_PATH = /[\w./-]+\.md(?:#[\w-]+)?/g;
const CONNECTORS = new Set(['см', 'see', 'ref']);

export function extractComments(source) {
  const comments = [];
  let index = 0;
  let line = 1;
  while (index < source.length) {
    const current = source[index];
    if (current === '\n') {
      line += 1;
      index += 1;
    } else if (source.startsWith('"""', index)) {
      index += 3;
      while (index < source.length && !source.startsWith('"""', index)) {
        if (source[index] === '\n') line += 1;
        index += 1;
      }
      index += 3;
    } else if (current === '"' || current === "'" || current === '`') {
      const quote = current;
      index += 1;
      while (index < source.length) {
        if (source[index] === '\\') {
          index += 2;
        } else if (source[index] === quote) {
          index += 1;
          break;
        } else if (source[index] === '\n') {
          line += 1;
          index += 1;
          if (quote !== '`') break;
        } else {
          index += 1;
        }
      }
    } else if (current === '/' && source[index + 1] === '/') {
      const start = line;
      let text = '';
      index += 2;
      while (index < source.length && source[index] !== '\n') {
        text += source[index];
        index += 1;
      }
      comments.push({ line: start, endLine: start, text: text.trim(), kind: 'line' });
    } else if (current === '/' && source[index + 1] === '*') {
      const start = line;
      let text = '';
      index += 2;
      while (index < source.length && !(source[index] === '*' && source[index + 1] === '/')) {
        if (source[index] === '\n') line += 1;
        text += source[index];
        index += 1;
      }
      index += 2;
      comments.push({ line: start, endLine: line, text, kind: 'block' });
    } else {
      index += 1;
    }
  }
  return mergeAdjacentLineComments(comments);
}

function mergeAdjacentLineComments(comments) {
  const merged = [];
  for (const comment of comments) {
    const previous = merged[merged.length - 1];
    if (comment.kind === 'line' && previous?.kind === 'line' && previous.endLine + 1 === comment.line) {
      previous.text = `${previous.text} ${comment.text}`.trim();
      previous.endLine = comment.line;
    } else {
      merged.push({ ...comment });
    }
  }
  return merged;
}

export function classify(text) {
  const body = text.replace(/^[*\s]+/gm, ' ').replace(/\s+/g, ' ').trim();
  if (!body) return 'blank';
  if (DIRECTIVE.test(body)) return 'directive';
  const withoutReferences = body.replace(DOCUMENT_PATH, ' ').replace(DOCUMENT_ID, ' ');
  if (withoutReferences === body) return 'prose';
  const words = withoutReferences
    .replace(/[[\]()<>{}.,;:!?"'`|/\\^~=+*&%$#@—–-]/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .filter((word) => !CONNECTORS.has(word.toLowerCase()));
  return words.length === 0 ? 'reference' : 'prose';
}

export async function collectSourceFiles(root, { sources = ['.'], exclude = [] } = {}, extensions = SOURCE_EXTENSIONS) {
  const excludes = [...DEFAULT_EXCLUDE, ...exclude];
  const files = [];
  for (const source of sources) {
    await walk(path.resolve(root, source), root, excludes, files, extensions);
  }
  return files.sort();
}

async function walk(directory, root, excludes, files, extensions) {
  let entries;
  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch (error) {
    if (error.code === 'ENOENT' || error.code === 'ENOTDIR') return;
    throw error;
  }
  for (const entry of entries) {
    const full = path.join(directory, entry.name);
    const relative = `/${path.relative(root, full).split(path.sep).join('/')}`;
    if (excludes.some((pattern) => relative.includes(pattern))) continue;
    if (entry.isDirectory()) {
      await walk(full, root, excludes, files, extensions);
    } else if (extensions.has(path.extname(entry.name))) {
      files.push(relative.slice(1));
    }
  }
}

export async function findProseComments(root, config) {
  const violations = new Map();
  for (const file of await collectSourceFiles(root, config)) {
    const source = await readFile(path.join(root, file), 'utf8');
    const prose = extractComments(source)
      .filter((comment) => classify(comment.text) === 'prose')
      .map((comment) => ({ line: comment.line, text: comment.text.replace(/\s+/g, ' ').trim().slice(0, 70) }));
    if (prose.length > 0) violations.set(file, prose);
  }
  return violations;
}
