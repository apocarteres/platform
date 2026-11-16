import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { afterEach, describe, expect, it } from 'vitest';
import { TelegramLink, provideTelegram } from './link';
import type { TelegramOptions } from './link';

function setUp(options: TelegramOptions = {}): { http: HttpTestingController; link: TelegramLink } {
  TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting(), provideTelegram(options)] });
  return { http: TestBed.inject(HttpTestingController), link: TestBed.inject(TelegramLink) };
}

afterEach(() => {
  TestBed.resetTestingModule();
});

// REQ-TELEGRAM-013
describe('связь с Telegram', () => {
  it('состояние — null до первого чтения, затем как отдал сервер', async () => {
    const { http, link } = setUp();
    expect(link.state()).toBeNull();
    expect(link.linked()).toBe(false);
    const read = link.refresh();
    http.expectOne('/api/telegram/link').flush({ linked: true, linkedAt: '2026-11-16T10:00:00Z' });
    await read;
    expect(link.state()).toEqual({ linked: true, linkedAt: '2026-11-16T10:00:00Z' });
    expect(link.linked()).toBe(true);
  });

  it('без входа состояние сбрасывается в null, прочий отказ не поглощается', async () => {
    const { http, link } = setUp();
    const signedOut = link.refresh();
    http.expectOne('/api/telegram/link').flush({ code: 'authentication-required' }, { status: 401, statusText: 'Unauthorized' });
    await signedOut;
    expect(link.state()).toBeNull();
    const failing = link.refresh();
    http.expectOne('/api/telegram/link').flush({ code: 'unexpected' }, { status: 500, statusText: 'Server Error' });
    await expect(failing).rejects.toBeTruthy();
  });

  it('ссылка связи — POST на объявленную базу; снятие — DELETE и состояние «нет связи»', async () => {
    const { http, link } = setUp({ base: '/backend/telegram' });
    const invited = link.invite();
    const post = http.expectOne('/backend/telegram/link');
    expect(post.request.method).toBe('POST');
    post.flush({ url: 'https://t.me/core_test_bot?start=abc', expiresAt: '2026-11-16T10:10:00Z' });
    await expect(invited).resolves.toEqual({ url: 'https://t.me/core_test_bot?start=abc', expiresAt: '2026-11-16T10:10:00Z' });
    const removed = link.unlink();
    const remove = http.expectOne('/backend/telegram/link');
    expect(remove.request.method).toBe('DELETE');
    remove.flush(null, { status: 204, statusText: 'No Content' });
    await removed;
    expect(link.state()).toEqual({ linked: false, linkedAt: null });
    http.verify();
  });
});
