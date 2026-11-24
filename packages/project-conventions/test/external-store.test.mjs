import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { tagCommit, tagMessage } from '../lib/release/git.mjs';
import { storeDeclaration } from '../lib/store/config.mjs';
import { StoreRefusal, storeClient } from '../lib/store/client.mjs';
import { closeRelease, finishRelease, openRelease, settle } from '../lib/store/cycle.mjs';
import { checkStore } from '../lib/store/check.mjs';
import { commitsWithoutATicket } from '../lib/store/commits.mjs';
import { manifestOf } from '../lib/store/shape.mjs';
import { documentationProblems } from '../lib/docs/documentation.mjs';
import { OBLIGATION, project } from './store-project.mjs';

test('store в .conventions.json: неизвестный ключ, адрес с ключом и ключ вместо имени переменной — отказ', () => {
  assert.equal(storeDeclaration({}).store, null);
  assert.equal(storeDeclaration({ store: { kind: 'files' } }).store, null);
  assert.match(storeDeclaration({ store: { kind: 'external', url: 'https://t.example/x', readKeyEnv: 'K', idPattern: 'A-\\d+', extra: 1 } }).problems.join(), /неизвестный ключ extra/);
  assert.match(storeDeclaration({ store: { kind: 'external', readKeyEnv: 'K', idPattern: 'A-\\d+' } }).problems.join(), /store\.url/);
  assert.match(storeDeclaration({ store: { kind: 'external', url: 'https://u:p@t.example', readKeyEnv: 'K', idPattern: 'A-\\d+' } }).problems.join(), /без учётных данных/);
  assert.match(storeDeclaration({ store: { kind: 'external', url: 'https://t.example', readKeyEnv: 'sk-live-123', idPattern: 'A-\\d+' } }).problems.join(), /имя переменной окружения/);
  assert.match(storeDeclaration({ store: { kind: 'external', url: 'https://t.example', idPattern: 'A-\\d+' } }).problems.join(), /назовите переменную/);
  assert.match(storeDeclaration({ store: { kind: 'external', url: 'https://t.example', readKeyEnv: 'K', idPattern: '(' } }).problems.join(), /idPattern/);
  const ok = storeDeclaration({ store: { kind: 'external', url: 'https://t.example/api/', readKeyEnv: 'K', idPattern: 'A-\\d+' } });
  assert.deepEqual(ok.problems, []);
  assert.equal(ok.store.url, 'https://t.example/api');
});

test('выпуск открывается, закрывается и завершается операциями хранилища; тег несёт манифест', async () => {
  const p = await project();
  try {
    p.store.add('SHOP-OPS-001', { status: 'done' });
    p.store.add('SHOP-OPS-002', { status: 'done', sections: { whyNot: false, openQuestions: false, beforeDeploy: '- Выключить задание', afterDeploy: null } });
    p.store.add('SHOP-OPS-003', { status: 'backlog' });
    const opened = await openRelease(p.root, p.context(), { version: undefined, tickets: ['SHOP-OPS-003'] });
    assert.equal(opened.id, 'RELEASE-2026-11-1');
    assert.equal(opened.tag, '2026.11.1');
    await p.store.operate('dropTicket', { ticket: 'SHOP-OPS-003', reason: 'не успели' });
    const head = await p.attest();
    const closed = await closeRelease(p.root, p.context());
    assert.equal(closed.closed, true, JSON.stringify(closed.problems));
    assert.deepEqual(closed.composition.sort(), ['SHOP-OPS-001', 'SHOP-OPS-002']);
    assert.equal(await tagCommit(p.root, '2026.11.1'), head);
    const manifest = manifestOf(await tagMessage(p.root, '2026.11.1'));
    assert.equal(manifest.release, 'RELEASE-2026-11-1');
    assert.equal(manifest.commit, head);
    assert.deepEqual(manifest.composition.map((one) => one.id).sort(), ['SHOP-OPS-001', 'SHOP-OPS-002']);
    assert.equal(manifest.receipt.command, 'mise run verify');
    assert.equal(p.store.open().status, 'in_progress');
    assert.equal(p.store.find('SHOP-OPS-001').release, 'RELEASE-2026-11-1');
    assert.deepEqual(p.store.open().actions.map((one) => [one.ticket, one.step, one.text, one.done]), [['SHOP-OPS-002', 'before', 'Выключить задание', false]]);

    const early = await finishRelease(p.root, p.context(), { note: 'развёрнуто' });
    assert.equal(early.finished, false);
    assert.match(early.problems.join(), /не отмечено: Выключить задание.*release mark SHOP-OPS-002 --step before/);
    await p.store.operate('markAction', { ticket: 'SHOP-OPS-002', step: 'before', item: 1, done: true, note: 'выключено' });
    const finished = await finishRelease(p.root, p.context(), { note: 'развёрнуто' });
    assert.equal(finished.finished, true, JSON.stringify(finished.problems));
    assert.equal(p.store.open(), null);
    assert.equal(p.store.state.releasedCount, 1);
    assert.deepEqual(p.store.operationsSeen(), ['openRelease', 'freezeRelease', 'closeRelease', 'finishRelease']);
  } finally {
    await p.stop();
  }
});

