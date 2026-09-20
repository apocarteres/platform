import assert from 'node:assert/strict';
import test from 'node:test';
import { DEFAULT_TIMEOUT_SECONDS, askTheService, judge } from '../lib/health.mjs';
import { fictitiousService, frontendProxy } from './fictitious-service.mjs';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';

const run = promisify(execFile);
const cli = path.join(path.dirname(path.dirname(fileURLToPath(import.meta.url))), 'bin', 'conventions.mjs');

// REQ-DEPLOYMENT-006
async function conventions(...args) {
  try {
    const { stdout } = await run(process.execPath, [cli, ...args]);
    return { code: 0, output: stdout };
  } catch (failure) {
    return { code: failure.code, output: `${failure.stdout}${failure.stderr}` };
  }
}

// REQ-DEPLOYMENT-006
test('проверка через прокси отказывает, а через сервис проходит', async () => {
  const service = await fictitiousService();
  const proxy = await frontendProxy();
  try {
    const throughProxy = await askTheService(proxy.readiness);
    assert.equal(throughProxy.healthy, false,
      'прокси отдаёт index.html с кодом 200: прежняя проверка объявляла сервис поднявшимся');
    assert.match(throughProxy.reason, /не документ состояния/);
    assert.match(throughProxy.reason, /то, что стоит перед ним/, 'отказ называет причину, а не только несоответствие');

    const direct = await askTheService(service.readiness);
    assert.equal(direct.healthy, true, direct.reason);
  } finally {
    await service.stop();
    await proxy.stop();
  }
});

// REQ-DEPLOYMENT-006, REQ-QUALITY-014
test('остановленный сервис роняет шаг, а прокси по-прежнему отвечает 200', async () => {
  const service = await fictitiousService();
  const proxy = await frontendProxy();
  try {
    assert.equal((await askTheService(service.readiness)).healthy, true, 'сначала сервис поднят');

    await service.stop();

    const afterStop = await askTheService(service.readiness);
    assert.equal(afterStop.healthy, false, 'заведомый отказ обязан ронять шаг развёртывания');
    assert.match(afterStop.reason, /обращение не удалось/);

    const stillGreen = await askTheService(proxy.readiness);
    assert.equal(stillGreen.healthy, false,
      'прокси отвечает 200 и при остановленном сервисе: проверка через неё осталась бы зелёной');
  } finally {
    await proxy.stop();
  }
});

// REQ-DEPLOYMENT-006
test('неготовый сервис отличается от поднятого, хотя отвечает', async () => {
  const service = await fictitiousService();
  try {
    service.halt();

    const answer = await askTheService(service.readiness);

    assert.equal(answer.healthy, false);
    assert.match(answer.reason, /кодом 503/);
  } finally {
    await service.stop();
  }
});

// REQ-DEPLOYMENT-006, REQ-QUALITY-005
test('разбор ответа различает четыре случая и называет каждый', () => {
  const cases = [
    [{ status: 200, contentType: 'text/html', body: '<!doctype html>' }, /не документ состояния/],
    [{ status: 200, contentType: 'application/json', body: 'не json' }, /не разбирается/],
    [{ status: 200, contentType: 'application/json', body: '{"status":"DOWN"}' }, /«DOWN», ожидалось UP/],
    [{ status: 502, contentType: 'text/plain', body: '' }, /кодом 502/],
  ];

  for (const [answer, expected] of cases) {
    const verdict = judge(answer);
    assert.equal(verdict.healthy, false);
    assert.match(verdict.reason, expected);
  }

  assert.equal(judge({ status: 200, contentType: 'application/json', body: '{"status":"UP"}' }).healthy, true);
});

// REQ-DEPLOYMENT-006
test('молчащий сервис роняет шаг по пределу, а не висит', async () => {
  const silent = await fictitiousService();
  try {
    const answer = await askTheService(silent.readiness, {
      timeoutSeconds: 0.05,
      fetcher: (url, options) => new Promise((_, reject) => {
        options.signal.addEventListener('abort', () => {
          const failure = new Error('timed out');
          failure.name = 'TimeoutError';
          reject(failure);
        });
      }),
    });

    assert.equal(answer.healthy, false);
    assert.match(answer.reason, /не ответил за 0\.05 с/, 'предел назван в отказе');
    assert.equal(DEFAULT_TIMEOUT_SECONDS, 10, 'предел есть по умолчанию: без него повтор не наступает');
  } finally {
    await silent.stop();
  }
});

// REQ-DEPLOYMENT-006
test('команда ядра роняет шаг на прокси и проходит на сервисе', async () => {
  const service = await fictitiousService();
  const proxy = await frontendProxy();
  try {
    const throughProxy = await conventions('health', '--url', proxy.readiness);
    assert.equal(throughProxy.code, 1, throughProxy.output);
    assert.match(throughProxy.output, /работоспособность не подтвердил/);
    // REQ-QUALITY-014
    assert.match(throughProxy.output, /остановите сервис и убедитесь, что шаг падает/);

    const direct = await conventions('health', '--url', service.readiness);
    assert.equal(direct.code, 0, direct.output);
    assert.match(direct.output, /подтвердил работоспособность: UP/);
  } finally {
    await service.stop();
    await proxy.stop();
  }
});

// REQ-RELEASE-028
test('команда проверки отвергает отсутствие адреса и негодный предел', async () => {
  const withoutUrl = await conventions('health');
  assert.equal(withoutUrl.code, 2, withoutUrl.output);
  assert.match(withoutUrl.output, /требует адреса/);

  const badTimeout = await conventions('health', '--url', 'http://127.0.0.1:1/x', '--timeout', 'скоро');
  assert.equal(badTimeout.code, 2, badTimeout.output);
  assert.match(badTimeout.output, /положительным числом секунд/);
});
