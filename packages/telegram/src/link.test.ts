import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { afterEach, describe, expect, it } from 'vitest';
import { TelegramLink, provideTelegram } from './link';
import type { TelegramOptions } from './link';

const BOTS = [
  { bot: 'news', name: 'site_news_bot', linked: true, linkedAt: '2026-11-16T10:00:00Z' },
  { bot: 'support', name: 'site_support_bot', linked: false, linkedAt: null },
];

function setUp(options: TelegramOptions = {}): { http: HttpTestingController; link: TelegramLink } {
  TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting(), provideTelegram(options)] });
  return { http: TestBed.inject(HttpTestingController), link: TestBed.inject(TelegramLink) };
}

afterEach(() => {
  TestBed.resetTestingModule();
});

// REQ-TELEGRAM-013
describe('связи с ботами Telegram', () => {
  it('связи — null до первого чтения, затем по каждому боту службы', async () => {
    const { http, link } = setUp();
    expect(link.bots()).toBeNull();
    expect(link.linked()).toEqual([]);
    const read = link.refresh();
    http.expectOne('/api/telegram/links').flush({ bots: BOTS });
    await read;
    expect(link.bots()).toEqual(BOTS);
    expect(link.linked()).toEqual(['news']);
  });

  it('без входа связи сбрасываются в null, прочий отказ не поглощается', async () => {
    const { http, link } = setUp();
    const signedOut = link.refresh();
    http.expectOne('/api/telegram/links').flush({ code: 'authentication-required' }, { status: 401, statusText: 'Unauthorized' });
    await signedOut;
    expect(link.bots()).toBeNull();
    const failing = link.refresh();
    http.expectOne('/api/telegram/links').flush({ code: 'unexpected' }, { status: 500, statusText: 'Server Error' });
    await expect(failing).rejects.toBeTruthy();
  });

  it('ссылка связи и снятие — по боту на объявленной базе; снятие отмечает только этот бот', async () => {
    const { http, link } = setUp({ base: '/backend/telegram' });
    const read = link.refresh();
    http.expectOne('/backend/telegram/links').flush({ bots: BOTS });
    await read;
    const invited = link.invite('support');
    const post = http.expectOne('/backend/telegram/support/link');
    expect(post.request.method).toBe('POST');
    post.flush({ url: 'https://t.me/site_support_bot?start=abc', expiresAt: '2026-11-16T10:10:00Z' });
    await expect(invited).resolves.toEqual({ url: 'https://t.me/site_support_bot?start=abc', expiresAt: '2026-11-16T10:10:00Z' });
    const removed = link.unlink('news');
    const remove = http.expectOne('/backend/telegram/news/link');
    expect(remove.request.method).toBe('DELETE');
    remove.flush(null, { status: 204, statusText: 'No Content' });
    await removed;
    expect(link.linked()).toEqual([]);
    expect(link.bots()?.map((one) => one.linkedAt)).toEqual([null, null]);
    http.verify();
  });
});
