import assert from 'node:assert/strict';
import test from 'node:test';
import path from 'node:path';
import { readFile, rm, writeFile } from 'node:fs/promises';
import { PREFIX, referenceConsumer } from './reference-consumer.mjs';
import { documentationProblems } from '../lib/docs/documentation.mjs';
import { openNext } from '../lib/release/cycle.mjs';

const DAY = new Date('2026-10-23T00:00:00Z');

function ticket(id, status = 'backlog') {
  return `---\nid: ${id}\ntype: ticket\nstatus: ${status}\nscope: quality\nauthority: supporting\npriority: P2\nrelease: unassigned\n---\n\n# ${id}\n`;
}

// REQ-PROJECT-PROCESS-013
test('задача, заведённая без пересборки сводок, не роняет проверку документации: PR сводок не трогает', async () => {
  const consumer = await referenceConsumer();
  try {
    const index = path.join(consumer.root, 'docs/tickets/INDEX.md');
    const before = await readFile(index, 'utf8');
    await writeFile(path.join(consumer.root, `docs/tickets/${PREFIX}-OPS-031-retry-export.md`), ticket(`${PREFIX}-OPS-031`));
    await writeFile(path.join(consumer.root, `docs/tickets/closed/${PREFIX}-OPS-032-done-in-a-pull-request.md`), ticket(`${PREFIX}-OPS-032`, 'done'));
    const { errors } = await documentationProblems(consumer.root, {});
    assert.deepEqual(errors, []);
    assert.equal(await readFile(index, 'utf8'), before, 'проверка сводку не пишет');
  } finally {
    await rm(consumer.root, { recursive: true, force: true });
  }
});

// REQ-PROJECT-PROCESS-013
test('проверка документации по-прежнему отказывает на самих задачах: повторный номер и неверный статус', async () => {
  const consumer = await referenceConsumer();
  try {
    await writeFile(path.join(consumer.root, `docs/tickets/${PREFIX}-OPS-031-first.md`), ticket(`${PREFIX}-OPS-031`));
    await writeFile(path.join(consumer.root, `docs/tickets/${PREFIX}-OPS-031-second.md`), ticket(`${PREFIX}-OPS-031`));
    await writeFile(path.join(consumer.root, `docs/tickets/${PREFIX}-OPS-033-odd.md`), ticket(`${PREFIX}-OPS-033`, 'someday'));
    const { errors } = await documentationProblems(consumer.root, {});
    assert.ok(errors.some((error) => /идентификатор/.test(error) && error.includes(`${PREFIX}-OPS-031`)), errors.join('\n'));
    assert.ok(errors.some((error) => /статус/.test(error)), errors.join('\n'));
  } finally {
    await rm(consumer.root, { recursive: true, force: true });
  }
});

// REQ-PROJECT-PROCESS-013
test('цикл выпуска пересобирает сводки: задача из PR попадает в сводку при открытии выпуска', async () => {
  const consumer = await referenceConsumer();
  try {
    await writeFile(path.join(consumer.root, `docs/tickets/${PREFIX}-OPS-031-retry-export.md`), ticket(`${PREFIX}-OPS-031`));
    await consumer.git('add', '-A');
    await consumer.git('commit', '--quiet', '-m', `${PREFIX}-OPS-031 Задача заведена в PR`);
    assert.equal((await openNext(consumer.root, { scheme: 'date', today: DAY })).opened, true);
    const { summariesAfterTheCycle } = await import('../lib/cli/release.mjs');
    await summariesAfterTheCycle(consumer.root);
    assert.match(await readFile(path.join(consumer.root, 'docs/tickets/INDEX.md'), 'utf8'), new RegExp(`${PREFIX}-OPS-031-retry-export\\.md`));
  } finally {
    await rm(consumer.root, { recursive: true, force: true });
  }
});
