import { execFile } from 'node:child_process';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import { parse } from 'yaml';
import { environmentWithoutGit } from './release/git.mjs';

const run = promisify(execFile);

// REQ-DEPLOYMENT-026, REQ-DATA-ACCESS-007
const YAML_FILE = /\.ya?ml$/;

// REQ-DEPLOYMENT-026
const TARGET = 'closes-';

// REQ-DEPLOYMENT-026
export function isChangelog(location) {
  return YAML_FILE.test(location);
}

// REQ-DEPLOYMENT-026
export function labelsOf(labels, kinds) {
  const all = String(labels ?? '').split(',').map((one) => one.trim()).filter((one) => one.length > 0);
  const kind = all.find((one) => kinds.includes(one)) ?? all.find((one) => !one.startsWith(TARGET));
  if (kind === undefined) return null;
  const target = all.find((one) => one.startsWith(TARGET));
  return { kind, target: target === undefined ? null : target.slice(TARGET.length) };
}

function entriesOf(text) {
  const document = parse(text);
  return Array.isArray(document?.databaseChangeLog) ? document.databaseChangeLog : [];
}

function located(file, reference) {
  return reference.relativeToChangelogFile ? path.posix.join(path.posix.dirname(file), reference.file ?? reference.path)
    : String(reference.file ?? reference.path).replace(/^\.\//, '');
}

async function exists(root, file) {
  try {
    await readFile(path.join(root, file));
    return true;
  } catch {
    return false;
  }
}

// REQ-DEPLOYMENT-026, REQ-DATA-ACCESS-007
async function walk(root, file, kinds, found) {
  for (const entry of entriesOf(await readFile(path.join(root, file), 'utf8'))) {
    if (entry.changeSet !== undefined) {
      const id = String(entry.changeSet.id);
      found.push({ file: `${file}#${id}`, source: file, set: id, version: id, names: new Set([id]), label: labelsOf(entry.changeSet.labels, kinds) });
    } else if (entry.include !== undefined) {
      if (String(entry.include.file).startsWith('classpath:')) continue;
      const included = located(file, entry.include);
      if (!isChangelog(included)) {
        found.push({ file: included, problem: `${included}: журнал не YAML — правило читает журналы Liquibase в YAML (REQ-DATA-ACCESS-007)` });
      } else if (!await exists(root, included)) {
        found.push({ file, problem: `журнал ${file} подключает ${included}, а его нет: исправьте путь include` });
      } else {
        await walk(root, included, kinds, found);
      }
    } else if (entry.includeAll !== undefined) {
      const directory = located(file, entry.includeAll).replace(/\/$/, '');
      let names = [];
      try {
        names = (await readdir(path.join(root, directory))).filter((name) => isChangelog(name)).sort();
      } catch {
        found.push({ file, problem: `журнал ${file} подключает каталог ${directory}, а его нет: исправьте путь includeAll` });
      }
      for (const name of names) await walk(root, `${directory}/${name}`, kinds, found);
    }
  }
}

// REQ-DEPLOYMENT-026
export async function changeSets(root, master, kinds) {
  if (!await exists(root, master)) return null;
  const found = [];
  await walk(root, master, kinds, found);
  return found;
}

// REQ-DEPLOYMENT-027
export async function setCarriedAt(root, commit, migration) {
  try {
    const { stdout } = await run('git', ['-C', root, 'show', `${commit}:${migration.source}`], { env: environmentWithoutGit(), maxBuffer: 64 * 1024 * 1024 });
    return entriesOf(stdout).some((entry) => entry.changeSet !== undefined && String(entry.changeSet.id) === migration.set);
  } catch {
    return false;
  }
}
