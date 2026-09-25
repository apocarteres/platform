import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { afterEach, describe, expect, it } from 'vitest';
import { APP_FETCH, AppUpdate, PAGE_RELOAD, UPDATE_IGNORED, UPDATE_SCHEDULE, apiFetch, provideAppUpdate } from './index';
import type { ApiFetch } from './index';

@Component({ selector: 'test-blocker', standalone: true, template: 'клиент устарел' })
class Blocker {}

interface Sent {
  readonly url: string;
  readonly version: string | null;
  readonly accept: string | null;
}

function setUp(answer: Response): { fetch: ApiFetch; sent: Sent[]; update: AppUpdate } {
  const sent: Sent[] = [];
  TestBed.configureTestingModule({
    providers: [
      provideHttpClient(),
      provideHttpClientTesting(),
      { provide: UPDATE_SCHEDULE, useValue: { every: () => () => undefined } },
      { provide: PAGE_RELOAD, useValue: () => undefined },
      { provide: APP_FETCH, useValue: (input: string | URL, init?: RequestInit) => {
        sent.push({ url: input.toString(), version: new Headers(init?.headers).get('X-Api-Version'), accept: new Headers(init?.headers).get('Accept') });
        return Promise.resolve(answer.clone());
      } },
      provideAppUpdate({ apiVersion: 7, available: UPDATE_IGNORED, required: Blocker }),
    ],
  });
  return { fetch: TestBed.runInInjectionContext(() => apiFetch()), sent, update: TestBed.inject(AppUpdate) };
}

afterEach(() => {
  TestBed.resetTestingModule();
});

// REQ-CLIENT-UPDATE-011
describe('apiFetch', () => {
  it('к своему источнику ставит версию API, к чужому — нет, и сохраняет свои заголовки', async () => {
    const { fetch, sent } = setUp(new Response('{}', { status: 200 }));
    await fetch('/api/auth/csrf', { headers: { Accept: 'application/json' } });
    await fetch('https://elsewhere.example/api');
    expect(sent).toEqual([
      { url: '/api/auth/csrf', version: '7', accept: 'application/json' },
      { url: 'https://elsewhere.example/api', version: null, accept: null },
    ]);
  });

  it('отказ client-outdated показывает «клиент устарел», как перехватчик', async () => {
    const { fetch, update } = setUp(new Response(JSON.stringify({ code: 'client-outdated' }), { status: 426 }));
    const response = await fetch('/api/things');
    expect(response.status).toBe(426);
    expect(update.state()).toBe('required');
  });

  it('426 без кода ядра состояния не меняет', async () => {
    const { fetch, update } = setUp(new Response('не json', { status: 426 }));
    await fetch('/api/things');
    expect(update.state()).toBe('current');
  });

  it('без provideAppUpdate отказывает и называет объявление', () => {
    TestBed.configureTestingModule({ providers: [] });
    expect(() => TestBed.runInInjectionContext(() => apiFetch())).toThrowError(/provideAppUpdate/);
  });
});
