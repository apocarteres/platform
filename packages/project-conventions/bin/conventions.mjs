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
import { BASELINE_FILE, baselineExists, compare, counts, grewOver, readBaseline, sizeOf, writeBaseline } from '../lib/baseline.mjs';
import { INSTALLED_DOCS_PATH, SOURCE_DOCS_PATH, inspectBlock, manifest, markerVersion, readAgents, replaceBlock, writeAgents } from '../lib/agents.mjs';
import { feedbackChannel, feedbackLine } from '../lib/feedback.mjs';
import { collisions, dictionary } from '../lib/terms.mjs';
import { updateTicketIndexes } from '../lib/docs/tickets-index.mjs';
import { documentationProblems } from '../lib/docs/documentation.mjs';
import { refreshCompositionLinks, updateReleaseIndex } from '../lib/docs/releases-index.mjs';
import { findObligationDebts, loadObligations, obligationState, readState } from '../lib/release/obligations.mjs';
import { writeReceipt } from '../lib/release/receipt.mjs';
import { headCommit } from '../lib/release/git.mjs';
import { systemNow } from '../lib/now.mjs';
import {
  commits, components, deployArgs, deployed, deps, health, manifest as deployManifest, unknown, upgradeReport,
} from '../lib/cli/commands.mjs';
import { parseArguments } from '../lib/cli/arguments.mjs';
import {
  releaseAccount, releaseAdopt, releaseCancel, releaseClose, releaseDefer, releaseDrop, releaseFinish,
  releaseOpen, releaseReclose, releaseSatisfy, releaseStatus, summariesAfterTheCycle, ticketList,
} from '../lib/cli/release.mjs';

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
    // REQ-QUALITY-007
    const { exceeded, improved } = compare(violations, baseline[rule.id] ?? {}, rule.unit);
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
    // REQ-QUALITY-007
    current[rule.id] = counts(await rule.find(root, config), rule.unit);
    const adopted = previous[rule.id] === undefined;
    if (adopted) continue;
    const before = previous[rule.id];
    // REQ-QUALITY-007
    for (const [file, entry] of Object.entries(current[rule.id])) {
      const growth = grewOver(entry, before[file]);
      if (growth === true) grown.push(`${rule.id} ${file}: ${sizeOf(before[file])} -> ${entry}`);
      else if (Array.isArray(growth) && growth.length > 0) {
        grown.push(`${rule.id} ${file}: новые послабления ${growth.join(', ')}`);
      }
    }
  }
  if (grown.length > 0 && !allowGrowth && !seeding) {
    console.error('Храповик поднимается только явно (--allow-growth):');
    for (const entry of grown) console.error(`- ${entry}`);
    process.exitCode = 1;
    return;
  }
  await writeBaseline(root, current);
  // REQ-QUALITY-007
  const summary = rules.map((rule) => `${rule.id} ${Object.values(current[rule.id]).reduce((sum, entry) => sum + sizeOf(entry), 0)}`).join(', ');
  console.log(`${BASELINE_FILE} ${seeding ? 'создан' : 'обновлён'}: ${summary}.`);
}