test('состав — задачи со слитой работой в любом статусе, кроме отменённой; выпуск закрывается без «Готово» и сам ставит его', async () => {
  const p = await project();
  try {
    p.store.add('SHOP-OPS-001', { status: 'in_review' });
    p.store.add('SHOP-OPS-002', { status: 'in_progress' });
    p.store.add('SHOP-OPS-003', { status: 'cancelled' });
    p.store.add('SHOP-OPS-004', { status: 'backlog' });
    p.store.add('SHOP-OPS-005', { status: 'done' });
    await p.commit('SHOP-OPS-001 Работа на проверке');
    await p.commit('SHOP-OPS-002 Работа в работе');
    await p.commit('SHOP-OPS-003 !revert Отменённая работа');
    await openRelease(p.root, p.context(), { tickets: [] });
    await p.attest();
    const closed = await closeRelease(p.root, p.context());
    assert.equal(closed.closed, true, JSON.stringify(closed.problems));
    assert.deepEqual(closed.composition.sort(), ['SHOP-OPS-001', 'SHOP-OPS-002', 'SHOP-OPS-005']);
    assert.equal(p.store.find('SHOP-OPS-003').release, null, 'отменённая в состав не входит');
    assert.equal(p.store.find('SHOP-OPS-004').release, null, 'задача без слитой работы в состав не входит');
    assert.equal(p.store.find('SHOP-OPS-001').status, 'in_review', 'закрытие статусов не меняет');
    const finished = await finishRelease(p.root, p.context(), { note: 'развёрнуто' });
    assert.equal(finished.finished, true, JSON.stringify(finished.problems));
    for (const name of ['SHOP-OPS-001', 'SHOP-OPS-002', 'SHOP-OPS-005']) assert.equal(p.store.find(name).status, 'done', name);
    assert.equal(p.store.find('SHOP-OPS-003').status, 'cancelled');
  } finally {
    await p.stop();
  }
});

test('указанная при открытии задача без слитой работы держит закрытие, отменённая из состава уходит', async () => {
  const p = await project();
  try {
    p.store.add('SHOP-OPS-001', { status: 'done' });
    p.store.add('SHOP-OPS-002', { status: 'todo' });
    p.store.add('SHOP-OPS-003', { status: 'in_review' });
    await openRelease(p.root, p.context(), { tickets: ['SHOP-OPS-002', 'SHOP-OPS-003'] });
    p.store.find('SHOP-OPS-003').status = 'cancelled';
    await p.attest();
    const held = await closeRelease(p.root, p.context());
    assert.equal(held.closed, false);
    const text = held.problems.join('\n');
    assert.match(text, /SHOP-OPS-002 состава без слитой работы \(todo\)/);
    assert.doesNotMatch(text, /SHOP-OPS-003/);
    assert.equal(p.store.open().status, 'draft');
  } finally {
    await p.stop();
  }
});

