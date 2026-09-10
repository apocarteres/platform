import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';

export const MISE_FILE = 'mise.toml';
const DEPTH = 2;
const SKIP = new Set(['node_modules', 'target', 'dist', 'build', '.git', 'coverage']);

async function read(root, file) {
  try {
    return await readFile(path.join(root, file), 'utf8');
  } catch (error) {
    if (error.code === 'ENOENT' || error.code === 'ENOTDIR' || error.code === 'EISDIR') return null;
    throw error;
  }
}

export function miseTools(source) {
  const tools = new Map();
  let inside = false;
  for (const raw of source.split('\n')) {
    const line = raw.trim();
    if (line.startsWith('[')) {
      inside = line === '[tools]';
      continue;
    }
    if (!inside) continue;
    const match = /^([A-Za-z0-9_.-]+)\s*=\s*"([^"]+)"/.exec(line);
    if (match !== null) tools.set(match[1], match[2]);
  }
  return tools;
}

// REQ-BUILD-010
export function rangeAccepts(range, version) {
  const [major, minor, patch] = version.split('.').map(Number);
  return range.split('||').some((part) => {
    const clause = part.trim();
    const match = /^([\^~]|>=|>|=)?\s*(\d+)(?:\.(\d+))?(?:\.(\d+))?$/.exec(clause);
    if (match === null) return false;
    const [, operator = '=', rawMajor, rawMinor, rawPatch] = match;
    const [wantMajor, wantMinor, wantPatch] = [Number(rawMajor), Number(rawMinor ?? 0), Number(rawPatch ?? 0)];
    const atLeast = major > wantMajor
      || (major === wantMajor && (minor > wantMinor || (minor === wantMinor && patch >= wantPatch)));
    if (operator === '^') return major === wantMajor && atLeast;
    if (operator === '~') return major === wantMajor && minor === wantMinor && patch >= wantPatch;
    if (operator === '>=') return atLeast;
    if (operator === '>') return atLeast && version !== `${wantMajor}.${wantMinor}.${wantPatch}`;
    if (rawMinor === undefined) return major === wantMajor;
    if (rawPatch === undefined) return major === wantMajor && minor === wantMinor;
    return major === wantMajor && minor === wantMinor && patch === wantPatch;
  });
}

const JAVA_TARGET_PROPERTIES = ['java.version', 'maven.compiler.release', 'maven.compiler.source', 'maven.compiler.target'];

// REQ-BUILD-010
export function javaTargets(source) {
  const declared = [];
  const add = (label, version) => {
    const value = version.trim();
    if (!value.startsWith('${')) declared.push({ label, major: value.split('.')[0] });
  };
  for (const property of JAVA_TARGET_PROPERTIES) {
    const tag = property.replaceAll('.', '\\.');
    for (const match of source.matchAll(new RegExp(`<${tag}>([^<]+)</${tag}>`, 'g'))) {
      add(`<${property}>${match[1].trim()}</${property}>`, match[1]);
    }
  }
  for (const plugin of source.matchAll(/<plugin>([\s\S]*?)<\/plugin>/g)) {
    if (!plugin[1].includes('<artifactId>maven-compiler-plugin</artifactId>')) continue;
    for (const match of plugin[1].matchAll(/<release>([^<]+)<\/release>/g)) {
      add(`<release>${match[1].trim()}</release> в maven-compiler-plugin`, match[1]);
    }
  }
  return declared;
}

async function manifests(root, name) {
  const found = [];
  const walk = async (directory, depth) => {
    let entries;
    try {
      entries = await readdir(directory, { withFileTypes: true });
    } catch (error) {
      if (error.code === 'ENOENT' || error.code === 'ENOTDIR') return;
      throw error;
    }
    for (const entry of entries) {
      if (entry.isFile() && entry.name === name) found.push(path.relative(root, path.join(directory, entry.name)));
      if (entry.isDirectory() && depth < DEPTH && !SKIP.has(entry.name) && !entry.name.startsWith('.')) {
        await walk(path.join(directory, entry.name), depth + 1);
      }
    }
  };
  await walk(root, 0);
  return found.sort();
}

export async function findToolchainMismatches(root) {
  const mise = await read(root, MISE_FILE);
  if (mise === null) return [`${MISE_FILE} отсутствует: версии инструментов закрепляются им (REQ-BUILD-003)`];
  const tools = miseTools(mise);
  const problems = [];

  const node = tools.get('node');
  for (const mirror of ['.nvmrc', '.node-version']) {
    const content = await read(root, mirror);
    if (content === null) continue;
    const pinned = content.trim();
    if (node === undefined) problems.push(`${mirror}: версия ${pinned} закреплена, а в ${MISE_FILE} node не объявлен`);
    else if (pinned !== node) problems.push(`${mirror}: ${pinned} против node = ${node} в ${MISE_FILE}`);
  }

  const toolVersions = await read(root, '.tool-versions');
  if (toolVersions !== null) {
    for (const line of toolVersions.split('\n')) {
      const match = /^([A-Za-z0-9_.-]+)\s+(\S+)/.exec(line.trim());
      if (match === null) continue;
      const [, tool, version] = match;
      const pinned = tools.get(tool);
      if (pinned !== undefined && pinned !== version) {
        problems.push(`.tool-versions: ${tool} ${version} против ${tool} = ${pinned} в ${MISE_FILE}`);
      }
    }
  }

  if (node !== undefined) {
    for (const manifest of await manifests(root, 'package.json')) {
      const parsed = JSON.parse(await read(root, manifest));
      const range = parsed.engines?.node;
      if (range === undefined) continue;
      if (!rangeAccepts(range, node)) problems.push(`${manifest}: node ${node} не входит в engines.node "${range}"`);
    }
  }

  const java = tools.get('java');
  if (java !== undefined) {
    for (const manifest of await manifests(root, 'pom.xml')) {
      const targets = javaTargets(await read(root, manifest));
      if (targets.length === 0) continue;
      const majors = new Set(targets.map((target) => target.major));
      if (majors.size > 1) {
        problems.push(`${manifest}: цель компиляции объявлена по-разному: ${targets.map((target) => target.label).join(', ')}`);
        continue;
      }
      if (targets[0].major !== java.split('.')[0]) {
        problems.push(`${manifest}: ${targets[0].label} против java = ${java} в ${MISE_FILE}`);
      }
    }
  }

  return problems;
}
