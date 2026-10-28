import assert from 'node:assert/strict';
import test from 'node:test';
import path from 'node:path';
import { readFile, rm, writeFile } from 'node:fs/promises';
import { PREFIX, referenceConsumer } from './reference-consumer.mjs';
import { documentationProblems } from '../lib/docs/documentation.mjs';
import { updateTicketIndexes } from '../lib/docs/tickets-index.mjs';
import { metadataDeclaration } from '../lib/docs/project-metadata.mjs';

const MANUAL_QA = { types: ['ticket'], values: ['required', 'passed', 'not-required'], index: true, done: ['passed', 'not-required'] };
const CONFIG = { metadata: { fields: { 'manual-qa': MANUAL_QA } } };

function ticket(id, status, extra = '') {
  return `---\nid: ${id}\ntype: ticket\nstatus: ${status}\nscope: quality\nauthority: supporting\npriority: P2\nrelease: unassigned\n${extra}---\n\n# ${id}\n`;
}

async function consumerWith(files) {
  const consumer = await referenceConsumer();
  for (const [name, content] of Object.entries(files)) await writeFile(path.join(consumer.root, name), content);
  return consumer;
}

const about = (errors, file) => errors.filter((error) => error.startsWith(file));

// REQ-PROJECT-PROCESS-024
test('объявленное поле принимается у своих типов и со своими значениями; необъявленное — отказ, как прежде', async () => {
  const consumer = await consumerWith({
    [`docs/tickets/${PREFIX}-QUAL-301-pay.md`]: ticket(`${PREFIX}-QUAL-301`, 'backlog', 'manual-qa: required\n'),
    [`docs/tickets/${PREFIX}-QUAL-302-odd.md`]: ticket(`${PREFIX}-QUAL-302`, 'backlog', 'manual-qa: maybe\n'),
    [`docs/tickets/${PREFIX}-QUAL-303-other.md`]: ticket(`${PREFIX}-QUAL-303`, 'backlog', 'owner-team: payments\n'),
    'docs/runbooks/qa.md': '---\nid: RUN-QA\ntype: runbook\nstatus: active\nscope: quality\nauthority: supporting\nmanual-qa: required\n---\n\n# QA\n',
  });
  try {
    const { errors } = await documentationProblems(consumer.root, CONFIG);
    assert.deepEqual(about(errors, `docs/tickets/${PREFIX}-QUAL-301`), []);
    assert.deepEqual(about(errors, `docs/tickets/${PREFIX}-QUAL-302`),
      [`docs/tickets/${PREFIX}-QUAL-302-odd.md: поле manual-qa: значение maybe не из required, passed, not-required`]);
    assert.deepEqual(about(errors, `docs/tickets/${PREFIX}-QUAL-303`),
      [`docs/tickets/${PREFIX}-QUAL-303-other.md: неизвестное поле метаданных owner-team`]);
    assert.deepEqual(about(errors, 'docs/runbooks/qa.md'),
      ['docs/runbooks/qa.md: поле manual-qa объявлено только для типов ticket, а документ — runbook']);
  } finally {
    await rm(consumer.root, { recursive: true, force: true });
  }
});

// REQ-PROJECT-PROCESS-024
test('условие для done: задача с полем выполнена только с разрешённым значением; без поля условия нет', async () => {
  const consumer = await consumerWith({
    [`docs/tickets/closed/${PREFIX}-QUAL-311-paid.md`]: ticket(`${PREFIX}-QUAL-311`, 'done', 'manual-qa: required\n'),
    [`docs/tickets/closed/${PREFIX}-QUAL-312-checked.md`]: ticket(`${PREFIX}-QUAL-312`, 'done', 'manual-qa: passed\n'),
    [`docs/tickets/closed/${PREFIX}-QUAL-313-plain.md`]: ticket(`${PREFIX}-QUAL-313`, 'done'),
  });
  try {
    const { errors } = await documentationProblems(consumer.root, CONFIG);
    assert.deepEqual(about(errors, `docs/tickets/closed/${PREFIX}-QUAL-311`),
      [`docs/tickets/closed/${PREFIX}-QUAL-311-paid.md: задача выполнена, а manual-qa — required; для done нужно passed или not-required`]);
    assert.deepEqual(about(errors, `docs/tickets/closed/${PREFIX}-QUAL-312`), []);
    assert.deepEqual(about(errors, `docs/tickets/closed/${PREFIX}-QUAL-313`), [], 'задача без поля условию не подлежит');
  } finally {
    await rm(consumer.root, { recursive: true, force: true });
  }
});

// REQ-PROJECT-PROCESS-024
test('объявление проверяется: имя поля ядра, неизвестный тип, done вне значений, неизвестный ключ', () => {
  const { problems } = metadataDeclaration({ metadata: { fields: {
    release: { types: ['ticket'], values: ['x'] },
    ticket: { types: ['ticket'], values: ['x'] },
    'manual-qa': { types: ['ticket', 'widget'], values: ['passed'], done: ['approved'], color: 'red' },
    'Bad Name': { types: ['ticket'], values: ['x'] },
  } } });
  for (const expected of [/поле release — поле ядра/, /поле ticket — поле ядра/, /manual-qa: тип widget неизвестен/,
    /manual-qa: done — значения из values: approved/, /manual-qa: неизвестный ключ color/, /имя поля «Bad Name»/]) {
    assert.ok(problems.some((problem) => expected.test(problem)), `${expected}\n${problems.join('\n')}`);
  }
  assert.deepEqual(metadataDeclaration(CONFIG).problems, []);
  assert.deepEqual(metadataDeclaration({}).problems, []);
});

// REQ-PROJECT-PROCESS-024
test('отказ объявления виден в проверке документации', async () => {
  const consumer = await referenceConsumer();
  try {
    const { errors } = await documentationProblems(consumer.root, { metadata: { fields: { status: { types: ['ticket'], values: ['x'] } } } });
    assert.ok(errors.includes('.conventions.json: metadata.fields: поле status — поле ядра; объявите своё имя'), errors.join('\n'));
  } finally {
    await rm(consumer.root, { recursive: true, force: true });
  }
});

// REQ-PROJECT-PROCESS-024
test('поле с index: true — столбец сводки задач', async () => {
  const consumer = await consumerWith({
    '.conventions.json': JSON.stringify({ sources: ['src'], ticketPrefix: PREFIX, ...CONFIG }),
    [`docs/tickets/${PREFIX}-QUAL-321-pay.md`]: ticket(`${PREFIX}-QUAL-321`, 'backlog', 'manual-qa: required\n'),
    [`docs/tickets/${PREFIX}-QUAL-322-plain.md`]: ticket(`${PREFIX}-QUAL-322`, 'backlog'),
  });
  try {
    assert.deepEqual(await updateTicketIndexes(consumer.root), []);
    const index = await readFile(path.join(consumer.root, 'docs/tickets/INDEX.md'), 'utf8');
    assert.match(index, /^\| Задача \| Приоритет \| Статус \| Выпуск \| Области \| manual-qa \|$/m);
    assert.match(index, new RegExp(`${PREFIX}-QUAL-321-pay\\.md\\) \\|.*\\| required \\|$`, 'm'));
    assert.match(index, new RegExp(`${PREFIX}-QUAL-322-plain\\.md\\) \\|.*\\|  \\|$`, 'm'));
  } finally {
    await rm(consumer.root, { recursive: true, force: true });
  }
});