test('отменённая коммитом !revert работа в состав не подбирается; невыполненное условие before-release держит закрытие', async () => {
  const p = await project();
  try {
    p.store.add('SHOP-OPS-001', { status: 'in_progress' });
    p.store.add('SHOP-OPS-002', { status: 'in_review', conditions: [{ key: 'manual-qa', phase: 'before-release', state: 'pending' }] });
    await p.commit('SHOP-OPS-001 Работа');
    await p.commit('SHOP-OPS-001 !revert Работа не нужна');
    await p.commit('SHOP-OPS-002 Работа на ручной проверке');
    await openRelease(p.root, p.context(), { tickets: [] });
    await p.attest();
    const held = await closeRelease(p.root, p.context());
    assert.equal(held.closed, false);
    const text = held.problems.join('\n');
    assert.match(text, /Задача SHOP-OPS-002: условие выпуска manual-qa \(before-release\) не выполнено/);
    assert.doesNotMatch(text, /SHOP-OPS-001/);
    p.store.find('SHOP-OPS-002').conditions = [
      { key: 'manual-qa', phase: 'before-release', state: 'done' },
      { key: 'smoke', phase: 'after-release', state: 'pending' },
    ];
    const closed = await closeRelease(p.root, p.context());
    assert.equal(closed.closed, true, JSON.stringify(closed.problems));
    assert.deepEqual(closed.composition, ['SHOP-OPS-002']);
  } finally {
    await p.stop();
  }
});

test('выпуск, открытый на доске без команды ядра, закрывается тем же путём: обязательства заведены, порог вопросов проверен', async () => {
  const p = await project({ obligations: [OBLIGATION], extra: { release: { openQuestions: { remind: 0, require: 0 } } } });
  try {
    p.store.add('SHOP-OPS-001', { status: 'done' });
    p.store.add('SHOP-OPS-004', { status: 'backlog', questions: 'open' });
    await p.store.operate('openRelease', { tickets: [] });
    await p.attest();
    const held = await closeRelease(p.root, p.context());
    assert.equal(held.closed, false);
    assert.match(held.problems.join(), /Задач с открытыми вопросами 1 — больше 0/);
    assert.equal(p.store.open().status, 'draft', 'отказ проверки снимает заморозку');
    assert.equal(await tagCommit(p.root, '2026.11.1'), null);
    const materialized = [...p.store.state.tickets.values()].find((ticket) => ticket.obligation === 'sample');
    assert.equal(materialized.release, 'RELEASE-2026-11-1');
    assert.equal(p.store.state.obligations.get('sample').seenAtCount, 0);

    p.store.find('SHOP-OPS-004').questions = 'resolved';
    const closed = await closeRelease(p.root, p.context());
    assert.equal(closed.closed, true, JSON.stringify(closed.problems));
    assert.deepEqual(closed.composition, ['SHOP-OPS-001']);
    assert.equal(materialized.release, null, 'незаконченная задача обязательства снята на следующий выпуск');
  } finally {
    await p.stop();
  }
});

test('сбой операции после поставленного тега: повтор доводит запись по манифесту и второго тега не ставит', async () => {
  const p = await project();
  try {
    p.store.add('SHOP-OPS-001', { status: 'done' });
    await p.store.operate('openRelease', { tickets: [] });
    const head = await p.attest();
    p.store.state.failOperation = 'closeRelease';
    await assert.rejects(closeRelease(p.root, p.context()), /Тег 2026\.11\.1 поставлен, а запись в хранилище не дошла.*Повторите команду/s);
    assert.equal(p.store.open().status, 'closing');
    assert.equal(await tagCommit(p.root, '2026.11.1'), head);
    const again = await closeRelease(p.root, p.context());
    assert.equal(again.closed, true);
    assert.equal(again.replayed, true);
    assert.equal(p.store.open().status, 'in_progress');
    assert.equal(p.store.open().result.commit, head);
    assert.equal((await p.git('tag', '--list')).split('\n').length, 1);
  } finally {
    await p.stop();
  }
});

// REQ-STORE-026
test('замороженный до закрытия выпуск — командой release freeze или сбоем до тега — закрывается без повторной заморозки', async () => {
  const p = await project();
  try {
    p.store.add('SHOP-OPS-001', { status: 'done' });
    await p.store.operate('openRelease', { tickets: [] });
    await p.store.operate('freezeRelease');
    await p.attest();
    const closed = await closeRelease(p.root, p.context());
    assert.equal(closed.closed, true, JSON.stringify(closed.problems));
    assert.equal(closed.replayed, undefined);
    assert.deepEqual(p.store.operationsSeen(), ['closeRelease']);
  } finally {
    await p.stop();
  }
});

