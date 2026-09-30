import { execFile } from 'node:child_process';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import { CONFIG_FILE } from './config.mjs';
import { releases } from './release/documents.mjs';
import { environmentWithoutGit } from './release/git.mjs';
import { changeSets, isChangelog, setCarriedAt } from './changelog.mjs';

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
  // REQ-DATA-ACCESS-007
  if (isChangelog(directory)) return changeSets(root, directory, KINDS);
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
export async function releasesCarrying(root, migration) {
  let count = 0;
  for (const release of await releases(root)) {
    const commit = release.metadata.get('commit');
    if (release.metadata.get('status') !== 'released' || commit === undefined) continue;
    const carried = migration.set === undefined ? await presentAt(root, commit, migration.file) : await setCarriedAt(root, commit, migration);
    if (carried) count += 1;
  }
  return count;
}

// REQ-DEPLOYMENT-026
function wording(migration) {
  return migration.set === undefined
    ? { what: 'переход', unlabelled: `переход без метки: первая строка -- migration: ${KINDS.join(' | ')}`,
      pair: 'contract не называет закрываемый expand: -- migration: contract <переход>', noun: 'перехода', due: (target) => `Выпустите переход с первой строкой -- migration: contract ${target}` }
    : { what: 'набор', unlabelled: 'набор без метки: labels — additive | expand | contract, closes-<набор> | breaking',
      pair: 'contract не называет закрываемый expand: labels — contract, closes-<набор>', noun: 'набора', due: (target) => `Выпустите парный набор с labels: contract, closes-${target}` };
}

// REQ-DEPLOYMENT-026
function nameOf(migration) {
  return migration.set ?? migration.file;
}

// REQ-DEPLOYMENT-026
function missing(location) {
  return isChangelog(location)
    ? `журнала переходов ${location} нет: назовите существующий журнал Liquibase в deployment.withoutDowntime.migrations`
    : `каталога переходов ${location} нет: назовите существующий в deployment.withoutDowntime.migrations`;
}

// REQ-DEPLOYMENT-026
function contractProblem(migration, all) {
  const words = wording(migration);
  if (migration.label.target === null) return words.pair;
  const target = all.find((one) => one.names.has(migration.label.target));
  if (target === undefined) return `contract называет ${migration.label.target}, а такого ${words.noun} нет`;
  if (target.label?.kind !== 'expand') return `contract называет ${nameOf(target)}, а это не expand`;
  return null;
}

// REQ-DEPLOYMENT-026
export async function findUnlabelledMigrations(root, config) {
  const declared = withoutDowntime(config);
  if (!declared.declared) return new Map();
  if (declared.problems.length > 0) return new Map([[CONFIG_FILE, declared.problems.map((text) => ({ line: 1, text }))]]);
  const found = await migrations(root, declared.migrations);
  if (found === null) return new Map([[CONFIG_FILE, [{ line: 1, text: missing(declared.migrations) }]]]);
  const violations = new Map();
  for (const broken of found.filter((one) => one.problem !== undefined)) violations.set(broken.file, [{ line: 1, text: broken.problem }]);
  const all = found.filter((one) => one.problem === undefined);
  for (const migration of all) {
    let text = null;
    if (migration.label === null) text = wording(migration).unlabelled;
    else if (!KINDS.includes(migration.label.kind)) {
      text = migration.set === undefined ? `метка ${migration.label.kind} неизвестна: ${KINDS.join(', ')}`
        : `метки ${migration.label.kind} нет среди ${KINDS.join(', ')}`;
    } else if (migration.label.kind === 'contract') {
      text = contractProblem(migration, all);
      const target = text === null ? all.find((one) => one.names.has(migration.label.target)) : null;
      // REQ-DEPLOYMENT-027
      if (target !== null && await releasesCarrying(root, target) === 0) {
        text = `contract раньше выпуска с ${target.set === undefined ? target.file : `набором ${target.set}`}: сужать можно, когда расширение уже развёрнуто`;
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
  const all = (await migrations(root, declared.migrations) ?? []).filter((one) => one.problem === undefined);
  const closed = new Set(all.filter((one) => one.label?.kind === 'contract' && one.label.target !== null)
    .map((one) => all.find((other) => other.names.has(one.label.target))?.file).filter(Boolean));
  const problems = [];
  const advisories = [];
  for (const expand of all.filter((one) => one.label?.kind === 'expand' && !closed.has(one.file))) {
    const carried = await releasesCarrying(root, expand);
    if (carried === 0) {
      advisories.push(`Временная совместимость: ${expand.file} ещё не выпущен; парный contract — в выпуске после него`);
      continue;
    }
    const remaining = declared.expandReleases + 1 - carried;
    if (remaining <= 0) {
      problems.push(`Временная совместимость просрочена: ${expand.file} прошёл выпусков ${carried}, после выпуска с ним`
        + ` срок ${declared.expandReleases}. ${wording(expand).due(expand.version)}`);
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
  const found = await migrations(root, declared.migrations);
  if (found === null) return { problems: [missing(declared.migrations)] };
  const broken = found.filter((one) => one.problem !== undefined);
  if (broken.length > 0) return { problems: broken.map((one) => one.problem) };
  const unreleased = [];
  for (const migration of found) {
    if (await releasesCarrying(root, migration) === 0) unreleased.push(migration);
  }
  const unlabelled = unreleased.filter((one) => one.label === null || !KINDS.includes(one.label.kind));
  if (unlabelled.length > 0) {
    return {
      problems: unlabelled.map((one) => `${one.file}: ${wording(one).what} без метки — порядок развёртывания не выбрать; ${wording(one).unlabelled}`),
    };
  }
  const order = unreleased.some((one) => one.label.kind === 'breaking') ? 'downtime' : 'switch';
  return {
    problems: [],
    lines: [...unreleased.map((one) => `migration=${one.file} kind=${one.label.kind}`), `order=${order}`],
  };
}
