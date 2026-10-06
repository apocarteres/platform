import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile, mkdir } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const run = promisify(execFile);
const here = path.dirname(fileURLToPath(import.meta.url));
const cli = path.join(path.dirname(here), 'bin', 'conventions.mjs');
const CORE_TEMPLATE = path.join(here, '..', '..', '..', '.github', 'ISSUE_TEMPLATE', 'consumer-report.md');
const TEMPLATE = '.github/ISSUE_TEMPLATE/consumer-report.md';

async function conventions(root, ...args) {
  try {
    const { stdout, stderr } = await run(process.execPath, [cli, ...args, '--root', root]);
    return { code: 0, output: `${stdout}${stderr}` };
  } catch (error) {
    return { code: error.code, output: `${error.stdout}${error.stderr}` };
  }
}

async function project(config) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'feedback-template-'));
  await writeFile(path.join(root, '.conventions.json'), JSON.stringify(config));
  return root;
}

const headings = (text) => text.split('\n').filter((line) => line.startsWith('## '));

// REQ-ADOPTION-027
test('без объявленного канала шаблон не пишется, отказ называет ключ', async () => {
  const root = await project({ sources: ['src'] });
  try {
    const refused = await conventions(root, 'feedback-template');
    assert.equal(refused.code, 2, refused.output);
    assert.match(refused.output, /\.conventions\.json.*feedback\.url/);
    assert.match(refused.output, /REQ-ADOPTION-027/);
    await assert.rejects(readFile(path.join(root, TEMPLATE)));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

// REQ-ADOPTION-027
test('адрес канала — только адрес https', async () => {
  const root = await project({ sources: ['src'], feedback: { url: 'git@example.test:team/ledger.git' } });
  try {
    const refused = await conventions(root, 'feedback-template');
    assert.equal(refused.code, 2, refused.output);
    assert.match(refused.output, /feedback\.url.*https/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

// REQ-ADOPTION-027, REQ-ADOPTION-019, REQ-ADOPTION-020, REQ-ADOPTION-025
test('объявленный канал получает шаблон заявки формы ядра с именем и версией проекта', async () => {
  const root = await project({ sources: ['src'], feedback: { url: 'https://github.example.test/team/ledger' } });
  try {
    const written = await conventions(root, 'feedback-template');
    assert.equal(written.code, 0, written.output);
    assert.match(written.output, /consumer-report\.md/);
    const template = await readFile(path.join(root, TEMPLATE), 'utf8');
    assert.match(template, /^---\nname: Заявка потребителя ledger\n/);
    assert.match(template, /labels: consumer-report/);
    assert.match(template, /https:\/\/github\.example\.test\/team\/ledger/);
    assert.match(template, /^Версия ledger:$/m);
    assert.match(template, /до закрытия следующего выпуска ledger/);
    assert.match(template, /ЗАКРЫТУЮ ЗАЯВКУ НЕ КОММЕНТИРУЙТЕ/);
    assert.match(template, /Продолжение #NN/);

    const core = await readFile(CORE_TEMPLATE, 'utf8');
    assert.deepEqual(headings(template).map((line) => line.replace('ledger', '<проект>')),
      headings(core).map((line) => line.replace('ядра', '<проект>')), 'разделы те же, что у заявки в ядро');
    assert.match(core, /ЗАКРЫТУЮ ЗАЯВКУ НЕ КОММЕНТИРУЙТЕ/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

// REQ-ADOPTION-027
test('повтор не меняет шаблон, правленый руками шаблон не перезаписывается', async () => {
  const root = await project({ sources: ['src'], feedback: { url: 'https://github.example.test/team/ledger.git' } });
  try {
    assert.equal((await conventions(root, 'feedback-template')).code, 0);
    const again = await conventions(root, 'feedback-template');
    assert.equal(again.code, 0, again.output);
    assert.match(again.output, /уже на месте/);

    const file = path.join(root, TEMPLATE);
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, 'своя форма\n');
    const refused = await conventions(root, 'feedback-template');
    assert.equal(refused.code, 1, refused.output);
    assert.match(refused.output, /consumer-report\.md.*отличается/);
    assert.equal(await readFile(file, 'utf8'), 'своя форма\n');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