// REQ-STORE-026
test('выпуск по шагам: задача выпуска, заморозка, e2e на коммите; закрытие на непроверенном коммите отказывает и заморозку не снимает', async () => {
  const p = await project();
  try {
    p.store.add('SHOP-OPS-001', { status: 'done' });
    p.store.add('SHOP-OPS-009', { status: 'in_progress' });
    const opened = await p.command('release', 'open', '--task', 'SHOP-OPS-009');
    assert.equal(opened.code, 0, opened.stderr);
    assert.match(opened.stdout, /выпуск ведёт задача SHOP-OPS-009/);
    assert.equal(p.store.open().task, 'SHOP-OPS-009');

    const frozen = await p.command('release', 'freeze');
    assert.equal(frozen.code, 0, frozen.stderr);
    assert.equal(p.store.open().status, 'closing');
    const again = await p.command('release', 'freeze');
    assert.equal(again.code, 1);
    assert.match(again.stdout + again.stderr, /Замораживается выпуск в draft/);

    const head = await p.attest();
    const unchecked = await closeRelease(p.root, p.context());
    assert.equal(unchecked.closed, false);
    assert.match(unchecked.problems.join('\n'), /ведёт задача SHOP-OPS-009: закрывается только коммит с зелёным e2e выпуска, а e2e не записан/);
    assert.match(unchecked.problems.join('\n'), new RegExp(`release record-e2e --commit ${head}`));
    assert.equal(p.store.open().status, 'closing', 'выпуск, замороженный шагом, отказ закрытия оставляет замороженным');
    assert.equal(await tagCommit(p.root, '2026.11.1'), null);

    const other = 'a'.repeat(40);
    assert.equal((await p.command('release', 'record-e2e', '--commit', other)).code, 0);
    const elsewhere = await closeRelease(p.root, p.context());
    assert.match(elsewhere.problems.join('\n'), new RegExp(`e2e записан на ${other.slice(0, 8)}, закрывается ${head.slice(0, 8)}`));
    const status = JSON.parse((await p.command('release', 'status', '--json')).stdout);
    assert.deepEqual(status.release, { id: 'RELEASE-2026-11-1', status: 'closing', task: 'SHOP-OPS-009', e2e: { commit: other, at: p.store.open().e2e.at }, e2eRequired: true });

    const recorded = await p.command('release', 'record-e2e', '--commit', head);
    assert.equal(recorded.code, 0, recorded.stderr);
    assert.match(recorded.stdout, new RegExp(`Зелёный e2e выпуска RELEASE-2026-11-1 записан на коммите ${head}`));
    const closed = await closeRelease(p.root, p.context());
    assert.equal(closed.closed, true, JSON.stringify(closed.problems));
    assert.equal(await tagCommit(p.root, '2026.11.1'), head);
  } finally {
    await p.stop();
  }
});

// REQ-STORE-026
test('release unfreeze с причиной возвращает замороженный выпуск в draft; без причины — отказ хранилища', async () => {
  const p = await project();
  try {
    p.store.add('SHOP-OPS-001', { status: 'done' });
    assert.equal((await p.command('release', 'open')).code, 0);
    assert.equal((await p.command('release', 'freeze')).code, 0);
    const bare = await p.command('release', 'unfreeze');
    assert.equal(bare.code, 1);
    const thawed = await p.command('release', 'unfreeze', '--reason', 'в состав нужна правка');
    assert.equal(thawed.code, 0, thawed.stderr);
    assert.match(thawed.stdout, /Заморозка выпуска RELEASE-2026-11-1 снята: выпуск в draft/);
    assert.equal(p.store.open().status, 'draft');
  } finally {
    await p.stop();
  }
});

test('операция над выпуском во время закрытия отказывает и состава не меняет', async () => {
  const p = await project();
  try {
    p.store.add('SHOP-OPS-001', { status: 'done' });
    p.store.add('SHOP-OPS-002', { status: 'done' });
    await p.store.operate('openRelease', { tickets: [] });
    await p.attest();
    const refusals = [];
    p.store.state.afterFreeze = () => {
      for (const attempt of [
        () => p.store.operate('cancelRelease', { reason: 'передумали' }),
        () => p.store.setStatus('SHOP-OPS-002', 'in_progress'),
      ]) {
        try {
          attempt();
          refusals.push('принято');
        } catch (failure) {
          refusals.push(failure.code);
        }
      }
    };
    const closed = await closeRelease(p.root, p.context());
    assert.equal(closed.closed, true, JSON.stringify(closed.problems));
    assert.deepEqual(refusals, ['release-closing', 'release-closing']);
    assert.deepEqual(closed.composition.sort(), ['SHOP-OPS-001', 'SHOP-OPS-002']);
  } finally {
    await p.stop();
  }
});

