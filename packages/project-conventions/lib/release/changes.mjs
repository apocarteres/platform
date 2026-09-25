import { execFile } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { promisify } from 'node:util';
import { environmentWithoutGit } from './git.mjs';
import { surfaceAt } from './surface.mjs';

const run = promisify(execFile);

// REQ-PUBLISHING-015
export const CHANGES_FILE = 'changes.json';

// REQ-PUBLISHING-015
export const DECLARED_SECTION = '## Несовместимые изменения';

// REQ-PUBLISHING-004, REQ-PUBLISHING-015
export const SEES_MORE_SECTION = '## Проверка видит больше';

// REQ-PUBLISHING-015
function difference(before, after, key = (one) => one) {
  const had = new Set(before.map(key));
  const has = new Set(after.map(key));
  return {
    added: after.filter((one) => !had.has(key(one))),
    removed: before.filter((one) => !has.has(key(one))),
  };
}

// REQ-PUBLISHING-015
function keysDifference(before, after) {
  const added = [];
  const removed = [];
  for (const command of new Set([...Object.keys(before), ...Object.keys(after)])) {
    if (!(command in before) || !(command in after)) continue;
    const change = difference(before[command], after[command]);
    added.push(...change.added.map((key) => `${command} ${key}`));
    removed.push(...change.removed.map((key) => `${command} ${key}`));
  }
  return { added, removed };
}

// REQ-PUBLISHING-015
export function changesBetween(before, after) {
  return {
    rules: difference(before.rules, after.rules, (one) => one.id),
    commands: difference(before.commands, after.commands),
    subcommands: difference(before.subcommands, after.subcommands),
    keys: keysDifference(before.keys, after.keys),
    clauses: difference(before.clauses, after.clauses),
    obligations: difference(before.obligations, after.obligations, (one) => one.id),
    // REQ-AUTH-020
    contract: difference(before.contract ?? [], after.contract ?? []),
    // REQ-AUTH-020
    schemasBefore: [...new Set((before.contract ?? []).map((entry) => schemaOf(entry, 'поле')).filter(Boolean))],
  };
}

// REQ-PUBLISHING-004, REQ-PUBLISHING-015
export function breakingReasons(changes, declared = []) {
  return [
    ...changes.rules.added.filter((rule) => rule.level === 'директива' && rule.enabledBy === undefined)
      .map((rule) => `новое правило-директива ${rule.id}: check потребителя может стать красным`),
    ...changes.commands.removed.map((name) => `снята команда conventions ${name}`),
    ...changes.subcommands.removed.map((name) => `снята подкоманда conventions release ${name}`),
    ...changes.keys.removed.map((key) => `снят ключ conventions ${key}`),
    ...changes.clauses.removed.map((id) => `снято положение ${id}: ссылки на него у потребителя перестанут разрешаться`),
    // REQ-AUTH-020
    ...(changes.contract?.removed ?? []).filter((entry) => !entry.includes(': обязательное поле '))
      .map((entry) => `снято в контракте — ${entry}: клиент, опиравшийся на это, сломается`),
    ...(changes.contract?.added ?? []).filter((entry) => entry.includes(': обязательное поле ')
      && (changes.schemasBefore ?? []).includes(schemaOf(entry, 'обязательное поле')))
      .map((entry) => `в контракте стало обязательным — ${entry}: прежний запрос его не несёт`),
    ...declared,
  ];
}

// REQ-PUBLISHING-015, CORE-OPS-087
export function optInLines(changes) {
  return changes.rules.added.filter((rule) => rule.level === 'директива' && rule.enabledBy !== undefined)
    .map((rule) => `новое правило ${rule.id}: действует только для объявивших ${rule.enabledBy} в .conventions.json`);
}

// REQ-PUBLISHING-015
export function obligingLines(changes) {
  return [
    ...changes.obligations.added.map((one) => `обязательство ${one.id} (${one.level}, ${one.requirement}): срок ${one.dueReleases} выпуск(ов) после принятия`),
    ...changes.rules.added.filter((rule) => rule.level !== 'директива').map((rule) => `правило-рекомендация ${rule.id}`),
  ];
}

