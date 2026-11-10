import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { environmentWithoutGit } from '../lib/release/git.mjs';
import { writeReceipt } from '../lib/release/receipt.mjs';
import { fakeStore } from './fake-store.mjs';

const run = promisify(execFile);
const cli = path.join(path.dirname(path.dirname(fileURLToPath(import.meta.url))), 'bin', 'conventions.mjs');

const OBLIGATION = {
  id: 'sample', title: 'Пример обязательства', requirement: 'REQ-QUALITY-001', level: 'директива', since: '0.19.0',
  dueReleases: 3, area: 'QUAL', slug: 'adopt-sample',
  ticket: { scope: 'quality', priority: 'P2', problem: 'Проект не соответствует.', required: ['Сделать.'], acceptance: ['Сделано.'] },
};

const TICKETS = [
  { id: 'SHOP-OPS-001', status: 'done', after: null },
  { id: 'SHOP-OPS-002', status: 'done', after: '- Проверить вход' },
  { id: 'SHOP-OPS-003', status: 'backlog', after: null },
];

const ticketFile = (one) => `---\nid: ${one.id}\ntype: ticket\nstatus: ${one.status}\nscope: quality\nauthority: supporting\npriority: P2\nrelease: unassigned\n---\n\n# ${one.id}\n`
  + `${one.after === null ? '' : `\n## После развёртывания\n\n${one.after}\n`}`;

async function project(kind) {
  const store = kind === 'external' ? await fakeStore({ key: 'SHOP' }) : null;
  const root = await mkdtemp(path.join(os.tmpdir(), `store-scenario-${kind}-`));
  const git = async (...args) => (await run('git', ['-C', root, ...args], { env: environmentWithoutGit() })).stdout.trim();
  await git('init', '--quiet', '-b', 'main');
  await git('config', 'user.email', 'test@example.test');
  await git('config', 'user.name', 'Test');
  await mkdir(path.join(root, 'node_modules/@apocarteres/project-conventions'), { recursive: true });
  await writeFile(path.join(root, 'node_modules/@apocarteres/project-conventions/obligations.json'), JSON.stringify({ obligations: [OBLIGATION] }));
  await writeFile(path.join(root, '.gitignore'), 'target/\nnode_modules/\n');
  const commit = async (message, body = '') => {
    await git('add', '-A');
    await git('commit', '--quiet', '--allow-empty', '-m', message, ...(body === '' ? [] : ['-m', body]));
    return git('rev-parse', 'HEAD');
  };
  if (store === null) {
    await mkdir(path.join(root, 'docs/tickets/closed'), { recursive: true });
    await mkdir(path.join(root, 'docs/releases'), { recursive: true });
    for (const one of TICKETS) await writeFile(path.join(root, `docs/tickets/${one.id}-work.md`), ticketFile(one));
  } else {
    for (const one of TICKETS) {
      store.add(one.id, { status: one.status, sections: { whyNot: false, openQuestions: false, beforeDeploy: null, afterDeploy: one.after } });
    }
  }
  const first = await commit('SHOP-OPS-001 Начало');
  const config = {
    sources: ['src'], ticketPrefix: 'SHOP', commitRuleSince: first,
    ...(store === null ? {} : { store: { kind: 'external', url: store.url, readKeyEnv: 'STORE_READ', writeKeyEnv: 'STORE_WRITE', idPattern: 'SHOP-(?:[A-Z]{2,5}-\\d{3}|\\d+)' } }),
  };
  await writeFile(path.join(root, '.conventions.json'), JSON.stringify(config));
  await commit('SHOP-OPS-001 Настройка');
  const env = { ...environmentWithoutGit(), ...(store === null ? {} : { STORE_READ: store.readKey, STORE_WRITE: store.writeKey }) };
  const command = async (...args) => {
    let result;
    try {
      const { stdout, stderr } = await run(process.execPath, [cli, 'release', ...args, '--root', root], { env });
      result = { code: 0, stdout, stderr };
    } catch (failure) {
      result = { code: failure.code, stdout: failure.stdout, stderr: failure.stderr };
    }
    await commit('Служебные правки выпуска', 'Release-cycle: scenario');
    return result;
  };
  const attest = async () => writeReceipt(root, {
    commit: await git('rev-parse', 'HEAD'), completedAt: '2026-11-12T10:00:00.000Z', checks: ['verify'], run: { command: 'mise run verify', exitCode: 0 },
  });
  const obligationTicket = async () => {
    if (store !== null) return [...store.state.tickets.values()].find((ticket) => ticket.obligation === 'sample')?.id ?? null;
    const names = await readdir(path.join(root, 'docs/tickets'));
    return names.find((name) => name.endsWith('-adopt-sample.md'))?.replace('-adopt-sample.md', '') ?? null;
  };
  const releaseStatuses = async () => {
    if (store !== null) return store.state.releases.map((release) => release.status);
    const found = [];
    for (const name of (await readdir(path.join(root, 'docs/releases'))).filter((one) => one.startsWith('RELEASE-')).sort()) {
      found.push(/^status: (.+)$/m.exec(await readFile(path.join(root, 'docs/releases', name), 'utf8'))[1]);
    }
    return found;
  };
  return {
    root, git, commit, command, attest, obligationTicket, releaseStatuses,
    stop: async () => {
      await store?.stop();
      await rm(root, { recursive: true, force: true });
    },
  };
}

