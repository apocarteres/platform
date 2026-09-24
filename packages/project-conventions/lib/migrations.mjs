import { execFile } from 'node:child_process';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import { CONFIG_FILE } from './config.mjs';
import { releases } from './release/documents.mjs';
import { environmentWithoutGit } from './release/git.mjs';

const run = promisify(execFile);

// REQ-DEPLOYMENT-026
export const DEFAULT_EXPAND_RELEASES = 2;

// REQ-DEPLOYMENT-026
export const KINDS = ['additive', 'expand', 'contract', 'breaking'];

// REQ-DEPLOYMENT-026
const LABEL = /^\s*--\s*migration:\s*(\S+)(?:\s+(\S+))?\s*$/;

// REQ-DEPLOYMENT-025, REQ-DEPLOYMENT-026
export function withoutDowntime(config) {
  const declared = config.deployment?.withoutDowntime;
  if (declared === undefined) return { declared: false, problems: [] };
  const problems = [];
  if (typeof declared?.migrations !== 'string' || declared.migrations.length === 0) {
    problems.push('deployment.withoutDowntime.migrations не назван: укажите каталог переходов базы');
  }
  const releasesAllowed = declared?.expandReleases ?? DEFAULT_EXPAND_RELEASES;
  if (!Number.isInteger(releasesAllowed) || releasesAllowed < 1) {
    problems.push(`deployment.withoutDowntime.expandReleases=${JSON.stringify(declared?.expandReleases)}: целое число выпусков от 1; бессрочного долга нет`);
  }
  const instances = declared?.instances ?? [];
  if (!Array.isArray(instances) || instances.some((one) => typeof one !== 'string' || !/^[a-z0-9][a-z0-9-]*$/.test(one))) {
    problems.push('deployment.withoutDowntime.instances: перечень имён экземпляров — строчные буквы, цифры и дефис');
  }
  return { declared: true, migrations: declared?.migrations, expandReleases: releasesAllowed, instances, problems };
}

// REQ-DEPLOYMENT-026
export function labelOf(source) {
  const first = source.split('\n').find((line) => line.trim().length > 0) ?? '';
  const match = LABEL.exec(first);
  if (match === null) return null;
  return { kind: match[1], target: match[2] ?? null };
}

// REQ-DEPLOYMENT-026
function identities(file) {
  const stem = path.basename(file).replace(/\.[^.]+$/, '');
  return { version: stem.split('__')[0], names: new Set([stem, stem.split('__')[0]]) };
}

// REQ-DEPLOYMENT-026
export async function migrations(root, directory) {
  let entries;
  try {
    entries = await readdir(path.join(root, directory), { recursive: true, withFileTypes: true });
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }
  const found = [];
  for (const entry of entries.filter((one) => one.isFile() && one.name.endsWith('.sql'))) {
    const file = path.relative(root, path.join(entry.parentPath, entry.name)).split(path.sep).join('/');
    found.push({ file, label: labelOf(await readFile(path.join(root, file), 'utf8')), ...identities(file) });
  }
  return found.sort((one, other) => one.file.localeCompare(other.file));
}

// REQ-DEPLOYMENT-026
async function presentAt(root, commit, file) {
  try {
    await run('git', ['-C', root, 'cat-file', '-e', `${commit}:${file}`], { env: environmentWithoutGit() });
    return true;
  } catch {
    return false;
  }
}

// REQ-DEPLOYMENT-027
export async function releasesCarrying(root, file) {
  let count = 0;
  for (const release of await releases(root)) {
    const commit = release.metadata.get('commit');
    if (release.metadata.get('status') !== 'released' || commit === undefined) continue;
    if (await presentAt(root, commit, file)) count += 1;
  }
  return count;
}

// REQ-DEPLOYMENT-026
function contractProblem(migration, all) {
  if (migration.label.target === null) return 'contract не называет закрываемый expand: -- migration: contract <переход>';
  const target = all.find((one) => one.names.has(migration.label.target));
  if (target === undefined) return `contract называет ${migration.label.target}, а такого перехода нет`;
  if (target.label?.kind !== 'expand') return `contract называет ${target.file}, а это не expand`;
  return null;
}

