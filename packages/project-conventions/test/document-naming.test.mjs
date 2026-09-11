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

test('этап плана функции проверяется по номеру порядка, а не по области', () => {
  const stage = metadata({ id: 'UR-08', type: 'ticket' });
  assert.equal(nameIssue('docs/tickets/features/user-registration/08-rollout.md', stage, TICKET_AREAS), null);
  assert.match(nameIssue('docs/tickets/features/user-registration/rollout.md', stage, TICKET_AREAS), /<NN>-<слаг>/);
  assert.match(nameIssue('docs/tickets/features/user-registration/07-rollout.md', stage, TICKET_AREAS), /07 не совпадает/);
  assert.match(
    nameIssue('docs/tickets/features/user-registration/08-rollout.md', metadata({ id: 'TICKET-ROLLOUT', type: 'ticket' }), TICKET_AREAS),
    /<ПЛАН>-<NN>/,
  );
});

test('область выводится из областей задачи, план функции — всегда FEAT', () => {
  assert.equal(areaFor(metadata({ id: 'X', scope: 'backend, security' }), 'docs/tickets/x.md'), 'SEC');
  assert.equal(areaFor(metadata({ id: 'X', scope: 'build, quality' }), 'docs/tickets/x.md'), 'OPS');
  assert.equal(areaFor(metadata({ id: 'X', scope: 'agent, quality' }), 'docs/tickets/x.md'), 'QUAL');
  assert.equal(areaFor(metadata({ id: 'X', scope: 'backend' }), 'docs/tickets/features/x.md'), 'FEAT');
  assert.equal(areaFor(metadata({ id: 'X', scope: 'backend' }), 'docs/tickets/x.md'), 'QUAL', 'область по умолчанию');
  assert.equal(areaFor(metadata({ id: 'X', scope: 'backend' }), 'docs/tickets/x.md', { X: 'ARC' }), 'ARC', 'перечень поправок главнее');
});

