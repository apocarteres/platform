import { HttpBackend, HttpClient, HttpErrorResponse, HttpHeaders } from '@angular/common/http';
import type { HttpInterceptorFn } from '@angular/common/http';
import {
  ApplicationRef, DOCUMENT, Directive, EnvironmentInjector, Injectable, InjectionToken, OnDestroy, OnInit,
  createComponent, inject, makeEnvironmentProviders, provideEnvironmentInitializer, signal,
} from '@angular/core';
import type { ComponentRef, EnvironmentProviders, Signal, Type } from '@angular/core';
import { NavigationError, Router } from '@angular/router';
import { firstValueFrom, tap } from 'rxjs';
import type { Subscription } from 'rxjs';
import { API_VERSION_HEADER, OUTDATED_CODE, apiVersionHeader, isApiVersion } from './api-version';
import { fingerprintOf } from './fingerprint';
import { PAGE_RELOAD, POLL_INTERVAL_MS, UPDATE_SCHEDULE } from './schedule';

// REQ-CLIENT-UPDATE-001
export type UpdateState = 'current' | 'available' | 'required';

// REQ-CLIENT-UPDATE-001
export const UPDATE_IGNORED: unique symbol = Symbol('UPDATE_IGNORED');

// REQ-CLIENT-UPDATE-001
export interface AppUpdateOptions {
  readonly apiVersion: number;
  readonly available: Type<unknown> | typeof UPDATE_IGNORED;
  readonly required: Type<unknown>;
}

// REQ-CLIENT-UPDATE-001
const OPTIONS = new InjectionToken<AppUpdateOptions>('APP_UPDATE_OPTIONS');

// REQ-CLIENT-UPDATE-002
const ENTRY = 'index.html';

// REQ-CLIENT-UPDATE-002
const NO_CACHE = new HttpHeaders({ 'Cache-Control': 'no-cache', Pragma: 'no-cache' });

const NOT_PROVIDED = 'Перехватчик appUpdateInterceptor подключён без provideAppUpdate:'
  + ' объявите provideAppUpdate({ apiVersion, available, required }) в конфигурации приложения';

// REQ-CLIENT-UPDATE-001, REQ-CLIENT-UPDATE-003
@Injectable()
export class AppUpdate implements OnDestroy {
  private readonly options = inject(OPTIONS);
  private readonly document = inject(DOCUMENT);
  private readonly schedule = inject(UPDATE_SCHEDULE);
  private readonly page = inject(PAGE_RELOAD);
  private readonly application = inject(ApplicationRef);
  private readonly injector = inject(EnvironmentInjector);
  private readonly router = inject(Router, { optional: true });
  // REQ-CLIENT-UPDATE-006
  private readonly direct = new HttpClient(inject(HttpBackend));
  private readonly current = signal<UpdateState>('current');
  private readonly listener = (): void => this.visible();
  private baseline: string | null = null;
  private shown: ComponentRef<unknown> | null = null;
  private stop: (() => void) | null = null;
  private navigation: Subscription | null = null;

  readonly state: Signal<UpdateState> = this.current.asReadonly();

  get apiVersion(): number {
    return this.options.apiVersion;
  }

  // REQ-CLIENT-UPDATE-002, REQ-CLIENT-UPDATE-004
  start(): void {
    this.stop = this.schedule.every(POLL_INTERVAL_MS, () => {
      if (!this.document.hidden) void this.check();
    });
    this.document.addEventListener('visibilitychange', this.listener);
    this.navigation = this.router?.events.subscribe((event) => {
      if (event instanceof NavigationError) void this.check();
    }) ?? null;
    void this.check();
  }

  // REQ-CLIENT-UPDATE-002, REQ-CLIENT-UPDATE-004
  async check(): Promise<void> {
    if (this.current() !== 'current') return;
    let html: string;
    try {
      html = await firstValueFrom(this.direct.get(this.entry(), { headers: NO_CACHE, responseType: 'text' }));
    } catch {
      return;
    }
    const seen = fingerprintOf(html, new DOMParser());
    if (seen === null) return;
    if (this.baseline === null) {
      this.baseline = seen;
      return;
    }
    if (seen !== this.baseline) this.become('available');
  }

