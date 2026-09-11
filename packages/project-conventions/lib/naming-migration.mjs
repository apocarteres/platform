import { readFile, readdir, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { parseFrontMatter } from './docs/ticket-model.mjs';
import { TICKET_AREAS } from './document-naming.mjs';
import { tickets } from './release/documents.mjs';
import { replaceMetadata, ticketId } from './release/documents.mjs';

// REQ-NAMING-002
const AREA_BY_SCOPE = [
  ['SEC', ['security', 'auth', 'secret', 'credential', 'authorization']],
  ['DATA', ['persistence', 'data', 'schema', 'migration', 'storage', 'idempotency']],
  ['API', ['api', 'openapi', 'contract']],
  ['PERF', ['performance', 'concurrency', 'throughput', 'latency']],
  ['TEST', ['test', 'testing', 'e2e']],
  ['ARC', ['architecture', 'design', 'modules', 'platform']],
  ['OPS', ['build', 'deployment', 'production', 'release', 'dependency', 'dependencies', 'ops', 'observability', 'monitoring', 'tooling', 'infrastructure']],
  ['DOC', ['documentation', 'planning', 'process']],
  ['FEAT', ['feature']],
];

const DATE = /-(\d{4}-\d{2}-\d{2})$/;
const SKIP_DIRECTORIES = new Set(['node_modules', 'target', 'dist', 'build', '.git', 'coverage', '.angular']);
const TEXT = new Set(['.md', '.java', '.ts', '.mjs', '.js', '.rs', '.py', '.sh', '.rb', '.toml', '.json', '.yml', '.yaml', '.xml', '.properties', '.sql', '.html']);

export function areaFor(metadata, file, overrides = {}) {
  const id = metadata.get('id');
  if (overrides[id] !== undefined) return overrides[id];
  if (file.includes('/features/')) return 'FEAT';
  const scopes = (metadata.get('scope') ?? '').split(',').map((value) => value.trim().toLowerCase());
  for (const [area, keywords] of AREA_BY_SCOPE) {
    if (scopes.some((scope) => keywords.some((keyword) => scope === keyword || scope.includes(keyword)))) return area;
  }
  return 'QUAL';
}

const LEADING_ID = /^[A-Za-z]{2,6}-\d{2,4}-/;

function quoted(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// REQ-NAMING-005
// REQ-NAMING-012
function references(paths, renames) {
  const parts = [
    ...[...paths.keys()].map((name) => `(?<![A-Za-z0-9-])${quoted(name)}`),
    ...[...renames.keys()].map((legacy) => `(?<![A-Za-z0-9-/])${quoted(legacy)}\\b`),
  ];
  return parts.length === 0 ? null : new RegExp(parts.join('|'), 'g');
}

export function slugFor(file) {
  const stem = path.posix.basename(file, '.md');
  const withoutDate = stem.replace(DATE, '').replace(LEADING_ID, '');
  const cleaned = withoutDate.toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
  const parts = cleaned.split('-');
  const limited = [];
  for (const part of parts) {
    if ([...limited, part].join('-').length > 60) break;
    limited.push(part);
  }
  return limited.join('-') || 'ticket';
}

export function sortKey(file, metadata) {
  const stem = path.posix.basename(file, '.md');
  const date = DATE.exec(stem)?.[1] ?? '9999-99-99';
  return `${date} ${stem}`;
}

async function featurePlans(root) {
  const directory = 'docs/tickets/features';
  let entries;
  try {
    entries = await readdir(path.join(root, directory), { withFileTypes: true });
  } catch (error) {
    if (error.code === 'ENOENT') return [];
    throw error;
  }
  const found = [];
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith('.md') || entry.name === 'INDEX.md') continue;
    const file = path.join(root, directory, entry.name);
    const parsed = parseFrontMatter(await readFile(file, 'utf8'));
    if (parsed?.metadata?.get('type') !== 'ticket') continue;
    found.push({ file, content: await readFile(file, 'utf8'), metadata: parsed.metadata });
  }
  return found;
}

