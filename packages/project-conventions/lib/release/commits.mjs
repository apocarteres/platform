import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { environmentWithoutGit } from './git.mjs';

const run = promisify(execFile);

// REQ-RELEASE-036
export const CYCLE_TRAILER = 'Release-cycle';

const RECORD = '';
const FIELD = '';

async function git(root, args) {
  const { stdout } = await run('git', ['-C', root, ...args], { env: environmentWithoutGit() });
  return stdout;
}

export async function commitsInRange(root, since) {
  // REQ-QUALITY-004
  const range = since === null ? 'HEAD' : (since.includes('..') ? since : `${since}..HEAD`);
  const format = `${RECORD}%H${FIELD}%s${FIELD}%P${FIELD}%b${FIELD}`;
  const output = await git(root, ['log', '--name-only', `--format=${format}`, range]);
  return output.split(RECORD)
    .filter((entry) => entry.trim().length > 0)
    .map((entry) => {
      const [sha, subject, parents, body, files] = entry.split(FIELD);
      return {
        sha,
        subject,
        body: body ?? '',
        parents: (parents ?? '').trim().split(/\s+/).filter(Boolean),
        // REQ-RELEASE-040
        files: (files ?? '').split('\n').map((line) => line.trim()).filter((line) => line.length > 0),
      };
    });
}

// REQ-RELEASE-040
export const TICKETS_PATH = 'docs/tickets/';

// REQ-TICKETS-020
export const IDEAS_PATH = 'docs/ideas/';

// REQ-TICKETS-020
export function ideaRecord(commit, prefix) {
  const head = prefix ? `${prefix}-` : '';
  const files = commit.files ?? [];
  return new RegExp(`^${head}IDEA-\\d{3}\\b`).test(commit.subject) && files.length > 0 && files.every((file) => file.startsWith(IDEAS_PATH));
}

// REQ-RELEASE-040
export function recordCommit(commit) {
  const files = commit.files ?? [];
  return files.length > 0 && files.every((file) => file.startsWith(TICKETS_PATH));
}

// REQ-RELEASE-036
export function mergeCommit(commit) {
  return (commit.parents ?? []).length > 1;
}

export function cycleCommit(commit) {
  return new RegExp(`^${CYCLE_TRAILER}:\\s*\\S`, 'm').test(commit.body);
}

// REQ-RELEASE-037
export const REVERT_LABEL = '!revert';

// REQ-RELEASE-037, REQ-RELEASE-042
export function revertCommit(commit, areas, prefix, stages) {
  const named = ticketsOf(commit, areas, prefix, stages);
  if (named.length === 0) return false;
  const head = named.join('\\s+');
  return new RegExp(`^${head}\\s+${REVERT_LABEL.replace('!', '\\!')}\\b`).test(commit.subject);
}

// REQ-NAMING-001, REQ-NAMING-011, REQ-NAMING-012
function leadingTicket(subject, areas, prefix, stages) {
  const head = prefix ? `${prefix}-` : '';
  const match = new RegExp(`^(${head}(?:${areas.join('|')})-\\d{3})\\b`).exec(subject);
  if (match !== null) return match[1];
  // REQ-NAMING-011
  const stage = /^([A-Z]{2,5}-\d{2})\b/.exec(subject);
  return stage !== null && stages.has(stage[1]) ? stage[1] : null;
}

// REQ-RELEASE-042
export function ticketsOf(commit, areas, prefix, stages = new Set()) {
  const found = [];
  let rest = commit.subject;
  for (;;) {
    const one = leadingTicket(rest, areas, prefix, stages);
    if (one === null) break;
    found.push(one);
    rest = rest.slice(one.length).replace(/^\s+/, '');
  }
  return found;
}

// REQ-NAMING-001, REQ-NAMING-011, REQ-NAMING-012
export function ticketOf(commit, areas, prefix, stages = new Set()) {
  return ticketsOf(commit, areas, prefix, stages)[0] ?? null;
}
