import assert from 'node:assert/strict';
import test from 'node:test';
import path from 'node:path';
import { mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { PREFIX, SEEDED_RELEASES, referenceConsumer, refreshIndexes } from './reference-consumer.mjs';
import { closability, closeRelease, finishRelease, openNext } from '../lib/release/cycle.mjs';
import { writeReceipt } from '../lib/release/receipt.mjs';
import { checkDocumentation } from '../lib/docs/check-docs.mjs';
import { DELIVERED_DOCUMENTS } from '../lib/documents.mjs';

const DAY = new Date('2026-09-12T00:00:00Z');
const receiptFor = (commit) => ({ commit, completedAt: DAY, checks: ['verify'], run: { command: 'mise run check', exitCode: 0 } });

async function head(consumer) {
  const { stdout } = await consumer.git('rev-parse', 'HEAD');
  return stdout.trim();
}

// CORE-ARC-005
test('эталонный потребитель несёт свойства формы, на которых ловились дефекты', async () => {
  const consumer = await referenceConsumer();
  try {
    const releases = await readdir(path.join(consumer.root, 'docs/releases'));
    const ordinals = releases.map((name) => Number(/RELEASE-\d{4}-\d{2}-(\d+)\.md/.exec(name)?.[1])).filter(Number.isInteger);
    assert.ok(ordinals.includes(9) && ordinals.includes(10), 'есть выпуски 9 и 10: порядок имён расходится с порядком номеров');
    assert.equal(ordinals.length, SEEDED_RELEASES);

    const delivered = await readdir(path.join(consumer.root, 'node_modules/@apocarteres/project-conventions/docs'));
    assert.deepEqual(delivered.sort(), [...DELIVERED_DOCUMENTS].sort(), 'видны только доставляемые документы');
    assert.ok(!delivered.includes('persistence.md'), 'внутренний документ ядра потребителю не виден');

    const config = JSON.parse(await readFile(path.join(consumer.root, '.conventions.json'), 'utf8'));
    assert.equal(config.ticketPrefix, PREFIX, 'префикс задач объявлен');
    assert.ok(config.commitRuleSince, 'правило о коммитах принято с объявленного коммита');

    const contract = await readFile(path.join(consumer.root, 'src/main/java/net/example/inventory/InventoryContract.java'), 'utf8');
    assert.match(contract, /internal\.InventoryStore/, 'корневой пакет модуля пользуется своей реализацией');
  } finally {
    await rm(consumer.root, { recursive: true, force: true });
  }
});

// CORE-OPS-033, CORE-QUAL-007, CORE-OPS-038, CORE-OPS-039
test('выпуск с двузначным номером закрывается у потребителя', async () => {
  const consumer = await referenceConsumer();
  const root = consumer.root;
  try {
    assert.equal((await openNext(root, { scheme: 'date', today: DAY })).opened, true);
    const opened = await readdir(path.join(root, 'docs/releases'));
    assert.ok(opened.includes('RELEASE-2026-09-11.md'), 'открыт одиннадцатый выпуск месяца');

    // CORE-QUAL-007
    const id = `${PREFIX}-QUAL-100`;
    await writeFile(path.join(root, `docs/tickets/closed/${id}-work.md`),
      `---\nid: ${id}\ntype: ticket\nstatus: done\nscope: quality\nauthority: supporting\npriority: P2\nrelease: unassigned\n---\n\n# ${id}\n`);
    await mkdir(path.join(root, 'src/main/java/net/example/inventory'), { recursive: true });
    await writeFile(path.join(root, 'src/main/java/net/example/inventory/Counted.java'),
      'package net.example.inventory;\n\npublic final class Counted {\n}\n');
    await consumer.git('add', '-A');
    await consumer.git('commit', '--quiet', '-m', `${id} работа по задаче состава`);

    // CORE-OPS-039
    await writeFile(path.join(root, `docs/tickets/closed/${id}-work.md`),
      `---\nid: ${id}\ntype: ticket\nstatus: done\nscope: quality\nauthority: supporting\npriority: P2\nrelease: unassigned\n---\n\n# ${id}\n\nОтвет владельца записан.\n`);
    await consumer.git('add', '-A');
    await consumer.git('commit', '--quiet', '-m', `${PREFIX}-QUAL-101 запись решения по незавершённой задаче`);

    // CORE-OPS-038
    await consumer.git('checkout', '--quiet', '-b', 'side');
    await writeFile(path.join(root, 'src/main/java/net/example/inventory/Side.java'),
      'package net.example.inventory;\n\npublic final class Side {\n}\n');
    await consumer.git('add', '-A');
    await consumer.git('commit', '--quiet', '-m', `${id} работа в ветке`);
    await consumer.git('checkout', '--quiet', '-');
    await consumer.git('merge', '--quiet', '--no-ff', '--no-edit', 'side');

    await writeReceipt(root, receiptFor(await head(consumer)));
    const state = await closability(root, { scheme: 'date' });
    assert.deepEqual(state.problems, [], state.problems.join('\n'));
    assert.equal((await closeRelease(root, { scheme: 'date', today: DAY })).closed, true);
    assert.equal((await finishRelease(root, { scheme: 'date', today: DAY, note: 'развёртывание' })).finished, true);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

// CORE-ARC-005, CORE-QUAL-007
test('проверка документов проходит, пока задача переезжает в закрытые при открытом выпуске', async () => {
  const consumer = await referenceConsumer();
  const root = consumer.root;
  try {
    const before = await checkDocumentation(root, { requiredCatalogTargets: [] });
    assert.deepEqual(before.errors, [], before.errors.join('\n'));
    assert.ok(before.markdownCount > 0, 'документы потребителя прочитаны');

    assert.equal((await openNext(root, { scheme: 'date', today: DAY })).opened, true);
    const id = `${PREFIX}-QUAL-200`;
    await writeFile(path.join(root, `docs/tickets/${id}-work.md`),
      `---\nid: ${id}\ntype: ticket\nstatus: in_progress\nscope: quality\nauthority: supporting\npriority: P2\nrelease: unassigned\n---\n\n# ${id}\n`);
    await refreshIndexes(root);
    const started = await checkDocumentation(root, { requiredCatalogTargets: [] });
    assert.deepEqual(started.errors, [], started.errors.join('\n'));
    assert.deepEqual(started.errors.filter((error) => error.includes(id)), [], started.errors.join('\n'));

    await rm(path.join(root, `docs/tickets/${id}-work.md`));
    await writeFile(path.join(root, `docs/tickets/closed/${id}-work.md`),
      `---\nid: ${id}\ntype: ticket\nstatus: done\nscope: quality\nauthority: supporting\npriority: P2\nrelease: RELEASE-2026-09-11\n---\n\n# ${id}\n`);
    await refreshIndexes(root);
    const moved = await checkDocumentation(root, { requiredCatalogTargets: [] });
    assert.deepEqual(moved.errors, [], 'переезд в закрытые при открытом выпуске документы не ломает');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
