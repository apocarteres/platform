import { HttpClient, HttpErrorResponse, HttpParams } from '@angular/common/http';
import {
  DOCUMENT, Injectable, InjectionToken, computed, inject, makeEnvironmentProviders, provideEnvironmentInitializer, signal,
} from '@angular/core';
import type { EnvironmentProviders, Signal, Type } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import type {
  AnswerLink, AuthorView, JournalEntry, Message, OperatorView, Page, Policy, RequestState, Snapshot, StateChange, Submission,
  Submitted, Unread,
} from './contract';

// REQ-SUPPORT-014
export interface JournalSource {
  entries(): readonly unknown[];
}

// REQ-SUPPORT-014
export const NO_JOURNAL: Type<JournalSource> = class NoJournal implements JournalSource {
  entries(): readonly unknown[] {
    return [];
  }
};

// REQ-SUPPORT-014
export interface SupportOptions {
  readonly journal: Type<JournalSource>;
  readonly base?: string;
  readonly clientVersion?: string;
}

// REQ-SUPPORT-008
export const UNREAD_INTERVAL_MS = 60 * 1000;

// REQ-SUPPORT-008, REQ-TYPESCRIPT-CLOCK-002
export interface SupportSchedule {
  every(milliseconds: number, run: () => void): () => void;
}

// REQ-SUPPORT-008
export const SUPPORT_SCHEDULE = new InjectionToken<SupportSchedule>('SUPPORT_SCHEDULE', {
  providedIn: 'root',
  factory: () => {
    const view = inject(DOCUMENT).defaultView;
    return {
      every: (milliseconds, run) => {
        if (view === null) return () => undefined;
        const handle = view.setInterval(run, milliseconds);
        return () => view.clearInterval(handle);
      },
    };
  },
});

// REQ-SUPPORT-014
export interface NewRequest {
  readonly message: string;
  readonly email?: string;
  readonly files?: readonly Blob[];
}

interface Resolved {
  readonly base: string;
  readonly clientVersion: string | null;
  readonly journal: Type<JournalSource>;
}

const OPTIONS = new InjectionToken<Resolved>('SUPPORT_OPTIONS');

