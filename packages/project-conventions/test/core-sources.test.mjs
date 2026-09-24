import assert from 'node:assert/strict';
import test from 'node:test';
import path from 'node:path';
import { readFile, readdir, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const CORE = path.resolve(here, '../../..');

async function isDirectory(file) {
  try {
    return (await stat(file)).isDirectory();
  } catch {
    return false;
  }
}

// REQ-PROJECT-RULES-002
async function moduleSources() {
  const found = [];
  for (const name of await readdir(CORE)) {
    if (name.startsWith('platform-') && await isDirectory(path.join(CORE, name, 'src'))) found.push(`${name}/src`);
  }
  for (const name of await readdir(path.join(CORE, 'packages'))) {
    if (await isDirectory(path.join(CORE, 'packages', name, 'src'))) found.push(`packages/${name}/src`);
  }
  return found.sort();
}

// REQ-PROJECT-RULES-002, CORE-QUAL-026
test('правила ядра видят каждый модуль Java и каждый пакет ядра', async () => {
  const config = JSON.parse(await readFile(path.join(CORE, '.conventions.json'), 'utf8'));
  const listed = new Set(config.sources);
  const missing = (await moduleSources()).filter((source) => !listed.has(source));
  assert.deepEqual(missing, [], `.conventions.json не перечисляет в "sources": ${missing.join(', ')}`);
});
