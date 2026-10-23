import assert from 'node:assert/strict';
import test from 'node:test';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { commitStanding } from '../lib/release/cycle.mjs';
import { environmentWithoutGit } from '../lib/release/git.mjs';

const run = promisify(execFile);
const cli = path.join(path.dirname(path.dirname(fileURLToPath(import.meta.url))), 'bin', 'conventions.mjs');

function ticket(id, title = 'Работа') {
  return `---\nid: ${id}\ntype: ticket\nstatus: done\nscope: quality\nauthority: supporting\npriority: P2\nrelease: unassigned\n---\n\n# ${title}\n`;
}

// REQ-PROJECT-PROCESS-023
async function repository() {
  const root = await mkdtemp(path.join(os.tmpdir(), 'ticket-exists-'));
  const git = async (...args) => (await run('git', ['-C', root, ...args], { env: environmentWithoutGit() })).stdout.trim();
  await git('init', '--quiet', '-b', 'main');
  await git('config', 'user.email', 'test@example.test');
  await git('config', 'user.name', 'Test');
  const put = async (file, content) => {
    await mkdir(path.dirname(path.join(root, file)), { recursive: true });
    await writeFile(path.join(root, file), content);
  };
  const commit = async (message) => {
    await git('add', '-A');
    await git('commit', '--quiet', '--allow-empty', '-m', message);
    return git('rev-parse', 'HEAD');
  };
  await put('docs/tickets/SHOP-OPS-001-first.md', ticket('SHOP-OPS-001'));
  const first = await commit('SHOP-OPS-001 Начало');
  await put('.conventions.json', JSON.stringify({ sources: ['src'], ticketPrefix: 'SHOP', commitRuleSince: first }));
  const base = await commit('SHOP-OPS-001 Настройка');
  return { root, git, put, commit, base, stop: () => rm(root, { recursive: true, force: true }) };
}

async function conventions(root, ...args) {
  try {
    const { stdout, stderr } = await run(process.execPath, [cli, ...args, '--root', root]);
    return { code: 0, output: `${stdout}${stderr}` };
  } catch (error) {
    return { code: error.code, output: `${error.stdout}${error.stderr}` };
  }
}

// REQ-PROJECT-PROCESS-023
test('коммит, называющий задачу, которой нет в репозитории, — отказ шлагбаума с выходом', async () => {
  const one = await repository();
  try {
    await one.put('src/a.txt', 'работа');
    const named = await one.commit('SHOP-OPS-002 Работа без задачи');
    const refused = await conventions(one.root, 'commits', '--range', `${one.base}..HEAD`);
    assert.equal(refused.code, 1, refused.output);
    assert.match(refused.output, new RegExp(`${named.slice(0, 8)}: называет SHOP-OPS-002, а задачи нет в docs/tickets`));
    assert.match(refused.output, /заведите её в этом же изменении или назовите существующую/);
  } finally {
    await one.stop();
  }
});

// REQ-PROJECT-PROCESS-023
test('задача, заведённая в том же изменении позже, засчитывается: сверка идёт с вершиной диапазона', async () => {
  const one = await repository();
  try {
    await one.put('src/a.txt', 'работа');
    await one.commit('SHOP-OPS-002 Работа');
    await one.put('docs/tickets/SHOP-OPS-002-work.md', ticket('SHOP-OPS-002'));
    await one.commit('SHOP-OPS-002 Задача заведена');
    const passed = await conventions(one.root, 'commits', '--range', `${one.base}..HEAD`);
    assert.equal(passed.code, 0, passed.output);
  } finally {
    await one.stop();
  }
});

// REQ-PROJECT-PROCESS-023
test('положение коммита: названной задачи нет — «задача не заведена», а не «вне состава»', () => {
  const context = { members: new Set(), cancelled: new Set(), accounted: [], areas: ['OPS'], prefix: 'SHOP', stages: new Set(),
    existing: new Set(['SHOP-OPS-001']) };
  const commit = (subject) => ({ sha: 'a'.repeat(40), subject, body: '', parents: ['b'], files: [] });
  assert.equal(commitStanding(commit('SHOP-OPS-009 Нечто'), context), 'задача не заведена');
  assert.equal(commitStanding(commit('SHOP-OPS-001 Нечто'), context), 'задача вне состава');
  assert.equal(commitStanding(commit('Без задачи'), context), 'не называет задачу');
});

