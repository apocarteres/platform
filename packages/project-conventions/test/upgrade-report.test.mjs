import assert from 'node:assert/strict';
import test from 'node:test';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import {
  SEES_MORE_SECTION, breakingReasons, changesBetween, changesHistory, costSection, declaredIn, majorProblem, reportLines,
} from '../lib/release/changes.mjs';
import { commandsOf, contractOf, rulesOf, surfaceAt } from '../lib/release/surface.mjs';
import { environmentWithoutGit } from '../lib/release/git.mjs';

const EMPTY = { rules: [], commands: [], subcommands: [], keys: {}, clauses: [], obligations: [], contract: [] };

function surface(overrides) {
  return { ...EMPTY, ...overrides };
}

// REQ-PUBLISHING-015
test('новое правило-директива, снятая команда, ключ и положение несовместимы, прочее — нет', () => {
  const before = surface({
    rules: [{ id: 'comments', level: 'директива' }],
    commands: ['check', 'health', 'legacy'],
    subcommands: ['open', 'close'],
    keys: { health: ['--timeout', '--url'] },
    clauses: ['REQ-A-001', 'REQ-A-002'],
  });
  const after = surface({
    rules: [{ id: 'comments', level: 'директива' }, { id: 'wiring', level: 'директива' }, { id: 'hint', level: 'рекомендация' }],
    commands: ['check', 'health', 'unknown'],
    subcommands: ['open', 'close', 'reclose'],
    keys: { health: ['--url'] },
    clauses: ['REQ-A-001', 'REQ-A-003'],
    obligations: [{ id: 'unknown-path', level: 'директива', dueReleases: 3, requirement: 'REQ-DEPLOYMENT-018' }],
  });
  const reasons = breakingReasons(changesBetween(before, after));

  assert.equal(reasons.length, 4, reasons.join('\n'));
  assert.ok(reasons.some((line) => line.includes('правило-директива wiring')));
  assert.ok(reasons.some((line) => line.includes('снята команда conventions legacy')));
  assert.ok(reasons.some((line) => line.includes('снят ключ conventions health --timeout')));
  assert.ok(reasons.some((line) => line.includes('снято положение REQ-A-002')));
  assert.ok(!reasons.some((line) => line.includes('hint')), 'рекомендация несовместимостью не считается');
  assert.ok(!reasons.some((line) => line.includes('unknown-path')), 'обязательство обязывает, но не ломает');
});

// REQ-PUBLISHING-015
test('объявленная несовместимость читается из раздела документа выпуска', () => {
  const document = '# Выпуск\n\n## Несовместимые изменения\n\n- среда prod отвергается\n- порт отказывает\n\nПояснение.\n\n## Результат\n\n- не отсюда\n';
  assert.deepEqual(declaredIn(document), ['среда prod отвергается', 'порт отказывает']);
  assert.deepEqual(declaredIn('# Выпуск\n\n## Результат\n'), []);
  assert.deepEqual(declaredIn(null), []);

  const reasons = breakingReasons(changesBetween(EMPTY, EMPTY), declaredIn(document));
  assert.deepEqual(reasons, ['среда prod отвергается', 'порт отказывает'], 'объявленное считается наравне с найденным');
});

// REQ-PUBLISHING-004
test('несовместимое требует старшей версии и называет выход', () => {
  const cost = { breaking: ['новое правило-директива wiring'] };

  const refused = majorProblem(cost, { from: 'v1.47.0', tag: 'v1.48.0' });
  assert.match(refused, /Выпуск v1\.48\.0 несовместим \(1\)/);
  assert.match(refused, /release cancel/);
  assert.match(refused, /release open --version 2\.0\.0/, 'выход назван с номером');

  assert.equal(majorProblem(cost, { from: 'v1.47.0', tag: 'v2.0.0' }), null, 'старшая версия проходит');
  assert.equal(majorProblem({ breaking: [] }, { from: 'v1.47.0', tag: 'v1.48.0' }), null, 'совместимое — младшей');
  assert.equal(majorProblem(null, { from: null, tag: 'v1.0.0' }), null, 'первый выпуск сравнивать не с чем');
});

