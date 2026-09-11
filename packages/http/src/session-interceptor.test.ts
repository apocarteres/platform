import { HttpErrorResponse } from '@angular/common/http';
import type { HttpRequest } from '@angular/common/http';
import { Injector, runInInjectionContext } from '@angular/core';
import { firstValueFrom, throwError } from 'rxjs';
import { expect, test } from 'vitest';
import { ApiFailure } from './sanitising-interceptor';
import { SESSION_EXPIRED, sessionExpiredInterceptor } from './session-interceptor';

const request = { url: '/players/17' } as HttpRequest<unknown>;

async function run(failure: unknown, expired?: () => void): Promise<unknown> {
  const injector = Injector.create({
    providers: expired === undefined ? [] : [{ provide: SESSION_EXPIRED, useValue: expired }],
  });
  try {
    await firstValueFrom(runInInjectionContext(
      injector,
      () => sessionExpiredInterceptor(request, () => throwError(() => failure)),
    ));
    return null;
  } catch (thrown) {
    return thrown;
  }
}

// REQ-API-002
test('401 зовёт обработчик истёкшей сессии и отказ не проглатывает', async () => {
  let called = 0;
  const failure = new HttpErrorResponse({ status: 401, error: { code: 'session-expired' } });
  const thrown = await run(failure, () => { called += 1; });

  expect(called).toBe(1);
  expect(thrown).toBe(failure);
});

test('разобранный ApiFailure с 401 тоже считается истёкшей сессией', async () => {
  let called = 0;
  await run(new ApiFailure({
    type: 'about:blank', title: 'Unauthorized', status: 401, detail: '', code: 'session-expired', extensions: {},
  }), () => { called += 1; });

  expect(called).toBe(1);
});

test('другие статусы обработчик не зовут', async () => {
  let called = 0;
  await run(new HttpErrorResponse({ status: 403, error: { code: 'forbidden' } }), () => { called += 1; });
  expect(called).toBe(0);
});

// REQ-API-002
test('без объявленного обработчика 401 роняет запрос названной ошибкой, а не молчит', async () => {
  const thrown = await run(new HttpErrorResponse({ status: 401, error: null }));
  expect(thrown).toBeInstanceOf(Error);
  expect((thrown as Error).message).toContain('SESSION_EXPIRED');
});

test('не-401 без объявленного обработчика проходит нетронутым', async () => {
  const failure = new HttpErrorResponse({ status: 500, error: null });
  expect(await run(failure)).toBe(failure);
});
