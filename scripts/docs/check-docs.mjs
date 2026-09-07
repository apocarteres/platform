#!/usr/bin/env node

import { readdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { validateReleases, releaseStatuses } from './release-model.mjs';
import { parseFrontMatter, validateTicket } from './ticket-model.mjs';
import { pathToFileURL } from 'node:url';

const REQUIRED_METADATA_FIELDS = ['id', 'type', 'status', 'scope', 'authority'];
const DOCUMENT_REFERENCE_FIELDS = ['depends-on', 'supersedes', 'superseded-by', 'related'];
const OPTIONAL_METADATA_FIELDS = [...DOCUMENT_REFERENCE_FIELDS, 'clause-id-prefix', 'priority', 'questions', 'release', 'opened-on', 'released-on', 'commit'];
const ALLOWED_METADATA_FIELDS = new Set([
  ...REQUIRED_METADATA_FIELDS,
  ...OPTIONAL_METADATA_FIELDS,
]);

const STATUS_BY_TYPE = new Map([
  ['release', releaseStatuses],
  ['index', new Set(['active'])],
  ['requirement', new Set(['draft', 'active', 'superseded'])],
  ['decision', new Set(['proposed', 'accepted', 'rejected', 'superseded'])],
  ['runbook', new Set(['active', 'retired'])],
  ['ticket', new Set(['backlog', 'in_progress', 'blocked', 'done', 'cancelled', 'superseded'])],
  ['reference', new Set(['active', 'retired', 'superseded'])],
]);

const ALLOWED_AUTHORITIES = new Set(['normative', 'supporting', 'historical', 'navigation']);
const REQUIRED_CATALOG_TARGETS = [
  'docs/REQUIREMENTS.md',
  'docs/decisions/INDEX.md',
  'docs/runbooks/INDEX.md',
  'docs/tickets/INDEX.md',
  'docs/releases/INDEX.md',
];

async function walkFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];

  for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...await walkFiles(entryPath));
    } else if (entry.isFile()) {
      files.push(entryPath);
    }
  }

  return files;
}

function toProjectPath(projectRoot, filePath) {
  return path.relative(projectRoot, filePath).split(path.sep).join('/');
}

function requiresMetadata(relativePath) {
  return relativePath.startsWith('docs/') && relativePath.endsWith('.md');
}

function validateMetadata(relativePath, parsed, errors, ids, references) {
  if (!parsed) {
    if (requiresMetadata(relativePath)) {
      errors.push(`${relativePath}: отсутствует YAML front matter`);
    }
    return;
  }

  if (parsed.error) {
    errors.push(`${relativePath}: ${parsed.error}`);
    return;
  }

  const { metadata } = parsed;
  for (const field of REQUIRED_METADATA_FIELDS) {
    if (!metadata.get(field)) {
      errors.push(`${relativePath}: отсутствует обязательное поле ${field}`);
    }
  }

  for (const field of metadata.keys()) {
    if (!ALLOWED_METADATA_FIELDS.has(field)) {
      errors.push(`${relativePath}: неизвестное поле метаданных ${field}`);
    }
  }

  const id = metadata.get('id');
  if (id && !/^[A-Z][A-Z0-9-]*$/.test(id)) {
    errors.push(`${relativePath}: идентификатор ${id} должен состоять из заглавных латинских букв, цифр и дефисов`);
  }
  if (id) {
    const existingPath = ids.get(id);
    if (existingPath) {
      errors.push(`${relativePath}: идентификатор ${id} уже используется в ${existingPath}`);
    } else {
      ids.set(id, relativePath);
    }
  }

  const type = metadata.get('type');
  const status = metadata.get('status');
  const allowedStatuses = STATUS_BY_TYPE.get(type);
  if (type && !allowedStatuses) {
    errors.push(`${relativePath}: неизвестный тип документа ${type}`);
  } else if (status && allowedStatuses && !allowedStatuses.has(status)) {
    errors.push(`${relativePath}: состояние ${status} недопустимо для типа ${type}`);
  }

  const scope = metadata.get('scope');
  if (scope && !/^[a-z0-9-]+(?:, [a-z0-9-]+)*$/.test(scope)) {
    errors.push(`${relativePath}: scope должен содержать области в kebab-case через запятую и пробел`);
  }

  const authority = metadata.get('authority');
  if (authority && !ALLOWED_AUTHORITIES.has(authority)) {
    errors.push(`${relativePath}: неизвестная роль authority ${authority}`);
  }

  for (const field of DOCUMENT_REFERENCE_FIELDS) {
    const value = metadata.get(field);
    if (value && !/^[A-Z][A-Z0-9-]*(?:, [A-Z][A-Z0-9-]*)*$/.test(value)) {
      errors.push(`${relativePath}: ${field} должен содержать идентификаторы документов через запятую и пробел`);
    } else if (value) {
      references.push({
        field,
        relativePath,
        targetIds: value.split(', '),
      });
    }
  }

  if (status === 'superseded' && !metadata.get('superseded-by')) {
    errors.push(`${relativePath}: заменённый документ должен содержать поле superseded-by`);
  }
  if (status !== 'superseded' && metadata.get('superseded-by')) {
    errors.push(`${relativePath}: поле superseded-by допустимо только для заменённого документа`);
  }

  const clauseIdPrefix = metadata.get('clause-id-prefix');
  if (clauseIdPrefix && !/^[A-Z][A-Z0-9-]*$/.test(clauseIdPrefix)) {
    errors.push(`${relativePath}: clause-id-prefix должен состоять из заглавных латинских букв, цифр и дефисов`);
  }
  if (clauseIdPrefix && clauseIdPrefix !== id) {
    errors.push(`${relativePath}: clause-id-prefix должен совпадать с идентификатором документа ${id}`);
  }
  if (clauseIdPrefix && (type !== 'requirement' || authority !== 'normative')) {
    errors.push(`${relativePath}: стабильные идентификаторы положений допустимы только для нормативных требований`);
  }
}