// REQ-PUBLISHING-015
test('отчёт об обновлении берёт выпуски строго после исходной версии и сводит итог', () => {
  const breaking = changesBetween(EMPTY, surface({ rules: [{ id: 'wiring', level: 'директива' }] }));
  const obliging = changesBetween(EMPTY, surface({
    obligations: [{ id: 'unknown-path', level: 'директива', dueReleases: 3, requirement: 'REQ-DEPLOYMENT-018' }],
  }));
  const history = [
    { version: '1.40.0', changes: breaking, declared: [], breaking: breakingReasons(breaking) },
    { version: '1.41.0', changes: obliging, declared: [], breaking: [] },
    { version: '1.42.0', changes: breaking, declared: [], breaking: breakingReasons(breaking) },
  ];

  const lines = reportLines(history, { from: '1.40.0' });
  assert.equal(lines[0], 'Обновление 1.40.0 → 1.42.0: выпусков 2.');
  assert.equal(lines[1], 'Несовместимо в 1 выпуск(ах): 1.42.0.', 'исходная версия в отчёт не входит');
  assert.equal(lines[2], 'Обязывает: 1.');

  assert.deepEqual(reportLines(history, { from: '1.42.0' }), ['После 1.42.0 выпусков нет: обновлять нечего.']);
  assert.equal(reportLines(history, { from: '1.39.0', to: '1.40.0' })[0], 'Обновление 1.39.0 → 1.40.0: выпусков 1.');
});

// REQ-PUBLISHING-015
test('раздел цены обновления говорит прямо, когда несовместимого нет', () => {
  const lines = costSection(changesBetween(EMPTY, surface({ commands: ['unknown'] })));
  assert.match(lines[0], /^Несовместимого нет/);
  assert.ok(lines.includes('- команда conventions unknown'));
});

// REQ-PUBLISHING-015
test('поверхность читается из исходников ядра без их исполнения', () => {
  const rules = "  {\n    id: 'comments',\n    level: DIRECTIVE,\n  },\n  {\n    id: 'hint',\n    level: RECOMMENDATION,\n  },\n";
  assert.deepEqual(rulesOf(rules), [{ id: 'comments', level: 'директива' }, { id: 'hint', level: 'рекомендация' }]);

  const newer = "const USAGE = {\n  check: 'conventions check',\n  'docs-check': 'x',\n  release: 'y',\n};\n"
    + "const RELEASE_USAGE = {\n  open: 'a',\n  close: 'b',\n};\n"
    + "const SPEC = {\n  health: { values: ['--url', '--timeout'] },\n};\n";
  assert.deepEqual(commandsOf(newer), { commands: ['check', 'docs-check'], subcommands: ['open', 'close'], keys: { health: ['--timeout', '--url'] } });

  const older = "const COMMANDS = 'conventions <check|sync'\n  + '|release> [--root <path>]';\nconsole.log('conventions release <status|close>');\n";
  assert.deepEqual(commandsOf(older).commands, ['check', 'sync'], 'ранняя форма без таблиц тоже читается');
  assert.deepEqual(commandsOf(older).subcommands, ['status', 'close']);
});

// REQ-PUBLISHING-015
function coreAt(root, { rules, commands, clauses, tag }) {
  const git = (...args) => execFileSync('git', ['-C', root, ...args], { env: environmentWithoutGit(), stdio: 'pipe' });
  return (async () => {
    const pkg = path.join(root, 'packages/project-conventions');
    await mkdir(path.join(pkg, 'bin'), { recursive: true });
    await mkdir(path.join(pkg, 'lib'), { recursive: true });
    await mkdir(path.join(root, 'docs/requirements'), { recursive: true });
    await writeFile(path.join(pkg, 'lib/rules.mjs'),
      rules.map((id) => `  {\n    id: '${id}',\n    level: DIRECTIVE,\n  },\n`).join(''));
    await writeFile(path.join(pkg, 'bin/conventions.mjs'),
      `const USAGE = {\n${commands.map((name) => `  ${name}: 'x',`).join('\n')}\n};\n`);
    await writeFile(path.join(pkg, 'lib/documents.mjs'), "export const DELIVERED_DOCUMENTS = [\n  'rules.md',\n];\n");
    await writeFile(path.join(root, 'docs/requirements/rules.md'),
      clauses.map((id) => `1. <a id="${id}"></a> **${id}** — текст.`).join('\n'));
    await writeFile(path.join(pkg, 'obligations.json'), JSON.stringify({ obligations: [] }));
    git('add', '-A');
    git('commit', '-q', '-m', `выпуск ${tag}`);
    git('tag', tag);
  })();
}