// REQ-DEPLOYMENT-026
export async function findUnlabelledMigrations(root, config) {
  const declared = withoutDowntime(config);
  if (!declared.declared) return new Map();
  if (declared.problems.length > 0) return new Map([[CONFIG_FILE, declared.problems.map((text) => ({ line: 1, text }))]]);
  const all = await migrations(root, declared.migrations);
  if (all === null) {
    return new Map([[CONFIG_FILE, [{ line: 1, text: `каталога переходов ${declared.migrations} нет: назовите существующий в deployment.withoutDowntime.migrations` }]]]);
  }
  const violations = new Map();
  for (const migration of all) {
    let text = null;
    if (migration.label === null) text = `переход без метки: первая строка -- migration: ${KINDS.join(' | ')}`;
    else if (!KINDS.includes(migration.label.kind)) text = `метка ${migration.label.kind} неизвестна: ${KINDS.join(', ')}`;
    else if (migration.label.kind === 'contract') {
      text = contractProblem(migration, all);
      const target = text === null ? all.find((one) => one.names.has(migration.label.target)) : null;
      // REQ-DEPLOYMENT-027
      if (target !== null && await releasesCarrying(root, target.file) === 0) {
        text = `contract раньше выпуска с ${target.file}: сужать можно, когда расширение уже развёрнуто`;
      }
    }
    if (text !== null) violations.set(migration.file, [{ line: 1, text }]);
  }
  return violations;
}

// REQ-DEPLOYMENT-027
export async function findExpandDebts(root, config) {
  const declared = withoutDowntime(config);
  if (!declared.declared || declared.problems.length > 0) return { problems: [], advisories: [] };
  const all = await migrations(root, declared.migrations) ?? [];
  const closed = new Set(all.filter((one) => one.label?.kind === 'contract' && one.label.target !== null)
    .map((one) => all.find((other) => other.names.has(one.label.target))?.file).filter(Boolean));
  const problems = [];
  const advisories = [];
  for (const expand of all.filter((one) => one.label?.kind === 'expand' && !closed.has(one.file))) {
    const carried = await releasesCarrying(root, expand.file);
    if (carried === 0) {
      advisories.push(`Временная совместимость: ${expand.file} ещё не выпущен; парный contract — в выпуске после него`);
      continue;
    }
    const remaining = declared.expandReleases + 1 - carried;
    if (remaining <= 0) {
      problems.push(`Временная совместимость просрочена: ${expand.file} прошёл выпусков ${carried}, после выпуска с ним`
        + ` срок ${declared.expandReleases}. Выпустите переход с первой строкой -- migration: contract ${expand.version}`);
      continue;
    }
    advisories.push(`Временная совместимость: ${expand.file} ждёт парного contract, остаётся выпусков ${remaining}`);
  }
  return { problems, advisories };
}

// REQ-DEPLOYMENT-029
export async function unreleasedMigrations(root, config) {
  const declared = withoutDowntime(config);
  if (!declared.declared) {
    return { problems: ['развёртывание без простоя не объявлено: объявите раздел deployment.withoutDowntime с каталогом переходов migrations (REQ-DEPLOYMENT-025)'] };
  }
  if (declared.problems.length > 0) return { problems: declared.problems };
  const all = await migrations(root, declared.migrations);
  if (all === null) return { problems: [`каталога переходов ${declared.migrations} нет: назовите существующий в deployment.withoutDowntime.migrations`] };
  const unreleased = [];
  for (const migration of all) {
    if (await releasesCarrying(root, migration.file) === 0) unreleased.push(migration);
  }
  const unlabelled = unreleased.filter((one) => one.label === null || !KINDS.includes(one.label.kind));
  if (unlabelled.length > 0) {
    return {
      problems: unlabelled.map((one) => `${one.file}: переход без метки — порядок развёртывания не выбрать; поставьте первой строкой -- migration: ${KINDS.join(' | ')}`),
    };
  }
  const order = unreleased.some((one) => one.label.kind === 'breaking') ? 'downtime' : 'switch';
  return {
    problems: [],
    lines: [...unreleased.map((one) => `migration=${one.file} kind=${one.label.kind}`), `order=${order}`],
  };
}
