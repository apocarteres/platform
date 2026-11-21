// REQ-E2E-TIMING-002, REQ-E2E-TIMING-006
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, dirname, resolve } from 'node:path';
import { appendHistory, buildRecord, deployFor, parsePhases, standName, summary } from './record.mjs';
import { send as defaultSend } from './send.mjs';

const VALUE = new Set(['--root', '--stand', '--out', '--history-dir', '--workers', '--phases', '--phases-started', '--deploy']);
const USAGE = 'использование: e2e-timing collect --root <каталог> --stand <стенд> --out <файл> --history-dir <каталог> '
  + '[--workers <N>] [--phases <файл>] [--phases-started <ISO>] [--deploy <файл>] [--full] <часть>…';

export function parseArgs(argv) {
  const [cmd, ...rest] = argv;
  if (cmd !== 'collect') throw new Error(USAGE);
  const a = { full: false, parts: [] };
  for (let i = 0; i < rest.length; i++) {
    const k = rest[i];
    if (k === '--full') a.full = true;
    else if (VALUE.has(k)) {
      if (i + 1 >= rest.length) throw new Error(`${k}: нужно значение`);
      a[k.slice(2).replace(/-(\w)/g, (_, c) => c.toUpperCase())] = rest[++i];
    } else if (k.startsWith('--')) throw new Error(`неизвестный аргумент: ${k}`);
    else a.parts.push(k);
  }
  for (const k of ['root', 'stand', 'out', 'historyDir']) if (!a[k]) throw new Error(USAGE);
  if (!a.parts.length) throw new Error(USAGE);
  a.workers = a.workers === undefined ? null : Number.parseInt(a.workers, 10);
  return a;
}

function git(root, ...args) {
  try {
    return execFileSync('git', ['-C', root, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch {
    return '';
  }
}

export function repositoryOf(url, root) {
  const m = /[:/]([A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+?)(?:\.git)?\/?$/.exec(url);
  return m ? m[1] : basename(resolve(root));
}

function gitMeta(root) {
  const up = git(root, 'rev-parse', '--abbrev-ref', '@{u}');
  return {
    repository: repositoryOf(git(root, 'remote', 'get-url', 'origin'), root),
    commit: git(root, 'rev-parse', 'HEAD'),
    branch: up.includes('/') ? up.slice(up.indexOf('/') + 1) : git(root, 'rev-parse', '--abbrev-ref', 'HEAD'),
  };
}

const readJson = (p) => JSON.parse(readFileSync(p, 'utf8'));

export async function collect(argv, { log, error, env = process.env, send = defaultSend, meta = gitMeta } = {}) {
  let a;
  try {
    a = parseArgs(argv);
  } catch (e) {
    error(`[e2e-timing] ${e.message}`);
    return 2;
  }
  try {
    const stand = standName(a.stand);
    const parts = a.parts.filter((p) => existsSync(p)).map(readJson);
    const m = { ...meta(a.root), runner: env['E2E_RUNNER'], machine: env['E2E_MACHINE'], stand, workers: a.workers };
    const deploy = a.deploy && existsSync(a.deploy) ? deployFor(readJson(a.deploy), m.commit) : null;
    const phases = a.phases && existsSync(a.phases) ? parsePhases(readFileSync(a.phases, 'utf8')) : [];
    const rec = buildRecord(parts, m, { deploy, phases, phasesStarted: a.phasesStarted ?? null });
    if (!rec) {
      log('[e2e-timing] частей прогона нет — запись не сделана');
      return 0;
    }
    const line = JSON.stringify(rec);
    mkdirSync(dirname(resolve(a.out)), { recursive: true });
    writeFileSync(a.out, line + '\n');
    const prev = a.full ? appendHistory(resolve(a.historyDir, stand), line) : null;
    log(summary(rec, prev, { full: a.full }));
    log(a.full ? await send(line, env) : '[e2e-timing] прогон не полный — без истории и отправки');
  } catch (e) {
    error(`[e2e-timing] запись не сделана: ${e.message}`);
  }
  return 0;
}
