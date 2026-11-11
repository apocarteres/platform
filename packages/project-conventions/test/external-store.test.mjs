import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { environmentWithoutGit, tagCommit, tagMessage } from '../lib/release/git.mjs';
import { writeReceipt } from '../lib/release/receipt.mjs';
import { storeDeclaration } from '../lib/store/config.mjs';
import { StoreRefusal, storeClient } from '../lib/store/client.mjs';
import { closeRelease, finishRelease, openRelease, settle } from '../lib/store/cycle.mjs';
import { checkStore } from '../lib/store/check.mjs';
import { commitsWithoutATicket } from '../lib/store/commits.mjs';
import { fieldsDigest, manifestOf } from '../lib/store/shape.mjs';
import { documentationProblems } from '../lib/docs/documentation.mjs';
import { fakeStore } from './fake-store.mjs';

const run = promisify(execFile);
const cli = path.join(path.dirname(path.dirname(fileURLToPath(import.meta.url))), 'bin', 'conventions.mjs');
const ID_PATTERN = 'SHOP-[A-Z]{2,5}-\\d{3}|DEMO-\\d+';

const OBLIGATION = {
  id: 'sample', title: 'Пример обязательства', requirement: 'REQ-QUALITY-001', level: 'директива', since: '0.19.0',
  dueReleases: 2, area: 'QUAL', slug: 'adopt-sample',
  ticket: { scope: 'quality', priority: 'P2', problem: 'Проект не соответствует.', required: ['Сделать.'], acceptance: ['Сделано.'] },
};

async function project({ obligations = [], extra = {} } = {}) {
  const store = await fakeStore();
  const root = await mkdtemp(path.join(os.tmpdir(), 'external-store-'));
  const git = async (...args) => (await run('git', ['-C', root, ...args], { env: environmentWithoutGit() })).stdout.trim();
  await git('init', '--quiet', '-b', 'main');
  await git('config', 'user.email', 'test@example.test');
  await git('config', 'user.name', 'Test');
  await mkdir(path.join(root, 'node_modules/@apocarteres/project-conventions'), { recursive: true });
  await writeFile(path.join(root, 'node_modules/@apocarteres/project-conventions/obligations.json'), JSON.stringify({ obligations }));
  await writeFile(path.join(root, '.gitignore'), 'target/\nnode_modules/\n');
  const commit = async (message) => {
    await git('add', '-A');
    await git('commit', '--quiet', '--allow-empty', '-m', message);
    return git('rev-parse', 'HEAD');
  };
  const first = await commit('SHOP-OPS-001 Начало');
  const config = {
    sources: ['src'], commitRuleSince: first,
    store: { kind: 'external', url: store.url, readKeyEnv: 'STORE_READ', writeKeyEnv: 'STORE_WRITE', idPattern: ID_PATTERN },
    ...extra,
  };
  await writeFile(path.join(root, '.conventions.json'), JSON.stringify(config));
  await commit('SHOP-OPS-001 Настройка');
  const declared = storeDeclaration(config).store;
  const env = { STORE_READ: store.readKey, STORE_WRITE: store.writeKey };
  const context = () => ({ config, store: declared, client: storeClient(declared, { env }), scheme: 'date' });
  const attest = async () => {
    const head = await git('rev-parse', 'HEAD');
    await writeReceipt(root, { commit: head, completedAt: '2026-11-12T10:00:00.000Z', checks: ['verify'], run: { command: 'mise run verify', exitCode: 0 } });
    return head;
  };
  const command = async (...args) => {
    try {
      const { stdout, stderr } = await run(process.execPath, [cli, ...args, '--root', root], { env: { ...environmentWithoutGit(), ...env } });
      return { code: 0, stdout, stderr };
    } catch (failure) {
      return { code: failure.code, stdout: failure.stdout, stderr: failure.stderr };
    }
  };
  return {
    root, store, git, commit, config, declared, context, attest, command, env,
    stop: async () => {
      await store.stop();
      await rm(root, { recursive: true, force: true });
    },
  };
}

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

