import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Injectable } from '@angular/core';
import type { Type } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Policy } from './contract';
import {
  NO_JOURNAL, SUPPORT_SCHEDULE, SupportDesk, SupportOperator, SupportUnread, UNREAD_INTERVAL_MS, barePath, provideSupport,
  refusedFiles,
} from './support';
import type { JournalSource, SupportOptions } from './support';

@Injectable({ providedIn: 'root' })
class FakeJournal implements JournalSource {
  entries(): readonly unknown[] {
    return [{ at: '2026-09-25T10:00:00.000Z', kind: 'navigation', path: '/a' }];
  }
}

class ManualSchedule {
  readonly runs: { milliseconds: number; run: () => void }[] = [];

  every(milliseconds: number, run: () => void): () => void {
    this.runs.push({ milliseconds, run });
    return () => undefined;
  }
}

function setUp(journal: Type<JournalSource> = FakeJournal, extra: Partial<SupportOptions> = {}): {
  backend: HttpTestingController; schedule: ManualSchedule;
} {
  const schedule = new ManualSchedule();
  TestBed.configureTestingModule({
    providers: [
      provideHttpClient(),
      provideHttpClientTesting(),
      { provide: SUPPORT_SCHEDULE, useValue: schedule },
      provideSupport({ journal, clientVersion: '1.2.3', ...extra }),
    ],
  });
  const backend = TestBed.inject(HttpTestingController);
  TestBed.inject(SupportUnread);
  backend.match((request) => request.url.endsWith('/unread')).forEach((request) => request.flush({ mine: 0, operator: null }));
  return { backend, schedule };
}

async function settle(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

function partText(part: FormDataEntryValue | null): Promise<string> {
  if (typeof part === 'string' || part === null) return Promise.resolve(String(part));
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : '');
    reader.readAsText(part);
  });
}

class RecordingForm {
  readonly parts: [string, unknown][] = [];

  append(name: string, value: unknown): void {
    this.parts.push([name, value]);
  }

  get(name: string): FormDataEntryValue | null {
    return (this.parts.find(([key]) => key === name)?.[1] ?? null) as FormDataEntryValue | null;
  }

  getAll(name: string): unknown[] {
    return this.parts.filter(([key]) => key === name).map(([, value]) => value);
  }
}

const REAL_FORM = globalThis.FormData;

beforeEach(() => {
  globalThis.FormData = RecordingForm as unknown as typeof FormData;
});

afterEach(() => {
  globalThis.FormData = REAL_FORM;
  TestBed.resetTestingModule();
  globalThis.history.replaceState(null, '', '/');
});

// REQ-SUPPORT-014
describe('объявление', () => {
  it('журнал объявляется явно: ClientJournal или NO_JOURNAL; молчание отказывает при объявлении', () => {
    expect(() => provideSupport({} as SupportOptions)).toThrowError(/journal не объявлен/);
  });

  it('NO_JOURNAL отправляет пустой журнал', async () => {
    const { backend } = setUp(NO_JOURNAL);
    const sent = TestBed.inject(SupportDesk).submit({ message: 'вопрос' });
    const request = backend.expectOne('/api/support/requests');
    const body = JSON.parse(await partText((request.request.body as FormData).get('request'))) as { journal: unknown[] };
    expect(body.journal).toEqual([]);
    request.flush({ id: 'r', number: 1 });
    await sent;
  });
});

// REQ-SUPPORT-001, REQ-SUPPORT-006
describe('отправка обращения', () => {
  it('часть request несёт текст, почту, снимок без строки запроса и журнал; файлы — частями files', async () => {
    globalThis.history.replaceState(null, '', '/reset?token=Zk3p_Qe9-Lm2Xc7Vb4Nq#part');
    const { backend } = setUp();
    const file = new Blob([new Uint8Array([0x89, 0x50])], { type: 'image/png' });
    const sent = TestBed.inject(SupportDesk).submit({ message: 'не могу войти', email: 'guest@mail.example', files: [file] });
    const request = backend.expectOne('/api/support/requests');
    expect(request.request.method).toBe('POST');
    const form = request.request.body as FormData;
    const part = form.get('request');
    expect((part as Blob).type).toBe('application/json');
    const body = JSON.parse(await partText(part)) as {
      message: string; email: string; snapshot: { page: string; version: string }; journal: unknown[];
    };
    expect(body.message).toBe('не могу войти');
    expect(body.email).toBe('guest@mail.example');
    expect(body.snapshot.page).toBe('/reset');
    expect(body.snapshot.version).toBe('1.2.3');
    expect(body.journal).toHaveLength(1);
    expect(form.getAll('files')).toHaveLength(1);
    request.flush({ id: 'r', number: 7 });
    expect(await sent).toEqual({ id: 'r', number: 7 });
  });
});