test('перезакрытие переносит тег с манифестом и сохраняет отметки действий', async () => {
  const p = await project();
  try {
    p.store.add('SHOP-OPS-001', { status: 'done', sections: { whyNot: false, openQuestions: false, beforeDeploy: null, afterDeploy: '- Проверить вход' } });
    await p.store.operate('openRelease', { tickets: [] });
    const first = await p.attest();
    assert.equal((await closeRelease(p.root, p.context())).closed, true);
    await p.store.operate('markAction', { ticket: 'SHOP-OPS-001', step: 'after', item: 1, done: true, note: 'вход работает' });
    const noReason = await closeRelease(p.root, p.context(), { reason: 'правка' });
    assert.match(noReason.problems.join(), /уже на текущем коммите/);
    await writeFile(path.join(p.root, 'fix.txt'), 'правка\n');
    await p.commit('SHOP-OPS-001 Правка после закрытия');
    const second = await p.attest();
    const reclosed = await closeRelease(p.root, p.context(), { reason: 'дефект в сборке' });
    assert.equal(reclosed.closed, true, JSON.stringify(reclosed.problems));
    assert.equal(await tagCommit(p.root, '2026.11.1'), second);
    assert.equal(manifestOf(await tagMessage(p.root, '2026.11.1')).reason, 'дефект в сборке');
    assert.deepEqual(p.store.open().retagged, [{ from: first, to: second, reason: 'дефект в сборке' }]);
    assert.equal(p.store.open().actions[0].done, true);
    assert.equal(p.store.open().actions[0].note, 'вход работает');
  } finally {
    await p.stop();
  }
});

test('шлагбаум закрытия: коммит без задачи, задача вне состава, невыпущенная зависимость и невыполненное условие выпуска', async () => {
  const p = await project();
  try {
    p.store.add('SHOP-OPS-001', { status: 'done', dependsOn: ['SHOP-OPS-009'], conditions: [{ key: 'manual-qa', phase: 'before-release', state: 'pending' }] });
    p.store.add('SHOP-OPS-009', { status: 'backlog' });
    p.store.add('SHOP-OPS-005', { status: 'in_progress' });
    await p.commit('Правка без задачи');
    await p.commit('SHOP-OPS-005 Работа вне состава');
    await p.commit('SHOP-OPS-777 Несуществующая задача');
    await p.store.operate('openRelease', { tickets: ['SHOP-OPS-005'] });
    await p.store.operate('dropTicket', { ticket: 'SHOP-OPS-005', reason: 'работа не нужна в этом выпуске' });
    await p.attest();
    const held = await closeRelease(p.root, p.context());
    assert.equal(held.closed, false);
    const text = held.problems.join('\n');
    assert.match(text, /не называет задачу: «Правка без задачи»/);
    assert.match(text, /относится к задаче SHOP-OPS-005 вне состава/);
    assert.match(text, /называет SHOP-OPS-777, а задачи нет в хранилище/);
    assert.match(text, /SHOP-OPS-001 состава зависит от SHOP-OPS-009, которая не выпущена/);
    assert.match(text, /Задача SHOP-OPS-001: условие выпуска manual-qa \(before-release\) не выполнено/);
    assert.equal(p.store.open().status, 'draft');
  } finally {
    await p.stop();
  }
});

test('ни одна команда не запрашивает всю историю: запросы не растут с числом закрытых задач и выпусков', async () => {
  const sizes = [];
  for (const history of [0, 400]) {
    const p = await project();
    try {
      for (let index = 0; index < history; index += 1) {
        p.store.add(`SHOP-OLD-${String(index).padStart(3, '0')}`, { status: 'done', release: `RELEASE-2020-01-${index}` });
      }
      p.store.add('SHOP-OPS-001', { status: 'done' });
      await openRelease(p.root, p.context(), { tickets: [] });
      await p.attest();
      assert.equal((await closeRelease(p.root, p.context())).closed, true);
      assert.equal((await finishRelease(p.root, p.context(), { note: 'развёрнуто' })).finished, true);
      sizes.push(p.store.state.requests.map((one) => `${one.method} ${one.route} ${one.status} ${one.bytes > 4000 ? 'большой' : 'малый'}`));
    } finally {
      await p.stop();
    }
  }
  assert.deepEqual(sizes[1], sizes[0]);
  assert.ok(sizes[0].every((line) => line.endsWith('малый')));
});