test('сбой между заморозкой и тегом: повтор команды снимает заморозку и закрывает заново', async () => {
  const p = await project();
  try {
    p.store.add('SHOP-OPS-001', { status: 'done' });
    await p.store.operate('openRelease', { tickets: [] });
    await p.store.operate('freezeRelease');
    await p.attest();
    const closed = await closeRelease(p.root, p.context());
    assert.equal(closed.closed, true, JSON.stringify(closed.problems));
    assert.equal(closed.replayed, undefined);
    assert.deepEqual(p.store.operationsSeen(), ['unfreezeRelease', 'freezeRelease', 'closeRelease']);
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

test('шлагбаум закрытия: коммит без задачи, задача вне состава, невыпущенная зависимость и значение поля вне done', async () => {
  const p = await project({ extra: { metadata: { fields: { 'manual-qa': { types: ['ticket'], values: ['required', 'passed'], done: ['passed'] } } } } });
  try {
    p.store.add('SHOP-OPS-001', { status: 'done', dependsOn: ['SHOP-OPS-009'], fields: { 'manual-qa': 'required' } });
    p.store.add('SHOP-OPS-009', { status: 'backlog' });
    p.store.add('SHOP-OPS-005', { status: 'in_progress' });
    await p.commit('Правка без задачи');
    await p.commit('SHOP-OPS-005 Работа вне состава');
    await p.commit('SHOP-OPS-777 Несуществующая задача');
    await p.store.operate('openRelease', { tickets: [] });
    await p.attest();
    const held = await closeRelease(p.root, p.context());
    assert.equal(held.closed, false);
    const text = held.problems.join('\n');
    assert.match(text, /не называет задачу: «Правка без задачи»/);
    assert.match(text, /относится к задаче SHOP-OPS-005 вне состава/);
    assert.match(text, /называет SHOP-OPS-777, а задачи нет в хранилище/);
    assert.match(text, /SHOP-OPS-001 состава зависит от SHOP-OPS-009, которая не выпущена/);
    assert.match(text, /Задача SHOP-OPS-001: задача выполнена, а manual-qa — required/);
    assert.equal(p.store.state.fields['manual-qa'].done[0], 'passed', 'определения полей опубликованы');
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

test('settle публикует определения полей один раз и не трогает хранилище ключом чтения', async () => {
  const fields = { executor: { types: ['ticket'], values: ['owner', 'agent'] } };
  const p = await project({ extra: { metadata: { fields } } });
  try {
    const reader = { ...p.context(), client: storeClient(p.declared, { env: { STORE_READ: p.store.readKey } }) };
    await settle(p.root, reader);
    assert.equal(p.store.state.fields, null);
    await settle(p.root, p.context());
    await settle(p.root, p.context());
    assert.deepEqual(p.store.operationsSeen(), ['defineFields']);
    assert.equal(fieldsDigest(fields), fieldsDigest({ executor: { values: ['owner', 'agent'], types: ['ticket'] } }));
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
  const fields = { maintenance: { types: ['ticket'], values: ['none', 'required'] } };
  const p = await project({ extra: { metadata: { fields } } });
  try {
    p.store.add('SHOP-OPS-001', { status: 'done', fields: { maintenance: 'required' }, sections: { whyNot: false, openQuestions: false, beforeDeploy: '- Выключить задание', afterDeploy: '- Проверить вход' } });
    p.store.add('SHOP-OPS-002', { status: 'backlog' });
    const looked = JSON.parse((await p.command('store', '--lookup', 'SHOP-OPS-001,SHOP-OPS-777', '--json')).stdout);
    assert.deepEqual(looked.tickets.map((ticket) => [ticket.id, ticket.fields.maintenance]), [['SHOP-OPS-001', 'required']]);
    assert.deepEqual(looked.missing, ['SHOP-OPS-777']);
    const working = JSON.parse((await p.command('store', '--working')).stdout);
    assert.deepEqual(working.tickets.map((ticket) => ticket.id).sort(), ['SHOP-OPS-001', 'SHOP-OPS-002']);
    assert.equal(JSON.parse((await p.command('store', '--open')).stdout).release, null);
    assert.equal((await p.command('store', '--open', '--working')).code, 2);

    const before = JSON.parse((await p.command('release', 'status', '--json')).stdout);
    assert.equal(before.release, null);
    await openRelease(p.root, p.context(), { version: undefined, tickets: [] });
    const status = JSON.parse((await p.command('release', 'status', '--json')).stdout);
    assert.deepEqual(status.release, { id: 'RELEASE-2026-11-1', status: 'draft' });
    assert.equal(status.tag, '2026.11.1');
    assert.deepEqual(status.composition, [{ id: 'SHOP-OPS-001', title: status.composition[0].title, status: 'done', fields: { maintenance: 'required' } }]);
    assert.deepEqual(status.actions, [
      { ticket: 'SHOP-OPS-001', step: 'before', item: 1, text: 'Выключить задание', done: false, note: null },
      { ticket: 'SHOP-OPS-001', step: 'after', item: 1, text: 'Проверить вход', done: false, note: null },
    ], 'до первого шага закрытия действия названы, а отметок ещё нет');
    assert.match(status.problems.join(), /Нет расписки/);

    await p.attest();
    const closed = await closeRelease(p.root, p.context());
    assert.equal(closed.closed, true, JSON.stringify(closed.problems));
    const manifest = manifestOf(await tagMessage(p.root, '2026.11.1'));
    assert.deepEqual(manifest.composition, [{ id: 'SHOP-OPS-001', title: manifest.composition[0].title, fields: { maintenance: 'required' } }]);
    await p.store.operate('markAction', { ticket: 'SHOP-OPS-001', step: 'before', item: 1, done: true, note: 'выключено' });
    const after = JSON.parse((await p.command('release', 'status', '--json')).stdout);
    assert.equal(after.release.status, 'in_progress');
    assert.deepEqual(after.actions.map((one) => [one.step, one.done, one.note]), [['before', true, 'выключено'], ['after', false, null]]);
    assert.match(after.problems.join(), /Проверить вход/);
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
    p.store.state.contract = 2;
    await assert.rejects(p.context().client.working(), (failure) => failure instanceof StoreRefusal
      && failure.code === 'contract-version' && /пакету правил нужна версия 1/.test(failure.message));
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
