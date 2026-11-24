import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { environmentWithoutGit } from '../lib/release/git.mjs';
import { writeReceipt } from '../lib/release/receipt.mjs';
import { storeDeclaration } from '../lib/store/config.mjs';
import { storeClient } from '../lib/store/client.mjs';
import { fakeStore } from './fake-store.mjs';

const run = promisify(execFile);
const cli = path.join(path.dirname(path.dirname(fileURLToPath(import.meta.url))), 'bin', 'conventions.mjs');
const ID_PATTERN = 'SHOP-[A-Z]{2,5}-\\d{3}|DEMO-\\d+';

export const OBLIGATION = {
  id: 'sample', title: 'Пример обязательства', requirement: 'REQ-QUALITY-001', level: 'директива', since: '0.19.0',
  dueReleases: 2, area: 'QUAL', slug: 'adopt-sample',
  ticket: { scope: 'quality', priority: 'P2', problem: 'Проект не соответствует.', required: ['Сделать.'], acceptance: ['Сделано.'] },
};

export async function project({ obligations = [], extra = {} } = {}) {
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
