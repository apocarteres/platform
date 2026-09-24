import assert from 'node:assert/strict';
import test from 'node:test';
import path from 'node:path';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { DOMAIN_NOUNS, PATTERN_SUFFIXES, findNamingIssues } from '../lib/naming.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));

async function listed(clause) {
  const text = await readFile(path.resolve(here, '../../../docs/requirements/java-naming.md'), 'utf8');
  const line = text.split('\n').find((one) => one.includes(`id="${clause}"`));
  const start = line.indexOf('Разрешены');
  const list = line.slice(start, line.indexOf('`.', start) + 1);
  return [...list.matchAll(/`([A-Z]\w*)`/g)].map((match) => match[1]);
}

// REQ-JAVA-NAMING-002, REQ-JAVA-NAMING-003
test('перечни правила совпадают с перечнями требования', async () => {
  assert.deepEqual(await listed('REQ-JAVA-NAMING-002'), PATTERN_SUFFIXES);
  assert.deepEqual(await listed('REQ-JAVA-NAMING-003'), DOMAIN_NOUNS);
});

// REQ-JAVA-NAMING-001, REQ-JAVA-NAMING-003
test('существительные предметной области проходят, имя исполнителя — нет', () => {
  const source = 'record Player() {}\nclass GameCharacter {}\nclass ClanJournalLedger {}\nrecord Letter() {}\nclass Fetcher {}\n';
  assert.deepEqual(findNamingIssues(source).map((issue) => issue.text), ['Fetcher']);
});
