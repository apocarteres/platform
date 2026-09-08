import { spawn } from 'node:child_process';
import { systemNow } from './now.mjs';

export const DEFAULT_LIMIT_SECONDS = 1800;
export const DEFAULT_IDLE_SECONDS = 300;
export const LIMIT_EXIT_CODE = 124;
export const IDLE_EXIT_CODE = 125;
const TAIL_LINES = 20;
const TERMINATION_GRACE_MS = 5000;

function tail(lines) {
  return lines.slice(-TAIL_LINES);
}

// REQ-AGENT-WORK-014
function stop(child, signal) {
  try {
    process.kill(-child.pid, signal);
  } catch {
    try {
      child.kill(signal);
    } catch {
      return;
    }
  }
}

// REQ-AGENT-WORK-012, REQ-AGENT-WORK-013
export function runWithLimits(command, args, {
  limitSeconds = DEFAULT_LIMIT_SECONDS,
  idleSeconds = DEFAULT_IDLE_SECONDS,
  onOutput = () => {},
  cwd,
  env,
  now = () => systemNow().getTime(),
} = {}) {
  return new Promise((resolve) => {
    const started = now();
    const recent = [];
    const child = spawn(command, args, { cwd, env, detached: true, stdio: ['ignore', 'pipe', 'pipe'] });
    let exceeded = null;
    let idleTimer;
    let limitTimer;
    let graceTimer;

    const finish = (code, signal) => {
      clearTimeout(idleTimer);
      clearTimeout(limitTimer);
      clearTimeout(graceTimer);
      resolve({
        exceeded,
        code: exceeded === 'idle' ? IDLE_EXIT_CODE : exceeded === 'limit' ? LIMIT_EXIT_CODE : code ?? 1,
        signal,
        elapsedSeconds: Math.round((now() - started) / 1000),
        tail: tail(recent),
      });
    };

    const exceed = (reason) => {
      if (exceeded !== null) return;
      exceeded = reason;
      stop(child, 'SIGTERM');
      graceTimer = setTimeout(() => stop(child, 'SIGKILL'), TERMINATION_GRACE_MS);
    };

    const resetIdle = () => {
      clearTimeout(idleTimer);
      if (idleSeconds > 0) idleTimer = setTimeout(() => exceed('idle'), idleSeconds * 1000);
    };

    for (const stream of [child.stdout, child.stderr]) {
      stream.setEncoding('utf8');
      stream.on('data', (chunk) => {
        for (const line of chunk.split('\n')) if (line.trim() !== '') recent.push(line);
        while (recent.length > TAIL_LINES) recent.shift();
        onOutput(chunk);
        resetIdle();
      });
    }

    if (limitSeconds > 0) limitTimer = setTimeout(() => exceed('limit'), limitSeconds * 1000);
    resetIdle();
    child.on('error', (error) => {
      recent.push(String(error.message ?? error));
      finish(1, null);
    });
    child.on('close', (code, signal) => finish(code, signal));
  });
}

// REQ-AGENT-WORK-015
export function report(result, command, { limitSeconds, idleSeconds }) {
  if (result.exceeded === null) return null;
  const cause = result.exceeded === 'idle'
    ? `нет движения в выводе ${idleSeconds} с`
    : `исчерпан общий предел ${limitSeconds} с`;
  return [
    `Процесс завершён по пределу: ${cause}.`,
    `Команда: ${command}`,
    `Прошло: ${result.elapsedSeconds} с`,
    ...(result.tail.length === 0
      ? ['Вывода не было вовсе.']
      : ['Последние строки вывода:', ...result.tail.map((line) => `  ${line}`)]),
  ].join('\n');
}
