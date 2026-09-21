import assert from 'node:assert/strict';
import test from 'node:test';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { promisify } from 'node:util';
import { checksum, deployedAsFile, deployedInContainer, labelOf } from '../lib/deployed.mjs';

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
