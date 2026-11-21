import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { send, sendTarget } from '../lib/send.mjs';

test('адрес: https или http только на localhost', () => {
  assert.ok(sendTarget('https://intake.example/e2e'));
  assert.ok(sendTarget('http://127.0.0.1:9000/x'));
  assert.equal(sendTarget('http://intake.example/x'), null);
  assert.equal(sendTarget('не адрес'), null);
});

test('без адреса — только файлы, без запроса', async () => {
  const msg = await send('{}', {}, () => assert.fail('запроса быть не должно'));
  assert.match(msg, /не задано/);
});

test('http не на localhost — отказ без запроса', async () => {
  const msg = await send('{}', { E2E_TIMING_URL: 'http://intake.example/' }, () => assert.fail('запроса быть не должно'));
  assert.match(msg, /только https/);
});

test('ключ из файла — заголовок Bearer, тело — строка записи', async () => {
  const file = join(mkdtempSync(join(tmpdir(), 'e2e-timing-')), 'token');
  writeFileSync(file, 'секрет\n');
  let seen;
  const msg = await send('{"a":1}', { E2E_TIMING_URL: 'https://intake.example/e2e', E2E_TIMING_TOKEN_FILE: file },
    async (url, init) => { seen = { url: String(url), init }; return { ok: true, status: 204 }; });
  assert.equal(msg, '[e2e-timing] отправлено в наблюдение: 204');
  assert.equal(seen.url, 'https://intake.example/e2e');
  assert.equal(seen.init.method, 'POST');
  assert.equal(seen.init.body, '{"a":1}');
  assert.equal(seen.init.headers['Authorization'], 'Bearer секрет');
});

test('отказ приёма и сбой сети прогон не роняют', async () => {
  const env = { E2E_TIMING_URL: 'https://intake.example/e2e' };
  assert.match(await send('{}', env, async () => ({ ok: false, status: 401 })), /не отправлено.*HTTP 401/);
  assert.match(await send('{}', env, async () => { throw new TypeError('fetch failed'); }), /не отправлено.*TypeError: fetch failed/);
  assert.match(await send('{}', { ...env, E2E_TIMING_TOKEN_FILE: '/нет/файла' }, async () => ({ ok: true })), /не отправлено/);
});