test('слаг берётся из имени файла без даты и без прежнего идентификатора', () => {
  assert.equal(slugFor('docs/tickets/agent-sync-queue-lock-test-flaky-2026-09-06.md'), 'agent-sync-queue-lock-test-flaky');
  assert.equal(slugFor('docs/tickets/closed/DES-004-resend-call-written-twice.md'), 'resend-call-written-twice');
  assert.equal(slugFor('docs/tickets/closed/MOD-016-modular-architecture.md'), 'modular-architecture');
  assert.equal(slugFor('docs/tickets/closed/ADR-0003-local-publishing.md'), 'local-publishing');
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

test('идентификатор с областью вне перечня переименовывается, а не сохраняется', async () => {
  const root = await project({
    'docs/tickets/closed/QUAL-004-known-area.md': ticket('QUAL-004', 'quality'),
    'docs/tickets/closed/BUG-001-auction-pool-disagrees.md': ticket('BUG-001', 'auction, money'),
    'docs/tickets/closed/MOD-001-modular-architecture.md': ticket('MOD-001', 'architecture, modules'),
  });
  try {
    const moves = await plan(root, {});
    assert.deepEqual(moves.map((move) => [move.legacyId, move.id]), [
      ['BUG-001', 'QUAL-005'],
      ['MOD-001', 'ARC-001'],
    ], 'известная область сохраняется, неизвестная получает область из перечня и следующий свободный номер');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

// REQ-NAMING-012
test('префикс проекта входит в идентификатор и имя файла задачи', () => {
  const withPrefix = metadata({ id: 'CORE-OPS-027', type: 'ticket' });
  assert.equal(nameIssue('docs/tickets/CORE-OPS-027-thing.md', withPrefix, TICKET_AREAS, 'CORE'), null);
  assert.match(
    nameIssue('docs/tickets/OPS-027-thing.md', metadata({ id: 'OPS-027', type: 'ticket' }), TICKET_AREAS, 'CORE'),
    /имя файла задачи должно быть CORE-<ОБЛАСТЬ>-<NNN>-<слаг>\.md/,
  );
  assert.match(
    nameIssue('docs/tickets/CORE-OPS-027-thing.md', metadata({ id: 'OPS-027', type: 'ticket' }), TICKET_AREAS, 'CORE'),
    /ожидается CORE-OPS-027/,
  );
  assert.equal(
    nameIssue('docs/tickets/OPS-027-thing.md', metadata({ id: 'OPS-027', type: 'ticket' }), TICKET_AREAS),
    null,
    'без объявленного префикса прежняя форма принимается',
  );
});

// REQ-NAMING-012
test('миграция приводит идентификаторы к объявленному префиксу проекта', async () => {
  const root = await project({
    'docs/tickets/closed/OPS-012-old-work.md': ticket('OPS-012', 'build'),
    'docs/tickets/OPS-013-other-work.md': `${ticket('OPS-013', 'build')}\nСсылка на \`OPS-012\` рядом.\n`,
    'docs/tickets/ZAVPN-QUAL-001-ready.md': `${ticket('ZAVPN-QUAL-001', 'quality')}\nСсылка на \`OPS-013\` рядом.\n`,
    'docs/tickets/ZAVPN-OPS-013-migrated-earlier.md': `${ticket('ZAVPN-OPS-013', 'build')}\nПереименована прошлым прогоном.\n`,
  });
  try {
    const moves = await plan(root, { prefix: 'ZAVPN' });
    assert.deepEqual(moves.map((move) => move.id), ['ZAVPN-OPS-014', 'ZAVPN-OPS-015']);
    assert.equal(moves[0].to, 'docs/tickets/closed/ZAVPN-OPS-014-old-work.md');

    const { moves: applied } = await migrate(root, { prefix: 'ZAVPN' });
    assert.equal(applied.length, 2);

    const other = await readFile(path.join(root, 'docs/tickets/ZAVPN-OPS-015-other-work.md'), 'utf8');
    assert.match(other, /^id: ZAVPN-OPS-015$/m);
    assert.match(other, /^legacy-id: OPS-013$/m);
    assert.match(other, /Ссылка на `ZAVPN-OPS-014` рядом/);

    const ready = await readFile(path.join(root, 'docs/tickets/ZAVPN-QUAL-001-ready.md'), 'utf8');
    assert.match(ready, /^id: ZAVPN-QUAL-001$/m, 'задача с префиксом остаётся на месте');
    assert.match(ready, /Ссылка на `ZAVPN-OPS-015` рядом/);

    const earlier = await readFile(path.join(root, 'docs/tickets/ZAVPN-OPS-013-migrated-earlier.md'), 'utf8');
    assert.match(earlier, /^id: ZAVPN-OPS-013$/m, 'переименованная прежде задача не трогается');
    assert.doesNotMatch(earlier, /ZAVPN-ZAVPN/, 'идентификатор прежнего прогона не получает второго префикса');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

// REQ-NAMING-012
test('без объявленного префикса миграция работает как прежде', async () => {
  const root = await project({
    'docs/tickets/closed/OPS-012-old-work.md': ticket('OPS-012', 'build'),
    'docs/tickets/first-build-break.md': ticket('TICKET-FIRST-BUILD-BREAK', 'build'),
  });
  try {
    assert.deepEqual((await plan(root, {})).map((move) => move.id), ['OPS-013']);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

// REQ-NAMING-012
test('имя файла не получает второго префикса, когда меняется только префикс', async () => {
  const root = await project({
    'docs/tickets/closed/OPS-001-npm-runs-under-any-node.md': ticket('OPS-001', 'build'),
    'docs/tickets/QUAL-001-adopt-observed-receipt.md': `${ticket('QUAL-001', 'quality')}\nСделано в [OPS-001](closed/OPS-001-npm-runs-under-any-node.md).\n`,
    'docs/tickets/INDEX.md': '# Задачи\n\n| [Npm](closed/OPS-001-npm-runs-under-any-node.md) | Выполнена |\n',
  });
  try {
    const { moves } = await migrate(root, { prefix: 'CL' });
    assert.deepEqual(moves.map((move) => move.id).sort(), ['CL-OPS-001', 'CL-QUAL-001'], 'номер не меняется, меняется только префикс');

    const index = await readFile(path.join(root, 'docs/tickets/INDEX.md'), 'utf8');
    assert.doesNotMatch(index, /CL-CL-/, 'имя файла не удваивает префикс');
    assert.match(index, /closed\/CL-OPS-001-npm-runs-under-any-node\.md/);

    const other = await readFile(path.join(root, 'docs/tickets/CL-QUAL-001-adopt-observed-receipt.md'), 'utf8');
    assert.doesNotMatch(other, /CL-CL-/, 'ссылка на файл не удваивает префикс');
    assert.match(other, /\[CL-OPS-001\]\(closed\/CL-OPS-001-npm-runs-under-any-node\.md\)/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

// REQ-NAMING-012
test('идентификатор чужого проекта, названный через его имя, префикса не получает', async () => {
  const root = await project({
    'docs/tickets/closed/OPS-001-our-work.md': ticket('OPS-001', 'build'),
    'docs/tickets/QUAL-001-report.md': `${ticket('QUAL-001', 'quality')}\nНаша \`OPS-001\`, ядра \`platform/OPS-001\`, соседняя \`zavpn/OPS-001\`.\n`,
  });
  try {
    await migrate(root, { prefix: 'CL' });
    const report = await readFile(path.join(root, 'docs/tickets/CL-QUAL-001-report.md'), 'utf8');
    assert.match(report, /Наша `CL-OPS-001`/);
    assert.match(report, /ядра `platform\/OPS-001`/, 'чужой идентификатор остаётся прежним');
    assert.match(report, /соседняя `zavpn\/OPS-001`/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
