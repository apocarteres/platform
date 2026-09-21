import assert from 'node:assert/strict';
import test from 'node:test';
import { absentPaths, askForAbsent, judgeAnswer } from '../lib/unknown-path.mjs';
import { frontendProxy } from './fictitious-service.mjs';

// REQ-DEPLOYMENT-018
test('спрашиваемые адреса маршрутами приложения быть не могут', () => {
  const paths = absentPaths({ token: 'проба' });

  assert.ok(paths.length > 1, 'адресов несколько: одна форма не покрывает раскладку');
  for (const path of paths) {
    assert.match(path, /\.[A-Za-z0-9]+$/, 'у каждого адреса есть расширение, а у маршрутов приложения его нет');
    assert.ok(path.includes('проба'), 'в имени есть случайная часть: иначе можно попасть в существующий файл');
  }
  assert.notDeepEqual(absentPaths(), absentPaths(), 'без заданной части адреса различаются от запуска к запуску');
});

// REQ-DEPLOYMENT-018
test('ответ страницей приложения назван тем, чем он является', () => {
  assert.equal(judgeAnswer({ path: '/нет.js', status: 404, contentType: 'text/html' }), null);

  const masked = judgeAnswer({ path: '/нет.js', status: 200, contentType: 'text/html; charset=utf-8' });
  assert.match(masked, /^\/нет\.js: ответ 200/);
  assert.match(masked, /обработчик одностраничного приложения/, 'отказ называет причину, а не только несовпадение');
  assert.match(masked, /по кодам ответа/, 'отказ называет цену: разбор становится невозможен');

  assert.match(judgeAnswer({ path: '/нет.js', status: 403, contentType: null }), /ответ 403, ожидался 404/);
});

// REQ-DEPLOYMENT-018
test('раскладка, отвечающая приложением на все пути, проверку не проходит', async () => {
  const proxy = await frontendProxy();
  try {
    const answer = await askForAbsent(proxy.url(''), { token: 'проба' });

    assert.equal(answer.proved, false);
    assert.equal(answer.reasons.length, answer.asked, 'назван каждый спрошенный адрес, а не первый');
    assert.match(answer.reasons[0], /ответ 200/);
  } finally {
    await proxy.stop();
  }
});

// REQ-DEPLOYMENT-018
test('раскладка, отвечающая 404 на адрес с расширением, проверку проходит', async () => {
  const proxy = await frontendProxy({ masksUnknown: false });
  try {
    const answer = await askForAbsent(proxy.url(''), { token: 'проба' });

    assert.deepEqual(answer.reasons, [], answer.reasons.join('\n'));
    assert.equal(answer.proved, true);
  } finally {
    await proxy.stop();
  }
});

// REQ-DEPLOYMENT-018, REQ-QUALITY-005, REQ-QUALITY-009
test('молчащий адрес и недоступный адрес различаются в отказе', async () => {
  const refused = async () => {
    throw new Error('fetch failed');
  };
  const silent = await askForAbsent('http://пример', { token: 'проба', fetcher: refused });
  assert.equal(silent.proved, false);
  assert.match(silent.reasons[0], /обращение не удалось: fetch failed/);

  // REQ-QUALITY-009, REQ-QUALITY-010
  const timedOut = async () => {
    const failure = new Error('предел истёк');
    failure.name = 'TimeoutError';
    throw failure;
  };
  const waited = await askForAbsent('http://пример', { token: 'проба', timeoutSeconds: 7, fetcher: timedOut });
  assert.match(waited.reasons[0], /не ответил за 7 с/);
  assert.equal(waited.reasons.length, waited.asked, 'назван каждый адрес');
});
