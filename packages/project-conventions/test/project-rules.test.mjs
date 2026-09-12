import assert from 'node:assert/strict';
import test from 'node:test';
import { allRules, projectRules } from '../lib/rules.mjs';
import { toRule, validate } from '../lib/project-rules.mjs';

const builtIn = new Set(['comments', 'clock', 'naming-er']);

test('правило проекта дополняет правила платформы, а не заменяет их', () => {
  const { rules, errors } = allRules({
    rules: [{
      id: 'no-er-suffix', level: 'рекомендация', document: 'REQ-JAVA-NAMING', text: 'docs/requirements/java-naming.md',
      message: 'класс с суффиксом -er', forbid: 'class\\s+\\w+[Ee]r\\b',
    }],
  });
  assert.deepEqual(errors, []);
  assert.deepEqual(rules.map((rule) => rule.id), [
    'comments', 'clock', 'money-types', 'file-size', 'config-secrets', 'dependency-versions',
    'document-naming', 'naming-er', 'no-er-suffix',
  ]);
});

test('идентификатор правила платформы занять нельзя', () => {
  const errors = validate([{ id: 'clock', level: 'директива', document: 'D', text: 't', message: 'm', forbid: 'a' }], builtIn);
  assert.equal(errors.length, 1);
  assert.match(errors[0], /занят правилом платформы/);
});

test('определение проверяется: поля, регулярное выражение, полярность', () => {
  assert.match(validate([{ id: 'a', level: 'директива', document: 'D', text: 't', message: 'm' }], builtIn)[0], /forbid.*where.*require/);
  assert.match(validate([{ id: 'a', level: 'директива', document: 'D', text: 't', message: 'm', forbid: '(' }], builtIn)[0], /не является регулярным/);
  assert.match(validate([{ id: 'a', level: 'директива', document: 'D', text: 't', message: 'm', forbid: 'x', typo: 1 }], builtIn).join(), /неизвестное поле typo/);
  assert.match(validate([{ level: 'директива', document: 'D', text: 't', message: 'm', forbid: 'x' }], builtIn).join(), /требуется id/);
});

