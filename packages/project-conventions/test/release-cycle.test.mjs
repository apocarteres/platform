import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { nextReleaseId, openRelease, releaseTag, unassignedTerminalTickets } from '../lib/release/documents.mjs';
import { obligationState, overdueObligations, pendingObligations } from '../lib/release/obligations.mjs';
import { adoptCycle, cancelRelease, closability, closeRelease, openNext, satisfyObligation } from '../lib/release/cycle.mjs';
import { writeReceipt } from '../lib/release/receipt.mjs';
import { environmentWithoutGit, headCommit, workingTreeClean } from '../lib/release/git.mjs';
import { refreshCompositionLinks } from '../lib/docs/releases-index.mjs';

const run = promisify(execFile);
const git = (...args) => run('git', args, { env: environmentWithoutGit() });
const FIXED_DAY = new Date('2026-09-07T00:00:00Z');
const RECEIPT = (commit, completedAt) => ({
  commit,
  completedAt,
  checks: ['verify'],
  run: { command: 'mise run check', exitCode: 0 },
});
const NEXT_DAY = new Date('2026-09-08T00:00:00Z');


const OBLIGATION = {
  id: 'sample',
  title: 'Пример обязательства',
  requirement: 'REQ-QUALITY-001',
  level: 'директива',
  since: '0.19.0',
  dueReleases: 2,
  slug: 'adopt-sample',
  ticket: {
    scope: 'quality',
    priority: 'P2',
    problem: 'Проект не соответствует требованию ядра.',
    required: ['Сделать то, что требует ядро.'],
    acceptance: ['Требование выполнено.'],
  },
};

async function project() {
  const root = await mkdtemp(path.join(os.tmpdir(), 'release-cycle-'));
  await mkdir(path.join(root, 'docs/releases'), { recursive: true });
  await mkdir(path.join(root, 'docs/tickets/closed'), { recursive: true });
  await mkdir(path.join(root, 'node_modules/@apocarteres/project-conventions'), { recursive: true });
  await writeFile(
    path.join(root, 'node_modules/@apocarteres/project-conventions/obligations.json'),
    JSON.stringify({ obligations: [OBLIGATION] }),
  );
  await writeFile(path.join(root, '.gitignore'), 'target/\nnode_modules/\n');
  await git('-C', root, 'init', '--quiet');
  await git('-C', root, 'config', 'user.email', 'test@example.test');
  await git('-C', root, 'config', 'user.name', 'Test');
  return root;
}

async function releaseDocuments(root) {
  try {
    return await readdir(path.join(root, 'docs/releases'));
  } catch (error) {
    if (error.code === 'ENOENT') return [];
    throw error;
  }
}

async function commitAll(root) {
  await git('-C', root, 'add', '-A');
  await git('-C', root, 'commit', '--quiet', '-m', 'состояние');
  const { stdout } = await git('-C', root, 'rev-parse', 'HEAD');
  return stdout.trim();
}

function ticket(id, status, release = 'unassigned') {
  return `---\nid: ${id}\ntype: ticket\nstatus: ${status}\nscope: quality\nauthority: supporting\npriority: P2\nrelease: ${release}\n---\n\n# ${id}\n`;
}

test('номер выпуска сервиса складывается из года, месяца и порядкового номера', () => {
  const existing = [{ metadata: new Map([['id', 'RELEASE-2026-09-1']]) }];
  const first = nextReleaseId([], 'date', FIXED_DAY);
  const second = nextReleaseId(existing, 'date', new Date('2026-09-30T00:00:00Z'));
  assert.equal(first.id, 'RELEASE-2026-09-1');
  assert.equal(first.tag, '2026.09.1');
  assert.equal(second.id, 'RELEASE-2026-09-2');
  assert.equal(second.tag, '2026.09.2');
  assert.equal(releaseTag('RELEASE-2026-09-2', 'date'), '2026.09.2');
});

test('номер выпуска ядра совпадает с версией артефактов', () => {
  const core = nextReleaseId([], 'semver', FIXED_DAY, '0.19.0');
  assert.equal(core.id, 'RELEASE-0-19-0');
  assert.equal(core.tag, 'v0.19.0');
  assert.throws(() => nextReleaseId([], 'semver', FIXED_DAY), /нужен номер версии/);
});

