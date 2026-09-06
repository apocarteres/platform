#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readConfig } from '../lib/config.mjs';
import { RULES, allRules } from '../lib/rules.mjs';
import { BASELINE_FILE, baselineExists, compare, counts, readBaseline, writeBaseline } from '../lib/baseline.mjs';
import { INSTALLED_DOCS_PATH, SOURCE_DOCS_PATH, inspectBlock, manifest, markerVersion, readAgents, replaceBlock, writeAgents } from '../lib/agents.mjs';

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
  for (const rule of rules) {
    const violations = await rule.find(root, config);
    tracked += violations.size;
    const { exceeded, improved } = compare(violations, baseline[rule.id] ?? {});
    improvedTotal += improved.length;
    for (const entry of exceeded) {
      problems.push(`${entry.file}: ${rule.title} ${entry.actual}, допускается ${entry.allowed}`);
      for (const item of entry.items.slice(0, 5)) problems.push(`    ${entry.file}:${item.line}: ${item.text}`);
    }
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
    const before = previous[rule.id] ?? {};
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

if (command === 'check') await check(root);
else if (command === 'baseline') await baseline(root, rest.includes('--allow-growth'));
else if (command === 'sync') await sync(root);
else {
  console.error('conventions <check|sync|baseline> [--root <path>] [--allow-growth]');
  process.exitCode = 2;
}
