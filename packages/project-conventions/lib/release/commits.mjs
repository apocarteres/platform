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
  const output = await git(root, ['log', `--format=%H${FIELD}%s${FIELD}%b${RECORD}`, range]);
  return output.split(RECORD)
    .map((entry) => entry.replace(/^\s+/, ''))
    .filter((entry) => entry.length > 0)
    .map((entry) => {
      const [sha, subject, body] = entry.split(FIELD);
      return { sha, subject, body: body ?? '' };
    });
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
