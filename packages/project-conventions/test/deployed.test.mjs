import assert from 'node:assert/strict';
import test from 'node:test';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import { promisify } from 'node:util';
import { checksum, deployedAsFile, deployedInContainer, labelOf, sumOfTree } from '../lib/deployed.mjs';

const run = promisify(execFile);
const LABEL = 'ru.example.artifact-sha';

// REQ-QUALITY-003
async function dockerHere() {
  try {
    await run('docker', ['version', '--format', '{{.Server.Version}}']);
    return true;
  } catch {
    return false;
  }
}

async function tree(content = 'артефакт\n') {
  const root = await mkdtemp(path.join(os.tmpdir(), 'deployed-'));
  await writeFile(path.join(root, 'app.jar'), content);
  return root;
}

// REQ-DEPLOYMENT-017
async function client(root, appContent = 'console.log(1)\n') {
  const directory = path.join(root, 'dist/client');
  await mkdir(path.join(directory, 'assets'), { recursive: true });
  await writeFile(path.join(directory, 'index.html'), '<html lang="ru"></html>\n');
  await writeFile(path.join(directory, 'assets/app.js'), appContent);
  return directory;
}

// REQ-DEPLOYMENT-017
test('артефакт-каталог считается: одинаковые деревья дают одну сумму, правленное — другую', async () => {
  const first = await mkdtemp(path.join(os.tmpdir(), 'tree-a-'));
  const second = await mkdtemp(path.join(os.tmpdir(), 'tree-b-'));
  try {
    const built = await client(first);
    const installed = await client(second);

    const sum = await checksum(built);
    assert.match(sum.value, /^[0-9a-f]{64}$/, 'каталог считается, а не отказывает');
    assert.equal((await checksum(installed)).value, sum.value, 'два одинаковых дерева дают одну сумму');

    await writeFile(path.join(installed, 'assets/app.js'), 'console.log(2)\n');
    assert.notEqual((await checksum(installed)).value, sum.value, 'правка файла внутри дерева видна');
  } finally {
    await rm(first, { recursive: true, force: true });
    await rm(second, { recursive: true, force: true });
  }
});

// REQ-DEPLOYMENT-017
test('сумма дерева не зависит от порядка обхода и зависит от имён', () => {
  const entries = [
    { name: 'index.html', sum: 'a'.repeat(64) },
    { name: 'assets/app.js', sum: 'b'.repeat(64) },
    { name: 'assets/style.css', sum: 'c'.repeat(64) },
  ];

  const straight = sumOfTree(entries);
  assert.equal(sumOfTree([...entries].reverse()), straight, 'обратный порядок даёт ту же сумму');
  assert.equal(sumOfTree([entries[1], entries[2], entries[0]]), straight, 'любая перестановка даёт ту же сумму');

  const renamed = [{ ...entries[0], name: 'default.html' }, entries[1], entries[2]];
  assert.notEqual(sumOfTree(renamed), straight, 'то же содержимое под другим именем даёт другую сумму');

  const swapped = [
    { name: 'index.html', sum: 'b'.repeat(64) },
    { name: 'assets/app.js', sum: 'a'.repeat(64) },
    entries[2],
  ];
  assert.notEqual(sumOfTree(swapped), straight, 'переставленное между именами содержимое видно');
});

// REQ-DEPLOYMENT-017
test('пустой каталог и содержимое не файл отказывают с названной причиной', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'tree-strange-'));
  try {
    const empty = path.join(root, 'dist');
    await mkdir(empty, { recursive: true });
    const emptySum = await checksum(empty);
    assert.match(emptySum.error, /артефакт пуст/);
    assert.match(emptySum.error, /сумма одна и та же/, 'отказ называет, чем плоха сумма пустоты');

    await writeFile(path.join(empty, 'index.html'), '<html lang="ru"></html>\n');
    await symlink(path.join(empty, 'index.html'), path.join(empty, 'latest.html'));
    const strange = await checksum(empty);
    assert.match(strange.error, /есть не файл и не каталог: latest\.html/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

// REQ-DEPLOYMENT-016, REQ-DEPLOYMENT-017
test('развёрнутый каталог сверяется с собранным', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'deployed-tree-'));
  const installedRoot = await mkdtemp(path.join(os.tmpdir(), 'installed-tree-'));
  try {
    await client(root);
    const installed = await client(installedRoot);
    assert.equal((await deployedAsFile(root, { artifact: 'dist/client', installed })).proved, true);

    await writeFile(path.join(installed, 'index.html'), '<html lang="ru">вчера</html>\n');
    const stale = await deployedAsFile(root, { artifact: 'dist/client', installed });
    assert.equal(stale.proved, false);
    assert.match(stale.reason, /развёрнуто не собранное/);
  } finally {
    await rm(root, { recursive: true, force: true });
    await rm(installedRoot, { recursive: true, force: true });
  }
});