// REQ-NAMING-012
export async function plan(root, { overrides = {}, areas = TICKET_AREAS, prefix = null } = {}) {
  const head = prefix ? `${prefix}-` : '';
  const correct = new RegExp(`^${head}(${areas.join('|')})-(\\d{3})$`);
  const all = [...await tickets(root), ...await featurePlans(root)];
  const decided = all.map((ticket) => ({
    ticket,
    file: path.relative(root, ticket.file).split(path.sep).join('/'),
    area: areaFor(ticket.metadata, path.relative(root, ticket.file), overrides),
  }));
  const taken = new Map();
  const counters = new Map();
  for (const area of areas) counters.set(area, 0);
  for (const entry of decided) {
    // REQ-NAMING-002, REQ-NAMING-012
    const current = correct.exec(ticketId(entry.ticket));
    if (current === null) continue;
    taken.set(ticketId(entry.ticket), entry);
    entry.keep = true;
    counters.set(current[1], Math.max(counters.get(current[1]) ?? 0, Number(current[2])));
  }
  const moves = [];
  for (const entry of decided.filter((item) => item.keep !== true)
    .sort((left, right) => sortKey(left.file, left.ticket.metadata).localeCompare(sortKey(right.file, right.ticket.metadata)))) {
    const next = (counters.get(entry.area) ?? 0) + 1;
    counters.set(entry.area, next);
    const id = `${head}${entry.area}-${String(next).padStart(3, '0')}`;
    const directory = path.posix.dirname(entry.file);
    moves.push({
      legacyId: ticketId(entry.ticket),
      id,
      from: entry.file,
      to: `${directory}/${id}-${slugFor(entry.file)}.md`,
      ticket: entry.ticket,
    });
  }
  return moves;
}

async function textFiles(root) {
  const found = [];
  const walk = async (current) => {
    let entries;
    try {
      entries = await readdir(path.join(root, current), { withFileTypes: true });
    } catch (error) {
      if (error.code === 'ENOENT' || error.code === 'ENOTDIR') return;
      throw error;
    }
    for (const entry of entries) {
      if (entry.isDirectory()) {
        if (SKIP_DIRECTORIES.has(entry.name)) continue;
        await walk(path.posix.join(current, entry.name));
      } else if (TEXT.has(path.extname(entry.name))) {
        found.push(path.posix.join(current, entry.name).replace(/^\.\//, ''));
      }
    }
  };
  await walk('.');
  return found;
}

// REQ-NAMING-009
export async function migrate(root, { overrides = {}, areas = TICKET_AREAS, prefix = null } = {}) {
  const moves = await plan(root, { overrides, areas, prefix });
  if (moves.length === 0) return { moves };

  for (const move of moves) {
    const content = replaceMetadata(move.ticket.content, { id: move.id, 'legacy-id': move.legacyId });
    await writeFile(move.ticket.file, content.endsWith('\n') ? content : `${content}\n`);
    await rename(move.ticket.file, path.join(root, move.to));
  }

  const renames = new Map(moves.map((move) => [move.legacyId, move.id]));
  const paths = new Map(moves.map((move) => [path.posix.basename(move.from), path.posix.basename(move.to)]));
  // REQ-NAMING-012
  const substitutions = new Map([...paths, ...renames]);
  const pattern = references(paths, renames);
  let touched = 0;
  for (const file of await textFiles(root)) {
    const before = await readFile(path.join(root, file), 'utf8');
    // REQ-NAMING-009
    const after = before.split('\n').map((line) => {
      if (line.startsWith('legacy-id:')) return line;
      // REQ-NAMING-012
      return pattern === null ? line : line.replace(pattern, (found) => substitutions.get(found) ?? found);
    }).join('\n');
    if (after === before) continue;
    await writeFile(path.join(root, file), after);
    touched += 1;
  }
  return { moves, touched };
}
