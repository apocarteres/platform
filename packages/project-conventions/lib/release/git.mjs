import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const run = promisify(execFile);

async function git(root, args) {
  const { stdout } = await run('git', ['-C', root, ...args]);
  return stdout.trim();
}

export async function headCommit(root) {
  return git(root, ['rev-parse', 'HEAD']);
}

export async function workingTreeClean(root) {
  return (await git(root, ['status', '--porcelain'])) === '';
}

export async function tagExists(root, tag) {
  const found = await git(root, ['tag', '--list', tag]);
  return found === tag;
}

export async function createTag(root, tag, commit, message) {
  await git(root, ['tag', '-a', tag, commit, '-m', message]);
}
