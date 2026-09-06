#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readConfig } from '../lib/config.mjs';
import { findProseComments } from '../lib/comments.mjs';
import { BASELINE_FILE, baselineExists, compare, counts, readBaseline, writeBaseline } from '../lib/baseline.mjs';
import { inspectBlock, markerVersion, readAgents, replaceBlock, writeAgents } from '../lib/agents.mjs';

const packageRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

async function packageVersion() {
  return JSON.parse(await readFile(path.join(packageRoot, 'package.json'), 'utf8')).version;
}

async function fragment() {
  return readFile(path.join(packageRoot, 'fragments', 'agents.md'), 'utf8');
}

async function check(root) {
  const problems = [];
  const version = await packageVersion();
  let agents;
  try {
    agents = await readAgents(root);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  if (agents === undefined) {
    problems.push('AGENTS.md отсутствует; выполните conventions sync');
  } else {
    const block = inspectBlock(agents, version, await fragment());
    if (block.state === 'missing') problems.push('AGENTS.md не содержит блок правил; выполните conventions sync');
    if (block.state === 'unterminated') problems.push('AGENTS.md: нет закрывающего маркера conventions:end');
    if (block.state === 'outdated') problems.push(`AGENTS.md содержит правила ${block.version}, установлена v${markerVersion(version)}; выполните conventions sync`);
    if (block.state === 'edited') problems.push('AGENTS.md: блок правил изменён вручную; правьте вне маркеров, затем conventions sync');
  }

  const violations = await findProseComments(root, await readConfig(root));
  const { exceeded, improved } = compare(violations, await readBaseline(root));
  for (const entry of exceeded) {
    problems.push(`${entry.file}: пояснительных комментариев ${entry.actual}, допускается ${entry.allowed}`);
    for (const comment of entry.comments.slice(0, 5)) problems.push(`    ${entry.file}:${comment.line}: ${comment.text}`);
  }
  if (problems.length > 0) {
    console.error('Проверка правил не пройдена:');
    for (const problem of problems) console.error(`- ${problem}`);
    process.exitCode = 1;
    return;
  }
  if (improved.length > 0) {
    console.log(`Комментариев стало меньше в файлах: ${improved.length}. Опустите храповик: conventions baseline`);
  }
  console.log(`Правила соблюдены. Файлов с зафиксированными комментариями: ${violations.size}.`);
}

async function baseline(root, allowGrowth) {
  const violations = await findProseComments(root, await readConfig(root));
  const current = counts(violations);
  const previous = await readBaseline(root);
  const seeding = !(await baselineExists(root));
  const grown = Object.entries(current).filter(([file, count]) => count > (previous[file] ?? 0));
  if (grown.length > 0 && !allowGrowth && !seeding) {
    console.error('Храповик поднимается только явно (--allow-growth):');
    for (const [file, count] of grown) console.error(`- ${file}: ${previous[file] ?? 0} -> ${count}`);
    process.exitCode = 1;
    return;
  }
  await writeBaseline(root, current);
  const total = Object.values(current).reduce((sum, count) => sum + count, 0);
  const action = seeding ? 'создан' : 'обновлён';
  console.log(`${BASELINE_FILE} ${action}: файлов ${Object.keys(current).length}, комментариев ${total}.`);
}

async function sync(root) {
  const version = await packageVersion();
  let agents = '';
  try {
    agents = await readAgents(root);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  await writeAgents(root, replaceBlock(agents, version, await fragment()));
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
