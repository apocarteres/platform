import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';

const DEPTH = 3;
const SKIP = new Set(['node_modules', 'target', 'dist', 'build', '.git', 'coverage']);

// REQ-DEPS-002
export const CORE_MANAGED_GROUPS = [
  'io.github.apocarteres.platform',
  'org.springframework',
  'org.apache.tomcat',
];

export async function poms(root) {
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
      const full = path.join(directory, entry.name);
      if (entry.isFile() && entry.name === 'pom.xml') found.push(path.relative(root, full));
      if (entry.isDirectory() && depth < DEPTH && !SKIP.has(entry.name) && !entry.name.startsWith('.')) {
        await walk(full, depth + 1);
      }
    }
  };
  await walk(root, 0);
  return found.sort();
}

function withoutParent(source) {
  return source.replace(/<parent>[\s\S]*?<\/parent>/g, '');
}

export function projectGroup(source) {
  const body = withoutParent(source);
  const boundary = body.search(/<(?:dependencies|dependencyManagement|build|modules)>/);
  const head = boundary === -1 ? body : body.slice(0, boundary);
  const own = /<groupId>([^<]+)<\/groupId>/.exec(head)?.[1];
  if (own !== undefined) return own;
  const parent = /<parent>[\s\S]*?<\/parent>/.exec(source)?.[0] ?? '';
  return /<groupId>([^<]+)<\/groupId>/.exec(parent)?.[1] ?? '';
}

// REQ-DEPS-003
export function deadVersionProperties(source) {
  const found = [];
  for (const block of source.matchAll(/<properties>[\s\S]*?<\/properties>/g)) {
    for (const property of block[0].matchAll(/<([A-Za-z0-9_.-]*\.version)>[^<]*<\/\1>/g)) {
      const name = property[1];
      const uses = source.split(`\${${name}}`).length - 1;
      if (uses > 0) continue;
      const line = source.slice(0, block.index + property.index).split('\n').length;
      found.push({ line, text: `свойство ${name} ни на что не влияет: ссылок на него в этом POM нет` });
    }
  }
  return found;
}

// REQ-DEPS-002
export function managedVersionPins(source, groups) {
  const found = [];
  for (const chunk of source.matchAll(/<dependency>[\s\S]*?<\/dependency>/g)) {
    const group = /<groupId>([^<]+)<\/groupId>/.exec(chunk[0])?.[1] ?? '';
    const version = /<version>([^<]+)<\/version>/.exec(chunk[0]);
    if (version === null) continue;
    if (!groups.some((managed) => group === managed || group.startsWith(`${managed}.`))) continue;
    const artifact = /<artifactId>([^<]+)<\/artifactId>/.exec(chunk[0])?.[1] ?? group;
    const line = source.slice(0, chunk.index + version.index).split('\n').length;
    found.push({ line, text: `версией ${artifact} управляет ядро: уберите версию из POM` });
  }
  return found;
}

export async function findDependencyIssues(root, config) {
  const groups = [...CORE_MANAGED_GROUPS, ...(config.managedGroups ?? [])];
  const violations = new Map();
  for (const file of await poms(root)) {
    const source = await readFile(path.join(root, file), 'utf8');
    // REQ-DEPS-002
    if (groups.some((managed) => projectGroup(source) === managed)) continue;
    const found = [...deadVersionProperties(source), ...managedVersionPins(source, groups)]
      .sort((left, right) => left.line - right.line);
    if (found.length > 0) violations.set(file, found);
  }
  return violations;
}
