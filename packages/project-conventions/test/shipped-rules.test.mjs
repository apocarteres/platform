import assert from 'node:assert/strict';
import test from 'node:test';
import path from 'node:path';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const core = path.resolve(here, '../../..');
const RULES_FILE = 'platform-arch-rules/src/main/java/io/github/apocarteres/platform/arch/PlatformArchRules.java';
const TESTS_FILE = 'platform-arch-rules/src/test/java/io/github/apocarteres/platform/arch/PlatformArchRulesTest.java';
const CLAUSE = /REQ-[A-Z-]+-\d{3}/g;
const REFUSAL = /assertThatThrownBy|violationsOf/;

function clausesOf(comment) {
  return comment === undefined ? [] : [...comment.matchAll(CLAUSE)].map((found) => found[0]);
}

// REQ-PUBLISHING-012
function assertedClauses(source) {
  const found = new Set();
  const lines = source.split('\n');
  lines.forEach((line, index) => {
    if (!/public static ArchRule /.test(line)) return;
    for (const clause of clausesOf(lines[index - 1])) found.add(clause);
  });
  return found;
}

// REQ-PUBLISHING-012
function casesByClause(source) {
  const cases = new Map();
  const blocks = source.split(/\n  @Test\n/).slice(1);
  const comments = [...source.matchAll(/\n(\s*\/\/ REQ-[^\n]*)\n  @Test\n/g)].map((found) => found[1]);
  blocks.forEach((block, index) => {
    const body = block.split('\n  }')[0];
    const kind = REFUSAL.test(body) ? 'refuses' : 'passes';
    for (const clause of clausesOf(comments[index])) {
      if (!cases.has(clause)) cases.set(clause, new Set());
      cases.get(clause).add(kind);
    }
  });
  return cases;
}

// REQ-PUBLISHING-012
test('у каждого готового правила есть и запрещённый случай, и разрешённый', async () => {
  const rules = assertedClauses(await readFile(path.join(core, RULES_FILE), 'utf8'));
  const cases = casesByClause(await readFile(path.join(core, TESTS_FILE), 'utf8'));
  assert.ok(rules.size > 0, 'правила не найдены');

  const missing = [];
  for (const clause of [...rules].sort()) {
    const kinds = cases.get(clause) ?? new Set();
    if (!kinds.has('refuses')) missing.push(`${clause}: нет случая, на котором правило отказывает`);
    if (!kinds.has('passes')) missing.push(`${clause}: нет случая, который правило пропускает`);
  }

  assert.deepEqual(missing, [], missing.join('\n'));
});
