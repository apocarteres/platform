import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Component, inject } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router, withNavigationErrorHandler } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { afterEach, describe, expect, it } from 'vitest';
import {
  AppUpdate, ApcrChunkFailure, PAGE_RELOAD, POLL_INTERVAL_MS, UPDATE_IGNORED, UPDATE_SCHEDULE,
  appUpdateInterceptor, provideAppUpdate,
} from './index';
import type { AppUpdateOptions } from './index';

@Component({ selector: 'test-banner', standalone: true, template: '<button (click)="update.reload()">новая версия</button>' })
class Banner {
  readonly update = inject(AppUpdate);
}

@Component({ selector: 'test-blocker', standalone: true, template: 'клиент устарел' })
class Blocker {}

@Component({ selector: 'test-failed', standalone: true, imports: [ApcrChunkFailure], template: '<p apcrChunkFailure>не загрузилось</p>' })
class Failed {}

const ENTRY = 'http://localhost:3000/index.html';

function page(...files: string[]): string {
  return `<!doctype html><html><head>${files.map((file) => file.endsWith('.css')
    ? `<link rel="stylesheet" href="${file}">`
    : `<script src="${file}" type="module"></script>`).join('')}</head><body><app-root></app-root></body></html>`;
}

const FIRST = page('main-AAAA.js', 'styles-1111.css');

interface Harness {
  readonly http: HttpTestingController;
  readonly update: AppUpdate;
  readonly tick: () => void;
  readonly reloads: () => number;
  readonly hide: (hidden: boolean) => void;
}

let hidden = false;
Object.defineProperty(document, 'hidden', { configurable: true, get: () => hidden });

function harness(options: Partial<AppUpdateOptions> = {}, router = false): Harness {
  const runs: (() => void)[] = [];
  let reloads = 0;
  TestBed.configureTestingModule({
    providers: [
      provideHttpClient(withInterceptors([appUpdateInterceptor])),
      provideHttpClientTesting(),
      ...(router ? [provideRouter([{ path: 'broken', loadComponent: () => Promise.reject(new Error('Failed to fetch dynamically imported module')) }], withNavigationErrorHandler(() => undefined))] : []),
      { provide: UPDATE_SCHEDULE, useValue: { every: (milliseconds: number, run: () => void) => {
        expect(milliseconds).toBe(POLL_INTERVAL_MS);
        runs.push(run);
        return () => runs.splice(0);
      } } },
      { provide: PAGE_RELOAD, useValue: () => { reloads += 1; } },
      provideAppUpdate({ apiVersion: 3, available: Banner, required: Blocker, ...options }),
    ],
  });
  const update = TestBed.inject(AppUpdate);
  const http = TestBed.inject(HttpTestingController);
  return {
    http,
    update,
    tick: () => runs.forEach((run) => run()),
    reloads: () => reloads,
    hide: (value) => {
      hidden = value;
      document.dispatchEvent(new Event('visibilitychange'));
    },
  };
}

async function answer(http: HttpTestingController, html: string): Promise<void> {
  const request = http.expectOne(ENTRY);
  expect(request.request.headers.get('Cache-Control')).toBe('no-cache');
  expect(request.request.headers.has('X-Api-Version')).toBe(false);
  request.flush(html);
  await Promise.resolve();
  await Promise.resolve();
}

function shown(): string {
  return Array.from(document.body.children).map((element) => element.tagName.toLowerCase()).join(',');
}

afterEach(() => {
  hidden = false;
  TestBed.resetTestingModule();
  document.body.innerHTML = '';
});

// REQ-CLIENT-UPDATE-001
describe('объявление механизма обновления', () => {
  it('отказывает без компонента обязательного обновления: его показ не отключается', () => {
    expect(() => provideAppUpdate({ apiVersion: 3, available: Banner } as unknown as AppUpdateOptions))
      .toThrowError(/не указан компонент required/);
    expect(() => provideAppUpdate({ apiVersion: 3, available: Banner, required: UPDATE_IGNORED } as unknown as AppUpdateOptions))
      .toThrowError(/не указан компонент required/);
  });

  it('отказывает без решения о новой сборке и принимает явную заглушку', () => {
    expect(() => provideAppUpdate({ apiVersion: 3, required: Blocker } as unknown as AppUpdateOptions))
      .toThrowError(/укажите компонент либо UPDATE_IGNORED/);
    expect(() => provideAppUpdate({ apiVersion: 3, available: UPDATE_IGNORED, required: Blocker })).not.toThrow();
  });
});

