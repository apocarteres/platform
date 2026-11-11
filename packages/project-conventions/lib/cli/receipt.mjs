import { spawn } from 'node:child_process';
import path from 'node:path';
import { readConfig } from '../config.mjs';
import { systemNow } from '../now.mjs';
import { headCommit, workingTreeClean } from '../release/git.mjs';
import { writeReceipt } from '../release/receipt.mjs';
import { partsDeclaration, runParts } from '../release/verify-parts.mjs';

export const RECEIPT_USAGE = 'conventions receipt --checks <набор[,набор...]> -- <команда набора>'
  + '\n  conventions receipt --checks <набор[,набор...]> --parts [--fresh] — части набора из verify.parts; часть с прежним деревом не перезапускается.';

export function withoutRoot(argv) {
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

// REQ-RELEASE-028, REQ-RELEASE-051
export function receiptRequest(argv) {
  const separator = argv.indexOf('--');
  const options = withoutRoot(separator === -1 ? argv : argv.slice(0, separator));
  const command = separator === -1 ? [] : argv.slice(separator + 1);
  const checksAt = options.indexOf('--checks');
  const flags = new Set(['--parts', '--fresh']);
  const unknown = options.filter((value, index) => !flags.has(value) && (checksAt === -1 || (index !== checksAt && index !== checksAt + 1)));
  if (unknown.length > 0) return { error: `неизвестный аргумент: ${unknown[0]}` };
  const checks = (checksAt === -1 ? '' : options[checksAt + 1] ?? '')
    .split(',')
    .map((value) => value.trim())
    .filter((value) => value !== '');
  if (checks.length === 0) return { error: '--checks требует непустой перечень наборов' };
  const byParts = options.includes('--parts');
  const fresh = options.includes('--fresh');
  if (fresh && !byParts) return { error: '--fresh действует только с --parts' };
  if (byParts && command.length > 0) return { error: 'с --parts команда после -- не задаётся: команды частей объявлены в verify.parts' };
  if (!byParts && command.length === 0) return { error: 'команда набора обязательна: перечислите её после --' };
  return { checks, command, byParts, fresh };
}

// REQ-RELEASE-051
async function byParts(root, request) {
  const declared = partsDeclaration(await readConfig(root));
  if (declared.problems.length > 0) {
    console.error('Расписка не записана:');
    for (const problem of declared.problems) console.error(`- ${problem}`);
    process.exitCode = 2;
    return;
  }
  if (!await workingTreeClean(root)) {
    console.error('Расписка не записана: рабочее дерево не чисто. Расписка части относится к дереву коммита,'
      + ' а прогон шёл бы по другому содержимому: зафиксируйте изменения либо отбросьте их.');
    process.exitCode = 1;
    return;
  }
  const commit = await headCommit(root);
  const outcomes = await runParts(root, { parts: declared.parts, commit, fresh: request.fresh, now: systemNow });
  for (const one of outcomes) {
    if (one.carriedFrom !== null) console.log(`Часть ${one.name}: расписка перенесена с ${one.carriedFrom.slice(0, 8)} — дерево части то же.`);
    else if (one.exitCode === 0) console.log(`Часть ${one.name}: пройдена за ${one.seconds} с.`);
    else console.error(`Часть ${one.name}: не пройдена, код возврата ${one.exitCode} (${one.command}).`);
  }
  const failed = outcomes.filter((one) => one.exitCode !== 0);
  if (failed.length > 0) {
    console.error(`Набор не пройден: ${failed.map((one) => one.name).join(', ')}. Расписка не записана.`);
    process.exitCode = failed[0].exitCode;
    return;
  }
  const file = await writeReceipt(root, {
    commit,
    completedAt: systemNow().toISOString(),
    checks: request.checks,
    run: { command: `conventions receipt --parts: ${outcomes.map((one) => one.command).join(' && ')}`, exitCode: 0 },
    parts: outcomes.map(({ name, tree, command, completedAt, carriedFrom }) => ({ name, tree, command, completedAt, carriedFrom })),
  });
  console.log(`Расписка о проверках записана: ${path.relative(root, file)}`);
}

// REQ-RELEASE-027
export async function receipt(root, argv) {
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
  if (request.byParts) {
    await byParts(root, request);
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
