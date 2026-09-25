import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { afterEach, describe, expect, it } from 'vitest';
import { BELL_INTERVAL_MS, BELL_SCHEDULE, NotificationBell, provideNotifications } from './bell';
import type { NotificationOptions } from './bell';

class ManualSchedule {
  readonly runs: { milliseconds: number; run: () => void }[] = [];

  every(milliseconds: number, run: () => void): () => void {
    this.runs.push({ milliseconds, run });
    return () => undefined;
  }
}

const NOTICE = { id: 'n1', kind: 'support.answered', params: { number: '7' }, link: '/support/requests/r', createdAt: '2026-09-25T10:00:00Z', read: false };

async function settle(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

function setUp(options: NotificationOptions = {}, unread = 3): { http: HttpTestingController; bell: NotificationBell; schedule: ManualSchedule } {
  const schedule = new ManualSchedule();
  TestBed.configureTestingModule({
    providers: [provideHttpClient(), provideHttpClientTesting(), { provide: BELL_SCHEDULE, useValue: schedule }, provideNotifications(options)],
  });
  const http = TestBed.inject(HttpTestingController);
  const bell = TestBed.inject(NotificationBell);
  http.match((request) => request.url.endsWith('/unread')).forEach((request) => request.flush({ count: unread }));
  return { http, bell, schedule };
}

afterEach(() => {
  TestBed.resetTestingModule();
});

// REQ-NOTIFICATIONS-005
describe('колокольчик', () => {
  it('число непрочитанного — при запуске и раз в минуту; без входа — ноль', async () => {
    const { http, bell, schedule } = setUp();
    await settle();
    expect(bell.unread()).toBe(3);
    expect(schedule.runs.map((one) => one.milliseconds)).toEqual([BELL_INTERVAL_MS]);
    schedule.runs[0]?.run();
    http.expectOne('/api/notifications/unread').flush({ code: 'authentication-required' }, { status: 401, statusText: 'Unauthorized' });
    await settle();
    expect(bell.unread()).toBe(0);
    expect(bell.empty()).toBe(true);
  });

  it('по щелчку — последние уведомления с объявленным пределом', async () => {
    const { http, bell } = setUp({ limit: 5 });
    expect(bell.items()).toBeNull();
    const opened = bell.open();
    http.expectOne('/api/notifications?limit=5').flush({ items: [NOTICE], unread: 1 });
    await opened;
    expect(bell.items()).toEqual([NOTICE]);
    expect(bell.unread()).toBe(1);
  });

  it('прочтение одного отмечает его и перечитывает число; прочтение всех — ноль', async () => {
    const { http, bell } = setUp();
    const opened = bell.open();
    http.expectOne('/api/notifications?limit=20').flush({ items: [NOTICE, { ...NOTICE, id: 'n2' }], unread: 2 });
    await opened;
    const read = bell.read('n1');
    http.expectOne({ method: 'POST', url: '/api/notifications/n1/read' }).flush(null);
    await settle();
    http.expectOne('/api/notifications/unread').flush({ count: 1 });
    await read;
    expect(bell.items()?.map((one) => one.read)).toEqual([true, false]);
    expect(bell.unread()).toBe(1);
    const all = bell.readAll();
    http.expectOne({ method: 'POST', url: '/api/notifications/read-all' }).flush(null);
    await all;
    expect(bell.items()?.every((one) => one.read)).toBe(true);
    expect(bell.unread()).toBe(0);
  });

  it('предел списка объявляется от 1 до 50', () => {
    expect(() => provideNotifications({ limit: 0 })).toThrowError(/limit 0/);
    expect(() => provideNotifications({ limit: 51 })).toThrowError(/limit 51/);
  });

  it('свой адрес точек', async () => {
    const { http, bell } = setUp({ base: '/svc/bell' });
    const opened = bell.open();
    http.expectOne('/svc/bell?limit=20').flush({ items: [], unread: 0 });
    await opened;
    http.verify();
  });
});
