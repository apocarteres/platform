import { execFile } from 'node:child_process';
import path from 'node:path';
import { promisify } from 'node:util';
import { environmentWithoutGit } from './git.mjs';

const run = promisify(execFile);
const PACKAGE = 'packages/project-conventions';

// REQ-PUBLISHING-015
async function shown(root, ref, file) {
  try {
    const { stdout } = await run('git', ['-C', root, 'show', `${ref}:${file}`],
      { env: environmentWithoutGit(), maxBuffer: 16 * 1024 * 1024 });
    return stdout;
  } catch {
    return null;
  }
}

// REQ-PUBLISHING-015
export function rulesOf(source) {
  if (source === null) return [];
  const found = [];
  const pattern = /^\s+id: '([a-z0-9-]+)',\s*\n\s+level: (DIRECTIVE|RECOMMENDATION)/gm;
  for (const match of source.matchAll(pattern)) found.push({ id: match[1], level: match[2] === 'DIRECTIVE' ? 'директива' : 'рекомендация' });
  return found;
}

// REQ-PUBLISHING-015
function objectKeys(source, name) {
  const start = source.indexOf(`const ${name} = {`);
  if (start === -1) return null;
  const end = source.indexOf('\n};', start);
  const body = source.slice(start, end);
  return [...body.matchAll(/^ {2}'?([a-z][a-z-]*)'?:/gm)].map((match) => match[1]);
}

// REQ-PUBLISHING-015
function listedAfter(source, prefix) {
  const joined = source.replace(/'\s*\n\s*\+\s*'/g, '');
  const match = new RegExp(`${prefix} <([a-z|-]+)>`).exec(joined);
  return match === null ? [] : match[1].split('|');
}

// REQ-PUBLISHING-015
export function commandsOf(source) {
  if (source === null) return { commands: [], subcommands: [], keys: {} };
  const commands = objectKeys(source, 'USAGE') ?? listedAfter(source, 'conventions');
  const subcommands = objectKeys(source, 'RELEASE_USAGE') ?? listedAfter(source, 'conventions release');
  const keys = {};
  for (const [table, prefix] of [['SPEC', ''], ['RELEASE_SPEC', 'release ']]) {
    const start = source.indexOf(`const ${table} = {`);
    if (start === -1) continue;
    const body = source.slice(start, source.indexOf('\n};', start));
    for (const line of body.split('\n')) {
      const entry = /^ {2}'?([a-z][a-z-]*)'?: \{(.*)\},?$/.exec(line);
      if (entry === null) continue;
      keys[`${prefix}${entry[1]}`] = [...entry[2].matchAll(/'(--[a-z-]+)'/g)].map((match) => match[1]).sort();
    }
  }
  return { commands: commands.filter((name) => name !== 'release'), subcommands, keys };
}

// REQ-PUBLISHING-015
function deliveredOf(source) {
  if (source === null) return [];
  const start = source.indexOf('DELIVERED_DOCUMENTS = [');
  if (start === -1) return [];
  const body = source.slice(start, source.indexOf('];', start));
  return [...body.matchAll(/'([a-z0-9-]+\.md)'/g)].map((match) => match[1]);
}

// REQ-PUBLISHING-015
function clausesOf(text) {
  return [...(text ?? '').matchAll(/<a id="(REQ-[A-Z0-9-]+-\d+)"><\/a>/g)].map((match) => match[1]);
}

// REQ-PUBLISHING-015
function obligationsOf(catalogue) {
  try {
    return (JSON.parse(catalogue ?? '{}').obligations ?? [])
      .map((one) => ({ id: one.id, level: one.level, dueReleases: one.dueReleases, requirement: one.requirement }));
  } catch {
    return [];
  }
}

// REQ-PUBLISHING-015, REQ-AUTH-020, REQ-SUPPORT-013, REQ-NOTIFICATIONS-008
export const CONTRACTS = [
  'platform-auth/src/main/resources/openapi/platform-auth.openapi.json',
  'platform-support/src/main/resources/openapi/platform-support.openapi.json',
  'platform-notifications/src/main/resources/openapi/platform-notifications.openapi.json',
];

// REQ-PUBLISHING-015, REQ-AUTH-020
export function contractOf(source, name = 'контракт') {
  let document;
  try {
    document = JSON.parse(source ?? 'null');
  } catch {
    return [];
  }
  if (document === null) return [];
  const found = [];
  for (const [route, operations] of Object.entries(document.paths ?? {})) {
    for (const [method, operation] of Object.entries(operations)) {
      const at = `${method.toUpperCase()} ${route}`;
      found.push(`${name}: точка ${at}`);
      for (const status of Object.keys(operation.responses ?? {})) {
        if (status.startsWith('2')) found.push(`${name}: ответ ${status} у ${at}`);
      }
    }
  }
  for (const [schema, definition] of Object.entries(document.components?.schemas ?? {})) {
    for (const field of Object.keys(definition.properties ?? {})) found.push(`${name}: поле ${schema}.${field}`);
    for (const field of definition.required ?? []) found.push(`${name}: обязательное поле ${schema}.${field}`);
    // REQ-SUPPORT-013
    for (const value of definition.enum ?? []) found.push(`${name}: значение ${schema} ${value}`);
  }
  return found.sort();
}

// REQ-PUBLISHING-015
export async function surfaceAt(root, ref) {
  const cli = await shown(root, ref, `${PACKAGE}/bin/conventions.mjs`);
  const rules = rulesOf(await shown(root, ref, `${PACKAGE}/lib/rules.mjs`));
  const delivered = deliveredOf(await shown(root, ref, `${PACKAGE}/lib/documents.mjs`));
  const clauses = [];
  for (const document of delivered) clauses.push(...clausesOf(await shown(root, ref, `docs/requirements/${document}`)));
  const obligations = obligationsOf(await shown(root, ref, `${PACKAGE}/obligations.json`));
  const contract = [];
  for (const file of CONTRACTS) contract.push(...contractOf(await shown(root, ref, file), path.basename(file, '.openapi.json')));
  return { ...commandsOf(cli), rules, clauses: [...new Set(clauses)].sort(), obligations, contract };
}