for (const kind of ['files', 'external']) {
  test(`сценарий цикла на хранилище ${kind}: open, drop, account, close, mark, reclose, defer, finish, satisfy, cancel`, async () => {
    const p = await project(kind);
    const passed = (result, step) => assert.equal(result.code, 0, `${step}: ${result.stderr}${result.stdout}`);
    try {
      const opened = await p.command('open', '--tickets', 'SHOP-OPS-003');
      passed(opened, 'open');
      const tag = /тег при закрытии: ([\d.]+)\./.exec(opened.stdout)[1];
      assert.notEqual(await p.obligationTicket(), null, 'обязательство материализовано задачей');
      assert.equal((await p.command('open')).code, 1, 'второй выпуск не открывается');

      assert.equal((await p.command('drop', 'SHOP-OPS-003')).code, 1, 'снятие без причины отказывает');
      passed(await p.command('drop', 'SHOP-OPS-003', '--reason', 'не успели'), 'drop');

      await writeFile(path.join(p.root, 'stray.txt'), 'правка\n');
      const stray = await p.commit('Правка без задачи');
      await p.attest();
      const held = await p.command('close');
      assert.equal(held.code, 1);
      assert.match(held.stderr, /не называет задачу: «Правка без задачи»/);
      assert.equal(await p.git('tag', '--list'), '', 'отказ закрытия тега не ставит');
      passed(await p.command('account', stray.slice(0, 8), '--reason', 'правка до правила'), 'account');

      passed(await p.command('defer', 'sample', '--reason', 'ждём решения'), 'defer');
      await p.attest();
      passed(await p.command('close'), 'close');
      assert.equal(await p.git('tag', '--list'), tag);
      const tagged = await p.git('rev-list', '-n', '1', tag);

      const early = await p.command('finish', '--note', 'развёрнуто');
      assert.equal(early.code, 1);
      assert.match(early.stderr, /SHOP-OPS-002 не отмечено: Проверить вход/);
      passed(await p.command('mark', 'SHOP-OPS-002', '--step', 'after', '--note', 'вход работает'), 'mark');

      await writeFile(path.join(p.root, 'fix.txt'), 'правка\n');
      await p.commit('SHOP-OPS-001 Правка после закрытия');
      await p.attest();
      passed(await p.command('reclose', '--reason', 'дефект в сборке'), 'reclose');
      assert.notEqual(await p.git('rev-list', '-n', '1', tag), tagged, 'тег перенесён');

      passed(await p.command('finish', '--note', 'развёрнуто'), 'finish');
      assert.deepEqual(await p.releaseStatuses(), ['released']);

      passed(await p.command('satisfy', 'sample', '--ticket', 'SHOP-OPS-001'), 'satisfy');
      const next = await p.command('open', ...(kind === 'files' ? [] : []));
      passed(next, 'open второго выпуска');
      assert.equal((await p.command('cancel')).code, 1, 'отмена без причины отказывает');
      passed(await p.command('cancel', '--reason', 'передумали'), 'cancel');
      assert.deepEqual(await p.releaseStatuses(), ['released', 'cancelled']);
    } finally {
      await p.stop();
    }
  });
}
