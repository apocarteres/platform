#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CONFIG_FILE, readConfig } from '../lib/config.mjs';
import { collectSourceFiles } from '../lib/comments.mjs';
import { findToolchainMismatches } from '../lib/toolchain.mjs';
import { TICKET_AREAS } from '../lib/document-naming.mjs';
import { migrate, plan } from '../lib/naming-migration.mjs';
import { DEFAULT_IDLE_SECONDS, DEFAULT_LIMIT_SECONDS, report, runWithLimits } from '../lib/run.mjs';
import { RECOMMENDATION, RULES, allRules } from '../lib/rules.mjs';
import { BASELINE_FILE, baselineExists, compare, counts, readBaseline, writeBaseline } from '../lib/baseline.mjs';
import { INSTALLED_DOCS_PATH, SOURCE_DOCS_PATH, inspectBlock, manifest, markerVersion, readAgents, replaceBlock, writeAgents } from '../lib/agents.mjs';
import { feedbackChannel, feedbackLine } from '../lib/feedback.mjs';
import { collisions, dictionary } from '../lib/terms.mjs';
import { checkDocumentation } from '../lib/docs/check-docs.mjs';
import { updateTicketIndexes } from '../lib/docs/tickets-index.mjs';
import { refreshCompositionLinks, updateReleaseIndex } from '../lib/docs/releases-index.mjs';
import { adoptCycle, cancelRelease, closeRelease, closability, dropFromComposition, finishability, finishRelease, openNext, satisfyObligation } from '../lib/release/cycle.mjs';
import { declaredObligations, findObligationDebts, loadObligations, obligationState, readState, writeState } from '../lib/release/obligations.mjs';
import { writeReceipt } from '../lib/release/receipt.mjs';
import { headCommit, tagCommit } from '../lib/release/git.mjs';
import { systemNow } from '../lib/now.mjs';

const packageRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

async function docsPath(root) {
  try {
    await readFile(path.join(root, SOURCE_DOCS_PATH, RULES[0].file));
    return SOURCE_DOCS_PATH;
  } catch {
    return INSTALLED_DOCS_PATH;
  }
}

// REQ-ADOPTION-019
async function nameTheDoor(root) {
  const line = feedbackLine(await feedbackChannel(root));
  if (line !== null) console.error(line);
}

async function packageVersion() {
  return JSON.parse(await readFile(path.join(packageRoot, 'package.json'), 'utf8')).version;
}


