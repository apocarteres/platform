import assert from 'node:assert/strict';
import test from 'node:test';
import path from 'node:path';
import os from 'node:os';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { DOMAIN_NOUNS, PATTERN_SUFFIXES, findNamingIssues, findNamingViolations } from '../lib/naming.mjs';

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
  const source = 'class Player {}\nclass GameCharacter {}\nclass ClanJournalLedger {}\ninterface Letter {}\nclass Fetcher {}\n';
  assert.deepEqual(findNamingIssues(source).map((issue) => issue.text), ['Fetcher']);
});

// REQ-JAVA-NAMING-005
test('record и enum — данные, а не действие: их имена на -er не проверяются', () => {
  const source = 'record Joker(String name) {}\nenum Filler { NONE }\nclass Maker {}\ninterface Fetcher {}\n';
  assert.deepEqual(findNamingIssues(source).map((issue) => issue.text), ['Maker', 'Fetcher']);
});

// REQ-JAVA-NAMING-007
test('существительные проекта из .conventions.json пропускаются, исполнитель — нет', () => {
  const source = 'class Joker {}\nclass WildJoker {}\nclass Lier {}\nclass Maker {}\n';
  assert.deepEqual(findNamingIssues(source, ['Joker', 'Lier']).map((issue) => issue.text), ['Maker']);
});

// REQ-JAVA-NAMING-007
test('перечень проекта читается из настройки, неверная запись названа', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'naming-er-'));
  try {
    await mkdir(path.join(root, 'src'), { recursive: true });
    await writeFile(path.join(root, 'src/Game.java'), 'class Joker {}\nclass Maker {}\n');
    await writeFile(path.join(root, '.conventions.json'), '{\n  "sources": ["src"],\n  "javaNaming": { "nouns": ["Joker", "joker", "Card"] }\n}\n');
    const config = { sources: ['src'], javaNaming: { nouns: ['Joker', 'joker', 'Card'] } };
    const found = await findNamingViolations(root, config);
    assert.deepEqual(found.get('src/Game.java').map((issue) => issue.text), ['Maker']);
    assert.deepEqual(found.get('.conventions.json').map((issue) => issue.text), [
      'javaNaming.nouns: «joker» — имя типа с заглавной буквы, оканчивающееся на -er',
      'javaNaming.nouns: «Card» — имя типа с заглавной буквы, оканчивающееся на -er',
    ]);
    assert.equal(found.get('.conventions.json')[0].line, 3);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
