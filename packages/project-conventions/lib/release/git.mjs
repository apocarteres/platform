import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const run = promisify(execFile);

export function environmentWithoutGit(environment = process.env) {
  return Object.fromEntries(Object.entries(environment).filter(([name]) => !name.startsWith('GIT_')));
}

async function git(root, args) {
  const { stdout } = await run('git', ['-C', root, ...args], { env: environmentWithoutGit() });
  return stdout.trim();
}

// REQ-BUILD-012
export const NOT_A_REPOSITORY = 'Дерево сборки не репозиторий: истории в нём нет.'
  + ' Проверки, читающие историю, на таком дереве отказать обязаны, и это не их дефект.'
  + ' Дерево сборки загружается репозиторием — например git bundle, — а не распакованным архивом';

// REQ-BUILD-012
export async function repositoryAt(root) {
  try {
    await run('git', ['-C', root, 'rev-parse', '--git-dir'], { env: environmentWithoutGit() });
    return true;
  } catch {
    return false;
  }
}

export async function headCommit(root) {
  return git(root, ['rev-parse', 'HEAD']);
}

// REQ-QUALITY-004
export async function resolveCommit(root, ref) {
  const { stdout } = await run('git', ['-C', root, 'rev-parse', '--verify', '--quiet', `${ref}^{commit}`], { env: environmentWithoutGit() });
  return stdout.trim();
}

export async function workingTreeClean(root) {
  return (await git(root, ['status', '--porcelain'])) === '';
}

// REQ-RELEASE-045
export const OUTSIDE_THE_CODE = ['docs/', '.conventions/'];

// REQ-RELEASE-045
export async function codeTree(root, commit) {
  const listing = await git(root, ['ls-tree', '-r', '--full-tree', commit]);
  const lines = listing === '' ? [] : listing.split('\n');
  const code = lines.filter((line) => {
    const file = line.slice(line.indexOf('\t') + 1);
    return !OUTSIDE_THE_CODE.some((prefix) => file.startsWith(prefix));
  });
  return createHash('sha256').update(code.sort().join('\n')).digest('hex');
}

// REQ-DEPLOYMENT-002
export async function tagOfHead(root) {
  try {
    const { stdout } = await run('git', ['-C', root, 'tag', '--points-at', 'HEAD'], { env: environmentWithoutGit() });
    const tags = stdout.split('\n').map((line) => line.trim()).filter(Boolean);
    return tags.length === 0 ? null : tags[0];
  } catch {
    return null;
  }
}

export async function tagExists(root, tag) {
  const found = await git(root, ['tag', '--list', tag]);
  return found === tag;
}

export async function tagCommit(root, tag) {
  if (!await tagExists(root, tag)) return null;
  return git(root, ['rev-list', '-n', '1', tag]);
}

export async function createTag(root, tag, commit, message) {
  await git(root, ['tag', '-a', tag, commit, '-m', message]);
}

// REQ-RELEASE-046
export async function moveTag(root, tag, commit, message) {
  await git(root, ['tag', '-f', '-a', tag, commit, '-m', message]);
}
