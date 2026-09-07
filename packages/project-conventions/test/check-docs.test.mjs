import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { checkDocumentation } from '../lib/docs/check-docs.mjs';

function metadata(id, type, status, scope, authority) {
  return [
    '---',
    `id: ${id}`,
    `type: ${type}`,
    `status: ${status}`,
    `scope: ${scope}`,
    `authority: ${authority}`,
    '---',
    '',
  ].join('\n');
}

async function writeFixtureFile(root, relativePath, content) {
  const target = path.join(root, relativePath);
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, content, 'utf8');
}

async function createValidFixture() {
  const root = await mkdtemp(path.join(os.tmpdir(), 'platform-docs-check-'));

  await writeFixtureFile(root, 'docs/INDEX.md', `${metadata('IDX-DOCS', 'index', 'active', 'documentation', 'navigation')}# Документация

- [Требования](REQUIREMENTS.md)
- [Решения](decisions/INDEX.md)
- [Инструкции](runbooks/INDEX.md)
- [Задачи](tickets/INDEX.md)
- [Выпуски](releases/INDEX.md)
`);
  await writeFixtureFile(root, 'docs/REQUIREMENTS.md', `${metadata('REQ-ROOT', 'requirement', 'active', 'project', 'normative')}# Требования

- [Каталог](requirements/)
- [Пример](requirements/example.md)
`);
  await writeFixtureFile(root, 'docs/requirements/example.md', `${metadata('REQ-EXAMPLE', 'requirement', 'active', 'example', 'normative')}# Пример

## Проверяемое правило

Правило.
`);
  await writeFixtureFile(root, 'docs/runbooks/INDEX.md', `${metadata('IDX-RUNBOOKS', 'index', 'active', 'operations', 'navigation')}# Инструкции

- [Пример](example.md)
`);
  await writeFixtureFile(root, 'docs/runbooks/example.md', `${metadata('RUN-EXAMPLE', 'runbook', 'active', 'operations', 'supporting')}# Эксплуатационная инструкция\n`);
  await writeFixtureFile(root, 'docs/decisions/INDEX.md', `${metadata('IDX-DECISIONS', 'index', 'active', 'architecture', 'navigation')}# Решения
`);
  await writeFixtureFile(root, 'docs/tickets/INDEX.md', `${metadata('IDX-TICKETS', 'index', 'active', 'planning', 'navigation')}# Задачи\n`);
  await writeFixtureFile(root, 'docs/tickets/closed/INDEX.md', `${metadata('IDX-CLOSED', 'index', 'active', 'planning', 'navigation')}# Закрытые задачи\n`);
  await writeFixtureFile(root, 'docs/tickets/features/INDEX.md', `${metadata('IDX-FEATURES', 'index', 'active', 'planning', 'navigation')}# Планы функций\n`);
  await writeFixtureFile(root, 'docs/releases/INDEX.md', `${metadata('IDX-RELEASES', 'index', 'active', 'planning', 'navigation')}# Выпуски\n`);

  return root;
}

