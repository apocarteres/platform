import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { nextReleaseId, openRelease, releaseTag, unassignedTerminalTickets } from '../lib/release/documents.mjs';
import { obligationState, overdueObligations, pendingObligations } from '../lib/release/obligations.mjs';
import { adoptCycle, closability, closeRelease, openNext } from '../lib/release/cycle.mjs';
import { writeReceipt } from '../lib/release/receipt.mjs';

const run = promisify(execFile);
const FIXED_DAY = new Date('2026-09-07T00:00:00Z');
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
  await run('git', ['-C', root, 'init', '--quiet']);
  await run('git', ['-C', root, 'config', 'user.email', 'test@example.test']);
  await run('git', ['-C', root, 'config', 'user.name', 'Test']);
  return root;
}

async function commitAll(root) {
  await run('git', ['-C', root, 'add', '-A']);
  await run('git', ['-C', root, 'commit', '--quiet', '-m', 'состояние']);
  const { stdout } = await run('git', ['-C', root, 'rev-parse', 'HEAD']);
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

    await writeReceipt(root, { commit, completedAt: '2026-09-07T00:00:00Z', checks: ['verify'] });
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
      body.replace('status: backlog', 'status: done').replace('release: RELEASE-2026-09-1', 'release: unassigned'),
    );
    const commit = await commitAll(root);
    await writeReceipt(root, { commit, completedAt: '2026-09-07T10:00:00Z', checks: ['verify'] });

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
    assert.equal(document.includes('- [ ]'), false, 'критерии закрытого выпуска отмечены с подтверждением');

    const state = JSON.parse(await readFile(path.join(root, '.conventions/obligations.json'), 'utf8'));
    assert.equal(state.releaseCount, 1);
    assert.equal(state.closed.sample.release, 'RELEASE-2026-09-1');

    const { stdout: tagged } = await run('git', ['-C', root, 'rev-list', '-n', '1', '2026.09.1']);
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
    const { stdout: tags } = await run('git', ['-C', root, 'tag', '--list']);
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