test('пара where и require ловит объявление без обязательного признака', async (t) => {
  const { mkdtemp, mkdir, writeFile, rm } = await import('node:fs/promises');
  const os = await import('node:os');
  const path = await import('node:path');
  const root = await mkdtemp(path.join(os.tmpdir(), 'project-rules-'));
  try {
    await mkdir(path.join(root, 'src'), { recursive: true });
    await writeFile(path.join(root, 'src', 'A.java'), [
      'public final class A {}',
      'public abstract class B {}',
      'public class C {}',
      '// public class D {}',
    ].join('\n'));
    const rule = toRule({
      id: 'final-classes', level: 'директива', document: 'REQ-CODE-FINAL', text: 'docs/requirements/code-final.md',
      message: 'неабстрактный класс без final', extensions: ['.java'],
      where: '\\bclass\\s+\\w+', require: '\\b(final|abstract)\\b',
    });
    const violations = await rule.find(root, { sources: ['.'] });
    assert.deepEqual([...violations.keys()], ['src/A.java']);
    assert.deepEqual(violations.get('src/A.java').map((item) => item.line), [3]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('область действия и перечень исключений сужают правило', async () => {
  const { mkdtemp, mkdir, writeFile, rm } = await import('node:fs/promises');
  const os = await import('node:os');
  const path = await import('node:path');
  const root = await mkdtemp(path.join(os.tmpdir(), 'project-rules-'));
  try {
    for (const file of ['backend/src/Manager.java', 'agent/src/Manager.java']) {
      await mkdir(path.join(root, path.dirname(file)), { recursive: true });
      await writeFile(path.join(root, file), 'class Manager {}\n');
    }
    const entry = {
      id: 'no-er-suffix', level: 'рекомендация', document: 'D', text: 't', message: 'класс с суффиксом -er',
      extensions: ['.java'], scope: ['backend'], forbid: 'class\\s+\\w+[Ee]r\\b',
    };
    assert.deepEqual([...(await toRule(entry).find(root, { sources: ['.'] })).keys()], ['backend/src/Manager.java']);
    const allowed = toRule({ ...entry, allow: ['backend/src/Manager.java'] });
    assert.equal((await allowed.find(root, { sources: ['.'] })).size, 0);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('пустой перечень правил проекта допустим', () => {
  assert.deepEqual(projectRules({}), { rules: [], errors: [] });
});

test('каждый документ правила входит в перечень доставляемых', async () => {
  const { DELIVERED_DOCUMENTS } = await import('../lib/documents.mjs');
  const { RULES } = await import('../lib/rules.mjs');
  for (const rule of RULES) assert(DELIVERED_DOCUMENTS.includes(rule.file), rule.file);
});

test('уровень требования обязателен и проверяется по перечню', () => {
  const base = { id: 'x', document: 'D', text: 't', message: 'm', forbid: 'a' };
  assert.match(validate([base], builtIn).join(), /требуется level/);
  assert.match(validate([{ ...base, level: 'желательно' }], builtIn).join(), /требуется level/);
  assert.deepEqual(validate([{ ...base, level: 'рекомендация' }], builtIn), []);
  assert.deepEqual(validate([{ ...base, level: 'директива' }], builtIn), []);
});

test('каждый документ требований либо доставляется потребителю, либо объявлен внутренним', async () => {
  const { readdir } = await import('node:fs/promises');
  const { fileURLToPath } = await import('node:url');
  const path = (await import('node:path')).default;
  const { DELIVERED_DOCUMENTS, CORE_ONLY_DOCUMENTS } = await import('../lib/documents.mjs');

  const requirements = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../docs/requirements');
  const documents = (await readdir(requirements)).filter((name) => name.endsWith('.md'));
  assert(documents.length > 0, 'каталог требований ядра не найден');
  for (const document of documents) {
    const classified = DELIVERED_DOCUMENTS.includes(document) || document in CORE_ONLY_DOCUMENTS;
    assert(classified, `${document}: документ не объявлен ни доставляемым, ни внутренним`);
  }
  for (const [document, reason] of Object.entries(CORE_ONLY_DOCUMENTS)) {
    assert(documents.includes(document), `${document}: объявлен внутренним, но такого документа нет`);
    assert(reason && reason.length > 10, `${document}: у внутреннего документа должна быть причина`);
    assert(!DELIVERED_DOCUMENTS.includes(document), `${document}: не может быть и внутренним, и доставляемым`);
  }
});

// REQ-ADOPTION-016, REQ-RELEASE-012
test('обязательство ссылается на положение доставляемого документа', async () => {
  const { readFile, readdir } = await import('node:fs/promises');
  const { fileURLToPath } = await import('node:url');
  const path = (await import('node:path')).default;
  const { DELIVERED_DOCUMENTS } = await import('../lib/documents.mjs');

  const here = path.dirname(fileURLToPath(import.meta.url));
  const requirements = path.resolve(here, '../../../docs/requirements');
  const delivered = new Set();
  for (const name of await readdir(requirements)) {
    if (!DELIVERED_DOCUMENTS.includes(name)) continue;
    const text = await readFile(path.join(requirements, name), 'utf8');
    for (const found of text.matchAll(/<a id="(REQ-[A-Z-]+-\d+)">/g)) delivered.add(found[1]);
  }
  assert(delivered.size > 0, 'доставляемые положения не найдены');

  const catalogue = JSON.parse(await readFile(path.resolve(here, '../obligations.json'), 'utf8'));
  for (const obligation of catalogue.obligations) {
    assert(
      delivered.has(obligation.requirement),
      `${obligation.id}: требование ${obligation.requirement} не доставляется потребителю, исполнить обязательство нечем`,
    );
  }
});
