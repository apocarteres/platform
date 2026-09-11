import { HttpErrorResponse, HttpResponse } from '@angular/common/http';
import type { HttpRequest } from '@angular/common/http';
import { firstValueFrom, of, throwError } from 'rxjs';
import { expect, test } from 'vitest';
import { ApiFailure, sanitisingInterceptor } from './sanitising-interceptor';

const request = { url: '/players/17' } as HttpRequest<unknown>;

async function failureOf(response: unknown): Promise<unknown> {
  try {
    await firstValueFrom(sanitisingInterceptor(request, () => throwError(() => response)));
    return null;
  } catch (failure) {
    return failure;
  }
}

// REQ-API-001
test('успешный ответ проходит нетронутым', async () => {
  const response = new HttpResponse({ status: 200 });
  const passed = await firstValueFrom(sanitisingInterceptor(request, () => of(response)));
  expect(passed).toBe(response);
});

test('тело контракта разбирается в ApiFailure с кодом', async () => {
  const failure = await failureOf(new HttpErrorResponse({
    status: 404,
    url: '/players/17',
    error: { status: 404, title: 'Not Found', detail: 'Not Found', code: 'player-absent' },
  }));

  expect(failure).toBeInstanceOf(ApiFailure);
  expect((failure as ApiFailure).problem.code).toBe('player-absent');
  expect((failure as ApiFailure).problem.status).toBe(404);
});

// REQ-API-003
test('ответ не по контракту заменяется непрозрачным, внутренности наружу не идут', async () => {
  const failure = await failureOf(new HttpErrorResponse({
    status: 502,
    statusText: 'Bad Gateway',
    url: '/players/17',
    error: '<html><body>nginx: upstream 10.0.0.7:8080 отказал</body></html>',
  }));

  expect(failure).toBeInstanceOf(ApiFailure);
  const problem = (failure as ApiFailure).problem;
  expect(problem.code).toBe('unexpected');
  expect(problem.status).toBe(502);
  expect(JSON.stringify(problem)).not.toContain('nginx');
  expect(JSON.stringify(problem)).not.toContain('10.0.0.7');
});

test('отказ не от HTTP остаётся собой', async () => {
  const original = new TypeError('сеть недоступна');
  expect(await failureOf(original)).toBe(original);
});