// REQ-STORE-004, REQ-STORE-025
test('пакет правил называет версию контракта в каждом запросе; определения полей хранилищу не передаются', async () => {
  const fields = { executor: { types: ['ticket'], values: ['owner', 'agent'] } };
  const p = await project({ extra: { metadata: { fields } } });
  try {
    await settle(p.root, p.context());
    await p.context().client.working();
    assert.ok(p.store.state.requests.length > 0);
    assert.ok(p.store.state.requests.every((one) => one.contract === '3'), 'заголовок X-Store-Contract: 3 в каждом запросе');
    assert.deepEqual(p.store.operationsSeen(), []);
  } finally {
    await p.stop();
  }
});

// REQ-STORE-025
test('store --check: условие выпуска с неизвестной фазой или состоянием и повтор ключа — нарушение контракта', async () => {
  const p = await project();
  try {
    p.store.add('SHOP-OPS-001', { status: 'backlog', conditions: [
      { key: 'qa', phase: 'before-deploy', state: 'pending' },
      { key: 'qa', phase: 'after-release', state: 'maybe' },
    ] });
    const result = await p.command('store', '--check');
    assert.equal(result.code, 1);
    assert.match(result.stdout + result.stderr, /условие qa: phase — before-release либо after-release/);
    assert.match(result.stdout + result.stderr, /условие qa: state — pending, done, not-required/);
    assert.match(result.stdout + result.stderr, /ключи условий повторяются/);
  } finally {
    await p.stop();
  }
});

test('commits: известный номер проходит без сети, неизвестный без сети — предупреждение, с --strict — отказ', async () => {
  const p = await project();
  try {
    p.store.add('SHOP-OPS-001', { status: 'done', aliases: ['DEMO-7'] });
    await p.commit('DEMO-7 Работа по псевдониму');
    const online = await commitsWithoutATicket(p.root, null, { ...p.context() });
    assert.deepEqual(online.found, []);
    const before = p.store.state.requests.length;
    await commitsWithoutATicket(p.root, null, { ...p.context() });
    assert.equal(p.store.state.requests.length, before, 'известные номера сеть не трогают');

    await p.commit('SHOP-OPS-042 Новая работа');
    const offline = { ...p.context(), client: storeClient({ ...p.declared, url: 'http://127.0.0.1:9' }, { env: p.env }) };
    const warned = await commitsWithoutATicket(p.root, null, offline);
    assert.deepEqual(warned.found, []);
    assert.match(warned.warnings.join(), /SHOP-OPS-042 — хранилище недоступно, номер не проверен/);
    const strict = await commitsWithoutATicket(p.root, null, { ...offline, strict: true });
    assert.equal(strict.found[0].standing, 'номер не проверен');
    const missing = await commitsWithoutATicket(p.root, null, { ...p.context() });
    assert.equal(missing.found[0].standing, 'задача не заведена');
    assert.equal(missing.found[0].named, 'SHOP-OPS-042');

    const cli = await p.command('commits', '--strict');
    assert.equal(cli.code, 1);
    assert.match(cli.stderr, /называет SHOP-OPS-042, а задачи нет в хранилище/);
    assert.doesNotMatch(cli.stdout + cli.stderr, new RegExp(`${p.store.readKey}|${p.store.writeKey}`));
  } finally {
    await p.stop();
  }
});

test('docs-check при внешнем хранилище к сети не обращается, сводок задач не требует и отвергает файл задачи', async () => {
  const p = await project();
  try {
    const put = async (file, content) => {
      await mkdir(path.dirname(path.join(p.root, file)), { recursive: true });
      await writeFile(path.join(p.root, file), content);
    };
    const head = (id, type, more = '') => `---\nid: ${id}\ntype: ${type}\nstatus: active\nscope: process\nauthority: navigation\n${more}---\n\n`;
    await put('docs/INDEX.md', `${head('IDX-DOCS', 'index')}# Документация\n\n[Требования](REQUIREMENTS.md) [Решения](decisions/INDEX.md) [Инструкции](runbooks/INDEX.md)\n`);
    await put('docs/REQUIREMENTS.md', `${head('IDX-REQ', 'index')}# Требования\n`);
    await put('docs/decisions/INDEX.md', `${head('IDX-DEC', 'index', 'related: SHOP-OPS-001\n')}# Решения\n`);
    await put('docs/runbooks/INDEX.md', `${head('IDX-RUN', 'index')}# Инструкции\n`);
    const clean = await documentationProblems(p.root, p.config);
    assert.deepEqual(clean.errors, []);
    await put('docs/tickets/SHOP-OPS-050-stray.md', '---\nid: SHOP-OPS-050\ntype: ticket\nstatus: backlog\nscope: ops\nauthority: supporting\npriority: P2\nrelease: unassigned\n---\n\n# Задача мимо хранилища\n\n## Проблема\n\nТекст.\n');
    const stray = await documentationProblems(p.root, p.config);
    assert.match(stray.errors.join('\n'), /SHOP-OPS-050-stray\.md: документ типа ticket лежит в репозитории/);
    assert.equal(p.store.state.requests.length, 0);
  } finally {
    await p.stop();
  }
});