// REQ-PUBLISHING-015
test('история собирается по тегам ядра, а не по его текущему состоянию', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'core-history-'));
  const git = (...args) => execFileSync('git', ['-C', root, ...args], { env: environmentWithoutGit(), stdio: 'pipe' });
  try {
    git('init', '-q');
    git('config', 'user.email', 'core@example.net');
    git('config', 'user.name', 'Ядро');
    await coreAt(root, { rules: ['comments'], commands: ['check'], clauses: ['REQ-R-001'], tag: 'v1.0.0' });
    await coreAt(root, { rules: ['comments'], commands: ['check', 'health'], clauses: ['REQ-R-001', 'REQ-R-002'], tag: 'v1.1.0' });
    await coreAt(root, { rules: ['comments', 'wiring'], commands: ['check', 'health'], clauses: ['REQ-R-002'], tag: 'v1.2.0' });

    const history = await changesHistory(root);
    assert.deepEqual(history.map((entry) => entry.version), ['1.1.0', '1.2.0']);
    assert.deepEqual(history[0].breaking, [], 'добавленная команда совместима');
    assert.equal(history[1].breaking.length, 2, history[1].breaking.join('\n'));
    assert.ok(history[1].breaking.some((line) => line.includes('wiring')));
    assert.ok(history[1].breaking.some((line) => line.includes('REQ-R-001')));

    const head = await surfaceAt(root, 'HEAD');
    assert.deepEqual(head.rules.map((rule) => rule.id), ['comments', 'wiring']);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

// REQ-PUBLISHING-004, REQ-PUBLISHING-015
test('исправление проверки объявляется «видит больше», несовместимостью не считается, но в отчёте видно', () => {
  const document = '# Выпуск\n\n## Проверка видит больше\n\n- правило больше не обрывает тег на стрелке\n\n## Результат\n';
  const seesMore = declaredIn(document, SEES_MORE_SECTION);
  assert.deepEqual(seesMore, ['правило больше не обрывает тег на стрелке']);
  assert.deepEqual(declaredIn(document), [], 'это не объявленная несовместимость');

  const nothing = changesBetween(EMPTY, EMPTY);
  assert.deepEqual(breakingReasons(nothing, declaredIn(document)), [], 'младшая версия допустима');

  const section = costSection(nothing, [], seesMore);
  assert.match(section[0], /^Несовместимого нет: требования и объявленное поведение не менялись, но проверка видит больше/);
  assert.ok(section.includes('- правило больше не обрывает тег на стрелке'));

  const history = [{ version: '2.0.1', changes: nothing, declared: [], seesMore, breaking: [] }];
  const lines = reportLines(history, { from: '2.0.0' });
  assert.ok(lines.includes('Проверка видит больше в 1 выпуск(ах): 2.0.1.'), lines.join('\n'));
  assert.ok(lines.some((line) => line.includes('правило больше не обрывает тег на стрелке')), 'выпуск без несовместимого всё равно показан');
});

// REQ-AUTH-020
test('контракт: снятая точка, ответ или поле и новое обязательное поле запроса несовместимы, добавленное — нет', () => {
  const contract = (extra = {}) => JSON.stringify({
    paths: { '/api/auth/login': { post: { responses: { 200: {}, 401: {} } } }, ...(extra.paths ?? {}) },
    components: { schemas: { LoginRequest: { properties: { email: {}, password: {}, ...(extra.fields ?? {}) }, required: ['email', ...(extra.required ?? [])] } } },
  });
  const before = surface({ contract: contractOf(contract(), 'auth') });
  assert.ok(before.contract.includes('auth: точка POST /api/auth/login'));
  assert.ok(before.contract.includes('auth: ответ 200 у POST /api/auth/login'));
  assert.ok(!before.contract.some((entry) => entry.includes('401')), 'ответ отказа — не часть поверхности: коды держит тест контракта');

  const grown = surface({ contract: contractOf(contract({ paths: { '/api/auth/policy': { get: { responses: { 200: {} } } } }, fields: { human: {} } }), 'auth') });
  const added = changesBetween(before, grown);
  assert.deepEqual(breakingReasons(added), []);
  assert.ok(costSection(added).some((line) => line.includes('в контракте — auth: точка GET /api/auth/policy')));

  const tightened = surface({ contract: contractOf(contract({ required: ['password'] }), 'auth') });
  assert.match(breakingReasons(changesBetween(before, tightened))[0], /стало обязательным — auth: обязательное поле LoginRequest\.password/);

  const shrunk = surface({ contract: contractOf(JSON.stringify({ paths: {}, components: { schemas: { LoginRequest: { properties: { email: {} }, required: ['email'] } } } }), 'auth') });
  const reasons = breakingReasons(changesBetween(before, shrunk));
  assert.ok(reasons.some((line) => line.includes('снято в контракте — auth: точка POST /api/auth/login')), reasons.join('\n'));
  assert.ok(reasons.some((line) => line.includes('снято в контракте — auth: поле LoginRequest.password')));
  const relaxed = surface({ contract: contractOf(JSON.stringify({ paths: { '/api/auth/login': { post: { responses: { 200: {} } } } },
    components: { schemas: { LoginRequest: { properties: { email: {}, password: {} }, required: [] } } } }), 'auth') });
  assert.deepEqual(breakingReasons(changesBetween(before, relaxed)), [], 'снятие обязательности — не несовместимость');
});
