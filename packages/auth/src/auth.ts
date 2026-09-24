import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import type { HttpInterceptorFn } from '@angular/common/http';
import {
  Injectable, InjectionToken, inject, makeEnvironmentProviders, provideEnvironmentInitializer, signal,
} from '@angular/core';
import type { EnvironmentProviders, Signal } from '@angular/core';
import { Router } from '@angular/router';
import type { CanMatchFn, UrlTree } from '@angular/router';
import { firstValueFrom, tap } from 'rxjs';
import type {
  Account, EmailRequest, LoginRequest, PasswordChangeRequest, Policy, RegisterRequest, ResetRequest, TokenRequest,
} from './contract';

// REQ-AUTH-015, REQ-AUTH-020
export type SignedIn = Account;

// REQ-AUTH-018, REQ-AUTH-020
export type PasswordPolicy = Policy;

// REQ-AUTH-015
export interface AuthOptions {
  readonly base?: string;
}

// REQ-AUTH-015
const OPTIONS = new InjectionToken<Required<AuthOptions>>('AUTH_OPTIONS');

// REQ-AUTH-008
const REQUIRED = 'authentication-required';

// REQ-AUTH-015
export function authFailureCode(failure: unknown): string | null {
  if (!(failure instanceof HttpErrorResponse)) return null;
  const body: unknown = failure.error;
  if (body === null || typeof body !== 'object') return null;
  const code = (body as Record<string, unknown>)['code'];
  return typeof code === 'string' ? code : null;
}

// REQ-AUTH-015
@Injectable()
export class AuthSession {
  private readonly http = inject(HttpClient);
  private readonly base = inject(OPTIONS).base;
  private readonly current = signal<SignedIn | null | undefined>(undefined);
  private loading: Promise<void> | null = null;

  readonly account: Signal<SignedIn | null | undefined> = this.current.asReadonly();

  // REQ-AUTH-008
  ready(): Promise<void> {
    this.loading ??= this.load();
    return this.loading;
  }

  has(role: string): boolean {
    return this.current()?.roles.includes(role) ?? false;
  }

  async login(email: string, password: string, human?: string): Promise<SignedIn> {
    const body: LoginRequest = { email, password, human };
    const signed = await firstValueFrom(this.http.post<SignedIn>(`${this.base}/login`, body));
    this.current.set(signed);
    await this.csrf();
    return signed;
  }

  async logout(): Promise<void> {
    try {
      await firstValueFrom(this.http.post(`${this.base}/logout`, {}));
    } finally {
      this.current.set(null);
      await this.csrf();
    }
  }

  // REQ-AUTH-021
  async register<P extends object>(email: string, password: string, profile?: P, human?: string): Promise<void> {
    const body: RegisterRequest = { email, password, human, profile: profile as Readonly<Record<string, unknown>> | undefined };
    await firstValueFrom(this.http.post(`${this.base}/register`, body));
  }

  async verify(token: string): Promise<void> {
    const body: TokenRequest = { token };
    await firstValueFrom(this.http.post(`${this.base}/verify`, body));
  }

  async resend(email: string): Promise<void> {
    const body: EmailRequest = { email };
    await firstValueFrom(this.http.post(`${this.base}/resend`, body));
  }

  async requestReset(email: string, human?: string): Promise<void> {
    const body: EmailRequest = { email, human };
    await firstValueFrom(this.http.post(`${this.base}/password-reset/request`, body));
  }

  async confirmReset(token: string, password: string): Promise<void> {
    const body: ResetRequest = { token, password };
    await firstValueFrom(this.http.post(`${this.base}/password-reset/confirm`, body));
  }

  // REQ-AUTH-019
  async changePassword(current: string, password: string): Promise<void> {
    const body: PasswordChangeRequest = { current, password };
    await firstValueFrom(this.http.post(`${this.base}/password`, body));
  }

  // REQ-AUTH-018
  policy(): Promise<PasswordPolicy> {
    return firstValueFrom(this.http.get<PasswordPolicy>(`${this.base}/policy`));
  }

  // REQ-AUTH-008
  expired(): void {
    this.current.set(null);
  }

  private async load(): Promise<void> {
    await this.csrf();
    try {
      this.current.set(await firstValueFrom(this.http.get<SignedIn>(`${this.base}/me`)));
    } catch (failure) {
      if (authFailureCode(failure) !== REQUIRED) throw failure;
      this.current.set(null);
    }
  }

  // REQ-AUTH-008
  private async csrf(): Promise<void> {
    await firstValueFrom(this.http.get(`${this.base}/csrf`));
  }
}

// REQ-AUTH-015
export function provideAuth(options: AuthOptions = {}): EnvironmentProviders {
  return makeEnvironmentProviders([
    { provide: OPTIONS, useValue: { base: options.base ?? '/api/auth' } },
    AuthSession,
    provideEnvironmentInitializer(() => void inject(AuthSession).ready()),
  ]);
}

// REQ-AUTH-008, REQ-AUTH-015
export const authInterceptor: HttpInterceptorFn = (request, next) => {
  const session = inject(AuthSession, { optional: true });
  return next(request).pipe(tap({
    error: (failure: unknown) => {
      if (session !== null && authFailureCode(failure) === REQUIRED) session.expired();
    },
  }));
};

// REQ-AUTH-015
export function signedIn(redirect: string): CanMatchFn {
  return async (): Promise<boolean | UrlTree> => {
    const session = inject(AuthSession);
    const router = inject(Router);
    await session.ready();
    return session.account() ? true : router.parseUrl(redirect);
  };
}

// REQ-AUTH-002, REQ-AUTH-015
export function withRole(role: string, redirect: string): CanMatchFn {
  return async (): Promise<boolean | UrlTree> => {
    const session = inject(AuthSession);
    const router = inject(Router);
    await session.ready();
    return session.has(role) ? true : router.parseUrl(redirect);
  };
}
