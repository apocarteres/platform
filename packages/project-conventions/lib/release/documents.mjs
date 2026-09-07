import { readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { parseFrontMatter, terminalStatuses } from '../docs/ticket-model.mjs';

// REQ-RELEASE-004, REQ-RELEASE-007, REQ-RELEASE-010
export const RELEASES_DIR = 'docs/releases';
export const TICKETS_DIR = 'docs/tickets';
const OPEN_STATUSES = new Set(['draft', 'in_progress', 'blocked']);

async function markdownFiles(directory) {
  try {
    return (await readdir(directory)).filter((name) => name.endsWith('.md')).sort();
  } catch (error) {
    if (error.code === 'ENOENT') return [];
    throw error;
  }
}

async function documents(root, directory, type) {
  const absolute = path.join(root, directory);
  const found = [];
  for (const name of await markdownFiles(absolute)) {
    const file = path.join(absolute, name);
    const content = await readFile(file, 'utf8');
    const parsed = parseFrontMatter(content);
    if (parsed?.metadata?.get('type') !== type) continue;
    found.push({ file, name, content, metadata: parsed.metadata });
  }
  return found;
}

export async function releases(root) {
  return documents(root, RELEASES_DIR, 'release');
}

export async function openRelease(root) {
  const found = (await releases(root)).filter((release) => OPEN_STATUSES.has(release.metadata.get('status')));
  if (found.length > 1) {
    throw new Error(`Открытых выпусков больше одного: ${found.map((release) => release.metadata.get('id')).join(', ')}`);
  }
  return found[0] ?? null;
}

export async function tickets(root) {
  return [
    ...await documents(root, TICKETS_DIR, 'ticket'),
    ...await documents(root, `${TICKETS_DIR}/closed`, 'ticket'),
  ];
}

export async function unassignedTerminalTickets(root) {
  return (await tickets(root)).filter((ticket) =>
    terminalStatuses.has(ticket.metadata.get('status'))
    && (ticket.metadata.get('release') ?? 'unassigned') === 'unassigned');
}

export function nextReleaseId(existing, scheme, today, version) {
  if (scheme === 'semver') {
    if (!version) throw new Error('Для схемы semver нужен номер версии: --version X.Y.Z');
    return { id: `RELEASE-${version.replaceAll('.', '-')}`, tag: `v${version}`, number: version };
  }
  const year = today.getUTCFullYear();
  const month = String(today.getUTCMonth() + 1).padStart(2, '0');
  const prefix = `RELEASE-${year}-${month}-`;
  const used = existing
    .map((release) => release.metadata.get('id'))
    .filter((id) => id.startsWith(prefix))
    .map((id) => Number.parseInt(id.slice(prefix.length), 10))
    .filter((value) => Number.isInteger(value));
  const ordinal = used.length === 0 ? 1 : Math.max(...used) + 1;
  return { id: `${prefix}${ordinal}`, tag: `${year}.${month}.${ordinal}`, number: `${year}.${month}.${ordinal}` };
}

export function releaseTag(id, scheme) {
  if (scheme === 'semver') return `v${id.slice('RELEASE-'.length).replaceAll('-', '.')}`;
  const [, year, month, ordinal] = id.split('-');
  return `${year}.${month}.${ordinal}`;
}

export function replaceMetadata(content, updates, removals = []) {
  const lines = content.split('\n');
  const end = lines.indexOf('---', 1);
  const head = lines.slice(1, end).filter((line) => !removals.some((key) => line.startsWith(`${key}:`)));
  for (const [key, value] of Object.entries(updates)) {
    const index = head.findIndex((line) => line.startsWith(`${key}:`));
    if (index === -1) head.push(`${key}: ${value}`);
    else head[index] = `${key}: ${value}`;
  }
  return ['---', ...head, '---', ...lines.slice(end + 1)].join('\n');
}

export function replaceSection(content, heading, body) {
  const lines = content.split('\n');
  const start = lines.findIndex((line) => line.trim() === heading);
  if (start === -1) throw new Error(`В документе нет раздела ${heading}`);
  let end = lines.length;
  for (let index = start + 1; index < lines.length; index += 1) {
    if (lines[index].startsWith('## ')) {
      end = index;
      break;
    }
  }
  return [...lines.slice(0, start + 1), '', ...body, '', ...lines.slice(end)].join('\n').replace(/\n{3,}/g, '\n\n');
}

export async function writeDocument(file, content) {
  await writeFile(file, content.endsWith('\n') ? content : `${content}\n`);
}

export function ticketId(ticket) {
  return ticket.metadata.get('id');
}

export function ticketTitle(ticket) {
  const line = ticket.content.split('\n').find((value) => value.startsWith('# '));
  return line ? line.slice(2).trim() : ticketId(ticket);
}

export function ticketLinkTarget(root, ticket) {
  return path.relative(path.join(root, RELEASES_DIR), ticket.file);
}
