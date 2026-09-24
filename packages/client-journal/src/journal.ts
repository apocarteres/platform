import { HttpErrorResponse, HttpResponse } from '@angular/common/http';
import type { HttpInterceptorFn } from '@angular/common/http';
import {
  DOCUMENT, ErrorHandler, Injectable, InjectionToken, inject, makeEnvironmentProviders, provideEnvironmentInitializer,
} from '@angular/core';
import type { EnvironmentProviders } from '@angular/core';
import { NavigationEnd, Router } from '@angular/router';
import { tap } from 'rxjs';
import { JOURNAL_CLOCK } from './clock';
import { barePath, masked } from './masking';

// REQ-CLIENT-JOURNAL-002
export type JournalKind = 'request' | 'navigation' | 'error';

// REQ-CLIENT-JOURNAL-002
export interface JournalEntry {
  readonly at: string;
  readonly kind: JournalKind;
  readonly method?: string;
  readonly path?: string;
  readonly status?: number;
  readonly durationMs?: number;
  readonly code?: string;
  readonly message?: string;
}

// REQ-CLIENT-JOURNAL-001
export interface ClientJournalOptions {
  readonly storageKey?: string;
  readonly limitBytes?: number;
  readonly skip?: readonly string[];
}

// REQ-CLIENT-JOURNAL-001
export const JOURNAL_STORAGE_KEY = 'apcr.client-journal';

// REQ-CLIENT-JOURNAL-001
export const JOURNAL_LIMIT_BYTES = 128 * 1024;

// REQ-CLIENT-JOURNAL-001
const SMALLEST_LIMIT_BYTES = 4 * 1024;

// REQ-CLIENT-JOURNAL-002
export const MESSAGE_LIMIT = 1024;

const KINDS: ReadonlySet<string> = new Set<JournalKind>(['request', 'navigation', 'error']);

const OPTIONS = new InjectionToken<Required<ClientJournalOptions>>('CLIENT_JOURNAL_OPTIONS');

// REQ-CLIENT-JOURNAL-006
export const JOURNAL_STORAGE = new InjectionToken<Storage | null>('JOURNAL_STORAGE', {
  providedIn: 'root',
  factory: () => {
    try {
      return inject(DOCUMENT).defaultView?.sessionStorage ?? null;
    } catch {
      return null;
    }
  },
});

// REQ-CLIENT-JOURNAL-001, REQ-CLIENT-JOURNAL-006, REQ-CLIENT-JOURNAL-009
@Injectable()
export class ClientJournal {
  private readonly options = inject(OPTIONS);
  private readonly clock = inject(JOURNAL_CLOCK);
  private readonly storage = inject(JOURNAL_STORAGE);
  private readonly encoder = new TextEncoder();

  entries(): JournalEntry[] {
    try {
      const raw = this.storage?.getItem(this.options.storageKey) ?? null;
      const parsed: unknown = raw === null ? [] : JSON.parse(raw);
      return Array.isArray(parsed) ? parsed.filter(isEntry) : [];
    } catch {
      return [];
    }
  }

  // REQ-CLIENT-JOURNAL-004
  record(entry: Omit<JournalEntry, 'at'>): void {
    const written: JournalEntry = {
      ...entry,
      at: this.clock.date().toISOString(),
      ...(entry.path === undefined ? {} : { path: masked(entry.path) }),
      ...(entry.message === undefined ? {} : { message: masked(entry.message).slice(0, MESSAGE_LIMIT) }),
    };
    const entries = [...this.entries(), written];
    let json = JSON.stringify(entries);
    while (entries.length > 0 && this.encoder.encode(json).length > this.options.limitBytes) {
      entries.splice(0, Math.max(1, Math.floor(entries.length / 10)));
      json = JSON.stringify(entries);
    }
    try {
      this.storage?.setItem(this.options.storageKey, json);
    } catch {
      return;
    }
  }

  clear(): void {
    try {
      this.storage?.removeItem(this.options.storageKey);
    } catch {
      return;
    }
  }

