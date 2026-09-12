import assert from 'node:assert/strict';
import test from 'node:test';
import path from 'node:path';
import os from 'node:os';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { INSTALLED_DOCS_PATH } from '../lib/agents.mjs';
import { collisions, dictionary, findForbiddenWords, findLongWordings, readableLines } from '../lib/terms.mjs';

const ALIAS = '# Подстановки\n\n| Запрещено | Вместо него | Почему |\n|---|---|---|\n'
  + '| храповик | ограничитель | образ без объяснения |\n';
const DEFINITIONS = '# Толкование\n\n| Термин | Толкование |\n|---|---|\n| Тикет | проектная задача |\n';

async function project(files) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'terms-'));
  for (const [name, content] of Object.entries(files)) {
    const target = path.join(root, name);
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, content);
  }
  return root;
}

// REQ-TERMS-004
test('запрещённое слово находится в документе и называется заменой', async () => {
  const root = await project({
    'docs/terms/ALIAS.md': ALIAS,
    'docs/tickets/CORE-QUAL-001-work.md': 'Нарушения держит храповик проекта.\n',
  });
  try {
    const found = await findForbiddenWords(root);

    const items = found.get('docs/tickets/CORE-QUAL-001-work.md');
    assert.equal(items.length, 1);
    assert.equal(items[0].replacement, 'ограничитель');
    assert.equal(items[0].line, 1);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

// REQ-TERMS-009
test('цитата, код и блок кода из проверки исключены', async () => {
  const root = await project({
    'docs/terms/ALIAS.md': ALIAS,
    'docs/tickets/CORE-QUAL-002-quote.md': [
      '> Потребитель пишет: храповик не опускается.',
      'Разбор: `храповик` в выводе команды.',
      '```',
      'Файлов под храповиком: 23',
      '```',
      'Обычная строка без слова.',
    ].join('\n'),
  });
  try {
    assert.deepEqual([...(await findForbiddenWords(root)).keys()], []);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

// REQ-TERMS-010
test('сам каталог словаря проверкой не читается', async () => {
  const root = await project({ 'docs/terms/ALIAS.md': ALIAS, 'docs/terms/RULES.md': 'Слово храповик здесь назвать можно.\n' });
  try {
    assert.equal((await findForbiddenWords(root)).size, 0);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

// REQ-TERMS-004
test('короткое толкование считается предпочтительным термином', async () => {
  const root = await project({
    'docs/terms/DEFINITIONS.md': DEFINITIONS,
    'docs/tickets/CORE-QUAL-003-work.md': 'Заведена проектная задача на разбор.\n',
  });
  try {
    const found = await findLongWordings(root);

    assert.equal(found.get('docs/tickets/CORE-QUAL-003-work.md')[0].replacement, 'Тикет');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

// REQ-TERMS-002
test('словарь потребителя дополняет доставленный словарь ядра', async () => {
  const root = await project({
    [path.join(INSTALLED_DOCS_PATH, 'terms/ALIAS.md')]: ALIAS,
    'docs/terms/ALIAS.md': '| Запрещено | Вместо него | Почему |\n|---|---|---|\n| эпик | план функции | свой термин проекта |\n',
    'docs/tickets/CORE-QUAL-004-work.md': 'Эпик разбит на этапы, храповик не трогаем.\n',
  });
  try {
    const items = (await findForbiddenWords(root)).get('docs/tickets/CORE-QUAL-004-work.md');

    assert.deepEqual(items.map((item) => item.replacement).sort(), ['ограничитель', 'план функции']);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

// REQ-TERMS-003
test('расхождение толкований у ядра и потребителя называется', async () => {
  const root = await project({
    [path.join(INSTALLED_DOCS_PATH, 'terms/DEFINITIONS.md')]: DEFINITIONS,
    'docs/terms/DEFINITIONS.md': '| Термин | Толкование |\n|---|---|\n| Тикет | обращение в поддержку |\n',
  });
  try {
    const found = collisions(await dictionary(root));

    assert.equal(found.length, 1);
    assert.match(found[0], /«Тикет» определён и в/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

// REQ-TERMS-009
test('строки цитат и кода в разбор не попадают', () => {
  const lines = readableLines('первая\n> цитата\n```\nкод\n```\nвторая\n');

  assert.deepEqual(lines.map((line) => line.text.trim()).filter((text) => text !== ''), ['первая', 'вторая']);
});
