import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { tagCommit, tagMessage } from '../lib/release/git.mjs';
import { closeRelease, freezeRelease } from '../lib/store/cycle.mjs';
import { manifestOf } from '../lib/store/shape.mjs';
import { OBLIGATION, project } from './store-project.mjs';

const put = async (p, file, content) => {
  await mkdir(path.dirname(path.join(p.root, file)), { recursive: true });
  await writeFile(path.join(p.root, file), content);
};

// REQ-STORE-027
test('заморозка проверяет закрываемость: условие «до заморозки» и просроченное обязательство держат её, обычное условие — нет', async () => {
  const p = await project({ obligations: [OBLIGATION] });
  try {
    p.store.add('SHOP-OPS-001', { status: 'done', conditions: [
      { key: 'external-sign-off', phase: 'before-release', state: 'pending', due: 'freeze' },
      { key: 'manual-qa', phase: 'before-release', state: 'pending' },
    ] });
    assert.equal((await p.command('release', 'open')).code, 0);
    p.store.state.releasedCount += OBLIGATION.dueReleases + 1;

    const refused = await p.command('release', 'freeze');
    assert.equal(refused.code, 1);
    const said = refused.stdout + refused.stderr;
    assert.match(said, /Задача SHOP-OPS-001: условие выпуска external-sign-off \(before-release, до заморозки\) не выполнено/);
    assert.match(said, /Обязательство sample просрочено/);
    assert.doesNotMatch(said, /manual-qa/, 'обычное условие before-release выполняется во время заморозки');
    assert.equal(p.store.open().status, 'draft');

    p.store.state.releasedCount -= OBLIGATION.dueReleases + 1;
    const obligation = [...p.store.state.tickets.values()].find((ticket) => ticket.obligation === 'sample');
    await p.commit(`${obligation.id} Обязательство`);
    p.store.find('SHOP-OPS-001').conditions[0].state = 'done';
    const frozen = await freezeRelease(p.root, p.context());
    assert.equal(frozen.frozen, true, JSON.stringify(frozen.problems));
    assert.equal(p.store.open().status, 'closing');

    await p.attest();
    const closing = await closeRelease(p.root, p.context());
    assert.match(closing.problems.join('\n'), /условие выпуска manual-qa \(before-release\) не выполнено/);
  } finally {
    await p.stop();
  }
});

// REQ-STORE-027
test('e2e переносится через правки вне сборки: closeRelease записывает перенос, манифест его несёт', async () => {
  const p = await project({ extra: { e2e: { outsideBuild: ['.github/', 'scripts/checks/'] } } });
  try {
    p.store.add('SHOP-OPS-001', { status: 'done' });
    p.store.add('SHOP-OPS-009', { status: 'in_progress' });
    assert.equal((await p.command('release', 'open', '--task', 'SHOP-OPS-009')).code, 0);
    const run = await p.git('rev-parse', 'HEAD');
    assert.equal((await p.command('release', 'record-e2e', '--commit', run)).code, 0);

    await put(p, '.github/workflows/check.yml', 'on: push\n');
    await put(p, 'scripts/checks/lint.sh', 'true\n');
    await put(p, 'docs/note.md', 'заметка\n');
    await p.commit('SHOP-OPS-001 Правка CI');
    const head = await p.attest();
    const closed = await closeRelease(p.root, p.context());
    assert.equal(closed.closed, true, JSON.stringify(closed.problems));
    assert.equal(await tagCommit(p.root, '2026.11.1'), head);
    assert.deepEqual(manifestOf(await tagMessage(p.root, '2026.11.1')).e2e, { commit: head, from: run });
    assert.deepEqual({ ...p.store.open().e2e, at: null }, { commit: head, from: run, at: null });
  } finally {
    await p.stop();
  }
});

// REQ-STORE-027
test('e2e не переносится через правку сборки, с чужой ветки и при неверном e2e.outsideBuild; перезакрытие переносит', async () => {
  const p = await project({ extra: { e2e: { outsideBuild: ['.github/'] } } });
  try {
    p.store.add('SHOP-OPS-001', { status: 'done' });
    p.store.add('SHOP-OPS-009', { status: 'in_progress' });
    assert.equal((await p.command('release', 'open', '--task', 'SHOP-OPS-009')).code, 0);
    const run = await p.git('rev-parse', 'HEAD');
    assert.equal((await p.command('release', 'record-e2e', '--commit', run)).code, 0);
    await put(p, 'src/app.js', 'export {};\n');
    await put(p, '.github/workflows/check.yml', 'on: push\n');
    await p.commit('SHOP-OPS-001 Правка кода');
    const head = await p.attest();
    const built = await closeRelease(p.root, p.context());
    assert.equal(built.closed, false);
    assert.match(built.problems.join('\n'), /После прогона изменены файлы сборки: src\/app\.js\./);
    assert.match(built.problems.join('\n'), new RegExp(`release record-e2e --commit ${head}`));
    assert.equal(await tagCommit(p.root, '2026.11.1'), null);

    const stray = 'b'.repeat(40);
    assert.equal((await p.command('release', 'record-e2e', '--commit', stray)).code, 0);
    const foreign = await closeRelease(p.root, p.context());
    assert.match(foreign.problems.join('\n'), /Коммит прогона не предок закрываемого/);

    assert.equal((await p.command('release', 'record-e2e', '--commit', head)).code, 0);
    assert.equal((await closeRelease(p.root, p.context())).closed, true);
    await put(p, '.github/workflows/deploy.yml', 'on: push\n');
    await p.commit('SHOP-OPS-001 Правка выкладки');
    const fixed = await p.attest();
    const reclosed = await closeRelease(p.root, p.context(), { reason: 'правка CI' });
    assert.equal(reclosed.closed, true, JSON.stringify(reclosed.problems));
    assert.equal(await tagCommit(p.root, '2026.11.1'), fixed);
    assert.equal(p.store.open().e2e.from, head);

    p.config.e2e = { outsideBuild: '.github/' };
    await put(p, '.github/workflows/more.yml', 'on: push\n');
    await p.commit('SHOP-OPS-001 Ещё правка');
    await p.attest();
    const malformed = await closeRelease(p.root, p.context(), { reason: 'ещё правка' });
    assert.match(malformed.problems.join('\n'), /e2e\.outsideBuild в \.conventions\.json — перечень путей/);
  } finally {
    await p.stop();
  }
});

// REQ-STORE-027
test('store --check: due у условия — только "freeze" и только у before-release', async () => {
  const p = await project();
  try {
    p.store.add('SHOP-OPS-001', { status: 'backlog', conditions: [
      { key: 'sign-off', phase: 'after-release', state: 'pending', due: 'freeze' },
      { key: 'qa', phase: 'before-release', state: 'pending', due: 'close' },
      { key: 'ok', phase: 'before-release', state: 'pending', due: 'freeze' },
    ] });
    const result = await p.command('store', '--check');
    assert.equal(result.code, 1);
    const said = result.stdout + result.stderr;
    assert.match(said, /условие sign-off: due — только "freeze" и только у before-release/);
    assert.match(said, /условие qa: due — только "freeze" и только у before-release/);
    assert.doesNotMatch(said, /условие ok:/);
  } finally {
    await p.stop();
  }
});