test('команды, работающие только с файлами, при внешнем хранилище отказывают с причиной', async () => {
  const p = await project();
  try {
    for (const args of [['releases-index'], ['tickets-renumber', 'SHOP-OPS-001'], ['naming', 'plan'], ['release', 'adopt']]) {
      const result = await p.command(...args);
      assert.equal(result.code, 1, args.join(' '));
      assert.match(result.stderr, /работает только с задачами и выпусками в файлах/);
    }
  } finally {
    await p.stop();
  }
});

test('чтения для скриптов проекта: store --lookup, --working, --open и release status --json печатают JSON в форме контракта', async () => {
  const p = await project();
  const conditions = [{ key: 'maintenance', phase: 'after-release', state: 'pending' }];
  try {
    p.store.add('SHOP-OPS-001', { status: 'done', conditions, sections: { whyNot: false, openQuestions: false, beforeDeploy: '- Выключить задание', afterDeploy: '- Проверить вход' } });
    p.store.add('SHOP-OPS-002', { status: 'backlog' });
    const looked = JSON.parse((await p.command('store', '--lookup', 'SHOP-OPS-001,SHOP-OPS-777', '--json')).stdout);
    assert.deepEqual(looked.tickets.map((ticket) => [ticket.id, ticket.conditions]), [['SHOP-OPS-001', conditions]]);
    assert.deepEqual(looked.missing, ['SHOP-OPS-777']);
    assert.equal(Object.hasOwn(looked.tickets[0], 'body'), false, 'без ключа --body тела в ответе нет');
    p.store.find('SHOP-OPS-001').text = '## Ручное QA\n\nПравка: вход';
    const bodied = JSON.parse((await p.command('store', '--lookup', 'SHOP-OPS-001,SHOP-OPS-002', '--body')).stdout);
    assert.deepEqual(bodied.tickets.map((ticket) => ticket.body), ['## Ручное QA\n\nПравка: вход', '']);
    assert.equal((await p.command('store', '--working', '--body')).code, 2);
    const working = JSON.parse((await p.command('store', '--working')).stdout);
    assert.deepEqual(working.tickets.map((ticket) => ticket.id).sort(), ['SHOP-OPS-001', 'SHOP-OPS-002']);
    assert.equal(JSON.parse((await p.command('store', '--open')).stdout).release, null);
    assert.equal((await p.command('store', '--open', '--working')).code, 2);

    const before = JSON.parse((await p.command('release', 'status', '--json')).stdout);
    assert.equal(before.release, null);
    await openRelease(p.root, p.context(), { version: undefined, tickets: [] });
    const status = JSON.parse((await p.command('release', 'status', '--json')).stdout);
    assert.deepEqual(status.release, { id: 'RELEASE-2026-11-1', status: 'draft', task: null, e2e: null, e2eRequired: true });
    assert.equal(status.tag, '2026.11.1');
    assert.deepEqual(status.composition, [{ id: 'SHOP-OPS-001', title: status.composition[0].title, status: 'done', conditions }]);
    assert.deepEqual(status.actions, [
      { ticket: 'SHOP-OPS-001', step: 'before', item: 1, text: 'Выключить задание', done: false, note: null },
      { ticket: 'SHOP-OPS-001', step: 'after', item: 1, text: 'Проверить вход', done: false, note: null },
    ], 'до первого шага закрытия действия названы, а отметок ещё нет');
    assert.match(status.problems.join(), /Нет расписки/);

    await p.attest();
    const closed = await closeRelease(p.root, p.context());
    assert.equal(closed.closed, true, JSON.stringify(closed.problems));
    const manifest = manifestOf(await tagMessage(p.root, '2026.11.1'));
    assert.deepEqual(manifest.composition, [{ id: 'SHOP-OPS-001', title: manifest.composition[0].title, conditions }]);
    await p.store.operate('markAction', { ticket: 'SHOP-OPS-001', step: 'before', item: 1, done: true, note: 'выключено' });
    const after = JSON.parse((await p.command('release', 'status', '--json')).stdout);
    assert.equal(after.release.status, 'in_progress');
    assert.deepEqual(after.actions.map((one) => [one.step, one.done, one.note]), [['before', true, 'выключено'], ['after', false, null]]);
    assert.match(after.problems.join(), /Проверить вход/);

    // REQ-RELEASE-052
    const recorded = p.store.open().actions[0];
    recorded.text = 'Выключить\nзадание';
    const wrapped = JSON.parse((await p.command('release', 'status', '--json')).stdout);
    assert.deepEqual(wrapped.actions[0], { ticket: 'SHOP-OPS-001', step: 'before', item: 1, text: 'Выключить задание', done: true, note: 'выключено' },
      'перевод строки вместо пробела в записи хранилища отметку не теряет');
    recorded.text = 'Выключить задание (кто: владелец)';
    const edited = JSON.parse((await p.command('release', 'status', '--json')).stdout);
    assert.deepEqual([edited.actions[0].done, edited.actions[0].note, edited.actions[0].text, edited.actions[0].recorded],
      [true, 'выключено', 'Выключить задание', 'Выключить задание (кто: владелец)'],
      'правка текста после закрытия отметку не теряет; текст записи хранилища показан рядом');
  } finally {
    await p.stop();
  }
});

