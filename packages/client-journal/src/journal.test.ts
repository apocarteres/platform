import { HttpClient, HttpErrorResponse, provideHttpClient, withInterceptors } from '@angular/common/http';
import type { HttpInterceptorFn } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Component, ErrorHandler, Injectable } from '@angular/core';
import type { EnvironmentProviders, Provider } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { catchError, firstValueFrom, throwError } from 'rxjs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { JOURNAL_CLOCK } from './clock';
import type { JournalClock } from './clock';
import {
  ClientJournal, JOURNAL_STORAGE, JOURNAL_STORAGE_KEY, JournalErrorHandler, MESSAGE_LIMIT, clientJournalInterceptor,
  provideClientJournal,
} from './journal';
import type { ClientJournalOptions, JournalEntry } from './journal';

const MOMENT = Date.parse('2026-09-24T10:00:00.000Z');

// REQ-TYPESCRIPT-CLOCK-004
class FixedClock implements JournalClock {
  now = MOMENT;

  instant(): number {
    return this.now;
  }

  date(): Date {
    return new Date(this.now);
  }
}

class MemoryStorage implements Storage {
  readonly values = new Map<string, string>();
  refuse = false;

  get length(): number {
    return this.values.size;
  }

  clear(): void {
    this.values.clear();
  }

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  key(index: number): string | null {
    return [...this.values.keys()][index] ?? null;
  }

  removeItem(key: string): void {
    this.values.delete(key);
  }

  setItem(key: string, value: string): void {
    if (this.refuse) throw new DOMException('quota', 'QuotaExceededError');
    this.values.set(key, value);
  }
}

@Component({ template: '' })
class Page {}

interface Setup {
  readonly options?: ClientJournalOptions;
  readonly storage?: Storage | null;
  readonly interceptors?: HttpInterceptorFn[];
  readonly extra?: (Provider | EnvironmentProviders)[];
}

function setUp(setup: Setup = {}): { journal: ClientJournal; http: HttpClient; backend: HttpTestingController; clock: FixedClock; storage: Storage | null } {
  const clock = new FixedClock();
  const storage = setup.storage === undefined ? new MemoryStorage() : setup.storage;
  TestBed.configureTestingModule({
    providers: [
      provideHttpClient(withInterceptors([clientJournalInterceptor, ...(setup.interceptors ?? [])])),
      provideHttpClientTesting(),
      provideRouter([{ path: 'a', component: Page }, { path: 'old', redirectTo: 'a' }]),
      { provide: JOURNAL_CLOCK, useValue: clock },
      { provide: JOURNAL_STORAGE, useValue: storage },
      provideClientJournal(setup.options),
      ...(setup.extra ?? []),
    ],
  });
  return {
    journal: TestBed.inject(ClientJournal),
    http: TestBed.inject(HttpClient),
    backend: TestBed.inject(HttpTestingController),
    clock,
    storage,
  };
}

afterEach(() => {
  TestBed.resetTestingModule();
  vi.restoreAllMocks();
});

// REQ-CLIENT-JOURNAL-001
describe('объявление', () => {
  it('недопустимая настройка отказывает при объявлении и называет её', () => {
    expect(() => provideClientJournal({ storageKey: '' })).toThrowError(/storageKey/);
    expect(() => provideClientJournal({ limitBytes: 1000 })).toThrowError(/limitBytes 1000/);
    expect(() => provideClientJournal({ limitBytes: 5000.5 })).toThrowError(/limitBytes/);
    expect(() => provideClientJournal({ skip: ['api/support'] })).toThrowError(/skip .*api\/support/);
  });

  it('умолчания: ключ ядра, предел 128 КБ, без исключений', async () => {
    const { journal, http, backend, storage } = setUp();
    const call = firstValueFrom(http.get('/api/items'));
    backend.expectOne('/api/items').flush({});
    await call;
    expect(storage?.getItem(JOURNAL_STORAGE_KEY)).not.toBeNull();
    expect(journal.entries()).toHaveLength(1);
  });
});

