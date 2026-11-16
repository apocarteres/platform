import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Injectable, InjectionToken, computed, inject, makeEnvironmentProviders, signal } from '@angular/core';
import type { EnvironmentProviders, Signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import type { BotLink, Invitation, Links } from './contract';

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
  private readonly current = signal<readonly BotLink[] | null>(null);

  readonly bots: Signal<readonly BotLink[] | null> = this.current.asReadonly();
  readonly linked: Signal<readonly string[]> = computed(() => (this.current() ?? []).filter((one) => one.linked).map((one) => one.bot));

  // REQ-TELEGRAM-009
  async refresh(): Promise<void> {
    try {
      this.current.set((await firstValueFrom(this.http.get<Links>(`${this.options.base}/links`))).bots);
    } catch (failure) {
      if (!signedOutFailure(failure)) throw failure;
      this.current.set(null);
    }
  }

  // REQ-TELEGRAM-006
  invite(bot: string): Promise<Invitation> {
    return firstValueFrom(this.http.post<Invitation>(`${this.options.base}/${encodeURIComponent(bot)}/link`, {}));
  }

  // REQ-TELEGRAM-009
  async unlink(bot: string): Promise<void> {
    await firstValueFrom(this.http.delete(`${this.options.base}/${encodeURIComponent(bot)}/link`));
    const bots = this.current();
    if (bots !== null) {
      this.current.set(bots.map((one) => (one.bot === bot ? { ...one, linked: false, linkedAt: null } : one)));
    }
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
