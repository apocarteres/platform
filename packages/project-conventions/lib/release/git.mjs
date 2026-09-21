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

export async function workingTreeClean(root) {
  return (await git(root, ['status', '--porcelain'])) === '';
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
