import assert from 'node:assert/strict';
import test from 'node:test';
import os from 'node:os';
import path from 'node:path';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { buildIdeaIndex, ideaTicketErrors, validateIdea } from '../lib/docs/ideas.mjs';
import { parseFrontMatter, validateTicket } from '../lib/docs/ticket-model.mjs';
import { nameIssue } from '../lib/document-naming.mjs';
import { ideaRecord } from '../lib/release/commits.mjs';
import { commitStanding } from '../lib/release/cycle.mjs';
import { questionStanding } from '../lib/release/questions.mjs';
import { updateTicketIndexes } from '../lib/docs/tickets-index.mjs';

// REQ-TICKETS-017
const idea = (fields, body = '') => `---\nid: CORE-IDEA-001\ntype: idea\nscope: planning\nauthority: supporting\n${fields}---\n\n# Идея\n${body}`;

// REQ-TICKETS-017
function problems(content, file = 'docs/ideas/CORE-IDEA-001-shared-journal.md') {
  const parsed = parseFrontMatter(content);
  return [...validateIdea(file, content, parsed), ...validateTicket(file, content, parsed)];
}

// REQ-TICKETS-017, REQ-TICKETS-018
test('идея может держать открытые вопросы, но не признаки работы', () => {
  assert.deepEqual(problems(idea('status: open\nquestions: open\n', '\n## Открытые вопросы\n\n1. Нужно ли? Ответ: —\n')), []);
  const worked = problems(idea('status: open\npriority: P1\nrelease: unassigned\nobligation: sample\n'));
  assert.equal(worked.length, 3);
  assert.ok(worked.every((one) => /у идеи недопустимо: идея не работа — заведите задачу/.test(one)), worked.join('\n'));
  assert.match(problems(idea('status: open\n'), 'docs/tickets/CORE-IDEA-001-x.md')[0], /идея лежит в docs\/ideas\//);
});

// REQ-TICKETS-018, REQ-TICKETS-019
test('принятая идея называет задачу, отклонённая — причину, и ни та ни другая не держит открытых вопросов', () => {
  assert.match(problems(idea('status: accepted\n'))[0], /называет задачу, которая её исполняет: поле ticket/);
  assert.deepEqual(problems(idea('status: accepted\nticket: CORE-OPS-001\n')), []);
  assert.match(problems(idea('status: open\nticket: CORE-OPS-001\n'))[0], /поле ticket есть только у принятой идеи/);
  assert.match(problems(idea('status: rejected\n'))[0], /разделом «Почему не делаем»/);
  assert.deepEqual(problems(idea('status: rejected\n', '\n## Почему не делаем\n\nДорого.\n')), []);
  assert.match(problems(idea('status: accepted\nticket: CORE-OPS-001\nquestions: open\n', '\n## Открытые вопросы\n\n1. ?\n'))[0],
    /не принимается и не отклоняется: сначала ответьте/);
  const documents = [
    { file: 'docs/ideas/a.md', metadata: new Map([['type', 'idea'], ['ticket', 'CORE-OPS-404']]) },
    { file: 'docs/tickets/b.md', metadata: new Map([['type', 'ticket'], ['id', 'CORE-OPS-001']]) },
  ];
  assert.deepEqual(ideaTicketErrors(documents), ['docs/ideas/a.md: идея ссылается на неизвестную задачу CORE-OPS-404']);
});

// REQ-TICKETS-017, REQ-NAMING-012
test('имя файла идеи — <префикс>-IDEA-<NNN>-<слаг>.md', () => {
  const metadata = new Map([['type', 'idea'], ['id', 'CORE-IDEA-007']]);
  assert.equal(nameIssue('docs/ideas/CORE-IDEA-007-shared-journal.md', metadata, ['OPS'], 'CORE'), null);
  assert.match(nameIssue('docs/ideas/CORE-OPS-007-shared-journal.md', metadata, ['OPS'], 'CORE'), /CORE-IDEA-<NNN>-<слаг>\.md/);
  assert.match(nameIssue('docs/ideas/CORE-IDEA-008-shared-journal.md', metadata, ['OPS'], 'CORE'), /ожидается CORE-IDEA-008/);
});

// REQ-TICKETS-020
test('коммит с идеей — запись об идее, только пока он меняет лишь файлы идей', () => {
  const commit = (subject, files) => ({ subject, files });
  assert.equal(ideaRecord(commit('CORE-IDEA-001 Записать идею', ['docs/ideas/CORE-IDEA-001-x.md', 'docs/ideas/INDEX.md']), 'CORE'), true);
  assert.equal(ideaRecord(commit('CORE-IDEA-001 Сделать идею', ['docs/ideas/CORE-IDEA-001-x.md', 'lib/a.mjs']), 'CORE'), false);
  assert.equal(ideaRecord(commit('CORE-OPS-001 Задача', ['docs/ideas/CORE-IDEA-001-x.md']), 'CORE'), false);

  const context = { members: new Set(), cancelled: new Set(), accounted: [], areas: ['OPS'], prefix: 'CORE', stages: new Set() };
  const standing = (subject, files) => commitStanding({ sha: 'abc', subject, body: '', files, parents: ['p'] }, context);
  assert.equal(standing('CORE-IDEA-001 Записать идею', ['docs/ideas/CORE-IDEA-001-x.md']), 'запись об идее');
  assert.equal(standing('CORE-IDEA-001 Сделать идею', ['lib/a.mjs']), 'не называет задачу');
});

// REQ-TICKETS-017, REQ-RELEASE-047
test('вопросы идей не считаются в пороги открытых вопросов; сводка идей собирается рядом со сводкой задач', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'ideas-'));
  try {
    await mkdir(path.join(root, 'docs/tickets/closed'), { recursive: true });
    await mkdir(path.join(root, 'docs/ideas'), { recursive: true });
    for (let index = 1; index <= 12; index += 1) {
      const id = `CORE-IDEA-${String(index).padStart(3, '0')}`;
      await writeFile(path.join(root, `docs/ideas/${id}-idea.md`),
        idea('status: open\nquestions: open\n', '\n## Открытые вопросы\n\n1. ? Ответ: —\n').replace('CORE-IDEA-001', id));
    }
    assert.deepEqual(await questionStanding(root, {}), { problems: [], reminders: [] });

    assert.deepEqual(await updateTicketIndexes(root), []);
    const index = await readFile(path.join(root, 'docs/ideas/INDEX.md'), 'utf8');
    assert.match(index, /Всего: 12, открыто: 12\./);
    assert.match(index, /\| \[Идея\]\(CORE-IDEA-001-idea\.md\) \| Открыта \| открыты \| — \|/);
    assert.equal((await buildIdeaIndex(root)).open, 12);
    assert.deepEqual(await updateTicketIndexes(root, { check: true }), []);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

// REQ-TICKETS-019
test('проверка документов принимает принятую идею с полем ticket и отвергает это поле у задачи', async () => {
  const { checkDocumentation } = await import('../lib/docs/check-docs.mjs');
  const root = await mkdtemp(path.join(os.tmpdir(), 'ideas-docs-'));
  try {
    await mkdir(path.join(root, 'docs/ideas'), { recursive: true });
    await mkdir(path.join(root, 'docs/tickets'), { recursive: true });
    await writeFile(path.join(root, 'docs/tickets/CORE-OPS-001-work.md'),
      '---\nid: CORE-OPS-001\ntype: ticket\nstatus: backlog\nscope: quality\nauthority: supporting\npriority: P2\nrelease: unassigned\nticket: CORE-OPS-002\n---\n\n# Работа\n');
    await writeFile(path.join(root, 'docs/ideas/CORE-IDEA-001-idea.md'), idea('status: accepted\nticket: CORE-OPS-001\n'));
    const { errors } = await checkDocumentation(root);
    assert.deepEqual(errors.filter((one) => one.includes('docs/ideas/CORE-IDEA-001')), []);
    assert.ok(errors.some((one) => /CORE-OPS-001-work\.md: неизвестное поле метаданных ticket/.test(one)), errors.join('\n'));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
