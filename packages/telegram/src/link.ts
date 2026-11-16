import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Injectable, InjectionToken, computed, inject, makeEnvironmentProviders, signal } from '@angular/core';
import type { EnvironmentProviders, Signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import type { Invitation, LinkState } from './contract';

// REQ-TELEGRAM-013
export interface TelegramOptions {
  readonly base?: string;
}

const OPTIONS = new InjectionToken<Required<TelegramOptions>>('TELEGRAM_OPTIONS');

// REQ-TELEGRAM-013
@Injectable()
export class TelegramLink {
  private readonly http = inject(HttpClient);
  private readonly options = inject(OPTIONS);
  private readonly current = signal<LinkState | null>(null);

  readonly state: Signal<LinkState | null> = this.current.asReadonly();
  readonly linked: Signal<boolean> = computed(() => this.current()?.linked === true);

  // REQ-TELEGRAM-009
  async refresh(): Promise<void> {
    try {
      this.current.set(await firstValueFrom(this.http.get<LinkState>(`${this.options.base}/link`)));
    } catch (failure) {
      if (!signedOutFailure(failure)) throw failure;
      this.current.set(null);
    }
  }

  // REQ-TELEGRAM-006
  invite(): Promise<Invitation> {
    return firstValueFrom(this.http.post<Invitation>(`${this.options.base}/link`, {}));
  }

  // REQ-TELEGRAM-009
  async unlink(): Promise<void> {
    await firstValueFrom(this.http.delete(`${this.options.base}/link`));
    this.current.set({ linked: false, linkedAt: null });
  }
}

// REQ-TELEGRAM-013
export function provideTelegram(options: TelegramOptions = {}): EnvironmentProviders {
  return makeEnvironmentProviders([
    { provide: OPTIONS, useValue: { base: options.base ?? '/api/telegram' } },
    TelegramLink,
  ]);
}

// REQ-API-003
function signedOutFailure(failure: unknown): boolean {
  if (failure instanceof HttpErrorResponse) return failure.status === 401;
  if (failure === null || typeof failure !== 'object') return false;
  const problem = (failure as Record<string, unknown>)['problem'];
  return problem !== null && typeof problem === 'object' && (problem as Record<string, unknown>)['status'] === 401;
}
