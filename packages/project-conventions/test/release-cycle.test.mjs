import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { nextReleaseId, openRelease, releaseTag, ticketId, unassignedDoneTickets } from '../lib/release/documents.mjs';
import { findObligationDebts, obligationState, overdueObligations, pendingObligations } from '../lib/release/obligations.mjs';
import { adoptCycle, cancelRelease, closability, closeRelease, dropFromComposition, finishRelease, openNext, satisfyObligation } from '../lib/release/cycle.mjs';
import { writeReceipt } from '../lib/release/receipt.mjs';
import { environmentWithoutGit, headCommit, workingTreeClean } from '../lib/release/git.mjs';
import { refreshCompositionLinks } from '../lib/docs/releases-index.mjs';
import { checkDocumentation } from '../lib/docs/check-docs.mjs';

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
  area: 'QUAL',
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

function cancelled(id) {
  return `${ticket(id, 'cancelled')}\n## Почему не делаем\n\nРабота передана в ядро.\n`;
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
    assert.deepEqual(opened.created, ['QUAL-001']);
    const created = await readFile(path.join(root, 'docs/tickets/QUAL-001-adopt-sample.md'), 'utf8');
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
    const obligationTicket = path.join(root, 'docs/tickets/QUAL-001-adopt-sample.md');
    const body = await readFile(obligationTicket, 'utf8');
    await rm(obligationTicket);
    await writeFile(
      path.join(root, 'docs/tickets/closed/QUAL-001-adopt-sample.md'),
      body.replace('status: backlog', 'status: done'),
    );
    const commit = await commitAll(root);
    await writeReceipt(root, RECEIPT(commit, '2026-09-07T10:00:00Z'));

    const closed = await closeRelease(root, { scheme: 'date', today: FIXED_DAY });
    assert.equal(closed.closed, true);
    assert.equal(closed.tag, '2026.09.1');
    assert.deepEqual(closed.composition, ['QUAL-001']);

    // REQ-RELEASE-001
    const afterTag = await readFile(path.join(root, 'docs/releases/RELEASE-2026-09-1.md'), 'utf8');
    assert.doesNotMatch(afterTag, /status: released/, 'до завершающего шага выпуск не выпущен');
    assert.match(afterTag, /- \[ \] Завершающий шаг/);

    const finished = await finishRelease(root, { scheme: 'date', today: FIXED_DAY, note: 'публикация артефактов' });
    assert.equal(finished.finished, true, finished.problems?.join('\n'));

    const document = await readFile(path.join(root, 'docs/releases/RELEASE-2026-09-1.md'), 'utf8');
    assert.match(document, /status: released/);
    assert.match(document, /- \[x\] Завершающий шаг выполнен — публикация артефактов/);
    assert.match(document, new RegExp(`commit: ${commit}`));
    assert.match(document, /QUAL-001/);
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
    // REQ-RELEASE-031
    assert.deepEqual(adopted.stamped.sort(), ['TICKET-OLD-ONE'], 'пометку получает только выпущенный результат');
    assert.match(await readFile(path.join(root, 'docs/tickets/closed/old-one.md'), 'utf8'), /release: before-cycle/);
    assert.match(await readFile(path.join(root, 'docs/tickets/closed/old-two.md'), 'utf8'), /release: unassigned/);
    assert.deepEqual(await unassignedDoneTickets(root), [], 'состав первого выпуска наполняется только новыми закрытиями');

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
    const draft = path.join(root, 'docs/tickets/QUAL-001-adopt-sample.md');
    assert.match(await readFile(draft, 'utf8'), /obligation: sample/);

    const missing = await satisfyObligation(root, { obligationId: 'sample', ticketId: 'TICKET-NONE' });
    assert.equal(missing.satisfied, false, 'ссылка на несуществующую задачу отклоняется');

    const satisfied = await satisfyObligation(root, { obligationId: 'sample', ticketId: 'TICKET-OLD-WORK' });
    assert.equal(satisfied.satisfied, true);
    assert.deepEqual(satisfied.removed, ['QUAL-001']);
    await assert.rejects(readFile(draft, 'utf8'), 'заготовка удалена: работа уже выполнена');

    const release = await readFile(path.join(root, 'docs/releases/RELEASE-2026-09-1.md'), 'utf8');
    assert.equal(release.includes('QUAL-001'), false, 'строка состава снята');

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
    const open = path.join(root, 'docs/tickets/QUAL-001-adopt-sample.md');
    const body = await readFile(open, 'utf8');
    await writeFile(path.join(root, 'docs/tickets/closed/QUAL-001-adopt-sample.md'), body.replace('status: backlog', 'status: done'));
    await rm(open);

    const stale = await refreshCompositionLinks(root, { check: true });
    assert.equal(stale.length, 1, 'устаревшая ссылка состава замечена проверкой');

    await refreshCompositionLinks(root, { check: false });
    const release = await readFile(path.join(root, 'docs/releases/RELEASE-2026-09-1.md'), 'utf8');
    assert.match(release, /\(\.\.\/tickets\/closed\/QUAL-001-adopt-sample\.md\)/);
    assert.deepEqual(await refreshCompositionLinks(root, { check: true }), []);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('невыполненное обязательство переносится в следующий выпуск вместе с задачей', async () => {
  const root = await project();
  try {
    await openNext(root, { scheme: 'date', today: FIXED_DAY });
    const draft = path.join(root, 'docs/tickets/QUAL-001-adopt-sample.md');
    assert.match(await readFile(draft, 'utf8'), /release: RELEASE-2026-09-1/);

    const release = await openRelease(root);
    await writeFile(release.file, release.content.replace('status: draft', 'status: released'));
    const next = await openNext(root, { scheme: 'date', today: NEXT_DAY });
    assert.equal(next.opened, true);
    assert.deepEqual(next.created, [], 'вторая заготовка не создаётся');
    assert.deepEqual(next.carried, ['QUAL-001']);

    assert.match(await readFile(draft, 'utf8'), /release: RELEASE-2026-09-2/);
    const opened = await readFile(path.join(root, 'docs/releases/RELEASE-2026-09-2.md'), 'utf8');
    assert.match(opened, /QUAL-001[^\n]*перенесено из предыдущего выпуска/);
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
    assert.deepEqual(adopted.created, ['QUAL-001']);
    assert.match(await readFile(path.join(root, 'docs/releases/RELEASE-2026-09-1.md'), 'utf8'), /status: draft/);
    assert.match(await readFile(path.join(root, 'docs/tickets/QUAL-001-adopt-sample.md'), 'utf8'), /obligation: sample/);
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

// REQ-RELEASE-031
test('отменённая задача не попадает в состав и не ломает проверку документов', async () => {
  const root = await project();
  try {
    await writeFile(
      path.join(root, 'node_modules/@apocarteres/project-conventions/obligations.json'),
      JSON.stringify({ obligations: [] }),
    );
    await openNext(root, { scheme: 'date', today: FIXED_DAY });
    await writeFile(path.join(root, 'docs/tickets/closed/shipped.md'), ticket('TICKET-SHIPPED', 'done'));
    await writeFile(path.join(root, 'docs/tickets/closed/dropped.md'), cancelled('TICKET-DROPPED'));
    const commit = await commitAll(root);
    await writeReceipt(root, RECEIPT(commit, FIXED_DAY));

    const closed = await closeRelease(root, { scheme: 'date', today: FIXED_DAY });
    assert.equal(closed.closed, true, closed.problems?.join('\n'));
    assert.deepEqual(closed.composition, ['TICKET-SHIPPED']);

    const released = await readFile(path.join(root, `docs/releases/${closed.id}.md`), 'utf8');
    assert.match(released, /TICKET-SHIPPED/);
    assert.doesNotMatch(released, /TICKET-DROPPED/, 'отменённая задача в составе не упоминается');

    const dropped = await readFile(path.join(root, 'docs/tickets/closed/dropped.md'), 'utf8');
    assert.match(dropped, /^release: unassigned$/m, 'отменённой задаче выпуск не назначается');

    const { errors } = await checkDocumentation(root);
    const aboutComposition = errors.filter((error) => /TICKET-DROPPED|не выполнена|в составе/.test(error));
    assert.deepEqual(aboutComposition, [], errors.join('\n'));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

// REQ-RELEASE-031
test('отменённая задача не возвращается в состав следующего выпуска', async () => {
  const root = await project();
  try {
    await writeFile(
      path.join(root, 'node_modules/@apocarteres/project-conventions/obligations.json'),
      JSON.stringify({ obligations: [] }),
    );
    await openNext(root, { scheme: 'date', today: FIXED_DAY });
    await writeFile(path.join(root, 'docs/tickets/closed/shipped.md'), ticket('TICKET-SHIPPED', 'done'));
    await writeFile(path.join(root, 'docs/tickets/closed/dropped.md'), cancelled('TICKET-DROPPED'));
    const commit = await commitAll(root);
    await writeReceipt(root, RECEIPT(commit, FIXED_DAY));
    assert.equal((await closeRelease(root, { scheme: 'date', today: FIXED_DAY })).closed, true);
    assert.equal((await finishRelease(root, { scheme: 'date', today: FIXED_DAY, note: 'публикация' })).finished, true);
    assert.equal((await openNext(root, { scheme: 'date', today: NEXT_DAY })).opened, true);

    const state = await closability(root, { scheme: 'date' });
    assert.deepEqual(state.composition.map(ticketId), [], 'следующий выпуск отменённую задачу не подбирает');
    assert.ok(state.problems.some((problem) => problem.includes('Состав пуст')), state.problems.join('\n'));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

// REQ-RELEASE-019
test('обязательство не закрывается отменённой задачей', async () => {
  const root = await project();
  try {
    await writeFile(path.join(root, 'docs/tickets/closed/dropped.md'), cancelled('TICKET-DROPPED'));
    await adoptCycle(root, { scheme: 'date', today: FIXED_DAY });
    const draft = path.join(root, 'docs/tickets/QUAL-001-adopt-sample.md');

    const refused = await satisfyObligation(root, { obligationId: 'sample', ticketId: 'TICKET-DROPPED' });
    assert.equal(refused.satisfied, false);
    assert.ok(refused.problems.some((problem) => problem.includes('не выполнена (cancelled)')), refused.problems.join('\n'));

    assert.match(await readFile(draft, 'utf8'), /obligation: sample/, 'заготовка остаётся на месте');
    const state = JSON.parse(await readFile(path.join(root, '.conventions/obligations.json'), 'utf8'));
    assert.deepEqual(state.closed ?? {}, {}, 'состояние обязательств не меняется');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

// REQ-RELEASE-021
test('обязательство переносится, пока его задача не выполнена', async () => {
  const root = await project();
  try {
    await adoptCycle(root, { scheme: 'date', today: FIXED_DAY });
    const draft = path.join(root, 'docs/tickets/closed/QUAL-001-adopt-sample.md');
    const body = await readFile(path.join(root, 'docs/tickets/QUAL-001-adopt-sample.md'), 'utf8');
    await rm(path.join(root, 'docs/tickets/QUAL-001-adopt-sample.md'));
    await writeFile(draft, body
      .replace('status: backlog', 'status: superseded')
      .replace('release: unassigned', 'release: unassigned\nsuperseded-by: TICKET-SHIPPED'));
    await writeFile(path.join(root, 'docs/tickets/closed/shipped.md'), ticket('TICKET-SHIPPED', 'done'));
    const commit = await commitAll(root);
    await writeReceipt(root, RECEIPT(commit, FIXED_DAY));
    assert.equal((await closeRelease(root, { scheme: 'date', today: FIXED_DAY })).closed, true);
    assert.equal((await finishRelease(root, { scheme: 'date', today: FIXED_DAY, note: 'публикация' })).finished, true);
    assert.equal((await openNext(root, { scheme: 'date', today: NEXT_DAY })).opened, true);

    const opened = (await openRelease(root)).content;
    assert.match(opened, /QUAL-001/, 'обязательство перенесено вместе с задачей');
    assert.match(opened, /перенесено из предыдущего выпуска/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

// REQ-RELEASE-007
test('открытие выпуска указывает задачи в состав в любом их состоянии', async () => {
  const root = await project();
  try {
    await writeFile(path.join(root, 'docs/tickets/in-work.md'), ticket('TICKET-IN-WORK', 'in_progress'));
    const opened = await openNext(root, { scheme: 'date', today: FIXED_DAY, tickets: ['TICKET-IN-WORK'] });
    assert.equal(opened.opened, true, opened.problems?.join('\n'));
    assert.deepEqual(opened.named, ['TICKET-IN-WORK']);

    assert.match(await readFile(path.join(root, 'docs/tickets/in-work.md'), 'utf8'), /^release: RELEASE-2026-09-1$/m);
    assert.match((await openRelease(root)).content, /\| \[TICKET-IN-WORK\][^|]+\| Указана при открытии выпуска \|/);

    const unknown = await openNext(root, { scheme: 'date', today: NEXT_DAY, tickets: ['TICKET-NONE'] });
    assert.equal(unknown.opened, false);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

// REQ-RELEASE-031
test('выпуск не закрывается, пока указанная задача не выполнена', async () => {
  const root = await project();
  try {
    await writeFile(
      path.join(root, 'node_modules/@apocarteres/project-conventions/obligations.json'),
      JSON.stringify({ obligations: [] }),
    );
    await writeFile(path.join(root, 'docs/tickets/in-work.md'), ticket('TICKET-IN-WORK', 'in_progress'));
    await openNext(root, { scheme: 'date', today: FIXED_DAY, tickets: ['TICKET-IN-WORK'] });
    const commit = await commitAll(root);
    await writeReceipt(root, RECEIPT(commit, FIXED_DAY));

    const refused = await closeRelease(root, { scheme: 'date', today: FIXED_DAY });
    assert.equal(refused.closed, false);
    assert.ok(refused.problems.some((problem) => problem.includes('TICKET-IN-WORK состава не выполнена (in_progress)')), refused.problems.join('\n'));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

// REQ-RELEASE-033
test('задача снимается из состава записью с причиной', async () => {
  const root = await project();
  try {
    await writeFile(path.join(root, 'docs/tickets/in-work.md'), ticket('TICKET-IN-WORK', 'in_progress'));
    await writeFile(path.join(root, 'docs/tickets/closed/shipped.md'), ticket('TICKET-SHIPPED', 'done'));
    await openNext(root, { scheme: 'date', today: FIXED_DAY, tickets: ['TICKET-IN-WORK'] });

    const withoutReason = await dropFromComposition(root, { ticketId: 'TICKET-IN-WORK', reason: '  ' });
    assert.equal(withoutReason.dropped, false);

    const dropped = await dropFromComposition(root, { ticketId: 'TICKET-IN-WORK', reason: 'работа отложена до следующего выпуска' });
    assert.equal(dropped.dropped, true, dropped.problems?.join('\n'));

    const document = (await openRelease(root)).content;
    assert.doesNotMatch(document, /\| \[TICKET-IN-WORK\]/, 'строка состава снята');
    assert.match(document, /- TICKET-IN-WORK — снята из состава: работа отложена до следующего выпуска/);
    assert.match(await readFile(path.join(root, 'docs/tickets/in-work.md'), 'utf8'), /^release: unassigned$/m);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

// REQ-RELEASE-034
test('завершающий шаг требует тега и записи о том, чем он выполнен', async () => {
  const root = await project();
  try {
    await writeFile(
      path.join(root, 'node_modules/@apocarteres/project-conventions/obligations.json'),
      JSON.stringify({ obligations: [] }),
    );
    await openNext(root, { scheme: 'date', today: FIXED_DAY });
    await writeFile(path.join(root, 'docs/tickets/closed/shipped.md'), ticket('TICKET-SHIPPED', 'done'));
    const commit = await commitAll(root);
    await writeReceipt(root, RECEIPT(commit, FIXED_DAY));

    const early = await finishRelease(root, { scheme: 'date', today: FIXED_DAY, note: 'развёрнуто' });
    assert.equal(early.finished, false, 'без тега завершать нечего');
    assert.ok(early.problems.some((problem) => problem.includes('release close')), early.problems.join('\n'));

    assert.equal((await closeRelease(root, { scheme: 'date', today: FIXED_DAY })).closed, true);

    const withoutNote = await finishRelease(root, { scheme: 'date', today: FIXED_DAY, note: '  ' });
    assert.equal(withoutNote.finished, false);
    assert.ok(withoutNote.problems.some((problem) => problem.includes('--note')));

    const finished = await finishRelease(root, { scheme: 'date', today: FIXED_DAY, note: 'развёртывание в прод' });
    assert.equal(finished.finished, true, finished.problems?.join('\n'));
    assert.equal(finished.commit, commit, 'выпущенным записан коммит тега');

    const state = JSON.parse(await readFile(path.join(root, '.conventions/obligations.json'), 'utf8'));
    assert.equal(state.releaseCount, 1, 'счёт выпусков ведёт завершающий шаг');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

// REQ-RELEASE-010
test('после завершения выпуска открытого выпуска нет, и это не отказ', async () => {
  const root = await project();
  try {
    await writeFile(
      path.join(root, 'node_modules/@apocarteres/project-conventions/obligations.json'),
      JSON.stringify({ obligations: [] }),
    );
    await openNext(root, { scheme: 'date', today: FIXED_DAY });
    await writeFile(path.join(root, 'docs/tickets/closed/shipped.md'), ticket('TICKET-SHIPPED', 'done'));
    const commit = await commitAll(root);
    await writeReceipt(root, RECEIPT(commit, FIXED_DAY));
    await closeRelease(root, { scheme: 'date', today: FIXED_DAY });
    await finishRelease(root, { scheme: 'date', today: FIXED_DAY, note: 'публикация' });

    assert.equal(await openRelease(root), null, 'открытого выпуска нет');
    const state = await closability(root, { scheme: 'date' });
    assert.ok(state.problems.some((problem) => problem.includes('Открытого выпуска нет')), state.problems.join('\n'));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

// REQ-RELEASE-035
test('проверка правил роняет сборку на просроченном долге и предупреждает о долге в срок', async () => {
  const root = await project();
  try {
    const state = (releaseCount, seenAt) => writeFile(
      path.join(root, '.conventions/obligations.json'),
      JSON.stringify({ releaseCount, seen: { sample: seenAt }, closed: {}, deferred: {} }),
    );
    await mkdir(path.join(root, '.conventions'), { recursive: true });

    await state(3, 1);
    const overdue = await findObligationDebts(root);
    assert.equal(overdue.problems.length, 1, overdue.problems.join('\n'));
    assert.match(overdue.problems[0], /обязательство ядра sample .* просрочено, срок 2 выпуск\(ов\), прошло 2/);
    assert.deepEqual(overdue.advisories, []);

    await state(2, 1);
    const inTime = await findObligationDebts(root);
    assert.deepEqual(inTime.problems, [], 'долг в срок сборку не роняет');
    assert.equal(inTime.advisories.length, 1);
    assert.match(inTime.advisories[0], /не закрыто, остаётся выпусков 1/);

    await writeFile(
      path.join(root, '.conventions/obligations.json'),
      JSON.stringify({ releaseCount: 1, seen: { sample: 1 }, closed: { sample: { release: 'RELEASE-2026-09-1', ticket: 'TICKET-DONE' } }, deferred: {} }),
    );
    const closed = await findObligationDebts(root);
    assert.deepEqual(closed, { problems: [], advisories: [] }, 'закрытое обязательство долгом не считается');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

// REQ-NAMING-012, REQ-NAMING-003
test('задача обязательства получает имя по правилу именования проекта', async () => {
  const root = await project();
  try {
    await writeFile(path.join(root, '.conventions.json'), JSON.stringify({ sources: [], ticketPrefix: 'ZAVPN' }));
    await writeFile(path.join(root, 'docs/tickets/closed/ZAVPN-QUAL-007-done.md'), ticket('ZAVPN-QUAL-007', 'done'));

    const opened = await openNext(root, { scheme: 'date', today: FIXED_DAY });
    assert.equal(opened.opened, true, opened.problems?.join('\n'));
    assert.deepEqual(opened.created, ['ZAVPN-QUAL-008'], 'номер следующий свободный в своей области');

    const file = path.join(root, 'docs/tickets/ZAVPN-QUAL-008-adopt-sample.md');
    const body = await readFile(file, 'utf8');
    assert.match(body, /^id: ZAVPN-QUAL-008$/m);
    assert.match(body, /^obligation: sample$/m);
    assert.doesNotMatch(body, /TICKET-ADOPT/, 'прежней формы идентификатора не остаётся');
    assert.doesNotMatch(path.basename(file), /\d{4}-\d{2}-\d{2}/, 'даты в имени файла нет');

    const release = (await openRelease(root)).content;
    assert.match(release, /\| \[ZAVPN-QUAL-008\]\(\.\.\/tickets\/ZAVPN-QUAL-008-adopt-sample\.md\)/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

// REQ-NAMING-012
test('без объявленного префикса задача обязательства именуется областью и номером', async () => {
  const root = await project();
  try {
    const opened = await openNext(root, { scheme: 'date', today: FIXED_DAY });
    assert.deepEqual(opened.created, ['QUAL-001']);
    assert.match(await readFile(path.join(root, 'docs/tickets/QUAL-001-adopt-sample.md'), 'utf8'), /^id: QUAL-001$/m);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

// REQ-RELEASE-036
test('закрытие сверяет коммиты диапазона с составом выпуска', async () => {
  const root = await project();
  try {
    await writeFile(
      path.join(root, 'node_modules/@apocarteres/project-conventions/obligations.json'),
      JSON.stringify({ obligations: [] }),
    );
    await writeFile(path.join(root, '.conventions.json'), JSON.stringify({ sources: [], ticketPrefix: 'ZAVPN' }));
    const baseline = await commitAll(root);
    await writeFile(path.join(root, '.conventions.json'), JSON.stringify({ sources: [], ticketPrefix: 'ZAVPN', commitRuleSince: baseline }));
    await openNext(root, { scheme: 'date', today: FIXED_DAY });
    await writeFile(path.join(root, 'docs/tickets/closed/ZAVPN-QUAL-007-done.md'), ticket('ZAVPN-QUAL-007', 'done'));
    await writeFile(path.join(root, 'docs/tickets/closed/ZAVPN-QUAL-008-other.md'), ticket('ZAVPN-QUAL-008', 'done'));

    await git('-C', root, 'add', '-A');
    await git('-C', root, 'commit', '--quiet', '-m', 'ZAVPN-QUAL-007 работа по задаче состава');

    await writeFile(path.join(root, 'docs/tickets/closed/ZAVPN-QUAL-010-stray.md'), ticket('ZAVPN-QUAL-010', 'done'));
    const commit = await commitAll(root);
    await writeReceipt(root, RECEIPT(commit, FIXED_DAY));

    const named = await closability(root, { scheme: 'date' });
    assert.ok(
      named.problems.some((problem) => problem.includes('не называет задачу')),
      named.problems.join('\n'),
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

// REQ-RELEASE-036
test('коммит с признаком цикла и коммит задачи состава проверку проходят', async () => {
  const root = await project();
  try {
    await writeFile(
      path.join(root, 'node_modules/@apocarteres/project-conventions/obligations.json'),
      JSON.stringify({ obligations: [] }),
    );
    const baseline = await commitAll(root);
    await writeFile(path.join(root, '.conventions.json'), JSON.stringify({ sources: [], ticketPrefix: 'ZAVPN', commitRuleSince: baseline }));
    await openNext(root, { scheme: 'date', today: FIXED_DAY });
    await git('-C', root, 'add', '-A');
    await git('-C', root, 'commit', '--quiet', '-m', 'Открыт выпуск\n\nRelease-cycle: RELEASE-2026-09-1');

    await writeFile(path.join(root, 'docs/tickets/closed/ZAVPN-QUAL-007-done.md'), ticket('ZAVPN-QUAL-007', 'done'));
    await git('-C', root, 'add', '-A');
    await git('-C', root, 'commit', '--quiet', '-m', 'ZAVPN-QUAL-007 работа по задаче состава');
    const head = await git('-C', root, 'rev-parse', 'HEAD');
    await writeReceipt(root, RECEIPT(head.stdout.trim(), FIXED_DAY));

    const state = await closability(root, { scheme: 'date' });
    assert.deepEqual(
      state.problems.filter((problem) => problem.includes('Коммит')),
      [],
      state.problems.join('\n'),
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

// REQ-RELEASE-033, REQ-RELEASE-036
test('снятая из состава задача удерживает выпуск своими коммитами', async () => {
  const root = await project();
  try {
    await writeFile(
      path.join(root, 'node_modules/@apocarteres/project-conventions/obligations.json'),
      JSON.stringify({ obligations: [] }),
    );
    const baseline = await commitAll(root);
    await writeFile(path.join(root, '.conventions.json'), JSON.stringify({ sources: [], ticketPrefix: 'ZAVPN', commitRuleSince: baseline }));
    await writeFile(path.join(root, 'docs/tickets/ZAVPN-QUAL-009-work.md'), ticket('ZAVPN-QUAL-009', 'in_progress'));
    await openNext(root, { scheme: 'date', today: FIXED_DAY, tickets: ['ZAVPN-QUAL-009'] });
    await mkdir(path.join(root, 'src'), { recursive: true });
    await writeFile(path.join(root, 'src/Work.java'), 'class Work {}\n');
    await git('-C', root, 'add', '-A');
    await git('-C', root, 'commit', '--quiet', '-m', 'ZAVPN-QUAL-009 работа по указанной задаче');

    const dropped = await dropFromComposition(root, { ticketId: 'ZAVPN-QUAL-009', reason: 'работа отложена' });
    assert.equal(dropped.dropped, true, dropped.problems?.join('\n'));

    await writeFile(path.join(root, 'docs/tickets/closed/ZAVPN-QUAL-007-done.md'), ticket('ZAVPN-QUAL-007', 'done'));
    const commit = await commitAll(root);
    await writeReceipt(root, RECEIPT(commit, FIXED_DAY));

    const state = await closability(root, { scheme: 'date' });
    assert.ok(
      state.problems.some((problem) => problem.includes('ZAVPN-QUAL-009 вне состава выпуска')),
      state.problems.join('\n'),
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

// REQ-RELEASE-037
test('отменённая работа снятой задачи выпуск не удерживает', async () => {
  const root = await project();
  try {
    await writeFile(
      path.join(root, 'node_modules/@apocarteres/project-conventions/obligations.json'),
      JSON.stringify({ obligations: [] }),
    );
    await writeFile(path.join(root, '.conventions.json'), JSON.stringify({ sources: [], ticketPrefix: 'ZAVPN' }));
    await writeFile(path.join(root, 'docs/tickets/ZAVPN-QUAL-009-work.md'), ticket('ZAVPN-QUAL-009', 'in_progress'));
    const baseline = await commitAll(root);
    await writeFile(path.join(root, '.conventions.json'), JSON.stringify({ sources: [], ticketPrefix: 'ZAVPN', commitRuleSince: baseline }));
    await openNext(root, { scheme: 'date', today: FIXED_DAY, tickets: ['ZAVPN-QUAL-009'] });
    await writeFile(path.join(root, 'docs/tickets/closed/ZAVPN-QUAL-007-done.md'), ticket('ZAVPN-QUAL-007', 'done'));
    await git('-C', root, 'add', '-A');
    await git('-C', root, 'commit', '--quiet', '-m', 'ZAVPN-QUAL-009 работа по указанной задаче');

    assert.equal(
      (await dropFromComposition(root, { ticketId: 'ZAVPN-QUAL-009', reason: 'работа отложена' })).dropped,
      true,
    );
    await git('-C', root, 'add', '-A');
    await git('-C', root, 'commit', '--quiet', '-m', 'ZAVPN-QUAL-009 !revert отмена отложенной работы');

    const commit = await commitAll(root).catch(() => git('-C', root, 'rev-parse', 'HEAD').then((r) => r.stdout.trim()));
    await writeReceipt(root, RECEIPT(commit, FIXED_DAY));

    const reverted = await closability(root, { scheme: 'date' });
    assert.deepEqual(
      reverted.problems.filter((problem) => problem.includes('ZAVPN-QUAL-009')),
      [],
      reverted.problems.join('\n'),
    );

    await mkdir(path.join(root, 'src'), { recursive: true });
    await writeFile(path.join(root, 'src/Resumed.java'), 'class Resumed {}\n');
    await git('-C', root, 'add', '-A');
    await git('-C', root, 'commit', '--quiet', '-m', 'ZAVPN-QUAL-009 работа после отмены');

    const again = await closability(root, { scheme: 'date' });
    assert.ok(
      again.problems.some((problem) => problem.includes('ZAVPN-QUAL-009 вне состава выпуска')),
      again.problems.join('\n'),
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

// REQ-RELEASE-036
test('закрытие не требует задач выпуска, вышедшего под номером с двузначной частью', async () => {
  const root = await project();
  try {
    await writeFile(
      path.join(root, 'node_modules/@apocarteres/project-conventions/obligations.json'),
      JSON.stringify({ obligations: [] }),
    );
    await writeFile(path.join(root, '.conventions.json'), JSON.stringify({ sources: [], ticketPrefix: 'ZAVPN' }));
    const baseline = await commitAll(root);
    await writeFile(path.join(root, '.conventions.json'), JSON.stringify({ sources: [], ticketPrefix: 'ZAVPN', commitRuleSince: baseline }));

    const ship = async (version, id) => {
      assert.equal((await openNext(root, { scheme: 'semver', version, today: FIXED_DAY })).opened, true);
      await git('-C', root, 'add', '-A');
      await git('-C', root, 'commit', '--quiet', '-m', `Открыт выпуск ${version}\n\nRelease-cycle: RELEASE-${version.replaceAll('.', '-')}`);
      await writeFile(path.join(root, `docs/tickets/closed/${id}-work.md`), ticket(id, 'done'));
      await git('-C', root, 'add', '-A');
      await git('-C', root, 'commit', '--quiet', '-m', `${id} работа по задаче состава`);
      const { stdout } = await git('-C', root, 'rev-parse', 'HEAD');
      await writeReceipt(root, RECEIPT(stdout.trim(), FIXED_DAY));
      assert.equal((await closeRelease(root, { scheme: 'semver', today: FIXED_DAY })).closed, true);
      assert.equal((await finishRelease(root, { scheme: 'semver', today: FIXED_DAY, note: 'публикация' })).finished, true);
      await git('-C', root, 'add', '-A');
      await git('-C', root, 'commit', '--quiet', '-m', `Выпущен ${version}\n\nRelease-cycle: RELEASE-${version.replaceAll('.', '-')}`);
    };

    await ship('1.2.0', 'ZAVPN-QUAL-002');
    await ship('1.10.0', 'ZAVPN-QUAL-003');

    assert.equal((await openNext(root, { scheme: 'semver', version: '1.11.0', today: NEXT_DAY })).opened, true);
    await git('-C', root, 'add', '-A');
    await git('-C', root, 'commit', '--quiet', '-m', 'Открыт выпуск 1.11.0\n\nRelease-cycle: RELEASE-1-11-0');
    await writeFile(path.join(root, 'docs/tickets/closed/ZAVPN-QUAL-004-work.md'), ticket('ZAVPN-QUAL-004', 'done'));
    await git('-C', root, 'add', '-A');
    await git('-C', root, 'commit', '--quiet', '-m', 'ZAVPN-QUAL-004 работа по задаче состава');

    const state = await closability(root, { scheme: 'semver' });
    assert.deepEqual(
      state.problems.filter((problem) => problem.includes('Коммит')),
      [],
      state.problems.join('\n'),
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

// REQ-RELEASE-039
test('отказ называет способ внести задачу в состав, а для отнесённой — что способа нет', async () => {
  const root = await project();
  try {
    await writeFile(
      path.join(root, 'node_modules/@apocarteres/project-conventions/obligations.json'),
      JSON.stringify({ obligations: [] }),
    );
    await writeFile(path.join(root, '.conventions.json'), JSON.stringify({ sources: [], ticketPrefix: 'ZAVPN' }));
    const baseline = await commitAll(root);
    await writeFile(path.join(root, '.conventions.json'), JSON.stringify({ sources: [], ticketPrefix: 'ZAVPN', commitRuleSince: baseline }));
    await writeFile(path.join(root, 'docs/tickets/closed/ZAVPN-QUAL-005-shipped.md'), ticket('ZAVPN-QUAL-005', 'done', 'RELEASE-2026-08-1'));
    await writeFile(path.join(root, 'docs/tickets/ZAVPN-QUAL-006-work.md'), ticket('ZAVPN-QUAL-006', 'in_progress'));
    await openNext(root, { scheme: 'date', today: FIXED_DAY });
    await git('-C', root, 'add', '-A');
    await git('-C', root, 'commit', '--quiet', '-m', 'Открыт выпуск\n\nRelease-cycle: RELEASE-2026-09-1');

    await mkdir(path.join(root, 'src'), { recursive: true });
    await writeFile(path.join(root, 'src/Shipped.java'), 'class Shipped {}\n');
    await git('-C', root, 'add', '-A');
    await git('-C', root, 'commit', '--quiet', '-m', 'ZAVPN-QUAL-005 правка после выпуска задачи');
    await writeFile(path.join(root, 'src/Ongoing.java'), 'class Ongoing {}\n');
    await git('-C', root, 'add', '-A');
    await git('-C', root, 'commit', '--quiet', '-m', 'ZAVPN-QUAL-006 работа по незаконченной задаче');

    const state = await closability(root, { scheme: 'date' });
    const shipped = state.problems.find((problem) => problem.includes('ZAVPN-QUAL-005'));
    assert.ok(shipped !== undefined, state.problems.join('\n'));
    assert.match(shipped, /уже отнесена к RELEASE-2026-08-1/);
    assert.match(shipped, /новой задачей/, 'назван законный выход при отнесённой задаче');

    const open = state.problems.find((problem) => problem.includes('ZAVPN-QUAL-006'));
    assert.ok(open !== undefined, state.problems.join('\n'));
    assert.match(open, /доведите её до выполненного состояния/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

// REQ-RELEASE-036
test('коммит слияния задачи не называет и закрытие не роняет', async () => {
  const root = await project();
  try {
    await writeFile(
      path.join(root, 'node_modules/@apocarteres/project-conventions/obligations.json'),
      JSON.stringify({ obligations: [] }),
    );
    const baseline = await commitAll(root);
    await writeFile(path.join(root, '.conventions.json'), JSON.stringify({ sources: [], ticketPrefix: 'ZAVPN', commitRuleSince: baseline }));
    await openNext(root, { scheme: 'date', today: FIXED_DAY });
    await git('-C', root, 'add', '-A');
    await git('-C', root, 'commit', '--quiet', '-m', 'Открыт выпуск\n\nRelease-cycle: RELEASE-2026-09-1');

    await git('-C', root, 'checkout', '--quiet', '-b', 'side');
    await writeFile(path.join(root, 'docs/tickets/closed/ZAVPN-QUAL-007-done.md'), ticket('ZAVPN-QUAL-007', 'done'));
    await git('-C', root, 'add', '-A');
    await git('-C', root, 'commit', '--quiet', '-m', 'ZAVPN-QUAL-007 работа по задаче состава');
    await git('-C', root, 'checkout', '--quiet', '-');
    await mkdir(path.join(root, 'docs/tickets/closed'), { recursive: true });
    await writeFile(path.join(root, 'docs/tickets/closed/ZAVPN-QUAL-008-other.md'), ticket('ZAVPN-QUAL-008', 'done'));
    await git('-C', root, 'add', '-A');
    await git('-C', root, 'commit', '--quiet', '-m', 'ZAVPN-QUAL-008 работа рядом');
    await git('-C', root, 'merge', '--quiet', '--no-ff', '--no-edit', 'side');

    const head = await git('-C', root, 'rev-parse', 'HEAD');
    await writeReceipt(root, RECEIPT(head.stdout.trim(), FIXED_DAY));

    const state = await closability(root, { scheme: 'date' });
    assert.deepEqual(
      state.problems.filter((problem) => problem.includes('Коммит')),
      [],
      state.problems.join('\n'),
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

// REQ-RELEASE-040
test('запись решения в документе задачи закрытие не удерживает, а работа по ней — удерживает', async () => {
  const root = await project();
  try {
    await writeFile(
      path.join(root, 'node_modules/@apocarteres/project-conventions/obligations.json'),
      JSON.stringify({ obligations: [] }),
    );
    const baseline = await commitAll(root);
    await writeFile(path.join(root, '.conventions.json'), JSON.stringify({ sources: [], ticketPrefix: 'ZAVPN', commitRuleSince: baseline }));
    await writeFile(path.join(root, 'docs/tickets/ZAVPN-OPS-021-waiting.md'), ticket('ZAVPN-OPS-021', 'in_progress'));
    await openNext(root, { scheme: 'date', today: FIXED_DAY });
    await writeFile(path.join(root, 'docs/tickets/closed/ZAVPN-QUAL-007-done.md'), ticket('ZAVPN-QUAL-007', 'done'));
    await git('-C', root, 'add', '-A');
    await git('-C', root, 'commit', '--quiet', '-m', 'Открыт выпуск\n\nRelease-cycle: RELEASE-2026-09-1');

    await writeFile(
      path.join(root, 'docs/tickets/ZAVPN-OPS-021-waiting.md'),
      `${ticket('ZAVPN-OPS-021', 'in_progress')}\n## Открытые вопросы\n\nОтвет владельца 2026-09-12: ждём решения о владении метриками.\n`,
    );
    await git('-C', root, 'add', '-A');
    await git('-C', root, 'commit', '--quiet', '-m', 'ZAVPN-OPS-021 записан ответ владельца, задача ждёт внешнего решения');
    const recorded = await git('-C', root, 'rev-parse', 'HEAD');
    await writeReceipt(root, RECEIPT(recorded.stdout.trim(), FIXED_DAY));

    const state = await closability(root, { scheme: 'date' });
    assert.deepEqual(
      state.problems.filter((problem) => problem.includes('Коммит')),
      [],
      state.problems.join('\n'),
    );

    await mkdir(path.join(root, 'src'), { recursive: true });
    await writeFile(path.join(root, 'src/Metrics.java'), 'class Metrics {}\n');
    await git('-C', root, 'add', '-A');
    await git('-C', root, 'commit', '--quiet', '-m', 'ZAVPN-OPS-021 работа по задаче вне состава');
    const worked = await git('-C', root, 'rev-parse', 'HEAD');
    await writeReceipt(root, RECEIPT(worked.stdout.trim(), FIXED_DAY));

    const after = await closability(root, { scheme: 'date' });
    assert.ok(
      after.problems.some((problem) => problem.includes('ZAVPN-OPS-021 вне состава выпуска')),
      after.problems.join('\n'),
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

// REQ-RELEASE-019
test('задача, объявившая обязательство, закрывает его и второй не заводится', async () => {
  const root = await project();
  try {
    await writeFile(
      path.join(root, 'docs/tickets/closed/QUAL-100-adopt-sample.md'),
      `${ticket('QUAL-100', 'done')}`.replace('release: unassigned', 'release: unassigned\nobligation: sample'),
    );

    const opened = await openNext(root, { scheme: 'date', today: FIXED_DAY });
    assert.deepEqual(opened.created, [], 'вторая задача на то же обязательство не заводится');

    const commit = await commitAll(root);
    await writeReceipt(root, RECEIPT(commit, FIXED_DAY));
    assert.equal((await closeRelease(root, { scheme: 'date', today: FIXED_DAY })).closed, true);
    assert.equal((await finishRelease(root, { scheme: 'date', today: FIXED_DAY, note: 'публикация' })).finished, true);

    const state = JSON.parse(await readFile(path.join(root, '.conventions/obligations.json'), 'utf8'));
    assert.equal(state.closed.sample.ticket, 'QUAL-100', JSON.stringify(state));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

// REQ-RELEASE-019
test('задача с тем же слагом, не объявившая обязательство, названа при открытии', async () => {
  const root = await project();
  try {
    await writeFile(path.join(root, 'docs/tickets/closed/QUAL-100-adopt-sample.md'), ticket('QUAL-100', 'done'));

    const opened = await openNext(root, { scheme: 'date', today: FIXED_DAY });

    assert.deepEqual(opened.created, ['QUAL-101'], 'заготовка всё же заводится: связь не объявлена');
    assert.deepEqual(opened.unclaimed, [{ ticket: 'QUAL-100', obligation: 'sample' }]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