test('отказ хранилища по инварианту доходит до человека кодом и текстом хранилища', async () => {
  const p = await project();
  try {
    p.store.add('SHOP-OPS-001', { status: 'done' });
    assert.equal((await p.command('release', 'open')).code, 0);
    const second = await p.command('release', 'open');
    assert.equal(second.code, 1);
    assert.match(second.stderr, /выпуск RELEASE-2026-11-1 уже открыт \(release-already-open\)/);
    const drop = await p.command('release', 'drop', 'SHOP-OPS-001');
    assert.match(drop.stderr, /снятие задачи требует причины \(reason-required\)/);
    assert.doesNotMatch(second.stdout + second.stderr + drop.stderr, new RegExp(`${p.store.readKey}|${p.store.writeKey}`));
  } finally {
    await p.stop();
  }
});

test('версия контракта, которой хранилище не исполняет, — отказ с названием требуемой версии', async () => {
  const p = await project();
  try {
    // REQ-STORE-024
    p.store.state.contract = 2;
    await assert.rejects(p.context().client.working(), (failure) => failure instanceof StoreRefusal
      && failure.code === 'contract-version' && /пакету правил нужна версия 3/.test(failure.message));
    const status = await p.command('release', 'status');
    assert.equal(status.code, 1);
    assert.match(status.stderr, /contract-version/);
  } finally {
    await p.stop();
  }
});

test('store --check сверяет чтения, а с --operations — операции, повтор и отказы, и не оставляет открытого выпуска', async () => {
  const p = await project();
  try {
    p.store.add('SHOP-OPS-001', { status: 'in_progress', aliases: ['DEMO-1'] });
    const reads = await checkStore({ client: p.context().client, config: p.config });
    assert.deepEqual(reads.problems, []);
    const full = await checkStore({ client: p.context().client, config: p.config, withOperations: true });
    assert.deepEqual(full.problems, []);
    assert.equal(full.operations, true);
    assert.equal(p.store.open(), null);
    assert.equal(p.store.state.releases[0].status, 'cancelled');

    p.store.add('SHOP-OPS-002', { status: 'cancelled' });
    p.store.state.tickets.get('SHOP-OPS-002').status = 'weird';
    const broken = await checkStore({ client: p.context().client, config: p.config });
    assert.match(broken.problems.join(), /status "weird" не из словаря ядра/);
    const cli = await p.command('store', '--check');
    assert.equal(cli.code, 1);
    assert.match(cli.stderr, /контракт ядра не исполняет/);
  } finally {
    await p.stop();
  }
});