  // REQ-CLIENT-UPDATE-006
  require(): void {
    this.become('required');
  }

  // REQ-CLIENT-UPDATE-003
  reload(): void {
    this.page();
  }

  ngOnDestroy(): void {
    this.stop?.();
    this.navigation?.unsubscribe();
    this.document.removeEventListener('visibilitychange', this.listener);
    this.hide();
  }

  // REQ-CLIENT-UPDATE-002
  private visible(): void {
    if (!this.document.hidden) void this.check();
  }

  // REQ-CLIENT-UPDATE-002
  private entry(): string {
    return new URL(ENTRY, this.document.baseURI).toString();
  }

  // REQ-CLIENT-UPDATE-001, REQ-CLIENT-UPDATE-006
  private become(state: 'available' | 'required'): void {
    if (this.current() === 'required' || this.current() === state) return;
    this.current.set(state);
    if (state === 'required') this.stop?.();
    this.hide();
    const shown = state === 'required' ? this.options.required : this.options.available;
    if (shown === UPDATE_IGNORED) return;
    const reference = createComponent(shown, { environmentInjector: this.injector });
    this.application.attachView(reference.hostView);
    this.document.body.appendChild(reference.location.nativeElement as Node);
    this.shown = reference;
  }

  private hide(): void {
    if (this.shown === null) return;
    this.shown.destroy();
    this.shown = null;
  }
}

// REQ-CLIENT-UPDATE-001
export function provideAppUpdate(options: AppUpdateOptions): EnvironmentProviders {
  if (!isApiVersion(options.apiVersion)) {
    throw new Error(`provideAppUpdate: версия API ${String(options.apiVersion)} недопустима — целое число от 1`
      + ' до 999999999, поднимается проектом, когда прежний клиент перестаёт понимать API');
  }
  if (typeof options.required !== 'function') {
    throw new Error('provideAppUpdate: не указан компонент required — показ обязательного обновления не отключается');
  }
  if (options.available !== UPDATE_IGNORED && typeof options.available !== 'function') {
    throw new Error('provideAppUpdate: не указан компонент available — укажите компонент либо UPDATE_IGNORED');
  }
  return makeEnvironmentProviders([
    { provide: OPTIONS, useValue: options },
    AppUpdate,
    provideEnvironmentInitializer(() => inject(AppUpdate).start()),
  ]);
}

// REQ-CLIENT-UPDATE-006
function sameOrigin(url: string, base: string): boolean {
  return new URL(url, base).origin === new URL(base).origin;
}

// REQ-CLIENT-UPDATE-006
export const appUpdateInterceptor: HttpInterceptorFn = (request, next) => {
  const update = inject(AppUpdate, { optional: true });
  if (update === null) throw new Error(NOT_PROVIDED);
  const base = inject(DOCUMENT).baseURI;
  const sent = sameOrigin(request.url, base)
    ? request.clone({ setHeaders: { [API_VERSION_HEADER]: apiVersionHeader(update.apiVersion) } })
    : request;
  return next(sent).pipe(tap({
    error: (failure: unknown) => {
      if (failure instanceof HttpErrorResponse && outdated(failure.error)) update.require();
    },
  }));
};

// REQ-CLIENT-UPDATE-006
function outdated(body: unknown): boolean {
  return body !== null && typeof body === 'object' && (body as Record<string, unknown>)['code'] === OUTDATED_CODE;
}

// REQ-CLIENT-UPDATE-004
@Directive({ selector: '[apcrChunkFailure]', standalone: true })
export class ApcrChunkFailure implements OnInit {
  private readonly update = inject(AppUpdate);

  ngOnInit(): void {
    void this.update.check();
  }
}