  // REQ-CLIENT-JOURNAL-007
  skips(path: string): boolean {
    return this.options.skip.some((skipped) => path === skipped || path.startsWith(skipped.endsWith('/') ? skipped : `${skipped}/`));
  }

  // REQ-CLIENT-JOURNAL-010
  instant(): number {
    return this.clock.instant();
  }
}

// REQ-CLIENT-JOURNAL-008
@Injectable()
export class JournalErrorHandler extends ErrorHandler {
  private readonly journal = inject(ClientJournal);

  override handleError(error: unknown): void {
    const message = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
    this.journal.record({ kind: 'error', message });
    super.handleError(error);
  }
}

// REQ-CLIENT-JOURNAL-001
export function provideClientJournal(options: ClientJournalOptions = {}): EnvironmentProviders {
  const resolved = resolve(options);
  return makeEnvironmentProviders([
    { provide: OPTIONS, useValue: resolved },
    ClientJournal,
    { provide: ErrorHandler, useClass: JournalErrorHandler },
    provideEnvironmentInitializer(() => {
      const journal = inject(ClientJournal);
      inject(Router, { optional: true })?.events.subscribe((event) => {
        if (event instanceof NavigationEnd) journal.record({ kind: 'navigation', path: barePath(event.urlAfterRedirects) });
      });
    }),
  ]);
}

// REQ-CLIENT-JOURNAL-002, REQ-CLIENT-JOURNAL-003, REQ-CLIENT-JOURNAL-007
export const clientJournalInterceptor: HttpInterceptorFn = (request, next) => {
  const journal = inject(ClientJournal, { optional: true });
  const path = barePath(request.url);
  if (journal === null || journal.skips(path)) return next(request);
  const started = journal.instant();
  const written = (status: number, code?: string): void => journal.record({
    kind: 'request', method: request.method, path, status, durationMs: journal.instant() - started, ...(code === undefined ? {} : { code }),
  });
  return next(request).pipe(tap({
    next: (event) => {
      if (event instanceof HttpResponse) written(event.status);
    },
    error: (failure: unknown) => {
      const { status, code } = failureOf(failure);
      written(status, code);
    },
  }));
};

// REQ-CLIENT-JOURNAL-002
function failureOf(failure: unknown): { status: number; code?: string } {
  if (failure instanceof HttpErrorResponse) return { status: failure.status, code: codeOf(failure.error) };
  if (failure !== null && typeof failure === 'object') {
    const problem = (failure as Record<string, unknown>)['problem'];
    if (problem !== null && typeof problem === 'object') {
      const status = (problem as Record<string, unknown>)['status'];
      return { status: typeof status === 'number' ? status : 0, code: codeOf(problem) };
    }
  }
  return { status: 0 };
}

function codeOf(body: unknown): string | undefined {
  if (body === null || typeof body !== 'object') return undefined;
  const code = (body as Record<string, unknown>)['code'];
  return typeof code === 'string' && code.length > 0 ? code : undefined;
}

function isEntry(value: unknown): value is JournalEntry {
  if (value === null || typeof value !== 'object') return false;
  const entry = value as Record<string, unknown>;
  return typeof entry['at'] === 'string' && typeof entry['kind'] === 'string' && KINDS.has(entry['kind']);
}

// REQ-CLIENT-JOURNAL-001
function resolve(options: ClientJournalOptions): Required<ClientJournalOptions> {
  const storageKey = options.storageKey ?? JOURNAL_STORAGE_KEY;
  const limitBytes = options.limitBytes ?? JOURNAL_LIMIT_BYTES;
  const skip = options.skip ?? [];
  if (storageKey.length === 0) throw new Error('provideClientJournal: storageKey пуст');
  if (!Number.isInteger(limitBytes) || limitBytes < SMALLEST_LIMIT_BYTES) {
    throw new Error(`provideClientJournal: limitBytes ${String(limitBytes)} недопустим — целое число не меньше ${SMALLEST_LIMIT_BYTES}`);
  }
  const relative = skip.filter((path) => !path.startsWith('/'));
  if (relative.length > 0) throw new Error(`provideClientJournal: skip — путь не от корня: ${relative.join(', ')}`);
  return { storageKey, limitBytes, skip };
}