// REQ-PUBLISHING-015
export function addedLines(changes) {
  return [
    ...changes.commands.added.map((name) => `команда conventions ${name}`),
    ...changes.subcommands.added.map((name) => `подкоманда conventions release ${name}`),
    ...changes.keys.added.map((key) => `ключ conventions ${key}`),
    ...(changes.clauses.added.length === 0 ? [] : [`положений добавлено: ${changes.clauses.added.length}`]),
    // REQ-AUTH-020
    ...(changes.contract ?? { added: [] }).added.filter((entry) => !entry.includes(': обязательное поле ')).map((entry) => `в контракте — ${entry}`),
  ];
}

// REQ-PUBLISHING-015
export function declaredIn(content, heading = DECLARED_SECTION) {
  if (content === null || content === undefined) return [];
  const lines = content.split('\n');
  const start = lines.findIndex((line) => line.trim() === heading);
  if (start === -1) return [];
  const found = [];
  for (const line of lines.slice(start + 1)) {
    if (line.startsWith('## ')) break;
    const item = /^- (.+)$/.exec(line.trim());
    if (item !== null) found.push(item[1]);
  }
  return found;
}

// REQ-PUBLISHING-015
export function costSection(changes, declared = [], seesMore = []) {
  const breaking = breakingReasons(changes, declared);
  const obliging = obligingLines(changes);
  const added = addedLines(changes);
  const lines = [];
  // REQ-PUBLISHING-004
  const quiet = seesMore.length === 0
    ? 'Несовместимого нет: обновление не делает check красным и не меняет объявленного поведения.'
    : 'Несовместимого нет: требования и объявленное поведение не менялись, но проверка видит больше — см. ниже.';
  lines.push(breaking.length === 0 ? quiet : `Несовместимо (${breaking.length}) — версия обязана быть старшей:`);
  lines.push(...breaking.map((line) => `- ${line}`));
  if (seesMore.length > 0) {
    lines.push('', `Проверка видит больше (${seesMore.length}) — нарушение, прежде невидимое, может найтись:`,
      ...seesMore.map((line) => `- ${line}`));
  }
  // CORE-OPS-087
  const optIn = optInLines(changes);
  if (optIn.length > 0) {
    lines.push('', `Включается объявлением (${optIn.length}) — check краснеет только у объявивших раздел:`,
      ...optIn.map((line) => `- ${line}`));
  }
  if (obliging.length > 0) {
    lines.push('', `Обязывает (${obliging.length}):`, ...obliging.map((line) => `- ${line}`));
  }
  if (added.length > 0) {
    lines.push('', `Добавлено (${added.length}):`, ...added.map((line) => `- ${line}`));
  }
  return lines;
}

// REQ-PUBLISHING-015
export function versionOf(tag) {
  const match = /^v(\d+)\.(\d+)\.(\d+)$/.exec(tag);
  return match === null ? null : match.slice(1).map(Number);
}

// REQ-PUBLISHING-015
export function compareVersions(one, other) {
  for (let index = 0; index < 3; index += 1) {
    if (one[index] !== other[index]) return one[index] - other[index];
  }
  return 0;
}

// REQ-PUBLISHING-015
export async function releaseTags(root) {
  const { stdout } = await run('git', ['-C', root, 'tag', '-l', 'v*'], { env: environmentWithoutGit() });
  return stdout.split('\n').map((tag) => tag.trim())
    .filter((tag) => versionOf(tag) !== null)
    .sort((one, other) => compareVersions(versionOf(one), versionOf(other)));
}

// REQ-PUBLISHING-015
async function releaseDocument(root, tag) {
  const [major, minor, patch] = versionOf(tag);
  try {
    return await readFile(`${root}/docs/releases/RELEASE-${major}-${minor}-${patch}.md`, 'utf8');
  } catch {
    return null;
  }
}

