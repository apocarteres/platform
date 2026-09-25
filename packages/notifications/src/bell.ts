import { HttpClient, HttpErrorResponse, HttpParams } from '@angular/common/http';
import {
  DOCUMENT, Injectable, InjectionToken, computed, inject, makeEnvironmentProviders, provideEnvironmentInitializer, signal,
} from '@angular/core';
import type { EnvironmentProviders, Signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import type { Bell, Notice, Unread } from './contract';

// REQ-NOTIFICATIONS-005
export interface NotificationOptions {
  readonly base?: string;
  readonly limit?: number;
}

// REQ-NOTIFICATIONS-005
export const BELL_INTERVAL_MS = 60 * 1000;

// REQ-NOTIFICATIONS-005, REQ-TYPESCRIPT-CLOCK-002
export interface BellSchedule {
  every(milliseconds: number, run: () => void): () => void;
}

// REQ-NOTIFICATIONS-005
export const BELL_SCHEDULE = new InjectionToken<BellSchedule>('BELL_SCHEDULE', {
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

const OPTIONS = new InjectionToken<Required<NotificationOptions>>('NOTIFICATION_OPTIONS');

// REQ-NOTIFICATIONS-005
@Injectable()
export class NotificationBell {
  private readonly http = inject(HttpClient);
  private readonly options = inject(OPTIONS);
  private readonly count = signal(0);
  private readonly list = signal<readonly Notice[] | null>(null);

  readonly unread: Signal<number> = this.count.asReadonly();
  readonly items: Signal<readonly Notice[] | null> = this.list.asReadonly();
  readonly empty: Signal<boolean> = computed(() => this.count() === 0);

  async refresh(): Promise<void> {
    try {
      this.count.set((await firstValueFrom(this.http.get<Unread>(`${this.options.base}/unread`))).count);
    } catch (failure) {
      if (!this.signedOut(failure)) throw failure;
    }
  }

  async open(): Promise<void> {
    try {
      const params = new HttpParams().set('limit', this.options.limit);
      const bell = await firstValueFrom(this.http.get<Bell>(this.options.base, { params }));
      this.list.set(bell.items);
      this.count.set(bell.unread);
    } catch (failure) {
      if (!this.signedOut(failure)) throw failure;
    }
  }

  async read(id: string): Promise<void> {
    await firstValueFrom(this.http.post(`${this.options.base}/${id}/read`, {}));
    const items = this.list();
    if (items !== null && items.some((one) => one.id === id && !one.read)) {
      this.list.set(items.map((one) => (one.id === id ? { ...one, read: true } : one)));
    }
    await this.refresh();
  }

  async readAll(): Promise<void> {
    await firstValueFrom(this.http.post(`${this.options.base}/read-all`, {}));
    const items = this.list();
    if (items !== null) this.list.set(items.map((one) => ({ ...one, read: true })));
    this.count.set(0);
  }

  private signedOut(failure: unknown): boolean {
    if (!signedOutFailure(failure)) return false;
    this.count.set(0);
    this.list.set(null);
    return true;
  }
}

// REQ-NOTIFICATIONS-005
export function provideNotifications(options: NotificationOptions = {}): EnvironmentProviders {
  const limit = options.limit ?? 20;
  if (!Number.isInteger(limit) || limit < 1 || limit > 50) {
    throw new Error(`provideNotifications: limit ${String(limit)} — целое от 1 до 50`);
  }
  return makeEnvironmentProviders([
    { provide: OPTIONS, useValue: { base: options.base ?? '/api/notifications', limit } },
    NotificationBell,
    provideEnvironmentInitializer(() => {
      const bell = inject(NotificationBell);
      const poll = (): void => void bell.refresh().catch(() => undefined);
      inject(BELL_SCHEDULE).every(BELL_INTERVAL_MS, poll);
      poll();
    }),
  ]);
}

// REQ-API-003
function signedOutFailure(failure: unknown): boolean {
  if (failure instanceof HttpErrorResponse) return failure.status === 401;
  if (failure === null || typeof failure !== 'object') return false;
  const problem = (failure as Record<string, unknown>)['problem'];
  return problem !== null && typeof problem === 'object' && (problem as Record<string, unknown>)['status'] === 401;
}