test('обязательство просрочено, когда прошло больше выпусков, чем срок', () => {
  const state = { releaseCount: 2, seen: { sample: 0 }, closed: {}, deferred: {} };
  assert.equal(obligationState(OBLIGATION, state).status, 'overdue');
  assert.equal(obligationState(OBLIGATION, { ...state, releaseCount: 1 }).status, 'open');
  assert.equal(obligationState(OBLIGATION, { closed: { sample: { release: 'RELEASE-2026-09-1' } } }).status, 'closed');
  assert.equal(overdueObligations([OBLIGATION], state).length, 1);
  assert.equal(overdueObligations([OBLIGATION], state, true).length, 0, 'ядро не должно обязательств себе');
  assert.equal(pendingObligations([OBLIGATION], state).length, 1);
});

test('открытие выпуска материализует обязательство задачей и не создаёт вторую при повторе', async () => {
  const root = await project();
  try {
    const opened = await openNext(root, { scheme: 'date', today: FIXED_DAY });
    assert.equal(opened.opened, true);
    assert.equal(opened.id, 'RELEASE-2026-09-1');
    assert.deepEqual(opened.created, ['TICKET-ADOPT-SAMPLE-2026-09-07']);
    const created = await readFile(path.join(root, 'docs/tickets/adopt-sample-2026-09-07.md'), 'utf8');
    assert.match(created, /obligation: sample/);
    assert.match(created, /release: RELEASE-2026-09-1/);

    const again = await openNext(root, { scheme: 'date', today: FIXED_DAY });
    assert.equal(again.opened, false, 'открытый выпуск всегда ровно один');

    const release = await openRelease(root);
    await writeFile(release.file, release.content.replace('status: draft', 'status: released').replace('id: RELEASE-2026-09-1', 'id: RELEASE-2026-09-1'));
    const reopened = await openNext(root, { scheme: 'date', today: NEXT_DAY });
    assert.equal(reopened.opened, true);
    assert.deepEqual(reopened.created, [], 'задача обязательства не создаётся второй раз');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('выпуск не закрывается без расписки, при грязном дереве и с пустым составом', async () => {
  const root = await project();
  try {
    await openNext(root, { scheme: 'date', today: FIXED_DAY });
    await writeFile(path.join(root, 'docs/tickets/closed/done-one.md'), ticket('TICKET-DONE-ONE', 'done'));
    const commit = await commitAll(root);

    const withoutReceipt = await closability(root, { scheme: 'date' });
    assert.ok(withoutReceipt.problems.some((problem) => problem.includes('Нет расписки')));

    // REQ-RELEASE-028
    await writeReceipt(root, { commit, completedAt: '2026-09-07T00:00:00Z', checks: ['verify'] });
    const claimed = await closability(root, { scheme: 'date' });
    assert.ok(claimed.problems.some((problem) => problem.includes('не содержит признака прогона')));

    await writeReceipt(root, RECEIPT(commit, '2026-09-07T00:00:00Z'));
    const ready = await closability(root, { scheme: 'date' });
    assert.deepEqual(ready.problems, [], 'с распиской и непустым составом выпуск закрывается');

    await writeFile(path.join(root, 'docs/tickets/closed/done-two.md'), ticket('TICKET-DONE-TWO', 'done'));
    const dirty = await closability(root, { scheme: 'date' });
    assert.ok(dirty.problems.some((problem) => problem.includes('дерево не чисто')));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('закрытие записывает состав, коммит и результат, а обязательство помечает закрытым', async () => {
  const root = await project();
  try {
    await openNext(root, { scheme: 'date', today: FIXED_DAY });
    const obligationTicket = path.join(root, 'docs/tickets/adopt-sample-2026-09-07.md');
    const body = await readFile(obligationTicket, 'utf8');
    await rm(obligationTicket);
    await writeFile(
      path.join(root, 'docs/tickets/closed/adopt-sample-2026-09-07.md'),
      body.replace('status: backlog', 'status: done'),
    );
    const commit = await commitAll(root);
    await writeReceipt(root, RECEIPT(commit, '2026-09-07T10:00:00Z'));

    const closed = await closeRelease(root, { scheme: 'date', today: FIXED_DAY });
    assert.equal(closed.closed, true);
    assert.equal(closed.tag, '2026.09.1');
    assert.deepEqual(closed.composition, ['TICKET-ADOPT-SAMPLE-2026-09-07']);

    const document = await readFile(path.join(root, 'docs/releases/RELEASE-2026-09-1.md'), 'utf8');
    assert.match(document, /status: released/);
    assert.match(document, new RegExp(`commit: ${commit}`));
    assert.match(document, /TICKET-ADOPT-SAMPLE-2026-09-07/);
    assert.match(document, /2026-09-07T10:00:00Z/);
    assert.match(document, /- \[x\] Тег выпуска создан на проверенном коммите — `2026\.09\.1`/);
    assert.match(document, /- \[x\] Обязательства ядра этого выпуска закрыты[^\n]*закрыты: sample/);
    assert.match(document, /Обязательство ядра `sample`, закрыто в этом выпуске/);
    assert.equal(document.includes('- [ ]'), false, 'критерии закрытого выпуска отмечены с подтверждением');

    const state = JSON.parse(await readFile(path.join(root, '.conventions/obligations.json'), 'utf8'));
    assert.equal(state.releaseCount, 1);
    assert.equal(state.closed.sample.release, 'RELEASE-2026-09-1');

    const { stdout: tagged } = await git('-C', root, 'rev-list', '-n', '1', '2026.09.1');
    assert.equal(tagged.trim(), commit, 'тег выпуска стоит на коммите с распиской');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('отказ в закрытии не оставляет тега', async () => {
  const root = await project();
  try {
    await openNext(root, { scheme: 'date', today: FIXED_DAY });
    await writeFile(path.join(root, 'docs/tickets/closed/done-one.md'), ticket('TICKET-DONE-ONE', 'done'));
    await commitAll(root);

    const refused = await closeRelease(root, { scheme: 'date', today: FIXED_DAY });
    assert.equal(refused.closed, false, 'без расписки закрытие отказывает');
    const { stdout: tags } = await git('-C', root, 'tag', '--list');
    assert.equal(tags.trim(), '', 'тег не ставится при отказе');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('принятие цикла не записывает в первый выпуск то, что выпущено до него', async () => {
  const root = await project();
  try {
    await writeFile(path.join(root, 'docs/tickets/closed/old-one.md'), ticket('TICKET-OLD-ONE', 'done'));
    await writeFile(path.join(root, 'docs/tickets/closed/old-two.md'), ticket('TICKET-OLD-TWO', 'cancelled'));

    const adopted = await adoptCycle(root, { scheme: 'date', today: FIXED_DAY });
    assert.equal(adopted.adopted, true);
    assert.deepEqual(adopted.stamped.sort(), ['TICKET-OLD-ONE', 'TICKET-OLD-TWO']);
    assert.match(await readFile(path.join(root, 'docs/tickets/closed/old-one.md'), 'utf8'), /release: before-cycle/);
    assert.deepEqual(await unassignedTerminalTickets(root), [], 'состав первого выпуска наполняется только новыми закрытиями');

    const again = await adoptCycle(root, { scheme: 'date', today: NEXT_DAY });
    assert.equal(again.adopted, false, 'принятие цикла выполняется один раз');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('обязательство закрывается ссылкой на уже выполненную задачу и снимает заготовку', async () => {
  const root = await project();
  try {
    await writeFile(path.join(root, 'docs/tickets/closed/old-work.md'), ticket('TICKET-OLD-WORK', 'done'));
    await adoptCycle(root, { scheme: 'date', today: FIXED_DAY });
    const draft = path.join(root, 'docs/tickets/adopt-sample-2026-09-07.md');
    assert.match(await readFile(draft, 'utf8'), /obligation: sample/);

    const missing = await satisfyObligation(root, { obligationId: 'sample', ticketId: 'TICKET-NONE' });
    assert.equal(missing.satisfied, false, 'ссылка на несуществующую задачу отклоняется');

    const satisfied = await satisfyObligation(root, { obligationId: 'sample', ticketId: 'TICKET-OLD-WORK' });
    assert.equal(satisfied.satisfied, true);
    assert.deepEqual(satisfied.removed, ['TICKET-ADOPT-SAMPLE-2026-09-07']);
    await assert.rejects(readFile(draft, 'utf8'), 'заготовка удалена: работа уже выполнена');

    const release = await readFile(path.join(root, 'docs/releases/RELEASE-2026-09-1.md'), 'utf8');
    assert.equal(release.includes('TICKET-ADOPT-SAMPLE-2026-09-07'), false, 'строка состава снята');

    const state = JSON.parse(await readFile(path.join(root, '.conventions/obligations.json'), 'utf8'));
    assert.equal(state.closed.sample.ticket, 'TICKET-OLD-WORK');
    assert.equal(obligationState(OBLIGATION, state).status, 'closed');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('ссылки состава следуют за задачей, переехавшей в closed', async () => {
  const root = await project();
  try {
    await openNext(root, { scheme: 'date', today: FIXED_DAY });
    const open = path.join(root, 'docs/tickets/adopt-sample-2026-09-07.md');
    const body = await readFile(open, 'utf8');
    await writeFile(path.join(root, 'docs/tickets/closed/adopt-sample-2026-09-07.md'), body.replace('status: backlog', 'status: done'));
    await rm(open);

    const stale = await refreshCompositionLinks(root, { check: true });
    assert.equal(stale.length, 1, 'устаревшая ссылка состава замечена проверкой');

    await refreshCompositionLinks(root, { check: false });
    const release = await readFile(path.join(root, 'docs/releases/RELEASE-2026-09-1.md'), 'utf8');
    assert.match(release, /\(\.\.\/tickets\/closed\/adopt-sample-2026-09-07\.md\)/);
    assert.deepEqual(await refreshCompositionLinks(root, { check: true }), []);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('невыполненное обязательство переносится в следующий выпуск вместе с задачей', async () => {
  const root = await project();
  try {
    await openNext(root, { scheme: 'date', today: FIXED_DAY });
    const draft = path.join(root, 'docs/tickets/adopt-sample-2026-09-07.md');
    assert.match(await readFile(draft, 'utf8'), /release: RELEASE-2026-09-1/);

    const release = await openRelease(root);
    await writeFile(release.file, release.content.replace('status: draft', 'status: released'));
    const next = await openNext(root, { scheme: 'date', today: NEXT_DAY });
    assert.equal(next.opened, true);
    assert.deepEqual(next.created, [], 'вторая заготовка не создаётся');
    assert.deepEqual(next.carried, ['TICKET-ADOPT-SAMPLE-2026-09-07']);

    assert.match(await readFile(draft, 'utf8'), /release: RELEASE-2026-09-2/);
    const opened = await readFile(path.join(root, 'docs/releases/RELEASE-2026-09-2.md'), 'utf8');
    assert.match(opened, /TICKET-ADOPT-SAMPLE-2026-09-07[^\n]*перенесено из предыдущего выпуска/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('первый выпуск открывается в проекте, где каталогов документации ещё нет', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'release-cycle-bare-'));
  try {
    await mkdir(path.join(root, 'node_modules/@apocarteres/project-conventions'), { recursive: true });
    await writeFile(
      path.join(root, 'node_modules/@apocarteres/project-conventions/obligations.json'),
      JSON.stringify({ obligations: [OBLIGATION] }),
    );
    await git('-C', root, 'init', '--quiet');

    const adopted = await adoptCycle(root, { scheme: 'date', today: FIXED_DAY });
    assert.equal(adopted.adopted, true, 'принятие цикла не должно требовать заранее созданных каталогов');
    assert.deepEqual(adopted.created, ['TICKET-ADOPT-SAMPLE-2026-09-07']);
    assert.match(await readFile(path.join(root, 'docs/releases/RELEASE-2026-09-1.md'), 'utf8'), /status: draft/);
    assert.match(await readFile(path.join(root, 'docs/tickets/adopt-sample-2026-09-07.md'), 'utf8'), /obligation: sample/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('открытие выпуска с уже занятым номером отказывает и не трогает документ', async () => {
  const root = await project();
  try {
    await openNext(root, { scheme: 'semver', version: '0.19.0', today: FIXED_DAY });
    const file = path.join(root, 'docs/releases/RELEASE-0-19-0.md');
    const released = (await readFile(file, 'utf8')).replace('status: draft', 'status: released');
    await writeFile(file, released);

    const again = await openNext(root, { scheme: 'semver', version: '0.19.0', today: NEXT_DAY });
    assert.equal(again.opened, false);
    assert.match(again.problems.join(), /уже существует/);
    assert.equal(await readFile(file, 'utf8'), released, 'закрытый документ не перезаписан');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

// REQ-RELEASE-029
test('отмена открытого выпуска требует причины, освобождает цикл и не переиспользует номер', async () => {
  const root = await project();
  try {
    const withoutRelease = await cancelRelease(root, { reason: 'номер сменён' });
    assert.equal(withoutRelease.cancelled, false);
    assert.ok(withoutRelease.problems.some((problem) => problem.includes('Открытого выпуска нет')));

    const opened = await openNext(root, { scheme: 'date', today: FIXED_DAY });
    assert.equal(opened.opened, true);

    const withoutReason = await cancelRelease(root, { reason: '  ' });
    assert.equal(withoutReason.cancelled, false);
    assert.ok(withoutReason.problems.some((problem) => problem.includes('требует причины')));

    const cancelled = await cancelRelease(root, { reason: 'выпуск несёт несовместимое изменение' });
    assert.equal(cancelled.cancelled, true);
    assert.equal(cancelled.id, opened.id);
    const document = await readFile(cancelled.file, 'utf8');
    assert.match(document, /status: cancelled/);
    assert.match(document, /Выпуск отменён, ничего не выпущено: выпуск несёт несовместимое изменение/);

    const next = await openNext(root, { scheme: 'date', today: FIXED_DAY });
    assert.equal(next.opened, true, 'после отмены цикл свободен');
    assert.notEqual(next.id, opened.id, 'номер отменённого выпуска не переиспользуется');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('команды выпуска действуют на переданный корень, а не на репозиторий из окружения', async () => {
  const root = await project();
  const foreign = await project();
  try {
    const commit = await commitAll(root);
    await writeFile(path.join(foreign, 'docs/releases/RELEASE-9-9-9.md'), 'чужой репозиторий\n');
    const foreignCommit = await commitAll(foreign);
    assert.notEqual(foreignCommit, commit, 'репозитории должны различаться, иначе проверка ничего не различает');
    const inherited = process.env.GIT_DIR;
    process.env.GIT_DIR = path.join(foreign, '.git');
    try {
      assert.equal(await headCommit(root), commit);
      assert.equal(await workingTreeClean(root), true);
    } finally {
      if (inherited === undefined) delete process.env.GIT_DIR;
      else process.env.GIT_DIR = inherited;
    }
  } finally {
    await rm(root, { recursive: true, force: true });
    await rm(foreign, { recursive: true, force: true });
  }
});

// REQ-RELEASE-030
test('принятие цикла на semver без номера ничего не меняет', async () => {
  const root = await project();
  try {
    await writeFile(path.join(root, 'docs/tickets/closed/QUAL-001-done.md'), ticket('QUAL-001', 'done'));
    const adopted = await adoptCycle(root, { scheme: 'semver', today: FIXED_DAY });
    assert.equal(adopted.adopted, false);
    assert.ok(adopted.problems.some((problem) => problem.includes('--version')), adopted.problems.join('\n'));
    const kept = await readFile(path.join(root, 'docs/tickets/closed/QUAL-001-done.md'), 'utf8');
    assert.match(kept, /^release: unassigned$/m);
    assert.deepEqual(await releaseDocuments(root), []);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