// REQ-CLIENT-UPDATE-002
describe('новая сборка', () => {
  it('та же сборка ничего не показывает, другая показывает компонент проекта', async () => {
    const { http, update, tick } = harness();
    await answer(http, FIRST);
    tick();
    await answer(http, page('styles-1111.css', 'main-AAAA.js'));
    expect(update.state()).toBe('current');
    expect(shown()).toBe('');

    tick();
    await answer(http, page('main-BBBB.js', 'styles-1111.css'));
    expect(update.state()).toBe('available');
    expect(shown()).toBe('test-banner');
    http.verify();
  });

  it('видит сборку, в которой поменялись только стили', async () => {
    const { http, update, tick } = harness();
    await answer(http, FIRST);
    tick();
    await answer(http, page('main-AAAA.js', 'styles-2222.css'));
    expect(update.state()).toBe('available');
  });

  it('в скрытой вкладке не опрашивает, при возврате на вкладку сверяет сразу', async () => {
    const { http, update, tick, hide } = harness();
    await answer(http, FIRST);
    hide(true);
    tick();
    http.expectNone(ENTRY);

    hide(false);
    await answer(http, page('main-BBBB.js', 'styles-1111.css'));
    expect(update.state()).toBe('available');
  });

  it('недоступная точка входа и страница без ссылок новой сборкой не считаются', async () => {
    const { http, update, tick } = harness();
    await answer(http, FIRST);
    tick();
    http.expectOne(ENTRY).flush('нет', { status: 502, statusText: 'Bad Gateway' });
    await Promise.resolve();
    tick();
    await answer(http, '<html><body>обслуживание</body></html>');
    expect(update.state()).toBe('current');
  });

  it('заглушка UPDATE_IGNORED ничего не показывает, а состояние видно', async () => {
    const { http, update, tick } = harness({ available: UPDATE_IGNORED });
    await answer(http, FIRST);
    tick();
    await answer(http, page('main-BBBB.js'));
    expect(update.state()).toBe('available');
    expect(shown()).toBe('');
  });
});

// REQ-CLIENT-UPDATE-003
describe('перезагрузка', () => {
  it('клиент не перезагружается сам, перезагрузку вызывает компонент проекта', async () => {
    const { http, tick, reloads } = harness();
    await answer(http, FIRST);
    tick();
    await answer(http, page('main-BBBB.js'));
    expect(reloads()).toBe(0);

    document.body.querySelector('button')?.click();
    expect(reloads()).toBe(1);
  });
});

// REQ-CLIENT-UPDATE-004
describe('отказ загрузки куска', () => {
  it('отказ перехода сверяет сборку сразу, без ожидания опроса', async () => {
    const { http, update } = harness({}, true);
    await answer(http, FIRST);
    await TestBed.inject(Router).navigateByUrl('/broken').catch(() => undefined);
    await answer(http, page('main-BBBB.js'));
    expect(update.state()).toBe('available');
  });

  it('блок @error с apcrChunkFailure сверяет сборку сразу', async () => {
    const { http, update } = harness();
    await answer(http, FIRST);
    TestBed.createComponent(Failed).detectChanges();
    await answer(http, page('main-BBBB.js'));
    expect(update.state()).toBe('available');
  });
});

// REQ-CLIENT-UPDATE-006
describe('устаревший API', () => {
  it('к запросам своего сервера добавляет версию API, к чужим — нет', async () => {
    const { http } = harness();
    await answer(http, FIRST);
    const client = TestBed.inject(HttpClient);
    void firstValueFrom(client.get('/api/things')).catch(() => undefined);
    void firstValueFrom(client.get('https://elsewhere.example/api')).catch(() => undefined);
    expect(http.expectOne('/api/things').request.headers.get('X-Api-Version')).toBe('3');
    expect(http.expectOne('https://elsewhere.example/api').request.headers.has('X-Api-Version')).toBe(false);
  });

  it('отказ client-outdated показывает обязательное обновление вместо новой сборки, и оно остаётся', async () => {
    const { http, update, tick } = harness();
    await answer(http, FIRST);
    tick();
    await answer(http, page('main-BBBB.js'));
    expect(shown()).toBe('test-banner');

    const client = TestBed.inject(HttpClient);
    const refused = firstValueFrom(client.get('/api/things'));
    http.expectOne('/api/things').flush({ code: 'client-outdated', status: 426 }, { status: 426, statusText: 'Upgrade Required' });
    await expect(refused).rejects.toBeDefined();
    expect(update.state()).toBe('required');
    expect(shown()).toBe('test-blocker');

    tick();
    http.expectNone(ENTRY);
    expect(update.state()).toBe('required');
  });

  it('сверка, начатая до отказа, не возвращает показ к новой сборке', async () => {
    const { http, update, tick } = harness();
    await answer(http, FIRST);
    tick();
    const pending = http.expectOne(ENTRY);
    update.require();
    pending.flush(page('main-BBBB.js'));
    await Promise.resolve();
    await Promise.resolve();
    expect(update.state()).toBe('required');
    expect(shown()).toBe('test-blocker');
  });

  it('другие отказы сервера состояния не меняют', async () => {
    const { http, update } = harness();
    await answer(http, FIRST);
    const refused = firstValueFrom(TestBed.inject(HttpClient).get('/api/things'));
    http.expectOne('/api/things').flush({ code: 'not-found', status: 404 }, { status: 404, statusText: 'Not Found' });
    await expect(refused).rejects.toBeDefined();
    expect(update.state()).toBe('current');
  });

  it('перехватчик без provideAppUpdate отказывает и называет, что объявить', async () => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(withInterceptors([appUpdateInterceptor])), provideHttpClientTesting()],
    });
    await expect(firstValueFrom(TestBed.inject(HttpClient).get('/api/things'))).rejects.toThrowError(/объявите provideAppUpdate/);
  });
});