async function check(root) {
  const problems = [];
  const version = await packageVersion();
  const config = await readConfig(root);
  const { rules, errors } = allRules(config);
  problems.push(...errors);
  let agents;
  try {
    agents = await readAgents(root);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  if (agents === undefined) {
    problems.push('AGENTS.md отсутствует; выполните conventions sync');
  } else {
    const block = inspectBlock(agents, version, manifest(version, await docsPath(root), rules));
    if (block.state === 'missing') problems.push('AGENTS.md не содержит блок правил; выполните conventions sync');
    if (block.state === 'unterminated') problems.push('AGENTS.md: нет закрывающего маркера conventions:end');
    if (block.state === 'outdated') problems.push(`AGENTS.md содержит правила ${block.version}, установлена v${markerVersion(version)}; выполните conventions sync`);
    if (block.state === 'edited') problems.push('AGENTS.md: блок правил изменён вручную; правьте вне маркеров, затем conventions sync');
  }

  // REQ-BUILD-010
  problems.push(...await findToolchainMismatches(root));
  // REQ-TERMS-003
  problems.push(...collisions(await dictionary(root)));

  // REQ-ADOPTION-009
  const scanned = await collectSourceFiles(root, config);
  if (scanned.length === 0) {
    problems.push(`${CONFIG_FILE}: правила не применяются ни к одному файлу; перечислите каталоги с исходниками в "sources"`);
  }

  const baseline = await readBaseline(root);
  let tracked = 0;
  let improvedTotal = 0;
  const advisories = [];

  // REQ-RELEASE-035
  const debts = await findObligationDebts(root);
  problems.push(...debts.problems);
  advisories.push(...debts.advisories);
  for (const rule of rules) {
    const violations = await rule.find(root, config);
    tracked += violations.size;
    const { exceeded, improved } = compare(violations, baseline[rule.id] ?? {});
    improvedTotal += improved.length;
    const target = rule.level === RECOMMENDATION ? advisories : problems;
    for (const entry of exceeded) {
      target.push(`${entry.file}: ${rule.title} ${entry.actual}, зафиксировано ${entry.allowed} (${rule.document})`);
      for (const item of entry.items.slice(0, 5)) target.push(`    ${entry.file}:${item.line}: ${item.text}`);
    }
  }
  if (advisories.length > 0) {
    console.log('Рекомендации не соблюдены; проверку это не роняет:');
    for (const advisory of advisories) console.log(`- ${advisory}`);
  }
  if (problems.length > 0) {
    console.error('Проверка правил не пройдена:');
    for (const problem of problems) console.error(`- ${problem}`);
    // REQ-ADOPTION-019
    await nameTheDoor(root);
    process.exitCode = 1;
    return;
  }
  if (improvedTotal > 0) {
    console.log(`Нарушений стало меньше в файлах: ${improvedTotal}. Опустите ограничитель: conventions baseline`);
  }
  console.log(`Правила соблюдены. Файлов под ограничителем: ${tracked}.`);
}

async function baseline(root, allowGrowth) {
  const config = await readConfig(root);
  const { rules, errors } = allRules(config);
  if (errors.length > 0) {
    for (const error of errors) console.error(`- ${error}`);
    process.exitCode = 1;
    return;
  }
  const previous = await readBaseline(root);
  const seeding = !(await baselineExists(root));
  const current = {};
  const grown = [];
  for (const rule of rules) {
    current[rule.id] = counts(await rule.find(root, config));
    const adopted = previous[rule.id] === undefined;
    if (adopted) continue;
    const before = previous[rule.id];
    for (const [file, count] of Object.entries(current[rule.id])) {
      if (count > (before[file] ?? 0)) grown.push(`${rule.id} ${file}: ${before[file] ?? 0} -> ${count}`);
    }
  }
  if (grown.length > 0 && !allowGrowth && !seeding) {
    console.error('Храповик поднимается только явно (--allow-growth):');
    for (const entry of grown) console.error(`- ${entry}`);
    process.exitCode = 1;
    return;
  }
  await writeBaseline(root, current);
  const summary = rules.map((rule) => `${rule.id} ${Object.values(current[rule.id]).reduce((sum, count) => sum + count, 0)}`).join(', ');
  console.log(`${BASELINE_FILE} ${seeding ? 'создан' : 'обновлён'}: ${summary}.`);
}

async function docsCheck(root) {
  const config = await readConfig(root);
  const result = await checkDocumentation(root, { requiredCatalogTargets: config.docs?.requiredCatalogTargets ?? [] });
  const indexErrors = [
    ...await updateTicketIndexes(root, { check: true }),
    ...await refreshCompositionLinks(root, { check: true }),
    ...await updateReleaseIndex(root, { check: true }),
  ];
  const errors = [...result.errors, ...indexErrors];
  if (errors.length > 0) {
    console.error(`Проверка документации завершилась с ошибками (${errors.length}):`);
    for (const error of errors) console.error(`- ${error}`);
    process.exitCode = 1;
    return;
  }
  console.log(`Документация проверена: ${result.markdownCount} Markdown-документов, ${result.requirementClauseCount} стабильных положений.`);
}

async function ticketsIndex(root) {
  const errors = await updateTicketIndexes(root, { check: false });
  if (errors.length > 0) {
    for (const error of errors) console.error(`- ${error}`);
    process.exitCode = 1;
    return;
  }
  console.log('Сводки задач согласованы.');
}

async function releasesIndex(root) {
  await refreshCompositionLinks(root, { check: false });
  const errors = await updateReleaseIndex(root, { check: false });
  if (errors.length > 0) {
    for (const error of errors) console.error(`- ${error}`);
    process.exitCode = 1;
    return;
  }
  console.log('Сводка выпусков согласована.');
}

function releaseScheme(config) {
  return config.release?.scheme ?? 'date';
}

const RECEIPT_USAGE = 'conventions receipt --checks <набор[,набор...]> -- <команда набора>';

function withoutRoot(argv) {
  const index = argv.indexOf('--root');
  return index === -1 ? argv : [...argv.slice(0, index), ...argv.slice(index + 2)];
}

function execute(command, root) {
  return new Promise((resolve) => {
    const child = spawn(command[0], command.slice(1), { cwd: root, stdio: 'inherit' });
    child.on('error', (error) => {
      console.error(String(error.message ?? error));
      resolve(1);
    });
    child.on('close', (code, signal) => resolve(signal === null ? code ?? 1 : 1));
  });
}

function receiptRequest(argv) {
  const separator = argv.indexOf('--');
  const options = withoutRoot(separator === -1 ? argv : argv.slice(0, separator));
  const command = separator === -1 ? [] : argv.slice(separator + 1);
  const checksAt = options.indexOf('--checks');
  const unknown = checksAt === -1
    ? options
    : options.filter((_, index) => index !== checksAt && index !== checksAt + 1);
  if (unknown.length > 0) return { error: `неизвестный аргумент: ${unknown[0]}` };
  const checks = (checksAt === -1 ? '' : options[checksAt + 1] ?? '')
    .split(',')
    .map((value) => value.trim())
    .filter((value) => value !== '');
  if (checks.length === 0) return { error: '--checks требует непустой перечень наборов' };
  if (command.length === 0) return { error: 'команда набора обязательна: перечислите её после --' };
  return { checks, command };
}

// REQ-RELEASE-027
async function receipt(root, argv) {
  const separator = argv.indexOf('--');
  if (withoutRoot(separator === -1 ? argv : argv.slice(0, separator)).includes('--help')) {
    console.log(RECEIPT_USAGE);
    return;
  }
  const request = receiptRequest(argv);
  if (request.error) {
    console.error(request.error);
    console.error(RECEIPT_USAGE);
    process.exitCode = 2;
    return;
  }
  const exitCode = await execute(request.command, root);
  if (exitCode !== 0) {
    console.error(`Набор не пройден: код возврата ${exitCode}. Расписка не записана.`);
    process.exitCode = exitCode;
    return;
  }
  const file = await writeReceipt(root, {
    commit: await headCommit(root),
    completedAt: systemNow().toISOString(),
    checks: request.checks,
    run: { command: request.command.join(' '), exitCode },
  });
  console.log(`Расписка о проверках записана: ${path.relative(root, file)}`);
}

async function obligations(root) {
  const state = await readState(root);
  const { obligations: declared, isCore } = await loadObligations(root);
  if (declared.length === 0) {
    console.log('Ядро не объявляет обязательств.');
    return;
  }
  if (isCore) {
    console.log('Это репозиторий ядра: обязательства объявлены здесь и относятся к потребителям.');
    for (const obligation of declared) {
      console.log(`- ${obligation.id} (${obligation.level}, ${obligation.requirement}), срок ${obligation.dueReleases} выпуск(ов)`);
    }
    return;
  }
  console.log(`Выпусков закрыто: ${state.releaseCount ?? 0}. Обязательства ядра:`);
  for (const obligation of declared) {
    const current = obligationState(obligation, state);
    const detail = current.status === 'closed'
      ? `закрыто задачей ${current.ticket} в выпуске ${current.release}`
      : current.status === 'new'
        ? 'ещё не попадало в выпуск'
        : `${current.status === 'overdue' ? 'просрочено' : 'в работе'}, прошло выпусков: ${current.elapsed} из ${obligation.dueReleases}${current.deferral ? `, отсрочка: ${current.deferral.reason}` : ''}`;
    console.log(`- ${obligation.id} (${obligation.level}, ${obligation.requirement}): ${detail}`);
    // REQ-RELEASE-019
    if (current.status !== 'closed') {
      console.log(`  закрывается задачей с полем obligation: ${obligation.id}`
        + ` либо командой conventions release satisfy ${obligation.id} --ticket <ID>`);
    }
  }
}

// REQ-RELEASE-010, REQ-RELEASE-034, REQ-RELEASE-038
async function releaseStatus(root) {
  try {
    await reportReleaseStatus(root);
  } catch (failure) {
    console.error(`Состояние выпуска прочитать не удалось: ${failure.message}`);
    process.exitCode = 1;
  }
}

async function reportReleaseStatus(root) {
  const config = await readConfig(root);
  const scheme = releaseScheme(config);
  const state = await closability(root, { scheme });
  if (state.release === null) {
    console.log('Открытого выпуска нет: работа идёт по задачам, коммиты ложатся в main.');
    console.log('Выпуск открывается командой release open --tickets A,B.');
    return;
  }
  const id = state.release.metadata.get('id');
  console.log(`Открытый выпуск: ${id}, тег при закрытии: ${state.tag}`);
  console.log(`Задач в составе: ${state.composition.length}`);
  const tagged = await tagCommit(root, state.tag);
  if (tagged !== null) {
    const ready = await finishability(root, { scheme });
    console.log(`Первый шаг закрытия выполнен: тег ${state.tag} на коммите ${tagged.slice(0, 8)}.`);
    if (ready.problems.length === 0) {
      console.log('Недостаёт завершающего шага: release finish --note "<чем выполнен>".');
      return;
    }
    console.log('Завершить выпуск нельзя:');
    for (const problem of ready.problems) console.log(`- ${problem}`);
    return;
  }
  if (state.problems.length === 0) {
    console.log('Первый шаг закрытия можно выполнять: release close.');
    return;
  }
  console.log('Выпуск закрыть нельзя:');
  for (const problem of state.problems) console.log(`- ${problem}`);
}

// REQ-RELEASE-030
function missingReleaseNumber(scheme, version) {
  if (scheme !== 'semver' || version) return false;
  console.error('Схема semver: номер выпуска задаётся ключом --version X.Y.Z');
  process.exitCode = 2;
  return true;
}

// REQ-RELEASE-001
async function releaseClose(root) {
  const config = await readConfig(root);
  const scheme = releaseScheme(config);
  const result = await closeRelease(root, { scheme, today: systemNow() });
  if (!result.closed) {
    console.error('Выпуск закрыть нельзя:');
    for (const problem of result.problems) console.error(`- ${problem}`);
    // REQ-ADOPTION-019
    await nameTheDoor(root);
    process.exitCode = 1;
    return;
  }
  console.log(`Первый шаг закрытия ${result.id} выполнен: коммит ${result.commit.slice(0, 8)}, задач в составе ${result.composition.length}.`);
  console.log(`Тег выпуска: ${result.tag}`);
  console.log('Выпуск ещё не закрыт: отметьте завершающий шаг командой release finish --note "<чем выполнен>".');
}

// REQ-RELEASE-034
async function releaseFinish(root, note) {
  const config = await readConfig(root);
  const result = await finishRelease(root, { scheme: releaseScheme(config), today: systemNow(), note });
  if (!result.finished) {
    console.error('Выпуск не завершён:');
    for (const problem of result.problems) console.error(`- ${problem}`);
    process.exitCode = 1;
    return;
  }
  console.log(`Выпуск ${result.id} закрыт: тег ${result.tag}, коммит ${result.commit.slice(0, 8)}.`);
  console.log(`Завершающий шаг: ${result.note}`);
}

// REQ-RELEASE-007
function ticketList(value) {
  return (value ?? '').split(',').map((name) => name.trim()).filter((name) => name.length > 0);
}

async function releaseOpen(root, version, names) {
  const config = await readConfig(root);
  const scheme = releaseScheme(config);
  // REQ-RELEASE-030
  if (missingReleaseNumber(scheme, version)) return;
  const result = await openNext(root, { scheme, version, today: systemNow(), tickets: names });
  if (!result.opened) {
    console.error('Выпуск не открыт:');
    for (const problem of result.problems) console.error(`- ${problem}`);
    process.exitCode = 1;
    return;
  }
  console.log(`Открыт выпуск ${result.id}, тег при закрытии: ${result.tag}.`);
  for (const ticket of result.named ?? []) console.log(`- в состав указана задача ${ticket}`);
  for (const ticket of result.created) console.log(`- обязательство материализовано задачей ${ticket}`);
  // REQ-RELEASE-019
  for (const entry of result.unclaimed ?? []) {
    console.log(`- задача ${entry.ticket} названа как работа по обязательству ${entry.obligation}, но его не объявляет:`
      + ` добавьте поле obligation: ${entry.obligation} либо закройте командой release satisfy`);
  }
}

// REQ-RELEASE-033
async function releaseDrop(root, name, reason) {
  if (!name) {
    console.error('conventions release drop <TICKET-ID> --reason "<причина>"');
    process.exitCode = 2;
    return;
  }
  const result = await dropFromComposition(root, { ticketId: name, reason });
  if (!result.dropped) {
    for (const problem of result.problems) console.error(`- ${problem}`);
    process.exitCode = 1;
    return;
  }
  console.log(`Задача ${result.ticket} снята из состава ${result.id}; причина записана в границы выпуска.`);
}

// REQ-RELEASE-029
async function releaseCancel(root, reason) {
  const result = await cancelRelease(root, { reason });
  if (!result.cancelled) {
    console.error('Выпуск не отменён:');
    for (const problem of result.problems) console.error(`- ${problem}`);
    process.exitCode = 1;
    return;
  }
  console.log(`Выпуск ${result.id} отменён; следующий откройте явным номером: release open --version X.Y.Z.`);
}

// REQ-AGENT-WORK-018
async function run(root, argv) {
  const separator = argv.indexOf('--');
  const options = separator === -1 ? argv : argv.slice(0, separator);
  const command = separator === -1 ? [] : argv.slice(separator + 1);
  if (command.length === 0) {
    console.error('conventions run [--idle <с>] [--limit <с>] -- <команда>');
    process.exitCode = 2;
    return;
  }
  const numberOf = (name, fallback) => {
    const index = options.indexOf(name);
    if (index === -1) return fallback;
    const value = Number(options[index + 1]);
    if (!Number.isFinite(value) || value < 0) {
      console.error(`${name} требует число секунд`);
      process.exit(2);
    }
    return value;
  };
  const limitSeconds = numberOf('--limit', DEFAULT_LIMIT_SECONDS);
  const idleSeconds = numberOf('--idle', DEFAULT_IDLE_SECONDS);
  const result = await runWithLimits(command[0], command.slice(1), {
    limitSeconds,
    idleSeconds,
    cwd: root,
    onOutput: (chunk) => process.stdout.write(chunk),
  });
  const message = report(result, command.join(' '), { limitSeconds, idleSeconds });
  if (message !== null) console.error(`\n${message}`);
  process.exitCode = result.code;
}

async function naming(root, subcommand, mapFile) {
  const config = await readConfig(root);
  const areas = [...TICKET_AREAS, ...(config.ticketAreas ?? [])];
  // REQ-NAMING-012
  const prefix = config.ticketPrefix ?? null;
  let overrides = {};
  if (mapFile) overrides = JSON.parse(await readFile(path.join(root, mapFile), 'utf8'));
  if (subcommand === 'plan') {
    const moves = await plan(root, { overrides, areas, prefix });
    console.log(`Переименований: ${moves.length}`);
    for (const move of moves) console.log(`- ${move.legacyId} -> ${move.id}: ${move.to}`);
    return;
  }
  if (subcommand === 'migrate') {
    const { moves, touched } = await migrate(root, { overrides, areas, prefix });
    console.log(`Переименовано задач: ${moves.length}, файлов со ссылками поправлено: ${touched ?? 0}`);
    for (const move of moves) console.log(`- ${move.legacyId} -> ${move.id}`);
    return;
  }
  console.error('conventions naming <plan|migrate> [--map <файл>]');
  process.exitCode = 2;
}

async function releaseAdopt(root, version) {
  const config = await readConfig(root);
  const scheme = releaseScheme(config);
  // REQ-RELEASE-030
  if (missingReleaseNumber(scheme, version)) return;
  const result = await adoptCycle(root, { scheme, version, today: systemNow() });
  if (!result.adopted) {
    console.error('Цикл выпусков не принят:');
    for (const problem of result.problems) console.error(`- ${problem}`);
    process.exitCode = 1;
    return;
  }
  console.log(`Закрытых задач помечено как выпущенные до цикла: ${result.stamped.length}`);
  console.log(`Открыт первый выпуск ${result.id}, тег при закрытии: ${result.tag}.`);
  for (const ticket of result.created) console.log(`- обязательство материализовано задачей ${ticket}`);
  await updateTicketIndexes(root, { check: false });
  await updateReleaseIndex(root, { check: false });
  console.log('Сводки задач и выпусков собраны.');
}

async function releaseSatisfy(root, id, ticketId) {
  if (!id || !ticketId) {
    console.error('conventions release satisfy <обязательство> --ticket <TICKET-ID>');
    process.exitCode = 2;
    return;
  }
  const result = await satisfyObligation(root, { obligationId: id, ticketId });
  if (!result.satisfied) {
    for (const problem of result.problems) console.error(`- ${problem}`);
    process.exitCode = 1;
    return;
  }
  console.log(`Обязательство ${id} закрыто задачей ${result.evidence}`);
  for (const removed of result.removed) console.log(`- задача-заготовка ${removed} удалена: работа уже выполнена`);
}

async function releaseDefer(root, id, reason) {
  if (!id || !reason) {
    console.error('conventions release defer <обязательство> --reason "<причина>"');
    process.exitCode = 2;
    return;
  }
  const declared = await declaredObligations(root);
  const obligation = declared.find((item) => item.id === id);
  if (obligation === undefined) {
    console.error(`Ядро не объявляет обязательства ${id}`);
    process.exitCode = 1;
    return;
  }
  const state = await readState(root);
  const current = obligationState(obligation, state);
  if (current.status === 'overdue') {
    console.error(`Обязательство ${id} просрочено: перенос невозможен, срок истёк`);
    process.exitCode = 1;
    return;
  }
  state.deferred ??= {};
  state.deferred[id] = { reason, recordedAt: systemNow().toISOString().slice(0, 10) };
  await writeState(root, state);
  console.log(`Обязательство ${id} перенесено: ${reason}`);
}

async function sync(root) {
  const version = await packageVersion();
  let agents = '';
  try {
    agents = await readAgents(root);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  await writeAgents(root, replaceBlock(agents, version, manifest(version, await docsPath(root), allRules(await readConfig(root)).rules)));
  console.log(`AGENTS.md: блок правил v${markerVersion(version)} записан.`);
}

const [command, ...rest] = process.argv.slice(2);
const rootOption = rest.indexOf('--root');
const root = path.resolve(rootOption === -1 ? process.cwd() : rest[rootOption + 1]);

const valueOf = (name) => {
  const index = rest.indexOf(name);
  return index === -1 ? undefined : rest[index + 1];
};

if (command === 'check') await check(root);
else if (command === 'receipt') await receipt(root, rest);
else if (command === 'obligations') await obligations(root);
else if (command === 'run') await run(root, rest.filter((value) => value !== '--root' && value !== root));
else if (command === 'naming') await naming(root, rest.find((value) => !value.startsWith('--') && value !== root), valueOf('--map'));
else if (command === 'release') {
  const [subcommand, ...args] = rest.filter((value) => value !== '--root' && value !== root);
  if (subcommand === 'status') await releaseStatus(root);
  else if (subcommand === 'close') await releaseClose(root);
  else if (subcommand === 'finish') await releaseFinish(root, valueOf('--note'));
  else if (subcommand === 'open') await releaseOpen(root, valueOf('--version'), ticketList(valueOf('--tickets')));
  else if (subcommand === 'cancel') await releaseCancel(root, valueOf('--reason'));
  else if (subcommand === 'defer') await releaseDefer(root, args[0], valueOf('--reason'));
  else if (subcommand === 'adopt') await releaseAdopt(root, valueOf('--version'));
  else if (subcommand === 'drop') await releaseDrop(root, args[0], valueOf('--reason'));
  else if (subcommand === 'satisfy') await releaseSatisfy(root, args[0], valueOf('--ticket'));
  else {
    console.error('conventions release <status|close|finish|open|drop|cancel|adopt|defer|satisfy> [--version X.Y.Z] [--tickets A,B] [--note "<чем выполнен>"] [--reason "<причина>"] [--ticket <TICKET-ID>]');
    process.exitCode = 2;
  }
}
else if (command === 'docs-check') await docsCheck(root);
else if (command === 'tickets-index') await ticketsIndex(root);
else if (command === 'releases-index') await releasesIndex(root);
else if (command === 'baseline') await baseline(root, rest.includes('--allow-growth'));
else if (command === 'sync') await sync(root);
else {
  console.error('conventions <check|docs-check|tickets-index|releases-index|sync|baseline|receipt|obligations|release> [--root <path>] [--allow-growth]');
  process.exitCode = 2;
}