const ORIGIN = /^(?:[a-z][a-z0-9+.-]*:)?\/\/[^/?#]*/i;

// REQ-SUPPORT-006, REQ-CLIENT-JOURNAL-005
export function barePath(url: string): string {
  const path = url.replace(ORIGIN, '').split(/[?#]/, 1)[0] ?? '';
  return path.length === 0 ? '/' : path;
}

// REQ-SUPPORT-005
export function refusedFiles(files: readonly Blob[], policy: Policy): readonly Blob[] {
  return files.filter((file, index) => index >= policy.attachments || file.size > policy.attachmentBytes
    || !policy.attachmentTypes.includes(file.type));
}

// REQ-SUPPORT-008
@Injectable()
export class SupportUnread {
  private readonly http = inject(HttpClient);
  private readonly base = inject(OPTIONS).base;
  private readonly counts = signal<Unread>({ mine: 0, operator: null });

  readonly mine: Signal<number> = computed(() => this.counts().mine);
  readonly operator: Signal<number | null> = computed(() => this.counts().operator ?? null);

  async refresh(): Promise<void> {
    try {
      this.counts.set(await firstValueFrom(this.http.get<Unread>(`${this.base}/unread`)));
    } catch (failure) {
      if (signedOutFailure(failure)) {
        this.counts.set({ mine: 0, operator: null });
        return;
      }
      throw failure;
    }
  }
}

// REQ-SUPPORT-001, REQ-SUPPORT-004, REQ-SUPPORT-006, REQ-SUPPORT-012
@Injectable()
export class SupportDesk {
  private readonly http = inject(HttpClient);
  private readonly options = inject(OPTIONS);
  private readonly journal = inject(this.options.journal);
  private readonly unread = inject(SupportUnread);
  private readonly document = inject(DOCUMENT);

  policy(): Promise<Policy> {
    return firstValueFrom(this.http.get<Policy>(`${this.options.base}/policy`));
  }

  // REQ-SUPPORT-001, REQ-SUPPORT-006
  submit(request: NewRequest): Promise<Submitted> {
    const body: Submission = {
      message: request.message,
      email: request.email ?? null,
      snapshot: this.snapshot(),
      journal: this.journal.entries() as readonly JournalEntry[],
    };
    const form = new FormData();
    form.append('request', new Blob([JSON.stringify(body)], { type: 'application/json' }));
    for (const file of request.files ?? []) form.append('files', file);
    return firstValueFrom(this.http.post<Submitted>(`${this.options.base}/requests`, form));
  }

  mine(page = 0, size = 20): Promise<Page> {
    return firstValueFrom(this.http.get<Page>(`${this.options.base}/requests`, { params: paging(page, size) }));
  }

  request(id: string): Promise<AuthorView> {
    return firstValueFrom(this.http.get<AuthorView>(`${this.options.base}/requests/${id}`));
  }

  write(id: string, text: string): Promise<AuthorView> {
    const body: Message = { text };
    return firstValueFrom(this.http.post<AuthorView>(`${this.options.base}/requests/${id}/messages`, body));
  }

  // REQ-SUPPORT-008
  async seen(id: string): Promise<void> {
    await firstValueFrom(this.http.post(`${this.options.base}/requests/${id}/seen`, {}));
    await this.unread.refresh();
  }

  fileUrl(id: string, file: string): string {
    return `${this.options.base}/requests/${id}/files/${file}`;
  }

  // REQ-SUPPORT-004
  answer(token: string): Promise<AuthorView> {
    const body: AnswerLink = { token };
    return firstValueFrom(this.http.post<AuthorView>(`${this.options.base}/answer`, body));
  }

  // REQ-SUPPORT-006
  private snapshot(): Snapshot {
    const view = this.document.defaultView;
    return {
      version: this.options.clientVersion,
      page: view === null ? null : barePath(view.location.href),
      language: view?.navigator.language ?? null,
      width: view?.innerWidth ?? null,
      height: view?.innerHeight ?? null,
      agent: view?.navigator.userAgent ?? null,
    };
  }
}

// REQ-SUPPORT-007, REQ-SUPPORT-012
@Injectable()
export class SupportOperator {
  private readonly http = inject(HttpClient);
  private readonly base = `${inject(OPTIONS).base}/operator/requests`;
  private readonly unread = inject(SupportUnread);

  list(state: RequestState | null = null, page = 0, size = 20): Promise<Page> {
    let params = paging(page, size);
    if (state !== null) params = params.set('state', state);
    return firstValueFrom(this.http.get<Page>(this.base, { params }));
  }

  request(id: string): Promise<OperatorView> {
    return firstValueFrom(this.http.get<OperatorView>(`${this.base}/${id}`));
  }

  answer(id: string, text: string): Promise<OperatorView> {
    const body: Message = { text };
    return firstValueFrom(this.http.post<OperatorView>(`${this.base}/${id}/messages`, body));
  }

  change(id: string, state: RequestState): Promise<OperatorView> {
    const body: StateChange = { state };
    return firstValueFrom(this.http.post<OperatorView>(`${this.base}/${id}/state`, body));
  }

  // REQ-SUPPORT-008
  async seen(id: string): Promise<void> {
    await firstValueFrom(this.http.post(`${this.base}/${id}/seen`, {}));
    await this.unread.refresh();
  }

  fileUrl(id: string, file: string): string {
    return `${this.base}/${id}/files/${file}`;
  }
}

// REQ-SUPPORT-014
export function provideSupport(options: SupportOptions): EnvironmentProviders {
  if ((options as { journal?: unknown }).journal === undefined) {
    throw new Error('provideSupport: journal не объявлен — ClientJournal из @apocarteres/client-journal или NO_JOURNAL');
  }
  const resolved: Resolved = {
    base: options.base ?? '/api/support',
    clientVersion: options.clientVersion ?? null,
    journal: options.journal,
  };
  return makeEnvironmentProviders([
    { provide: OPTIONS, useValue: resolved },
    ...(options.journal === NO_JOURNAL ? [NO_JOURNAL] : []),
    SupportUnread,
    SupportDesk,
    SupportOperator,
    provideEnvironmentInitializer(() => {
      const unread = inject(SupportUnread);
      const poll = (): void => void unread.refresh().catch(() => undefined);
      inject(SUPPORT_SCHEDULE).every(UNREAD_INTERVAL_MS, poll);
      poll();
    }),
  ]);
}

function paging(page: number, size: number): HttpParams {
  return new HttpParams().set('page', page).set('size', size);
}

// REQ-API-003
function signedOutFailure(failure: unknown): boolean {
  if (failure instanceof HttpErrorResponse) return failure.status === 401;
  if (failure === null || typeof failure !== 'object') return false;
  const problem = (failure as Record<string, unknown>)['problem'];
  return problem !== null && typeof problem === 'object' && (problem as Record<string, unknown>)['status'] === 401;
}