// REQ-SUPPORT-006, REQ-CLIENT-JOURNAL-005
describe('путь страницы', () => {
  it('выделяется по общим примерам журнала клиента', () => {
    const vectors = JSON.parse(readFileSync(path.resolve(process.cwd(), '../client-journal/masking-vectors.json'), 'utf8')) as {
      paths: { url: string; path: string }[];
    };
    for (const { url, path: bare } of vectors.paths) expect(barePath(url), url).toBe(bare);
  });
});

// REQ-SUPPORT-005
describe('вложения', () => {
  it('отклоняет лишние, большие и не картинки до отправки', () => {
    const policy: Policy = { messageChars: 4000, attachments: 2, attachmentBytes: 4, attachmentTypes: ['image/png', 'image/jpeg'], guestIntake: true };
    const good = new Blob([new Uint8Array(3)], { type: 'image/png' });
    const big = new Blob([new Uint8Array(5)], { type: 'image/jpeg' });
    const gif = new Blob([new Uint8Array(1)], { type: 'image/gif' });
    const third = new Blob([new Uint8Array(1)], { type: 'image/png' });
    expect(refusedFiles([good, big, third], policy)).toEqual([big, third]);
    expect(refusedFiles([gif], policy)).toEqual([gif]);
  });
});

// REQ-SUPPORT-008
describe('счётчики нового', () => {
  it('спрашиваются при запуске и раз в минуту; без входа — нули', async () => {
    const schedule = new ManualSchedule();
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), { provide: SUPPORT_SCHEDULE, useValue: schedule },
        provideSupport({ journal: NO_JOURNAL })],
    });
    const backend = TestBed.inject(HttpTestingController);
    const unread = TestBed.inject(SupportUnread);
    backend.expectOne('/api/support/unread').flush({ mine: 2, operator: 5 });
    await settle();
    expect(unread.mine()).toBe(2);
    expect(unread.operator()).toBe(5);
    expect(schedule.runs.map((run) => run.milliseconds)).toEqual([UNREAD_INTERVAL_MS]);
    schedule.runs[0]?.run();
    backend.expectOne('/api/support/unread').flush({ code: 'authentication-required' }, { status: 401, statusText: 'Unauthorized' });
    await settle();
    expect(unread.mine()).toBe(0);
    expect(unread.operator()).toBeNull();
  });

  it('просмотр обращения сразу перечитывает счётчики', async () => {
    const { backend } = setUp();
    const seen = TestBed.inject(SupportDesk).seen('r');
    backend.expectOne({ method: 'POST', url: '/api/support/requests/r/seen' }).flush(null);
    await settle();
    backend.expectOne('/api/support/unread').flush({ mine: 0, operator: null });
    await seen;
    const operatorSeen = TestBed.inject(SupportOperator).seen('r');
    backend.expectOne({ method: 'POST', url: '/api/support/operator/requests/r/seen' }).flush(null);
    await settle();
    backend.expectOne('/api/support/unread').flush({ mine: 0, operator: 0 });
    await operatorSeen;
  });
});

// REQ-SUPPORT-004, REQ-SUPPORT-007, REQ-SUPPORT-012
describe('точки центра', () => {
  it('автор, ответ по ссылке и оператор ходят в свои точки', () => {
    const { backend } = setUp(NO_JOURNAL, { base: '/svc/support' });
    const desk = TestBed.inject(SupportDesk);
    const operator = TestBed.inject(SupportOperator);
    void desk.mine(1, 10);
    backend.expectOne('/svc/support/requests?page=1&size=10').flush({ items: [], page: 1, size: 10, total: 0 });
    void desk.write('r', 'ещё');
    const write = backend.expectOne('/svc/support/requests/r/messages');
    expect(write.request.body).toEqual({ text: 'ещё' });
    write.flush({});
    void desk.answer('tok');
    const answer = backend.expectOne('/svc/support/answer');
    expect(answer.request.body).toEqual({ token: 'tok' });
    answer.flush({});
    void operator.list('NEW');
    backend.expectOne('/svc/support/operator/requests?page=0&size=20&state=NEW').flush({ items: [], page: 0, size: 20, total: 0 });
    void operator.change('r', 'CLOSED');
    const change = backend.expectOne('/svc/support/operator/requests/r/state');
    expect(change.request.body).toEqual({ state: 'CLOSED' });
    change.flush({});
    void operator.answer('r', 'ответ');
    backend.expectOne('/svc/support/operator/requests/r/messages').flush({});
    expect(desk.fileUrl('r', 'f')).toBe('/svc/support/requests/r/files/f');
    expect(operator.fileUrl('r', 'f')).toBe('/svc/support/operator/requests/r/files/f');
    backend.verify();
  });
});
