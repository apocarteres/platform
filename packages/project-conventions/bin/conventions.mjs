#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readConfig } from '../lib/config.mjs';
import { RECOMMENDATION, RULES, allRules } from '../lib/rules.mjs';
import { BASELINE_FILE, baselineExists, compare, counts, readBaseline, writeBaseline } from '../lib/baseline.mjs';
import { INSTALLED_DOCS_PATH, SOURCE_DOCS_PATH, inspectBlock, manifest, markerVersion, readAgents, replaceBlock, writeAgents } from '../lib/agents.mjs';
import { checkDocumentation } from '../lib/docs/check-docs.mjs';
import { updateTicketIndexes } from '../lib/docs/tickets-index.mjs';
import { refreshCompositionLinks, updateReleaseIndex } from '../lib/docs/releases-index.mjs';
import { adoptCycle, closeRelease, closability, openNext, satisfyObligation } from '../lib/release/cycle.mjs';
import { declaredObligations, loadObligations, obligationState, readState, writeState } from '../lib/release/obligations.mjs';
import { writeReceipt } from '../lib/release/receipt.mjs';
import { headCommit } from '../lib/release/git.mjs';
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

  const baseline = await readBaseline(root);
  let tracked = 0;
  let improvedTotal = 0;
  const advisories = [];
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
    process.exitCode = 1;
    return;
  }
  if (improvedTotal > 0) {
    console.log(`Нарушений стало меньше в файлах: ${improvedTotal}. Опустите храповик: conventions baseline`);
  }
  console.log(`Правила соблюдены. Файлов под храповиком: ${tracked}.`);
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

async function receipt(root, checks) {
  const commit = await headCommit(root);
  const file = await writeReceipt(root, {
    commit,
    completedAt: systemNow().toISOString(),
    checks: checks.length > 0 ? checks : ['verify'],
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
  }
}

async function releaseStatus(root) {
  const config = await readConfig(root);
  const state = await closability(root, { scheme: releaseScheme(config) });
  if (state.release === null) {
    console.error('Открытого выпуска нет: выполните conventions release open');
    process.exitCode = 1;
    return;
  }
  console.log(`Открытый выпуск: ${state.release.metadata.get('id')}, тег при закрытии: ${state.tag}`);
  console.log(`Состав по факту закрытия задач: ${state.composition.length}`);
  if (state.problems.length === 0) {
    console.log('Выпуск можно закрывать.');
    return;
  }
  console.error('Выпуск закрыть нельзя:');
  for (const problem of state.problems) console.error(`- ${problem}`);
  process.exitCode = 1;
}

async function releaseClose(root, nextVersion) {
  const config = await readConfig(root);
  const scheme = releaseScheme(config);
  if (scheme === 'semver' && !nextVersion) {
    console.error('Схема semver: номер следующего выпуска задаётся ключом --next-version X.Y.Z');
    process.exitCode = 2;
    return;
  }
  const result = await closeRelease(root, { scheme, today: systemNow() });
  if (!result.closed) {
    console.error('Выпуск закрыть нельзя:');
    for (const problem of result.problems) console.error(`- ${problem}`);
    process.exitCode = 1;
    return;
  }
  console.log(`Выпуск ${result.id} закрыт: коммит ${result.commit.slice(0, 8)}, задач в составе ${result.composition.length}.`);
  console.log(`Тег выпуска: ${result.tag}`);
  const opened = await openNext(root, { scheme, version: nextVersion, today: systemNow() });
  if (!opened.opened) {
    console.error('Следующий выпуск не открыт:');
    for (const problem of opened.problems) console.error(`- ${problem}`);
    process.exitCode = 1;
    return;
  }
  console.log(`Открыт выпуск ${opened.id}${opened.created.length > 0 ? `, обязательств в составе: ${opened.created.length}` : ''}.`);
  for (const ticket of opened.created) console.log(`- ${ticket}`);
}

async function releaseOpen(root, version) {
  const config = await readConfig(root);
  const result = await openNext(root, { scheme: releaseScheme(config), version, today: systemNow() });
  if (!result.opened) {
    console.error('Выпуск не открыт:');
    for (const problem of result.problems) console.error(`- ${problem}`);
    process.exitCode = 1;
    return;
  }
  console.log(`Открыт выпуск ${result.id}, тег при закрытии: ${result.tag}.`);
  for (const ticket of result.created) console.log(`- обязательство материализовано задачей ${ticket}`);
}

async function releaseAdopt(root) {
  const config = await readConfig(root);
  const scheme = releaseScheme(config);
  const result = await adoptCycle(root, { scheme, today: systemNow() });
  if (!result.adopted) {
    console.error('Цикл выпусков не принят:');
    for (const problem of result.problems) console.error(`- ${problem}`);
    process.exitCode = 1;
    return;
  }
  console.log(`Закрытых задач помечено как выпущенные до цикла: ${result.stamped.length}`);
  console.log(`Открыт первый выпуск ${result.id}, тег при закрытии: ${result.tag}.`);
  for (const ticket of result.created) console.log(`- обязательство материализовано задачей ${ticket}`);
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
else if (command === 'receipt') await receipt(root, rest.filter((value) => !value.startsWith('--') && value !== root));
else if (command === 'obligations') await obligations(root);
else if (command === 'release') {
  const [subcommand, ...args] = rest.filter((value) => value !== '--root' && value !== root);
  if (subcommand === 'status') await releaseStatus(root);
  else if (subcommand === 'close') await releaseClose(root, valueOf('--next-version'));
  else if (subcommand === 'open') await releaseOpen(root, valueOf('--version'));
  else if (subcommand === 'defer') await releaseDefer(root, args[0], valueOf('--reason'));
  else if (subcommand === 'adopt') await releaseAdopt(root);
  else if (subcommand === 'satisfy') await releaseSatisfy(root, args[0], valueOf('--ticket'));
  else {
    console.error('conventions release <status|close|open|adopt|defer|satisfy> [--version X.Y.Z] [--next-version X.Y.Z] [--reason "<причина>"] [--ticket <TICKET-ID>]');
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