// REQ-PUBLISHING-015
export async function changesHistory(root, { since = 'v1.0.0' } = {}) {
  const tags = (await releaseTags(root)).filter((tag) => compareVersions(versionOf(tag), versionOf(since)) >= 0);
  const history = [];
  let before = null;
  for (const tag of tags) {
    const after = await surfaceAt(root, tag);
    if (before !== null) {
      const changes = changesBetween(before, after);
      const document = await releaseDocument(root, tag);
      const declared = declaredIn(document);
      const seesMore = declaredIn(document, SEES_MORE_SECTION);
      history.push({ version: tag.slice(1), changes, declared, seesMore, breaking: breakingReasons(changes, declared) });
    }
    before = after;
  }
  return history;
}

// REQ-PUBLISHING-015
export async function upgradeCost(root, { from, content }) {
  if (from === null) return null;
  const changes = changesBetween(await surfaceAt(root, from), await surfaceAt(root, 'HEAD'));
  const declared = declaredIn(content);
  return { changes, declared, seesMore: declaredIn(content, SEES_MORE_SECTION), breaking: breakingReasons(changes, declared) };
}

// REQ-PUBLISHING-004, REQ-PUBLISHING-015
export function majorProblem(cost, { from, tag }) {
  if (cost === null || cost.breaking.length === 0) return null;
  const was = versionOf(from);
  const will = versionOf(tag);
  if (was === null || will === null || will[0] > was[0]) return null;
  return `Выпуск ${tag} несовместим (${cost.breaking.length}): ${cost.breaking.join('; ')}.`
    + ` Несовместимое выходит старшей версией (REQ-PUBLISHING-004): release cancel --reason "<причина>",`
    + ` затем release open --version ${was[0] + 1}.0.0 — задачи состава освободятся сами (REQ-RELEASE-044)`;
}

// REQ-PUBLISHING-015
export function reportLines(history, { from, to = null }) {
  const start = versionOf(`v${from}`);
  const end = to === null ? null : versionOf(`v${to}`);
  const taken = history.filter((entry) => {
    const version = versionOf(`v${entry.version}`);
    return compareVersions(version, start) > 0 && (end === null || compareVersions(version, end) <= 0);
  });
  if (taken.length === 0) return [`После ${from} выпусков нет: обновлять нечего.`];
  const last = taken[taken.length - 1].version;
  const breaking = taken.filter((entry) => entry.breaking.length > 0);
  const obliging = taken.flatMap((entry) => obligingLines(entry.changes));
  const sharper = taken.filter((entry) => (entry.seesMore ?? []).length > 0);
  const lines = [
    `Обновление ${from} → ${last}: выпусков ${taken.length}.`,
    breaking.length === 0
      ? 'Несовместимого нет.'
      : `Несовместимо в ${breaking.length} выпуск(ах): ${breaking.map((entry) => entry.version).join(', ')}.`,
    `Обязывает: ${obliging.length}.`,
  ];
  // REQ-PUBLISHING-004
  if (sharper.length > 0) {
    lines.push(`Проверка видит больше в ${sharper.length} выпуск(ах): ${sharper.map((entry) => entry.version).join(', ')}.`);
  }
  for (const entry of taken) {
    const section = costSection(entry.changes, entry.declared, entry.seesMore ?? []);
    const shown = entry.breaking.length === 0 ? section.slice(1).filter((line, index) => index > 0 || line !== '') : section;
    if (shown.length === 0) continue;
    lines.push('', entry.version, ...shown.map((line) => (line === '' ? '' : `  ${line}`)));
  }
  return lines;
}

// REQ-PUBLISHING-015, CORE-ARC-017
function schemaOf(entry, kind) {
  const found = new RegExp(`^(.+): ${kind} ([^.]+)\\.`).exec(entry);
  return found === null ? null : `${found[1]}: ${found[2]}`;
}