async function docsCheck(root) {
  const config = await readConfig(root);
  const result = await documentationProblems(root, config);
  const errors = result.errors;
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

// REQ-RELEASE-028
const COMMANDS = 'conventions <check|docs-check|tickets-index|releases-index|sync'
  + '|baseline|receipt|run|naming|obligations|commits|health|unknown|deps|components|deploy-args|deployed|manifest|upgrade-report|release> [--root <path>]';

// REQ-RELEASE-028
const USAGE = {
  check: 'conventions check [--root <path>]',
  'docs-check': 'conventions docs-check [--root <path>]',
  'tickets-index': 'conventions tickets-index [--root <path>]',
  'releases-index': 'conventions releases-index [--root <path>]',
  sync: 'conventions sync [--root <path>]',
  obligations: 'conventions obligations [--root <path>]',
  baseline: 'conventions baseline [--allow-growth] [--root <path>]',
  naming: 'conventions naming <plan|apply> [--map <файл>] [--root <path>]',
  receipt: RECEIPT_USAGE,
  run: 'conventions run [--idle <с>] [--limit <с>] -- <команда>',
  commits: 'conventions commits [--range <диапазон git>] [--root <path>]',
  health: 'conventions health --url <адрес состояния сервиса> [--timeout <с>]',
  unknown: 'conventions unknown --url <адрес сайта> [--timeout <с>]',
  'upgrade-report': 'conventions upgrade-report --from X.Y.Z [--to X.Y.Z]',
  'deploy-args': 'conventions deploy-args [--root <path>] -- <доводы скрипта>   |   conventions deploy-args --usage',
  manifest: 'conventions manifest --env <среда> [--only a,b] [--file <путь>] [--journal <путь>] [--untagged-reason "<причина>"]',
  deployed: 'conventions deployed --artifact <путь> (--container <имя> --label <метка> | --installed <путь>)',
  components: 'conventions components [--environments|--full] [--root <path>]'
    + '\n  Печатает объявленные составляющие проекта по одной в строке; с --environments — среды.',
  deps: 'conventions deps --dir <каталог> [--state <файл>] [--tools node,npm] [--record] [--root <path>]'
    + '\n  Код 0 — зависимости не менялись, ставить нечего; код 1 — изменились.',
  release: 'conventions release <status|close|reclose|finish|open|drop|cancel|adopt|defer|satisfy|account> [--root <path>]',
};

// REQ-RELEASE-028
const RELEASE_USAGE = {
  status: 'conventions release status [--root <path>]',
  close: 'conventions release close [--root <path>]',
  reclose: 'conventions release reclose --reason "<причина>" [--root <path>]',
  finish: 'conventions release finish --note "<чем выполнен>" [--root <path>]',
  open: 'conventions release open [--version X.Y.Z] [--tickets A,B] [--root <path>]',
  drop: 'conventions release drop <TICKET-ID> --reason "<причина>" [--root <path>]',
  cancel: 'conventions release cancel --reason "<причина>" [--root <path>]',
  adopt: 'conventions release adopt [--version X.Y.Z] [--root <path>]',
  defer: 'conventions release defer <обязательство> --reason "<причина>" [--root <path>]',
  satisfy: 'conventions release satisfy <обязательство> --ticket <TICKET-ID> [--root <path>]',
  account: 'conventions release account <хеш коммита> --reason "<причина>" [--root <path>]',
};

// REQ-RELEASE-028
const RELEASE_SPEC = {
  status: {},
  close: {},
  reclose: { values: ['--reason'] },
  finish: { values: ['--note'] },
  open: { values: ['--version', '--tickets'] },
  drop: { values: ['--reason'], positional: 1 },
  cancel: { values: ['--reason'] },
  adopt: { values: ['--version'] },
  defer: { values: ['--reason'], positional: 1 },
  satisfy: { values: ['--ticket'], positional: 1 },
  account: { values: ['--reason'], positional: 1 },
};

// REQ-RELEASE-043
const RELEASE_READS = new Set(['status']);

// REQ-RELEASE-028
const SPEC = {
  check: {},
  'docs-check': {},
  'tickets-index': {},
  'releases-index': {},
  sync: {},
  obligations: {},
  baseline: { flags: ['--allow-growth'] },
  naming: { values: ['--map'], positional: 1 },
  commits: { values: ['--range'] },
  health: { values: ['--url', '--timeout'] },
  unknown: { values: ['--url', '--timeout'] },
  'upgrade-report': { values: ['--from', '--to'] },
  deps: { values: ['--dir', '--state', '--tools'], flags: ['--record'] },
  components: { flags: ['--environments', '--full'] },
  deployed: { values: ['--artifact', '--container', '--label', '--installed'] },
  manifest: { values: ['--env', '--only', '--file', '--journal', '--untagged-reason'] },
};

// REQ-RELEASE-028
function rootOf(argv) {
  const index = argv.indexOf('--root');
  return path.resolve(index === -1 ? process.cwd() : argv[index + 1] ?? '.');
}

// REQ-RELEASE-028
function refuse(usage, message) {
  if (message) console.error(message);
  console.error(usage);
  process.exitCode = 2;
}

const [command, ...argv] = process.argv.slice(2);

// REQ-RELEASE-028
if (command === undefined || command === '--help') {
  console.log(COMMANDS);
  for (const line of Object.values(USAGE)) console.log(`  ${line}`);
} else if (!Object.hasOwn(USAGE, command)) {
  refuse(COMMANDS, `неизвестная команда: ${command}`);
} else if (command === 'receipt' || command === 'run') {
  // REQ-RELEASE-027, REQ-RELEASE-028
  const separator = argv.indexOf('--');
  const options = withoutRoot(separator === -1 ? argv : argv.slice(0, separator));
  if (options.includes('--help')) console.log(USAGE[command]);
  else if (command === 'receipt') await receipt(rootOf(argv), argv);
  else await run(rootOf(argv), withoutRoot(argv));
} else if (command === 'release') {
  await release(argv);
} else if (command === 'deploy-args') {
  // REQ-DEPLOYMENT-019
  await deployArgs(rootOf(argv), withoutRoot(argv), { usage: USAGE, refuse });
} else {
  const spec = SPEC[command];
  const parsed = parseArguments(argv, { ...spec, values: ['--root', ...(spec.values ?? [])] });
  if (parsed.help) console.log(USAGE[command]);
  else if (parsed.error) refuse(USAGE[command], parsed.error);
  else {
    const root = path.resolve(parsed.values.get('--root') ?? process.cwd());
    if (command === 'check') await check(root);
    else if (command === 'docs-check') await docsCheck(root);
    else if (command === 'tickets-index') await ticketsIndex(root);
    else if (command === 'releases-index') await releasesIndex(root);
    else if (command === 'sync') await sync(root);
    else if (command === 'obligations') await obligations(root);
    else if (command === 'baseline') await baseline(root, parsed.flags.has('--allow-growth'));
    else if (command === 'commits') await commits(root, parsed.values.get('--range') ?? null);
    else if (command === 'health') await health(parsed.values.get('--url'), parsed.values.get('--timeout'), { usage: USAGE, refuse });
    // REQ-DEPLOYMENT-018
    else if (command === 'unknown') await unknown(parsed.values.get('--url'), parsed.values.get('--timeout'), { usage: USAGE, refuse });
    else if (command === 'deps') await deps(root, parsed, { usage: USAGE, refuse });
    else if (command === 'components') {
      // REQ-DEPLOYMENT-020
      await components(root, {
        environments: parsed.flags.has('--environments'),
        full: parsed.flags.has('--full'),
      });
    }
    else if (command === 'deployed') await deployed(root, parsed, { usage: USAGE, refuse });
    // REQ-PUBLISHING-015
    else if (command === 'upgrade-report') await upgradeReport(parsed, { usage: USAGE, refuse });
    else if (command === 'manifest') await deployManifest(root, parsed, { usage: USAGE, refuse });
    else await naming(root, parsed.positional[0], parsed.values.get('--map'));
  }
}

// REQ-RELEASE-028
async function release(argv) {
  const [subcommand, ...rest] = argv;
  if (subcommand === undefined || subcommand === '--help') {
    console.log(USAGE.release);
    for (const line of Object.values(RELEASE_USAGE)) console.log(`  ${line}`);
    return;
  }
  if (!Object.hasOwn(RELEASE_SPEC, subcommand)) {
    refuse(USAGE.release, `неизвестная подкоманда выпуска: ${subcommand}`);
    return;
  }
  const usage = RELEASE_USAGE[subcommand];
  const spec = RELEASE_SPEC[subcommand];
  const parsed = parseArguments(rest, { ...spec, values: ['--root', ...(spec.values ?? [])] });
  if (parsed.help) {
    console.log(usage);
    return;
  }
  if (parsed.error) {
    refuse(usage, parsed.error);
    return;
  }
  const root = path.resolve(parsed.values.get('--root') ?? process.cwd());
  const valueOf = (name) => parsed.values.get(name);
  const first = parsed.positional[0];
  if (subcommand === 'status') await releaseStatus(root);
  else if (subcommand === 'close') await releaseClose(root);
  // REQ-RELEASE-046
  else if (subcommand === 'reclose') await releaseReclose(root, valueOf('--reason'));
  else if (subcommand === 'finish') await releaseFinish(root, valueOf('--note'));
  else if (subcommand === 'open') await releaseOpen(root, valueOf('--version'), ticketList(valueOf('--tickets')));
  else if (subcommand === 'cancel') await releaseCancel(root, valueOf('--reason'));
  else if (subcommand === 'defer') await releaseDefer(root, first, valueOf('--reason'));
  else if (subcommand === 'adopt') await releaseAdopt(root, valueOf('--version'));
  else if (subcommand === 'drop') await releaseDrop(root, first, valueOf('--reason'));
  else if (subcommand === 'satisfy') await releaseSatisfy(root, first, valueOf('--ticket'));
  else await releaseAccount(root, first, valueOf('--reason'));
  // REQ-RELEASE-043
  if (!RELEASE_READS.has(subcommand) && !process.exitCode) await summariesAfterTheCycle(root);
}