// REQ-CLIENT-JOURNAL-002, REQ-CLIENT-JOURNAL-003, REQ-CLIENT-JOURNAL-010
describe('сетевой вызов', () => {
  it('пишет метод, путь, статус и длительность по часам журнала, без строки запроса и источника', async () => {
    const { journal, http, backend, clock } = setUp();
    const call = firstValueFrom(http.post('https://example.org/api/items?page=2#top', { secret: 'тело' }, { headers: { 'X-Secret': 'заголовок' } }));
    const request = backend.expectOne('https://example.org/api/items?page=2#top');
    clock.now = MOMENT + 250;
    request.flush({ answer: 'ответ' }, { status: 201, statusText: 'Created' });
    await call;
    expect(journal.entries()).toEqual([
      { kind: 'request', method: 'POST', path: '/api/items', status: 201, durationMs: 250, at: '2026-09-24T10:00:00.250Z' },
    ]);
  });

  it('отказ пишется со статусом и кодом ошибки ядра, вызов без ответа — со статусом 0', async () => {
    const { journal, http, backend } = setUp();
    const refused = firstValueFrom(http.get('/api/items/7')).catch((failure: unknown) => failure);
    backend.expectOne('/api/items/7').flush({ code: 'item-missing', status: 404 }, { status: 404, statusText: 'Not Found' });
    expect(await refused).toBeInstanceOf(HttpErrorResponse);
    const lost = firstValueFrom(http.get('/api/items/8')).catch((failure: unknown) => failure);
    backend.expectOne('/api/items/8').error(new ProgressEvent('error'));
    await lost;
    expect(journal.entries().map(({ status, code }) => ({ status, code }))).toEqual([
      { status: 404, code: 'item-missing' },
      { status: 0, code: undefined },
    ]);
  });

  it('отказ, уже разобранный в ошибку ядра внутренним перехватчиком, сохраняет статус и код', async () => {
    const parsed: HttpInterceptorFn = (request, next) => next(request).pipe(
      catchError((failure: HttpErrorResponse) => throwError(() => ({ problem: { status: failure.status, code: 'conflict' } }))),
    );
    const { journal, http, backend } = setUp({ interceptors: [parsed] });
    const refused = firstValueFrom(http.get('/api/items')).catch((failure: unknown) => failure);
    backend.expectOne('/api/items').flush('', { status: 409, statusText: 'Conflict' });
    await refused;
    expect(journal.entries()[0]).toMatchObject({ status: 409, code: 'conflict' });
  });
});

// REQ-CLIENT-JOURNAL-002, REQ-CLIENT-JOURNAL-003
describe('переход', () => {
  it('пишет путь после перенаправления, без строки запроса', async () => {
    const { journal } = setUp();
    await TestBed.inject(Router).navigateByUrl('/old?token=Zk3p');
    expect(journal.entries()).toEqual([{ kind: 'navigation', path: '/a', at: '2026-09-24T10:00:00.000Z' }]);
  });
});

// REQ-CLIENT-JOURNAL-004
describe('маскирование до записи', () => {
  it('в хранилище не попадают почта, маркеры и телефоны', async () => {
    const { journal, http, backend, storage } = setUp();
    const call = firstValueFrom(http.get('/api/accounts/ivan@example.org/Zk3p_Qe9-Lm2Xc7Vb4Nq'));
    backend.expectOne(() => true).flush({});
    await call;
    journal.record({ kind: 'error', message: 'Error: звонить +7 (900) 123-45-67' });
    const raw = storage?.getItem(JOURNAL_STORAGE_KEY) ?? '';
    expect(raw).not.toMatch(/ivan|Zk3p|900/);
    expect(journal.entries().map((entry) => entry.path ?? entry.message)).toEqual(['/api/accounts/***/***', 'Error: звонить ***']);
  });

  it('сообщение укорачивается до предела после маскирования', () => {
    const { journal } = setUp();
    journal.record({ kind: 'error', message: `${'я'.repeat(MESSAGE_LIMIT - 4)} ivan@example.org` });
    expect(journal.entries()[0]?.message).toBe(`${'я'.repeat(MESSAGE_LIMIT - 4)} ***`);
    journal.record({ kind: 'error', message: 'я'.repeat(MESSAGE_LIMIT * 2) });
    expect(journal.entries()[1]?.message).toHaveLength(MESSAGE_LIMIT);
  });
});

