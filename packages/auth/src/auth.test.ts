import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { afterEach, describe, expect, it } from 'vitest';
import { AuthSession, authFailureCode, authInterceptor, provideAuth, signedIn, withRole } from './index';

@Component({ selector: 'test-page', standalone: true, template: 'страница' })
class Page {}

const ME = { id: '6f1c0a8e-6b1d-4d7e-9b7a-1f4f8a9e2c11', email: 'player@site.example', roles: ['USER'] };

function setUp(): { http: HttpTestingController; session: AuthSession } {
  TestBed.configureTestingModule({
    providers: [
      provideHttpClient(withInterceptors([authInterceptor])),
      provideHttpClientTesting(),
      provideRouter([
        { path: 'login', component: Page },
        { path: 'lobby', component: Page, canMatch: [signedIn('/login')] },
        { path: 'admin', component: Page, canMatch: [withRole('ADMIN', '/lobby')] },
      ]),
      provideAuth(),
    ],
  });
  return { http: TestBed.inject(HttpTestingController), session: TestBed.inject(AuthSession) };
}

async function flushes(): Promise<void> {
  for (let turn = 0; turn < 5; turn += 1) await Promise.resolve();
}

async function start(http: HttpTestingController, me: object | null): Promise<void> {
  await flushes();
  http.expectOne('/api/auth/csrf').flush({ token: 't' });
  await flushes();
  const request = http.expectOne('/api/auth/me');
  if (me === null) request.flush({ code: 'authentication-required' }, { status: 401, statusText: 'Unauthorized' });
  else request.flush(me);
  await flushes();
}

afterEach(() => {
  TestBed.resetTestingModule();
});

// REQ-AUTH-008, REQ-AUTH-015
describe('состояние сессии', () => {
  it('при запуске берёт токен CSRF раньше первого запроса и узнаёт, кто вошёл', async () => {
    const { http, session } = setUp();
    expect(session.account()).toBeUndefined();
    await start(http, ME);
    expect(session.account()?.email).toBe('player@site.example');
    expect(session.has('USER')).toBe(true);
    expect(session.has('ADMIN')).toBe(false);
    http.verify();
  });

  it('без входа состояние — «не вошёл», а не отказ', async () => {
    const { http, session } = setUp();
    await start(http, null);
    await expect(session.ready()).resolves.toBeUndefined();
    expect(session.account()).toBeNull();
  });

  it('отказ сервера при запуске — не «не вошёл»: ожидание отвергается, состояние остаётся неизвестным', async () => {
    const { http, session } = setUp();
    await flushes();
    http.expectOne('/api/auth/csrf').flush({ token: 't' });
    await flushes();
    http.expectOne('/api/auth/me').flush({ code: 'unexpected' }, { status: 500, statusText: 'Server Error' });
    await expect(session.ready()).rejects.toBeDefined();
    expect(session.account()).toBeUndefined();
  });

  it('вход записывает учётную запись и обновляет токен, выход её стирает', async () => {
    const { http, session } = setUp();
    await start(http, null);
    const signed = session.login('player@site.example', 'long password', 'answer');
    await flushes();
    const login = http.expectOne('/api/auth/login');
    expect(login.request.body).toEqual({ email: 'player@site.example', password: 'long password', human: 'answer' });
    login.flush(ME);
    await flushes();
    http.expectOne('/api/auth/csrf').flush({ token: 'u' });
    await expect(signed).resolves.toEqual(ME);
    expect(session.account()?.id).toBe(ME.id);

    const out = session.logout();
    await flushes();
    http.expectOne('/api/auth/logout').flush(null, { status: 204, statusText: 'No Content' });
    await flushes();
    http.expectOne('/api/auth/csrf').flush({ token: 'v' });
    await out;
    expect(session.account()).toBeNull();
  });

  it('отказ сервера authentication-required на любом запросе сбрасывает вход', async () => {
    const { http, session } = setUp();
    await start(http, ME);
    const refused = firstValueFrom(TestBed.inject(HttpClient).get('/api/things'));
    http.expectOne('/api/things').flush({ code: 'authentication-required' }, { status: 401, statusText: 'Unauthorized' });
    await expect(refused).rejects.toBeDefined();
    expect(session.account()).toBeNull();
  });

  it('отказ входа с неверным паролем вход не сбрасывает и код отказа читается', async () => {
    const { http, session } = setUp();
    await start(http, ME);
    const failed = session.login('player@site.example', 'wrong password');
    await flushes();
    http.expectOne('/api/auth/login').flush({ code: 'credentials-rejected' }, { status: 401, statusText: 'Unauthorized' });
    const failure = await failed.catch((reason: unknown) => reason);
    expect(authFailureCode(failure)).toBe('credentials-rejected');
    expect(session.account()?.email).toBe('player@site.example');
  });

  it('регистрация, подтверждение и сброс уходят на точки ядра с телом, которое оно ждёт', async () => {
    const { http, session } = setUp();
    await start(http, null);
    const calls = [
      [session.register('new@site.example', 'long password', { name: 'Игрок' }, 'h'), '/api/auth/register',
        { email: 'new@site.example', password: 'long password', human: 'h', profile: { name: 'Игрок' } }],
      [session.verify('tok'), '/api/auth/verify', { token: 'tok' }],
      [session.resend('new@site.example'), '/api/auth/resend', { email: 'new@site.example' }],
      [session.requestReset('new@site.example', 'h'), '/api/auth/password-reset/request', { email: 'new@site.example', human: 'h' }],
      [session.confirmReset('tok', 'another password'), '/api/auth/password-reset/confirm', { token: 'tok', password: 'another password' }],
    ] as const;
    for (const [promise, url, body] of calls) {
      const request = http.expectOne(url);
      expect(request.request.method).toBe('POST');
      expect(request.request.body).toEqual(body);
      request.flush(null, { status: 202, statusText: 'Accepted' });
      await promise;
    }
  });
});

// REQ-AUTH-002, REQ-AUTH-015
describe('охрана маршрутов', () => {
  it('не вошедшего уводит на вход, без роли — на указанный маршрут', async () => {
    const { http } = setUp();
    const router = TestBed.inject(Router);
    await start(http, null);
    await router.navigateByUrl('/lobby');
    expect(router.url).toBe('/login');

    TestBed.inject(AuthSession).expired();
    TestBed.resetTestingModule();
    const again = setUp();
    const routed = TestBed.inject(Router);
    await start(again.http, ME);
    await routed.navigateByUrl('/lobby');
    expect(routed.url).toBe('/lobby');
    await routed.navigateByUrl('/admin');
    expect(routed.url).toBe('/lobby');
  });

  it('охрана ждёт, пока станет известно, кто вошёл', async () => {
    const { http } = setUp();
    const router = TestBed.inject(Router);
    await flushes();
    http.expectOne('/api/auth/csrf').flush({ token: 't' });
    await flushes();
    const pending = http.expectOne('/api/auth/me');
    const navigation = router.navigateByUrl('/admin');
    for (let turn = 0; turn < 20; turn += 1) await flushes();
    pending.flush({ ...ME, roles: ['USER', 'ADMIN'] });
    await navigation;
    expect(router.url).toBe('/admin');
  });
});
