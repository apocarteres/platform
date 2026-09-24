import assert from 'node:assert/strict';
import test from 'node:test';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { checkStatic, judgeAbsent, judgeEntry, judgeServed, referrerWarning } from '../lib/static-check.mjs';

// REQ-DEPLOYMENT-022
const CURRENT = { 'index.html': '<script src="main-BBBBBBBB.js"></script>\n', 'main-BBBBBBBB.js': 'новая', 'chunk-CCCCCCCC.js': 'кусок' };

// REQ-DEPLOYMENT-022
const PREVIOUS = { 'index.html': '<script src="main-AAAAAAAA.js"></script>\n', 'main-AAAAAAAA.js': 'прежняя' };

// REQ-DEPLOYMENT-022
async function tree(files) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'static-'));
  for (const [file, content] of Object.entries(files)) {
    await mkdir(path.join(root, path.dirname(file)), { recursive: true });
    await writeFile(path.join(root, file), content);
  }
  return root;
}

// REQ-DEPLOYMENT-022, REQ-DEPLOYMENT-023
async function site({ referrerPolicy = null, entryCache = 'no-store', hashedCache = 'public, max-age=31536000, immutable', absentImmutable = false, entryFromArchive = false, archive = true } = {}) {
  const current = await tree(CURRENT);
  const previous = await tree(PREVIOUS);
  const server = http.createServer(async (request, response) => {
    const name = decodeURIComponent(request.url.slice(1));
    const from = async (directory) => readFile(path.join(directory, name), 'utf8').catch(() => null);
    if (name === 'index.html') {
      response.writeHead(200, { 'content-type': 'text/html', 'cache-control': entryCache, ...(referrerPolicy ? { 'referrer-policy': referrerPolicy } : {}) });
      response.end(await from(entryFromArchive ? previous : current));
      return;
    }
    const body = (await from(current)) ?? (archive ? await from(previous) : null);
    if (body === null) {
      response.writeHead(404, absentImmutable ? { 'cache-control': 'public, max-age=31536000, immutable' } : {});
      response.end('нет');
      return;
    }
    response.writeHead(200, { 'cache-control': hashedCache });
    response.end(body);
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  return {
    url: `http://127.0.0.1:${server.address().port}`,
    artifact: current,
    stop: async () => {
      await new Promise((resolve) => server.close(resolve));
      await rm(current, { recursive: true, force: true });
      await rm(previous, { recursive: true, force: true });
    },
  };
}

// REQ-DEPLOYMENT-024
test('раскладка по правилам проходит и называет архив непроверенным, пока кусок прежней сборки не назван', async () => {
  const one = await site();
  try {
    const plain = await checkStatic(one.url, { artifact: one.artifact, token: 'проба' });
    assert.deepEqual(plain.reasons, []);
    assert.equal(plain.proved, true);
    assert.match(plain.unchecked, /архив прежних кусков не проверен: назовите .* --previous/);

    const archived = await checkStatic(one.url, { artifact: one.artifact, previous: ['main-AAAAAAAA.js'], token: 'проба' });
    assert.equal(archived.proved, true, archived.reasons.join('\n'));
    assert.equal(archived.unchecked, null);
  } finally {
    await one.stop();
  }
});

// REQ-DEPLOYMENT-022
test('кусок прежней сборки без архива — отказ с адресом и ответом', async () => {
  const one = await site({ archive: false });
  try {
    const answer = await checkStatic(one.url, { artifact: one.artifact, previous: ['main-AAAAAAAA.js'], token: 'проба' });
    assert.equal(answer.proved, false);
    assert.deepEqual(answer.reasons, ['/main-AAAAAAAA.js: кусок прежней сборки ответил 404, ожидался 200']);
  } finally {
    await one.stop();
  }
});

// REQ-DEPLOYMENT-022
test('точка входа из архива — отказ: отдана не текущая сборка', async () => {
  const one = await site({ entryFromArchive: true });
  try {
    const answer = await checkStatic(one.url, { artifact: one.artifact, token: 'проба' });
    assert.deepEqual(answer.reasons, ['/index.html: отдана не текущая сборка — точка входа пришла из архива или из прежней раскладки']);
  } finally {
    await one.stop();
  }
});

// REQ-DEPLOYMENT-023
test('кэш точки входа, файла с отпечатком и отказа проверяется по заголовкам', async () => {
  const cached = await site({ entryCache: 'public, max-age=600', hashedCache: 'public, max-age=600', absentImmutable: true });
  try {
    const answer = await checkStatic(cached.url, { artifact: cached.artifact, token: 'проба' });
    assert.equal(answer.proved, false);
    assert.equal(answer.reasons.length, 3, answer.reasons.join('\n'));
    assert.match(answer.reasons[0], /^\/index\.html: Cache-Control «public, max-age=600» без no-store/);
    assert.match(answer.reasons[1], /^\/chunk-CCCCCCCC\.js: файл текущей сборки без immutable/);
    assert.match(answer.reasons[2], /^\/nonexistent-проба\.0badc0de\.js: отказ несёт вечный кэш/);
  } finally {
    await cached.stop();
  }
});

// REQ-DEPLOYMENT-023, REQ-DEPLOYMENT-024
test('суждения по одному ответу называют, что не так', () => {
  assert.deepEqual(judgeEntry({ status: 200, cacheControl: 'no-store', body: 'a\n', built: 'a' }), []);
  assert.match(judgeEntry({ status: 502, cacheControl: null, body: '', built: 'a' })[0], /ответ 502, ожидался 200/);
  assert.deepEqual(judgeServed({ path: '/x.js', status: 200, cacheControl: 'max-age=1, immutable', role: 'файл' }), []);
  assert.deepEqual(judgeAbsent({ path: '/y.js', status: 404, cacheControl: null }), []);
  assert.match(judgeAbsent({ path: '/y.js', status: 200, cacheControl: null })[0], /выдуманный файл ответил 200, ожидался 404/);
});

// REQ-DEPLOYMENT-024
test('сборка без файлов с отпечатком названа: без отпечатка нет ни вечного кэша, ни архива', async () => {
  const one = await site();
  const bare = await tree({ 'index.html': CURRENT['index.html'], 'main.js': 'без отпечатка' });
  try {
    const answer = await checkStatic(one.url, { artifact: bare, token: 'проба' });
    assert.match(answer.reasons[0], /нет файлов с отпечатком в имени: .* outputHashing/);
  } finally {
    await one.stop();
    await rm(bare, { recursive: true, force: true });
  }
});

// REQ-DEPLOYMENT-024, REQ-CLIENT-UPDATE-006
test('политика no-referrer — предупреждение, а не отказ: на http признак браузера пропадает', async () => {
  const strict = await site({ referrerPolicy: 'no-referrer' });
  try {
    const answer = await checkStatic(strict.url, { artifact: strict.artifact, token: 'проба' });
    assert.equal(answer.proved, true, answer.reasons.join('\n'));
    assert.equal(answer.warnings.length, 1);
    assert.match(answer.warnings[0], /no-referrer — по http браузер не пошлёт ни Sec-Fetch-Site, ни Referer/);
  } finally {
    await strict.stop();
  }
  const plain = await site({ referrerPolicy: 'strict-origin-when-cross-origin' });
  try {
    assert.deepEqual((await checkStatic(plain.url, { artifact: plain.artifact, token: 'проба' })).warnings, []);
  } finally {
    await plain.stop();
  }
  assert.match(referrerWarning({ referrerPolicy: null, body: '<meta name="referrer" content="no-referrer">' }), /no-referrer/);
  assert.match(referrerWarning({ referrerPolicy: null, body: "<meta content='no-referrer' name='referrer'>" }), /no-referrer/);
  assert.equal(referrerWarning({ referrerPolicy: 'no-referrer-when-downgrade', body: '' }), null, 'no-referrer-when-downgrade — другая политика');
});