// REQ-TICKETS-022
async function collided() {
  const one = await repository();
  await one.git('checkout', '--quiet', '-b', 'feature');
  await one.put('docs/tickets/SHOP-OPS-002-mine.md', ticket('SHOP-OPS-002', 'Моя работа'));
  await one.put('src/mine.js', '// SHOP-OPS-002\nexport const mine = 1;\n');
  await one.commit('SHOP-OPS-002 Моя работа');
  await one.put('src/mine.js', '// SHOP-OPS-002\nexport const mine = 2;\n');
  await one.commit('SHOP-OPS-002 Доделка\n\nПодробности SHOP-OPS-002.');
  await one.git('checkout', '--quiet', 'main');
  await one.put('docs/tickets/SHOP-OPS-002-theirs.md', ticket('SHOP-OPS-002', 'Чужая работа'));
  await one.put('src/theirs.js', '// SHOP-OPS-002\n');
  await one.commit('SHOP-OPS-002 Чужая работа');
  await one.git('checkout', '--quiet', 'feature');
  await one.git('rebase', '--quiet', 'main');
  return one;
}

// REQ-TICKETS-022
test('перенумерация: своя задача ветки получает свободный номер, сообщения и ссылки ветки переписаны, чужое не тронуто', async () => {
  const one = await collided();
  try {
    const renumbered = await conventions(one.root, 'tickets-renumber', 'SHOP-OPS-002', '--base', 'main');
    assert.equal(renumbered.code, 0, renumbered.output);
    assert.match(renumbered.output, /SHOP-OPS-002 → SHOP-OPS-003/);
    assert.match(renumbered.output, /--force-with-lease/);

    const files = await readdir(path.join(one.root, 'docs/tickets'));
    assert.ok(files.includes('SHOP-OPS-003-mine.md'), files.join(', '));
    assert.ok(files.includes('SHOP-OPS-002-theirs.md'), 'чужая задача на месте');
    assert.match(await readFile(path.join(one.root, 'docs/tickets/SHOP-OPS-003-mine.md'), 'utf8'), /^id: SHOP-OPS-003$/m);
    assert.match(await readFile(path.join(one.root, 'src/mine.js'), 'utf8'), /^\/\/ SHOP-OPS-003$/m);
    assert.match(await readFile(path.join(one.root, 'src/theirs.js'), 'utf8'), /^\/\/ SHOP-OPS-002$/m, 'файл main не тронут');

    const branch = (await one.git('log', '--format=%s%n%b', 'main..HEAD')).split('\n').filter(Boolean);
    const record = 'SHOP-OPS-003 Задача перенумерована: SHOP-OPS-002 занят в main';
    assert.ok(branch.includes(record), 'перенумерация записана коммитом, который называет оба номера');
    assert.ok(branch.filter((line) => line !== record && !line.startsWith('Подробности')).every((line) => !line.includes('SHOP-OPS-002')),
      branch.join('\n'));
    assert.ok(branch.includes('SHOP-OPS-003 Моя работа'), branch.join('\n'));
    assert.ok(branch.includes('SHOP-OPS-003 Доделка'), branch.join('\n'));
    // REQ-TICKETS-022
    assert.ok(branch.includes('Подробности SHOP-OPS-002.'), 'упоминание в теле не тронуто: оно может быть задачей основы');
    assert.match(renumbered.output, /упоминает SHOP-OPS-002 в теле — не тронуто, проверьте/);
    assert.equal(await one.git('log', '-1', '--format=%s', 'main'), 'SHOP-OPS-002 Чужая работа');
    assert.equal(await one.git('status', '--porcelain'), '', 'перенумерация закоммичена');
    // REQ-PROJECT-PROCESS-013
    assert.equal(await one.git('diff', '--name-only', 'HEAD~1', 'HEAD', '--', 'docs/tickets/INDEX.md'), '', 'сводки перенумерация не трогает');

    assert.equal((await conventions(one.root, 'commits', '--range', 'main..HEAD')).code, 0);
  } finally {
    await one.stop();
  }
});