async function withFixture(action) {
  const root = await createValidFixture();
  try {
    await action(root);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

test('принимает согласованный каталог документов', async () => {
  await withFixture(async (root) => {
    const result = await checkDocumentation(root);
    assert.deepEqual(result.errors, []);
  });
});

test('отклоняет действующее требование без метаданных', async () => {
  await withFixture(async (root) => {
    await writeFixtureFile(root, 'docs/requirements/example.md', '# Пример\n');
    const result = await checkDocumentation(root);
    assert(result.errors.some((error) => error.includes('docs/requirements/example.md: отсутствует YAML front matter')));
  });
});

test('отклоняет повторный идентификатор документа', async () => {
  await withFixture(async (root) => {
    await writeFixtureFile(root, 'docs/requirements/second.md', `${metadata('REQ-EXAMPLE', 'requirement', 'active', 'example', 'normative')}# Второе требование\n`);
    await writeFixtureFile(root, 'docs/REQUIREMENTS.md', `${metadata('REQ-ROOT', 'requirement', 'active', 'project', 'normative')}# Требования

- [Пример](requirements/example.md)
- [Второе требование](requirements/second.md)
`);
    const result = await checkDocumentation(root);
    assert(result.errors.some((error) => error.includes('идентификатор REQ-EXAMPLE уже используется')));
  });
});

test('проверяет существование файла и якоря', async () => {
  await withFixture(async (root) => {
    await writeFixtureFile(root, 'docs/requirements/example.md', `${metadata('REQ-EXAMPLE', 'requirement', 'active', 'example', 'normative')}# Пример

[Нет файла](missing.md)
[Нет якоря](#отсутствует)
`);
    const result = await checkDocumentation(root);
    assert(result.errors.some((error) => error.includes('цель ссылки missing.md не существует')));
    assert(result.errors.some((error) => error.includes('якорь #отсутствует отсутствует')));
  });
});

test('требует включать каждый документ требований в карту', async () => {
  await withFixture(async (root) => {
    await writeFixtureFile(root, 'docs/requirements/second.md', `${metadata('REQ-SECOND', 'requirement', 'active', 'example', 'normative')}# Второе требование\n`);
    const result = await checkDocumentation(root);
    assert(result.errors.some((error) => error.includes('docs/REQUIREMENTS.md: отсутствует ссылка на docs/requirements/second.md')));
  });
});

test('отклоняет ссылку метаданных на неизвестный документ', async () => {
  await withFixture(async (root) => {
    await writeFixtureFile(root, 'docs/requirements/example.md', `---
id: REQ-EXAMPLE
type: requirement
status: active
scope: example
authority: normative
related: UNKNOWN-DOCUMENT
---

# Пример
`);
    const result = await checkDocumentation(root);
    assert(result.errors.some((error) => error.includes('ссылается на неизвестный документ UNKNOWN-DOCUMENT')));
  });
});

test('отклоняет свободный статус в начале документа', async () => {
  await withFixture(async (root) => {
    await writeFixtureFile(root, 'docs/runbooks/example.md', `${metadata('RUN-EXAMPLE', 'runbook', 'active', 'operations', 'supporting')}# Инструкция

Status: active.
`);
    const result = await checkDocumentation(root);
    assert(result.errors.some((error) => error.includes('поле Status должно храниться только в YAML front matter')));
  });
});

test('требует индекс для каждого плана функции', async () => {
  await withFixture(async (root) => {
    await writeFixtureFile(root, 'docs/tickets/features/example/INDEX.md', `${metadata('FEATURE-EXAMPLE', 'ticket', 'backlog', 'example', 'supporting')}# План функции\n`);
    const result = await checkDocumentation(root);
    assert(result.errors.some((error) => error.includes('docs/tickets/features/INDEX.md: отсутствует ссылка на docs/tickets/features/example/INDEX.md')));
  });
});

test('не допускает нерешённый вопрос в действующем требовании', async () => {
  await withFixture(async (root) => {
    await writeFixtureFile(root, 'docs/requirements/example.md', `${metadata('REQ-EXAMPLE', 'requirement', 'active', 'example', 'normative')}# Пример

> Требует уточнения: выбрать поведение.
`);
    const result = await checkDocumentation(root);
    assert(result.errors.some((error) => error.includes('нерешённый вопрос должен находиться в proposed-решении')));
  });
});

test('принимает стабильные идентификаторы положений требования', async () => {
  await withFixture(async (root) => {
    await writeFixtureFile(root, 'docs/requirements/example.md', `---
id: REQ-EXAMPLE
type: requirement
status: active
scope: example
authority: normative
clause-id-prefix: REQ-EXAMPLE
---

# Пример

1. <a id="REQ-EXAMPLE-001"></a> **REQ-EXAMPLE-001** — Проверяемое правило.
`);
    const result = await checkDocumentation(root);
    assert.deepEqual(result.errors, []);
    assert.equal(result.requirementClauseCount, 1);
  });
});

test('требует стабильный идентификатор у каждого нумерованного положения размеченного документа', async () => {
  await withFixture(async (root) => {
    await writeFixtureFile(root, 'docs/requirements/example.md', `---
id: REQ-EXAMPLE
type: requirement
status: active
scope: example
authority: normative
clause-id-prefix: REQ-EXAMPLE
---

# Пример

1. Проверяемое правило.
`);
    const result = await checkDocumentation(root);
    assert(result.errors.some((error) => error.includes('нумерованное положение должно начинаться со стабильного якоря')));
  });
});

test('отклоняет повторный идентификатор положения', async () => {
  await withFixture(async (root) => {
    await writeFixtureFile(root, 'docs/requirements/example.md', `---
id: REQ-EXAMPLE
type: requirement
status: active
scope: example
authority: normative
clause-id-prefix: REQ-EXAMPLE
---

# Пример

1. <a id="REQ-EXAMPLE-001"></a> **REQ-EXAMPLE-001** — Первое правило.
2. <a id="REQ-EXAMPLE-001"></a> **REQ-EXAMPLE-001** — Второе правило.
`);
    const result = await checkDocumentation(root);
    assert(result.errors.some((error) => error.includes('идентификатор положения REQ-EXAMPLE-001 уже используется')));
  });
});

test('общая проверка применяет правила задач к метаданным и расположению', async () => {
  await withFixture(async (root) => {
    await writeFixtureFile(root, 'docs/tickets/example.md',
      metadata('TICKET-EXAMPLE', 'ticket', 'done', 'testing', 'supporting') + '# Пример\n');
    const result = await checkDocumentation(root);
    assert(result.errors.some(error => error.includes('priority должен')));
    assert(result.errors.some(error => error.includes('расположение задачи')));
  });
});

test('общая проверка сверяет назначение выпуска и полноту каталога', async () => {
  await withFixture(async root => {
    const header = metadata('TICKET-RELEASE', 'ticket', 'backlog', 'testing', 'supporting')
      .replace('authority: supporting\n', 'authority: supporting\npriority: P2\nrelease: RELEASE-MISSING\n');
    await writeFixtureFile(root, 'docs/tickets/release-task.md', header + '# Задача\n');
    const result = await checkDocumentation(root);
    assert(result.errors.some(error => error.includes('назначенный выпуск не существует')));
    await writeFixtureFile(root, 'docs/releases/rules.md',
      metadata('REF-RELEASE-RULES', 'reference', 'active', 'planning', 'supporting') + '# Правила\n');
    const updated = await checkDocumentation(root);
    assert(updated.errors.some(error => error.includes('отсутствует ссылка на docs/releases/rules.md')));
  });
});

test('задача, выпущенная до цикла, не требует документа выпуска и может ссылаться на обязательство', async () => {
  await withFixture(async (root) => {
    await writeFixtureFile(root, 'docs/tickets/closed/old.md', `---
id: TICKET-OLD
type: ticket
status: done
scope: example
authority: supporting
priority: P2
release: before-cycle
obligation: sample
---

# Старая задача
`);
    await writeFixtureFile(root, 'docs/tickets/closed/INDEX.md', `${metadata('IDX-CLOSED', 'index', 'active', 'planning', 'navigation')}# Закрытые задачи

- [Старая задача](old.md)
`);
    const result = await checkDocumentation(root);
    assert.deepEqual(result.errors, []);
  });
});

test('ссылка на нормативный документ, доставленный пакетом правил, считается известной', async () => {
  await withFixture(async (root) => {
    await writeFixtureFile(root, 'docs/tickets/closed/linked.md', `---
id: TICKET-LINKED
type: ticket
status: done
scope: example
authority: supporting
priority: P2
release: unassigned
related: REQ-DELIVERED
---

# Задача со ссылкой на требование ядра
`);
    await writeFixtureFile(root, 'docs/tickets/closed/INDEX.md', `${metadata('IDX-CLOSED', 'index', 'active', 'planning', 'navigation')}# Закрытые задачи

- [Задача со ссылкой](linked.md)
`);
    const unknown = await checkDocumentation(root);
    assert.ok(unknown.errors.some((error) => error.includes('REQ-DELIVERED')), 'без пакета ссылка неизвестна');

    await writeFixtureFile(
      root,
      'node_modules/@apocarteres/project-conventions/docs/delivered.md',
      `${metadata('REQ-DELIVERED', 'requirement', 'active', 'example', 'normative')}# Доставленное требование\n`,
    );
    const known = await checkDocumentation(root);
    assert.deepEqual(known.errors, []);
  });
});