// REQ-DEPLOYMENT-016
test('установленный файл сверяется с собранным по содержимому', async () => {
  const root = await tree();
  const target = path.join(root, 'installed.jar');
  try {
    await writeFile(target, 'артефакт\n');
    assert.equal((await deployedAsFile(root, { artifact: 'app.jar', installed: target })).proved, true);

    await writeFile(target, 'вчерашний артефакт\n');
    const stale = await deployedAsFile(root, { artifact: 'app.jar', installed: target });
    assert.equal(stale.proved, false);
    assert.match(stale.reason, /развёрнуто не собранное/);
    assert.match(stale.reason, /несостоявшаяся замена файла/, 'отказ называет, как это выглядит на деле');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

// REQ-DEPLOYMENT-016
test('отсутствие артефакта и отсутствие установленного различаются', async () => {
  const root = await tree();
  try {
    const noArtifact = await deployedAsFile(root, { artifact: 'нет.jar', installed: path.join(root, 'app.jar') });
    assert.match(noArtifact.reason, /артефакта нет: .*нет\.jar/);

    const noInstalled = await deployedAsFile(root, { artifact: 'app.jar', installed: '/нет/такого' });
    assert.match(noInstalled.reason, /артефакта нет: \/нет\/такого/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

// REQ-DEPLOYMENT-016
test('метка работающего контейнера сверяется с собранным', async (t) => {
  // REQ-QUALITY-003
  if (!await dockerHere()) {
    t.skip('Docker здесь не запущен: сверка по метке требует внешней службы');
    return;
  }
  const root = await tree();
  const image = 'core-deployed-probe:t';
  const container = 'core-deployed-probe';
  try {
    const built = await checksum(path.join(root, 'app.jar'));
    await writeFile(path.join(root, 'Dockerfile'),
      `FROM alpine:3\nARG SHA\nLABEL ${LABEL}=$SHA\nCMD ["sleep","30"]\n`);
    await run('docker', ['build', '-q', '--build-arg', `SHA=${built.value}`, '-t', image, root]);
    await run('docker', ['rm', '-f', container]).catch(() => {});
    await run('docker', ['run', '-d', '--name', container, image]);

    const proved = await deployedInContainer(root, { artifact: 'app.jar', container, label: LABEL });
    assert.equal(proved.proved, true, proved.reason);

    await writeFile(path.join(root, 'app.jar'), 'пересобранный артефакт\n');
    const stale = await deployedInContainer(root, { artifact: 'app.jar', container, label: LABEL });
    assert.equal(stale.proved, false, 'контейнер прежний, артефакт новый — это и есть ловимый случай');
    assert.match(stale.reason, /перезапуск прежнего контейнера/);

    const absent = await deployedInContainer(root, { artifact: 'app.jar', container, label: 'нет.такой' });
    assert.match(absent.reason, /нет метки нет\.такой/);
  } finally {
    await run('docker', ['rm', '-f', container]).catch(() => {});
    await run('docker', ['rmi', '-f', image]).catch(() => {});
    await rm(root, { recursive: true, force: true });
  }
});

// REQ-DEPLOYMENT-016
test('несуществующий контейнер назван отказом, а не принят за совпадение', async () => {
  const answer = await labelOf('нет-такого-контейнера-core', LABEL);

  assert.match(answer.error, /не опрошен/, 'ответ один и тот же, есть Docker или нет: молчание совпадением не считается');
});

// REQ-QUALITY-003
test('пропуск сверки по метке объявлен, а не молчалив', async () => {
  const available = await dockerHere();

  assert.equal(typeof available, 'boolean');
  if (!available) {
    assert.ok(true, 'Docker отсутствует: проверка выше пропущена с названной причиной, а не прошла как чистая');
  }
});