// REQ-TICKETS-022
test('перенумерация отказывает: номер не занят, рабочее дерево грязное, в ветке слияние', async () => {
  const one = await collided();
  try {
    const free = await conventions(one.root, 'tickets-renumber', 'SHOP-OPS-001', '--base', 'main');
    assert.equal(free.code, 1, free.output);
    assert.match(free.output, /ветка не заводит задачу SHOP-OPS-001/);

    await writeFile(path.join(one.root, 'src/dirty.js'), 'x');
    const dirty = await conventions(one.root, 'tickets-renumber', 'SHOP-OPS-002', '--base', 'main');
    assert.equal(dirty.code, 1, dirty.output);
    assert.match(dirty.output, /незакоммиченные изменения/);
    await rm(path.join(one.root, 'src/dirty.js'));

    await one.git('checkout', '--quiet', '-b', 'side', 'main');
    await one.put('src/side.js', 'side');
    await one.commit('SHOP-OPS-001 Боковая');
    await one.git('checkout', '--quiet', 'feature');
    await one.git('merge', '--quiet', '--no-ff', '-m', 'Слияние', 'side');
    const merged = await conventions(one.root, 'tickets-renumber', 'SHOP-OPS-002', '--base', 'main');
    assert.equal(merged.code, 1, merged.output);
    assert.match(merged.output, /слияни/);
  } finally {
    await one.stop();
  }
});

// REQ-TICKETS-022
test('перенумерация меняет только строки ветки: ссылка основы на свою задачу с тем же номером остаётся', async () => {
  const one = await repository();
  try {
    await one.put('deploy/all.yml', 'first: 1\nsecond: 2\nthird: 3\n');
    await one.commit('SHOP-OPS-001 Настройка развёртывания');
    await one.git('checkout', '--quiet', '-b', 'feature');
    await one.put('docs/tickets/SHOP-OPS-002-mine.md', ticket('SHOP-OPS-002', 'Моя работа'));
    await one.put('deploy/all.yml', 'first: 1\nsecond: 2\nthird: 3 # SHOP-OPS-002 моя правка\n');
    await one.commit('SHOP-OPS-002 Моя работа\n\nСм. также SHOP-OPS-002 в main.');
    await one.git('checkout', '--quiet', 'main');
    await one.put('docs/tickets/SHOP-OPS-002-theirs.md', ticket('SHOP-OPS-002', 'Чужая работа'));
    await one.put('deploy/all.yml', 'first: 1 # SHOP-OPS-002 чужая правка\nsecond: 2\nthird: 3\n');
    await one.commit('SHOP-OPS-002 Чужая работа');
    await one.git('checkout', '--quiet', 'feature');
    await one.git('rebase', '--quiet', 'main');

    const renumbered = await conventions(one.root, 'tickets-renumber', 'SHOP-OPS-002', '--base', 'main');
    assert.equal(renumbered.code, 0, renumbered.output);
    assert.equal(await readFile(path.join(one.root, 'deploy/all.yml'), 'utf8'),
      'first: 1 # SHOP-OPS-002 чужая правка\nsecond: 2\nthird: 3 # SHOP-OPS-003 моя правка\n');
    assert.match(renumbered.output, /deploy\/all\.yml:1: SHOP-OPS-002 пришёл из main — не тронут, проверьте/);

    const message = await one.git('log', '-1', '--format=%B', 'HEAD~1');
    assert.match(message, /^SHOP-OPS-003 Моя работа/, 'идентификатор в начале сообщения — задача ветки');
    assert.match(message, /См\. также SHOP-OPS-002 в main\./, 'упоминание в теле может быть задачей основы');
    assert.match(renumbered.output, /сообщение [0-9a-f]{8} упоминает SHOP-OPS-002 в теле — не тронуто, проверьте/);
  } finally {
    await one.stop();
  }
});
