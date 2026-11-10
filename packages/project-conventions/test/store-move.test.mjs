import assert from 'node:assert/strict';
import { access, mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { environmentWithoutGit } from '../lib/release/git.mjs';
import { storeDeclaration } from '../lib/store/config.mjs';
import { storeClient } from '../lib/store/client.mjs';
import { exportProject } from '../lib/store/export.mjs';
import { moveToStore } from '../lib/store/move.mjs';
import { fakeStore } from './fake-store.mjs';

const run = promisify(execFile);
const cli = path.join(path.dirname(path.dirname(fileURLToPath(import.meta.url))), 'bin', 'conventions.mjs');
const ID_PATTERN = 'SHOP-[A-Z]{2,5}-\\d{3}';

const OBLIGATION = {
  id: 'sample', title: 'Пример обязательства', requirement: 'REQ-QUALITY-001', level: 'директива', since: '0.19.0',
  dueReleases: 3, area: 'QUAL', slug: 'adopt-sample',
  ticket: { scope: 'quality', priority: 'P2', problem: 'Проект не соответствует.', required: ['Сделать.'], acceptance: ['Сделано.'] },
};

const head = (id, type, status, more = '') => `---\nid: ${id}\ntype: ${type}\nstatus: ${status}\nscope: process\nauthority: ${type === 'index' ? 'navigation' : 'supporting'}\n${more}---\n\n`;
const exists = (file) => access(file).then(() => true, () => false);

async function project({ releaseStatus = 'released' } = {}) {
  const store = await fakeStore({ key: 'SHOP' });
  const root = await mkdtemp(path.join(os.tmpdir(), 'store-move-'));
  const put = async (file, content) => {
    await mkdir(path.dirname(path.join(root, file)), { recursive: true });
    await writeFile(path.join(root, file), content);
  };
  await put('node_modules/@apocarteres/project-conventions/obligations.json', JSON.stringify({ obligations: [OBLIGATION] }));
  await put('.conventions.json', JSON.stringify({ sources: ['src'], ticketPrefix: 'SHOP' }));
  await put('.conventions/obligations.json', JSON.stringify({ releaseCount: 1, seen: { sample: 0 }, closed: {}, deferred: { sample: { reason: 'ждём', recordedAt: '2026-10-01' } } }));
  await put('docs/INDEX.md', `${head('IDX-DOCS', 'index', 'active')}# Документация\n\n[Требования](REQUIREMENTS.md) [Решения](decisions/INDEX.md) [Инструкции](runbooks/INDEX.md) [Задачи](tickets/INDEX.md) [Выпуски](releases/INDEX.md)\n`);
  await put('docs/REQUIREMENTS.md', `${head('IDX-REQ', 'index', 'active')}# Требования\n`);
  await put('docs/decisions/INDEX.md', `${head('IDX-DEC', 'index', 'active')}# Решения\n`);
  await put('docs/runbooks/INDEX.md', `${head('IDX-RUN', 'index', 'active')}# Инструкции\n\n- [Вход](login.md)\n`);
  await put('docs/runbooks/login.md', `${head('RUN-LOGIN', 'runbook', 'active', 'related: SHOP-OPS-001\n')}# Вход\n\n`
    + 'Сделано задачей [SHOP-OPS-001](../tickets/closed/SHOP-OPS-001-login.md) и вышло в [первом выпуске](../releases/RELEASE-2026-10-1.md).\n\n'
    + 'Путь `[SHOP-OPS-001](../tickets/closed/SHOP-OPS-001-login.md)` в строке кода не меняется.\n\n'
    + '```\n[SHOP-OPS-002](../tickets/SHOP-OPS-002-work.md)\n```\n');
  await put('docs/tickets/INDEX.md', `${head('IDX-TICKETS', 'index', 'active')}# Открытые задачи\n`);
  await put('docs/tickets/closed/INDEX.md', `${head('IDX-TICKETS-CLOSED', 'index', 'active')}# Закрытые задачи\n`);
  await put('docs/tickets/closed/SHOP-OPS-001-login.md', `${head('SHOP-OPS-001', 'ticket', 'done', 'priority: P1\nrelease: RELEASE-2026-10-1\n')}# Вход\n\n## Проблема\n\nВхода нет.\n\n## После развёртывания\n\n- Проверить вход\n`);
  await put('docs/tickets/SHOP-OPS-002-work.md', `${head('SHOP-OPS-002', 'ticket', 'backlog', 'priority: unassigned\nrelease: unassigned\ndepends-on: SHOP-OPS-001\n')}# Работа\n\n## Проблема\n\nТекст.\n`);
  await put('docs/tickets/SHOP-QUAL-001-adopt-sample.md', `${head('SHOP-QUAL-001', 'ticket', 'backlog', 'priority: P2\nrelease: unassigned\nobligation: sample\n')}# Пример обязательства\n\n## Проблема\n\nТекст.\n`);
  await put('docs/releases/INDEX.md', `${head('IDX-RELEASES', 'index', 'active')}# Выпуски\n`);
  await put('docs/releases/RELEASE-2026-10-1.md', `${head('RELEASE-2026-10-1', 'release', releaseStatus, 'opened-on: 2026-10-01\nreleased-on: 2026-10-02\ncommit: 0a6cd3a0a6cd3a0a6cd3a0a6cd3a0a6cd3a0a6cd3a\n')}# Выпуск 2026.10.1\n\n## Состав\n\nТекст.\n`);
  const config = JSON.parse(await readFile(path.join(root, '.conventions.json'), 'utf8'));
  const declared = { kind: 'external', url: store.url, readKeyEnv: 'STORE_READ', writeKeyEnv: 'STORE_WRITE', idPattern: ID_PATTERN };
  const env = { STORE_READ: store.readKey, STORE_WRITE: store.writeKey };
  const client = storeClient(storeDeclaration({ store: declared }).store, { env });
  return {
    root, store, config, declared, client, env,
    stop: async () => {
      await store.stop();
      await rm(root, { recursive: true, force: true });
    },
  };
}

test('выгрузка несёт задачи, выпуски и учёт обязательств в форме контракта', async () => {
  const p = await project();
  try {
    const exported = await exportProject(p.root, p.config);
    assert.deepEqual(exported.tickets.map((ticket) => ticket.id).sort(), ['SHOP-OPS-001', 'SHOP-OPS-002', 'SHOP-QUAL-001']);
    const done = exported.tickets.find((ticket) => ticket.id === 'SHOP-OPS-001');
    assert.equal(done.release, 'RELEASE-2026-10-1');
    assert.equal(done.sections.afterDeploy, '- Проверить вход');
    assert.match(done.body, /^# Вход\n\n## Проблема/);
    const open = exported.tickets.find((ticket) => ticket.id === 'SHOP-OPS-002');
    assert.equal(open.release, null);
    assert.equal(open.priority, null);
    assert.deepEqual(open.dependsOn, ['SHOP-OPS-001']);
    assert.deepEqual(exported.releases.map((release) => [release.id, release.status, release.tag, release.releasedOn]), [['RELEASE-2026-10-1', 'released', '2026.10.1', '2026-10-02']]);
    assert.deepEqual(exported.obligations, [{ id: 'sample', ticket: 'SHOP-QUAL-001', due: 3, seenAtCount: 0, deferred: { reason: 'ждём', on: '2026-10-01' }, closed: null }]);
    assert.equal(exported.releasedCount, 1);
  } finally {
    await p.stop();
  }
});

test('переход одной командой: хранилище приняло всё, ссылки заменены номером, каталоги убраны, docs-check называет только ссылки в коде', async () => {
  const p = await project();
  try {
    const result = await moveToStore(p.root, { config: p.config, declared: p.declared, client: p.client });
    assert.equal(result.moved, true, JSON.stringify(result.problems));
    assert.deepEqual(result.documentation, [
      'docs/runbooks/login.md: цель ссылки ../tickets/SHOP-OPS-002-work.md не существует',
      'docs/runbooks/login.md: цель ссылки ../tickets/closed/SHOP-OPS-001-login.md не существует',
    ], 'ссылки в коде не заменяются: их называет проверка документации, и правит человек');
    assert.equal(result.tickets, 3);
    assert.equal(result.releases, 1);
    for (const gone of ['docs/tickets', 'docs/releases', '.conventions/obligations.json']) {
      assert.equal(await exists(path.join(p.root, gone)), false, gone);
    }
    const runbook = await readFile(path.join(p.root, 'docs/runbooks/login.md'), 'utf8');
    assert.match(runbook, /Сделано задачей `SHOP-OPS-001` и вышло в первом выпуске \(`RELEASE-2026-10-1`\)\./);
    assert.match(runbook, /Путь `\[SHOP-OPS-001\]\(\.\.\/tickets\/closed\/SHOP-OPS-001-login\.md\)` в строке кода/);
    assert.match(runbook, /```\n\[SHOP-OPS-002\]\(\.\.\/tickets\/SHOP-OPS-002-work\.md\)\n```/);
    assert.doesNotMatch(await readFile(path.join(p.root, 'docs/INDEX.md'), 'utf8'), /tickets\/INDEX\.md|releases\/INDEX\.md/);
    assert.deepEqual(JSON.parse(await readFile(path.join(p.root, '.conventions.json'), 'utf8')).store, p.declared);
    assert.equal(p.store.find('SHOP-OPS-001').release, 'RELEASE-2026-10-1');
    assert.match(p.store.find('SHOP-OPS-002').text, /## Проблема/);
    assert.equal(p.store.state.releases[0].status, 'released');
    assert.equal(p.store.state.releasedCount, 1);
    assert.equal(p.store.state.obligations.get('sample').seenAtCount, 0, 'срок обязательства после перехода равен сроку до него');
    const done = (await p.client.working()).tickets.map((ticket) => ticket.id).sort();
    assert.deepEqual(done, ['SHOP-OPS-002', 'SHOP-QUAL-001'], 'вышедшая задача в рабочий набор не входит');

    const again = await run(process.execPath, [cli, 'store', '--check', '--root', p.root], { env: { ...environmentWithoutGit(), ...p.env } });
    assert.match(again.stdout, /исполняет контракт ядра/);
  } finally {
    await p.stop();
  }
});

test('задача, которой нет в хранилище, останавливает переход до удаления файлов и названа по номеру', async () => {
  const p = await project();
  try {
    p.store.state.dropOnImport = 'SHOP-OPS-002';
    const result = await moveToStore(p.root, { config: p.config, declared: p.declared, client: p.client });
    assert.equal(result.moved, false);
    assert.match(result.problems.join(), /не подтвердило под прежним номером: задача SHOP-OPS-002\. Файлы не тронуты/);
    assert.equal(await exists(path.join(p.root, 'docs/tickets/SHOP-OPS-002-work.md')), true);
    assert.equal(JSON.parse(await readFile(path.join(p.root, '.conventions.json'), 'utf8')).store, undefined);
  } finally {
    await p.stop();
  }
});

test('переход отказывает при открытом выпуске, чужом документе в каталоге задач и номере вне idPattern', async () => {
  const p = await project({ releaseStatus: 'draft' });
  try {
    await writeFile(path.join(p.root, 'docs/tickets/plan.md'), `${head('PLAN-1', 'plan', 'active')}# План\n`);
    const result = await moveToStore(p.root, { config: p.config, declared: { ...p.declared, idPattern: 'SHOP-OPS-\\d{3}' }, client: p.client });
    assert.equal(result.moved, false);
    const text = result.problems.join('\n');
    assert.match(text, /Выпуск RELEASE-2026-10-1 открыт/);
    assert.match(text, /docs\/tickets\/plan\.md/);
    assert.match(text, /не подходят под idPattern: SHOP-QUAL-001/);
    assert.equal(p.store.state.requests.length, 0);
  } finally {
    await p.stop();
  }
});
