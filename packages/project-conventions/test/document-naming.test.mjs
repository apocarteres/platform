import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { TICKET_AREAS, findNamingIssues, nameIssue } from '../lib/document-naming.mjs';
import { areaFor, migrate, plan, slugFor } from '../lib/naming-migration.mjs';

function metadata(entries) {
  return new Map(Object.entries(entries));
}

async function project(files) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'document-naming-'));
  for (const [name, content] of Object.entries(files)) {
    const target = path.join(root, name);
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, content);
  }
  return root;
}

function ticket(id, scope, extra = '') {
  return `---\nid: ${id}\ntype: ticket\nstatus: done\nscope: ${scope}\nauthority: supporting\npriority: P2\nrelease: unassigned\n${extra}---\n\n# ${id}\n`;
}

test('имя файла задачи и идентификатор проверяются друг против друга', () => {
  const good = metadata({ id: 'ARC-012', type: 'ticket' });
  assert.equal(nameIssue('docs/tickets/ARC-012-split-the-god-service.md', good, TICKET_AREAS), null);
  assert.match(nameIssue('docs/tickets/split-the-god-service.md', good, TICKET_AREAS), /<ОБЛАСТЬ>-<NNN>-<слаг>/);
  assert.match(nameIssue('docs/tickets/ARC-013-split.md', good, TICKET_AREAS), /ожидается ARC-013/);
  assert.match(nameIssue('docs/tickets/XXX-001-thing.md', metadata({ id: 'XXX-001', type: 'ticket' }), TICKET_AREAS), /область из перечня/);
  assert.equal(nameIssue('docs/tickets/XXX-001-thing.md', metadata({ id: 'XXX-001', type: 'ticket' }), [...TICKET_AREAS, 'XXX']), null);
});

test('решение, выпуск и требование проверяются по своим правилам', () => {
  assert.equal(nameIssue('docs/decisions/ADR-0003-local-publishing.md', metadata({ id: 'ADR-0003', type: 'decision' }), TICKET_AREAS), null);
  assert.match(nameIssue('docs/decisions/ADR-3-local.md', metadata({ id: 'ADR-0003', type: 'decision' }), TICKET_AREAS), /ADR-NNNN/);
  assert.equal(nameIssue('docs/releases/RELEASE-2026-09-1.md', metadata({ id: 'RELEASE-2026-09-1', type: 'release' }), TICKET_AREAS), null);
  assert.match(nameIssue('docs/releases/september.md', metadata({ id: 'RELEASE-2026-09-1', type: 'release' }), TICKET_AREAS), /совпадать с идентификатором/);
  assert.equal(nameIssue('docs/requirements/dependencies.md', metadata({ id: 'REQ-DEPS', type: 'requirement' }), TICKET_AREAS), null, 'имя файла требования описательно');
  assert.match(nameIssue('docs/requirements/Dependencies.md', metadata({ id: 'REQ-DEPS', type: 'requirement' }), TICKET_AREAS), /слагом/);
  assert.equal(nameIssue('docs/tickets/INDEX.md', metadata({ id: 'IDX-TICKETS', type: 'index' }), TICKET_AREAS), null);
});

test('область выводится из областей задачи, план функции — всегда FEAT', () => {
  assert.equal(areaFor(metadata({ id: 'X', scope: 'backend, security' }), 'docs/tickets/x.md'), 'SEC');
  assert.equal(areaFor(metadata({ id: 'X', scope: 'build, quality' }), 'docs/tickets/x.md'), 'OPS');
  assert.equal(areaFor(metadata({ id: 'X', scope: 'agent, quality' }), 'docs/tickets/x.md'), 'QUAL');
  assert.equal(areaFor(metadata({ id: 'X', scope: 'backend' }), 'docs/tickets/features/x.md'), 'FEAT');
  assert.equal(areaFor(metadata({ id: 'X', scope: 'backend' }), 'docs/tickets/x.md'), 'QUAL', 'область по умолчанию');
  assert.equal(areaFor(metadata({ id: 'X', scope: 'backend' }), 'docs/tickets/x.md', { X: 'ARC' }), 'ARC', 'перечень поправок главнее');
});

test('слаг берётся из имени файла без даты и не растёт бесконечно', () => {
  assert.equal(slugFor('docs/tickets/agent-sync-queue-lock-test-flaky-2026-09-06.md'), 'agent-sync-queue-lock-test-flaky');
  assert.ok(slugFor(`docs/tickets/${'very-long-part-'.repeat(12)}end.md`).length <= 60);
});

test('нумерация продолжает существующие номера области, а не начинается заново', async () => {
  const root = await project({
    'docs/tickets/closed/SEC-007-old-work.md': ticket('SEC-007', 'security'),
    'docs/tickets/first-security-hole.md': ticket('TICKET-FIRST-SECURITY-HOLE', 'security'),
    'docs/tickets/second-security-hole.md': ticket('TICKET-SECOND-SECURITY-HOLE', 'security'),
  });
  try {
    const moves = await plan(root, {});
    assert.deepEqual(moves.map((move) => move.id), ['SEC-008', 'SEC-009']);
    assert.equal(moves[0].to, 'docs/tickets/SEC-008-first-security-hole.md');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('переход правит идентификатор, имя файла и ссылки, но не запись о прежнем идентификаторе', async () => {
  const root = await project({
    'docs/tickets/closed/lost-pin.md': ticket('TICKET-LOST-PIN', 'security'),
    'docs/releases/RELEASE-2026-09-1.md': '---\nid: RELEASE-2026-09-1\ntype: release\n---\n\n| [TICKET-LOST-PIN](../tickets/closed/lost-pin.md) | Закрыта |\n',
    'src/A.java': '// TICKET-LOST-PIN\nclass A {}\n',
  });
  try {
    const { moves, touched } = await migrate(root, {});
    assert.deepEqual(moves.map((move) => [move.legacyId, move.id]), [['TICKET-LOST-PIN', 'SEC-001']]);
    assert.ok(touched >= 2, 'ссылки поправлены в выпуске и в коде');

    const renamed = await readFile(path.join(root, 'docs/tickets/closed/SEC-001-lost-pin.md'), 'utf8');
    assert.match(renamed, /^id: SEC-001$/m);
    assert.match(renamed, /^legacy-id: TICKET-LOST-PIN$/m, 'прежний идентификатор сохранён');

    const release = await readFile(path.join(root, 'docs/releases/RELEASE-2026-09-1.md'), 'utf8');
    assert.match(release, /\[SEC-001\]\(\.\.\/tickets\/closed\/SEC-001-lost-pin\.md\)/);
    assert.match(await readFile(path.join(root, 'src/A.java'), 'utf8'), /\/\/ SEC-001/);
    assert.deepEqual((await readdir(path.join(root, 'docs/tickets/closed'))), ['SEC-001-lost-pin.md']);
    assert.equal((await findNamingIssues(root, {})).size, 0);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
