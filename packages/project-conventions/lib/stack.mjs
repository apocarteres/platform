import { execFile } from 'node:child_process';
import { access } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import { CONFIG_FILE } from './config.mjs';
import { environmentWithoutGit } from './release/git.mjs';

const run = promisify(execFile);

// REQ-ADOPTION-028
export const STACKS = ['java', 'angular', 'rust'];

// REQ-ADOPTION-028
const BUILD_FILES = {
  'pom.xml': 'java',
  'build.gradle': 'java',
  'build.gradle.kts': 'java',
  'angular.json': 'angular',
  'Cargo.toml': 'rust',
};

const OUTSIDE = /(^|\/)(node_modules|target|dist|build|\.git)\//;

// REQ-ADOPTION-028
export function declaredStack(config) {
  return Array.isArray(config.stack) ? config.stack : null;
}

async function exists(file) {
  try {
    await access(file);
    return true;
  } catch {
    return false;
  }
}

// REQ-ADOPTION-028
async function buildFiles(root) {
  let listed;
  try {
    const { stdout } = await run('git', ['-C', root, 'ls-files', '-co', '--exclude-standard', '-z'],
      { env: environmentWithoutGit(), maxBuffer: 256 * 1024 * 1024 });
    listed = stdout.split('\0').filter(Boolean);
  } catch {
    return [];
  }
  const found = [];
  for (const file of listed) {
    if (OUTSIDE.test(file) || !Object.hasOwn(BUILD_FILES, path.posix.basename(file))) continue;
    if (await exists(path.join(root, file))) found.push(file);
  }
  return found.sort();
}

// REQ-ADOPTION-028
export async function stackProblems(root, config) {
  if (config.stack === undefined) return [];
  const declared = declaredStack(config);
  if (declared === null) return [`${CONFIG_FILE}: stack — перечень стеков проекта: ${STACKS.join(', ')}`];
  const problems = declared.filter((one) => !STACKS.includes(one))
    .map((one) => `${CONFIG_FILE}: стек ${one} неизвестен; известны ${STACKS.join(', ')}`);
  const files = await buildFiles(root);
  for (const stack of STACKS) {
    if (declared.includes(stack)) continue;
    const file = files.find((one) => BUILD_FILES[path.posix.basename(one)] === stack);
    if (file !== undefined) problems.push(`${CONFIG_FILE}: найден ${file}, а стек ${stack} не объявлен в stack`);
  }
  return problems;
}
