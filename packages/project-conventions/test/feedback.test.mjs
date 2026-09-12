import assert from 'node:assert/strict';
import test from 'node:test';
import path from 'node:path';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import { feedbackChannel, feedbackLine } from '../lib/feedback.mjs';
import { INSTALLED_DOCS_PATH } from '../lib/agents.mjs';

const CLAUSE = '19. <a id="REQ-ADOPTION-019"></a> **REQ-ADOPTION-019** — Потребитель сообщает ядру о его дефекте'
  + ' заявкой в issue репозитория ядра `https://github.com/example/core`. Адрес доставляется вместе с текстами правил.\n';

// REQ-ADOPTION-019
test('адрес канала берётся из доставленного правила, а не из кода', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'feedback-'));
  try {
    await mkdir(path.join(root, INSTALLED_DOCS_PATH), { recursive: true });
    await writeFile(path.join(root, INSTALLED_DOCS_PATH, 'adoption.md'), `---\nid: REQ-ADOPTION\n---\n\n${CLAUSE}`);

    const channel = await feedbackChannel(root);

    assert.equal(channel.url, 'https://github.com/example/core');
    assert.match(feedbackLine(channel), /заявка в ядро: https:\/\/github\.com\/example\/core \(REQ-ADOPTION-019\)/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

// REQ-ADOPTION-019
test('без доставленного правила канал не выдумывается', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'feedback-'));
  try {
    assert.equal(await feedbackChannel(root), null);
    assert.equal(feedbackLine(null), null);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
