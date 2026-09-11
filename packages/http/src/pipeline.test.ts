import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, expect, test } from 'vitest';
import { ApiFailure, sanitisingInterceptor } from './sanitising-interceptor';
import { SESSION_EXPIRED, sessionExpiredInterceptor } from './session-interceptor';
import type { SessionExpiry } from './session-interceptor';

let expired = 0;
let lastExpiry: SessionExpiry | null = null;

// REQ-QUALITY-012
beforeEach(() => {
  expired = 0;
  lastExpiry = null;
  TestBed.configureTestingModule({
    providers: [
      provideHttpClient(withInterceptors([sanitisingInterceptor, sessionExpiredInterceptor])),
      provideHttpClientTesting(),
      { provide: SESSION_EXPIRED, useValue: (expiry: SessionExpiry) => { expired += 1; lastExpiry = expiry; } },
    ],
  });
});

afterEach(() => {
  TestBed.inject(HttpTestingController).verify();
  TestBed.resetTestingModule();
});

async function failureOf(status: number, body: object | string, statusText = 'Failure'): Promise<unknown> {
  const client = TestBed.inject(HttpClient);
  const backend = TestBed.inject(HttpTestingController);
  const answer = new Promise<unknown>((resolve) => {
    client.get('/players/17').subscribe({ next: () => resolve(null), error: resolve });
  });
  backend.expectOne('/players/17').flush(body, { status, statusText });
  return answer;
}

test('в собранном конвейере отказ приходит разобранным ApiFailure', async () => {
  const failure = await failureOf(404, { status: 404, detail: 'Not Found', code: 'player-absent' });

  expect(failure).toBeInstanceOf(ApiFailure);
  expect((failure as ApiFailure).problem.code).toBe('player-absent');
});

test('в собранном конвейере 401 зовёт обработчик истёкшей сессии', async () => {
  await failureOf(401, { status: 401, code: 'session-expired' });
  expect(expired).toBe(1);
});

// REQ-API-009
test('обработчик получает запрос и разобранный отказ и различает по ним случаи', async () => {
  await failureOf(401, { status: 401, code: 'bad-credentials' });

  expect(lastExpiry?.request.url).toBe('/players/17');
  expect(lastExpiry?.problem?.code).toBe('bad-credentials');
});

test('в собранном конвейере тело не по контракту становится непрозрачным', async () => {
  const failure = await failureOf(502, 'nginx: upstream 10.0.0.7 отказал', 'Bad Gateway');

  expect((failure as ApiFailure).problem.code).toBe('unexpected');
  expect(JSON.stringify((failure as ApiFailure).problem)).not.toContain('10.0.0.7');
});

test('успешный ответ конвейер не трогает', async () => {
  const client = TestBed.inject(HttpClient);
  const backend = TestBed.inject(HttpTestingController);
  const answer = new Promise<unknown>((resolve, reject) => {
    client.get<{ id: string }>('/players/17').subscribe({ next: resolve, error: reject });
  });
  backend.expectOne('/players/17').flush({ id: '17' });

  expect(await answer).toEqual({ id: '17' });
  expect(expired).toBe(0);
});

// REQ-API-007
test('в собранном конвейере поля расширения доходят до обработчика', async () => {
  const failure = await failureOf(409, {
    status: 409,
    detail: 'Недостаточно остатка',
    code: 'stock-short',
    availableQuantity: 5,
    blockedItems: ['a-1'],
  }, 'Conflict');

  expect((failure as ApiFailure).extensions).toEqual({ availableQuantity: 5, blockedItems: ['a-1'] });
});
