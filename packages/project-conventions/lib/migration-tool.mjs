import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

// REQ-DATA-ACCESS-008
const BUILD_FILES = new Set(['pom.xml', 'build.gradle', 'build.gradle.kts']);

// REQ-DATA-ACCESS-008
const SKIPPED = new Set(['node_modules', 'target', 'build', 'dist', '.git']);

// REQ-DATA-ACCESS-008
const FLYWAY = /org\.flywaydb/;

async function buildFiles(root, relative = '') {
  const found = [];
  for (const entry of await readdir(path.join(root, relative), { withFileTypes: true })) {
    const at = relative === '' ? entry.name : `${relative}/${entry.name}`;
    if (entry.isDirectory() && !SKIPPED.has(entry.name) && !entry.name.startsWith('.')) found.push(...await buildFiles(root, at));
    else if (entry.isFile() && BUILD_FILES.has(entry.name)) found.push(at);
  }
  return found;
}

// REQ-DATA-ACCESS-008
export async function findFlyway(root) {
  const violations = new Map();
  for (const file of await buildFiles(root)) {
    const lines = (await readFile(path.join(root, file), 'utf8')).split('\n');
    const at = lines.findIndex((line) => FLYWAY.test(line));
    if (at === -1) continue;
    violations.set(file, [{
      line: at + 1,
      text: 'переходы базы ведёт Flyway, а инструмент ядра — Liquibase (REQ-DATA-ACCESS-007):'
        + ' переезд — обязательство liquibase-migrations, порядок — changelogSync журналов ядра (REQ-DATA-ACCESS-008)',
    }]);
  }
  return violations;
}
