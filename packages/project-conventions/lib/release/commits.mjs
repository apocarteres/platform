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
  const range = since === null ? 'HEAD' : `${since}..HEAD`;
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

export function revertCommit(commit, areas, prefix) {
  const ticket = ticketOf(commit, areas, prefix);
  if (ticket === null) return false;
  return new RegExp(`^${ticket}\\s+${REVERT_LABEL.replace('!', '\\!')}\\b`).test(commit.subject);
}

// REQ-NAMING-001, REQ-NAMING-012
export function ticketOf(commit, areas, prefix) {
  const head = prefix ? `${prefix}-` : '';
  const match = new RegExp(`^(${head}(?:${areas.join('|')})-\\d{3})\\b`).exec(commit.subject);
  return match === null ? null : match[1];
}