function validateLegacyHeaderFields(relativePath, content, parsed, errors) {
  if (!parsed?.metadata) {
    return;
  }

  const headerLines = content
    .split(/\r?\n/)
    .slice(parsed.closingIndex + 1, parsed.closingIndex + 13);
  const legacyField = headerLines.find((line) => /^(?:Status|Статус|Date|Дата|Depends on|Зависит от):/.test(line));
  if (legacyField) {
    errors.push(`${relativePath}: поле ${legacyField.split(':', 1)[0]} должно храниться только в YAML front matter`);
  }

  if (parsed.metadata.get('type') === 'requirement'
      && parsed.metadata.get('status') === 'active'
      && /^> Требует уточнения:/m.test(content)) {
    errors.push(`${relativePath}: нерешённый вопрос должен находиться в proposed-решении или открытой задаче`);
  }
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function validateRequirementClauses(relativePath, content, parsed, errors, clauseIds) {
  const prefix = parsed?.metadata?.get('clause-id-prefix');
  if (!prefix) {
    return;
  }

  const expectedId = new RegExp(`^${escapeRegExp(prefix)}-\\d{3}$`);
  const clausePattern = /^(\d+(?:\.\d+)*\.)\s+<a id="([A-Z][A-Z0-9-]*)"><\/a>\s+\*\*([A-Z][A-Z0-9-]*)\*\*\s+—\s+\S/;
  let clauseCount = 0;
  let inFence = false;

  for (const [index, line] of content.split(/\r?\n/).entries()) {
    if (/^\s*```/.test(line)) {
      inFence = !inFence;
      continue;
    }
    if (inFence || !/^\d+(?:\.\d+)*\.\s+/.test(line)) {
      continue;
    }

    const match = clausePattern.exec(line);
    if (!match) {
      errors.push(`${relativePath}:${index + 1}: нумерованное положение должно начинаться со стабильного якоря и видимого идентификатора`);
      continue;
    }

    const anchorId = match[2];
    const visibleId = match[3];
    if (anchorId !== visibleId) {
      errors.push(`${relativePath}:${index + 1}: якорь ${anchorId} и видимый идентификатор ${visibleId} не совпадают`);
      continue;
    }
    if (!expectedId.test(anchorId)) {
      errors.push(`${relativePath}:${index + 1}: идентификатор положения ${anchorId} должен иметь формат ${prefix}-NNN`);
      continue;
    }

    clauseCount += 1;
    const existingLocation = clauseIds.get(anchorId);
    if (existingLocation) {
      errors.push(`${relativePath}:${index + 1}: идентификатор положения ${anchorId} уже используется в ${existingLocation}`);
    } else {
      clauseIds.set(anchorId, `${relativePath}:${index + 1}`);
    }
  }

  if (clauseCount === 0) {
    errors.push(`${relativePath}: clause-id-prefix указан, но положения со стабильными идентификаторами отсутствуют`);
  }
}

function extractMarkdownLinks(content) {
  const links = [];
  const pattern = /!?\[[^\]]*\]\((<[^>]+>|[^)\s]+)(?:\s+(?:"[^"]*"|'[^']*'))?\)/g;
  let match;

  while ((match = pattern.exec(content)) !== null) {
    links.push(match[1].replace(/^<|>$/g, ''));
  }

  return links;
}

function githubSlug(heading) {
  return heading
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/<[^>]+>/g, '')
    .replace(/[`*_~]/g, '')
    .toLocaleLowerCase('ru-RU')
    .replace(/[^\p{L}\p{N}\s_-]/gu, '')
    .trim()
    .replace(/\s+/g, '-');
}

function collectAnchors(content) {
  const anchors = new Set();
  const slugCounts = new Map();
  let inFence = false;

  for (const line of content.split(/\r?\n/)) {
    if (/^\s*```/.test(line)) {
      inFence = !inFence;
      continue;
    }
    if (inFence) {
      continue;
    }

    const headingMatch = /^#{1,6}\s+(.+?)\s*#*\s*$/.exec(line);
    if (headingMatch) {
      const baseSlug = githubSlug(headingMatch[1]);
      const occurrence = slugCounts.get(baseSlug) ?? 0;
      const slug = occurrence === 0 ? baseSlug : `${baseSlug}-${occurrence}`;
      slugCounts.set(baseSlug, occurrence + 1);
      anchors.add(slug);
    }

    const explicitAnchorPattern = /<a\s+(?:id|name)=["']([^"']+)["'][^>]*>/gi;
    let anchorMatch;
    while ((anchorMatch = explicitAnchorPattern.exec(line)) !== null) {
      anchors.add(anchorMatch[1]);
    }
  }

  return anchors;
}

function splitLink(link) {
  const hashIndex = link.indexOf('#');
  if (hashIndex === -1) {
    return { target: link, anchor: null };
  }
  return {
    target: link.slice(0, hashIndex),
    anchor: link.slice(hashIndex + 1),
  };
}

function isExternalLink(link) {
  return /^(?:https?:|mailto:|tel:|data:)/i.test(link);
}

async function resolveLocalLink(projectRoot, sourcePath, link) {
  if (isExternalLink(link)) {
    return null;
  }

  const { target, anchor } = splitLink(link);
  let decodedTarget;
  let decodedAnchor;
  try {
    decodedTarget = decodeURIComponent(target.split('?')[0]);
    decodedAnchor = anchor === null ? null : decodeURIComponent(anchor);
  } catch {
    return { error: `некорректное URL-кодирование в ссылке ${link}` };
  }

  const targetPath = decodedTarget === ''
    ? sourcePath
    : path.resolve(path.dirname(sourcePath), decodedTarget);

  try {
    const targetStat = await stat(targetPath);
    if (!targetStat.isFile() && !targetStat.isDirectory()) {
      return { error: `ссылка ${link} не указывает на файл или каталог` };
    }
  } catch {
    return { error: `цель ссылки ${link} не существует` };
  }

  if (decodedAnchor && path.extname(targetPath).toLowerCase() === '.md') {
    const targetContent = await readFile(targetPath, 'utf8');
    if (!collectAnchors(targetContent).has(decodedAnchor)) {
      return { error: `якорь #${decodedAnchor} отсутствует в ${toProjectPath(projectRoot, targetPath)}` };
    }
  }

  return { targetPath };
}

async function collectIndexTargets(projectRoot, indexPath) {
  const content = await readFile(indexPath, 'utf8');
  const targets = new Set();

  for (const link of extractMarkdownLinks(content)) {
    const resolved = await resolveLocalLink(projectRoot, indexPath, link);
    if (resolved?.targetPath) {
      targets.add(path.resolve(resolved.targetPath));
    }
  }

  return targets;
}

async function readDirectoryEntries(directory) {
  try {
    return await readdir(directory, { withFileTypes: true });
  } catch (error) {
    if (error.code === 'ENOENT') return [];
    throw error;
  }
}

async function checkIndexCoverage(projectRoot, directory, indexPath, errors) {
  const targets = await collectIndexTargets(projectRoot, indexPath);
  const entries = await readDirectoryEntries(directory);

  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith('.md') || entry.name === path.basename(indexPath)) {
      continue;
    }
    const requiredPath = path.resolve(directory, entry.name);
    if (!targets.has(requiredPath)) {
      errors.push(`${toProjectPath(projectRoot, indexPath)}: отсутствует ссылка на ${toProjectPath(projectRoot, requiredPath)}`);
    }
  }
}

