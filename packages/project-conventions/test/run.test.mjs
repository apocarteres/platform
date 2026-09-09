import assert from 'node:assert/strict';
import { execSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import {
  DEFAULT_IDLE_SECONDS, DEFAULT_LIMIT_SECONDS, IDLE_EXIT_CODE, LIMIT_EXIT_CODE, report, runWithLimits,
} from '../lib/run.mjs';

const shell = (script) => ['sh', ['-c', script]];

test('пределы по умолчанию заданы и не равны нулю', () => {
  assert.equal(DEFAULT_LIMIT_SECONDS, 1800);
  assert.equal(DEFAULT_IDLE_SECONDS, 300);
});

test('завершившийся процесс отдаёт свой код возврата, а не код предела', async () => {
  const ok = await runWithLimits(...shell('echo раз; echo два'), { idleSeconds: 5 });
  assert.equal(ok.code, 0);
  assert.equal(ok.exceeded, null);
  assert.deepEqual(ok.tail, ['раз', 'два']);

  const failed = await runWithLimits(...shell('echo причина >&2; exit 3'), { idleSeconds: 5 });
  assert.equal(failed.code, 3);
  assert.equal(failed.exceeded, null);
  assert.deepEqual(failed.tail, ['причина'], 'поток ошибок тоже считается выводом');
});

test('молчание дольше предела завершает процесс', async () => {
  const result = await runWithLimits(...shell('echo начал; sleep 30'), { idleSeconds: 1, limitSeconds: 30 });
  assert.equal(result.exceeded, 'idle');
  assert.equal(result.code, IDLE_EXIT_CODE);
  assert.ok(result.elapsedSeconds < 10, `завершение не должно ждать общий предел: ${result.elapsedSeconds}`);
  assert.deepEqual(result.tail, ['начал']);
});

test('движение в выводе сбрасывает предел бездействия', async () => {
  const result = await runWithLimits(...shell('for i in 1 2 3 4 5 6; do echo шаг $i; sleep 0.3; done'), { idleSeconds: 1 });
  assert.equal(result.exceeded, null, 'процесс с выводом каждые 0.3 с не считается зависшим при пределе 1 с');
  assert.equal(result.code, 0);
  assert.ok(result.elapsedSeconds >= 1, `процесс шёл дольше предела бездействия: ${result.elapsedSeconds}`);
});

test('общий предел завершает даже разговорчивый процесс', async () => {
  const result = await runWithLimits(...shell('while true; do echo тик; sleep 0.2; done'), { limitSeconds: 1, idleSeconds: 30 });
  assert.equal(result.exceeded, 'limit');
  assert.equal(result.code, LIMIT_EXIT_CODE);
});

test('потомки завершаются вместе с процессом', async () => {
  const marker = `conventions-run-probe-${randomUUID().replaceAll('-', '')}`;
  const result = await runWithLimits(...shell(`sh -c 'sleep 30 # ${marker}' & echo запущен; sleep 30`), { idleSeconds: 1 });
  assert.equal(result.exceeded, 'idle');
  await new Promise((resolve) => setTimeout(resolve, 6500));
  const alive = execSync(`pgrep -f ${marker} || true`).toString().trim();
  assert.equal(alive, '', 'группа процессов завершается целиком');
});

test('отчёт называет исчерпанный предел, время и последние строки', async () => {
  const result = await runWithLimits(...shell('echo единственная строка; sleep 30'), { idleSeconds: 1 });
  const message = report(result, 'sh -c ...', { limitSeconds: 30, idleSeconds: 1 });
  assert.match(message, /нет движения в выводе 1 с/);
  assert.match(message, /Последние строки вывода:/);
  assert.match(message, /единственная строка/);
  assert.equal(report({ exceeded: null }, 'x', { limitSeconds: 1, idleSeconds: 1 }), null, 'без превышения отчёта нет');
});