// REQ-CLIENT-JOURNAL-006
describe('хранение', () => {
  it('журнал переживает перезагрузку: новый экземпляр читает то же хранилище вкладки', () => {
    const storage = new MemoryStorage();
    setUp({ storage }).journal.record({ kind: 'error', message: 'Error: до перезагрузки' });
    TestBed.resetTestingModule();
    expect(setUp({ storage }).journal.entries().map((entry) => entry.message)).toEqual(['Error: до перезагрузки']);
  });

  it('держится в пределе, вытесняя самые старые записи', () => {
    const storage = new MemoryStorage();
    const { journal } = setUp({ storage, options: { limitBytes: 4096 } });
    for (let index = 0; index < 200; index += 1) journal.record({ kind: 'error', message: `Error: запись ${index}` });
    const raw = storage.getItem(JOURNAL_STORAGE_KEY) ?? '';
    expect(new TextEncoder().encode(raw).length).toBeLessThanOrEqual(4096);
    const messages = journal.entries().map((entry) => entry.message);
    expect(messages.at(-1)).toBe('Error: запись 199');
    expect(messages).not.toContain('Error: запись 0');
    expect(messages.length).toBeGreaterThan(10);
  });

  it('отказ хранилища не ломает клиент', async () => {
    const storage = new MemoryStorage();
    storage.refuse = true;
    const { journal, http, backend } = setUp({ storage });
    const call = firstValueFrom(http.get('/api/items'));
    backend.expectOne('/api/items').flush({ ok: true });
    expect(await call).toEqual({ ok: true });
    expect(journal.entries()).toEqual([]);
  });

  it('без хранилища журнал пуст и не отказывает', () => {
    const { journal } = setUp({ storage: null });
    journal.record({ kind: 'error', message: 'Error: x' });
    expect(journal.entries()).toEqual([]);
    expect(() => journal.clear()).not.toThrow();
  });

  it('повреждённое содержимое читается пустым, записи чужой формы отбрасываются', () => {
    const storage = new MemoryStorage();
    const { journal } = setUp({ storage });
    storage.values.set(JOURNAL_STORAGE_KEY, '{не json');
    expect(journal.entries()).toEqual([]);
    const kept: JournalEntry = { at: '2026-09-24T10:00:00.000Z', kind: 'navigation', path: '/a' };
    storage.values.set(JOURNAL_STORAGE_KEY, JSON.stringify([kept, { at: 1, kind: 'error' }, { at: 'x', kind: 'other' }, null, 'строка']));
    expect(journal.entries()).toEqual([kept]);
  });
});

// REQ-CLIENT-JOURNAL-007
describe('исключённые пути', () => {
  it('исключает путь по целым сегментам', async () => {
    const { journal, http, backend } = setUp({ options: { skip: ['/api/support'] } });
    for (const url of ['/api/support', '/api/support/requests?x=1', '/api/supportive']) {
      const call = firstValueFrom(http.get(url));
      backend.expectOne(url).flush({});
      await call;
    }
    expect(journal.entries().map((entry) => entry.path)).toEqual(['/api/supportive']);
  });
});

// REQ-CLIENT-JOURNAL-008
describe('необработанная ошибка', () => {
  it('записывается и передаётся стандартному обработчику', () => {
    const console = vi.spyOn(globalThis.console, 'error').mockImplementation(() => undefined);
    setUp();
    const failure = new TypeError('x is undefined');
    TestBed.inject(ErrorHandler).handleError(failure);
    expect(TestBed.inject(ClientJournal).entries()).toMatchObject([{ kind: 'error', message: 'TypeError: x is undefined' }]);
    expect(console).toHaveBeenCalled();
  });

  it('наследник, объявленный после журнала, заменяет обработчик и пишет в журнал', () => {
    const seen: unknown[] = [];
    @Injectable()
    class ProjectHandler extends JournalErrorHandler {
      override handleError(error: unknown): void {
        seen.push(error);
        super.handleError(error);
      }
    }
    vi.spyOn(globalThis.console, 'error').mockImplementation(() => undefined);
    setUp({ extra: [{ provide: ErrorHandler, useClass: ProjectHandler }] });
    TestBed.inject(ErrorHandler).handleError('строка');
    expect(seen).toEqual(['строка']);
    expect(TestBed.inject(ClientJournal).entries()).toMatchObject([{ kind: 'error', message: 'строка' }]);
  });
});

// REQ-CLIENT-JOURNAL-009
describe('выдача', () => {
  it('записи отдаются проекту, а clear очищает журнал', () => {
    const { journal, storage } = setUp();
    journal.record({ kind: 'error', message: 'Error: x' });
    expect(journal.entries()).toHaveLength(1);
    journal.clear();
    expect(journal.entries()).toEqual([]);
    expect(storage?.getItem(JOURNAL_STORAGE_KEY)).toBeNull();
  });
});