async function checkChildIndexCoverage(projectRoot, directory, indexPath, errors) {
  const targets = await collectIndexTargets(projectRoot, indexPath);
  const entries = await readDirectoryEntries(directory);

  for (const entry of entries) {
    if (!entry.isDirectory()) {
      continue;
    }
    const requiredPath = path.resolve(directory, entry.name, 'INDEX.md');
    try {
      const requiredStat = await stat(requiredPath);
      if (!requiredStat.isFile()) {
        errors.push(`${toProjectPath(projectRoot, requiredPath)}: индекс подраздела не является файлом`);
        continue;
      }
    } catch {
      errors.push(`${toProjectPath(projectRoot, requiredPath)}: отсутствует индекс подраздела`);
      continue;
    }

    if (!targets.has(requiredPath)) {
      errors.push(`${toProjectPath(projectRoot, indexPath)}: отсутствует ссылка на ${toProjectPath(projectRoot, requiredPath)}`);
    }
  }
}

export async function checkDocumentation(projectRoot) {
  const resolvedRoot = path.resolve(projectRoot);
  const docsRoot = path.join(resolvedRoot, 'docs');
  const files = await walkFiles(docsRoot);
  const markdownFiles = files.filter((file) => file.endsWith('.md'));
  const errors = [];
  const ids = new Map();
  const clauseIds = new Map();
  const references = [];
  const documents = [];

  for (const filePath of markdownFiles) {
    const relativePath = toProjectPath(resolvedRoot, filePath);
    const content = await readFile(filePath, 'utf8');
    const parsed = parseFrontMatter(content);
    if (parsed?.metadata) documents.push({ file: relativePath, content, metadata: parsed.metadata });
    validateMetadata(relativePath, parsed, errors, ids, references);
    errors.push(...validateTicket(relativePath, content, parsed));
    validateLegacyHeaderFields(relativePath, content, parsed, errors);
    validateRequirementClauses(relativePath, content, parsed, errors, clauseIds);

    for (const link of extractMarkdownLinks(content)) {
      const resolved = await resolveLocalLink(resolvedRoot, filePath, link);
      if (resolved?.error) {
        errors.push(`${relativePath}: ${resolved.error}`);
      }
    }
  }

  errors.push(...validateReleases(documents));

  for (const reference of references) {
    for (const targetId of reference.targetIds) {
      if (!ids.has(targetId)) {
        errors.push(`${reference.relativePath}: поле ${reference.field} ссылается на неизвестный документ ${targetId}`);
      }
    }
  }

  await checkIndexCoverage(
    resolvedRoot,
    path.join(docsRoot, 'requirements'),
    path.join(docsRoot, 'REQUIREMENTS.md'),
    errors,
  );
  await checkIndexCoverage(
    resolvedRoot,
    path.join(docsRoot, 'runbooks'),
    path.join(docsRoot, 'runbooks', 'INDEX.md'),
    errors,
  );
  await checkIndexCoverage(
    resolvedRoot,
    path.join(docsRoot, 'decisions'),
    path.join(docsRoot, 'decisions', 'INDEX.md'),
    errors,
  );

  await checkIndexCoverage(resolvedRoot, path.join(docsRoot, 'releases'),
    path.join(docsRoot, 'releases/INDEX.md'), errors);

  const ticketsRoot = path.join(docsRoot, 'tickets');
  await checkIndexCoverage(
    resolvedRoot,
    ticketsRoot,
    path.join(ticketsRoot, 'INDEX.md'),
    errors,
  );
  await checkIndexCoverage(
    resolvedRoot,
    path.join(ticketsRoot, 'closed'),
    path.join(ticketsRoot, 'closed', 'INDEX.md'),
    errors,
  );

  const featuresRoot = path.join(ticketsRoot, 'features');
  const featuresIndex = path.join(featuresRoot, 'INDEX.md');
  await checkChildIndexCoverage(resolvedRoot, featuresRoot, featuresIndex, errors);
  const featureEntries = await readDirectoryEntries(featuresRoot);
  for (const entry of featureEntries) {
    if (!entry.isDirectory()) {
      continue;
    }
    const featureDirectory = path.join(featuresRoot, entry.name);
    await checkIndexCoverage(
      resolvedRoot,
      featureDirectory,
      path.join(featureDirectory, 'INDEX.md'),
      errors,
    );
  }

  const documentationIndex = path.join(docsRoot, 'INDEX.md');
  const documentationTargets = await collectIndexTargets(resolvedRoot, documentationIndex);
  for (const requiredTarget of REQUIRED_CATALOG_TARGETS) {
    const absoluteTarget = path.join(resolvedRoot, requiredTarget);
    if (!documentationTargets.has(absoluteTarget)) {
      errors.push(`docs/INDEX.md: отсутствует ссылка на ${requiredTarget}`);
    }
  }

  return {
    errors: [...new Set(errors)].sort(),
    markdownCount: markdownFiles.length,
    requirementClauseCount: clauseIds.size,
  };
}

async function main() {
  const projectRoot = process.argv[2] ?? process.cwd();
  const result = await checkDocumentation(projectRoot);
  if (result.errors.length > 0) {
    console.error(`Проверка документации завершилась с ошибками (${result.errors.length}):`);
    for (const error of result.errors) {
      console.error(`- ${error}`);
    }
    process.exitCode = 1;
    return;
  }

  console.log(`Документация проверена: ${result.markdownCount} Markdown-документов, ${result.requirementClauseCount} стабильных положений.`);
}

const entryPoint = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : null;
if (entryPoint === import.meta.url) {
  await main();
}
