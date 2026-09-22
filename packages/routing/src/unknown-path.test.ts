import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { RouterTestingHarness } from '@angular/router/testing';
import { provideRouter } from '@angular/router';
import type { Routes } from '@angular/router';
import { describe, expect, it } from 'vitest';
import { UNKNOWN_PATH, withUnknownPath } from './unknown-path';

@Component({ selector: 'test-lobby', standalone: true, template: 'лобби' })
class LobbyPage {}

@Component({ selector: 'test-inventory', standalone: true, template: 'склад' })
class InventoryPage {}

@Component({ selector: 'test-not-found', standalone: true, template: 'адреса не существует' })
class NotFoundPage {}

const APPLICATION: Routes = [
  { path: '', component: LobbyPage },
  { path: 'inventory', component: InventoryPage },
];

// REQ-DEPLOYMENT-018
describe('порт неизвестного адреса', () => {
  it('добавляет ответ на неизвестный адрес последним и не правит объявленное', () => {
    const routes = withUnknownPath(APPLICATION, { notFound: NotFoundPage });

    expect(routes).toHaveLength(APPLICATION.length + 1);
    expect(routes.at(-1)).toEqual({ path: UNKNOWN_PATH, component: NotFoundPage });
    expect(APPLICATION).toHaveLength(2);
  });

  it('отказывает, когда страница «не найдено» — это рабочая страница', () => {
    expect(() => withUnknownPath(APPLICATION, { notFound: LobbyPage }))
      .toThrowError(/совпадает с рабочей страницей «\/»/);
    expect(() => withUnknownPath(APPLICATION, { notFound: InventoryPage }))
      .toThrowError(/совпадает с рабочей страницей «\/inventory»/);
  });

  it('видит рабочую страницу и во вложенных маршрутах', () => {
    const nested: Routes = [
      { path: 'lobby', component: LobbyPage, children: [{ path: 'rules', component: InventoryPage }] },
    ];

    expect(() => withUnknownPath(nested, { notFound: InventoryPage }))
      .toThrowError(/«\/lobby\/rules»/);
  });

  it('отказывает, когда маршруты уже отвечают на неизвестный адрес', () => {
    const own: Routes = [...APPLICATION, { path: UNKNOWN_PATH, redirectTo: '' }];

    expect(() => withUnknownPath(own, { notFound: NotFoundPage }))
      .toThrowError(/два ответа на один вопрос/);
  });

  it('отказывает, когда порт страницы не объявляет или объявляет дважды', () => {
    expect(() => withUnknownPath(APPLICATION, {}))
      .toThrowError(/ядро требует решения, а не подставляет своё/);

    expect(() => withUnknownPath(APPLICATION, {
      notFound: NotFoundPage,
      loadNotFound: () => Promise.resolve(NotFoundPage),
    })).toThrowError(/объявляет страницу дважды/);
  });
});

// REQ-DEPLOYMENT-018
describe('порт на лениво загружаемых маршрутах', () => {
  const lobby = () => Promise.resolve(LobbyPage);
  const LAZY: Routes = [
    { path: '', loadComponent: lobby },
    { path: 'inventory', loadComponent: () => import('./index').then(() => InventoryPage) },
  ];

  it('ловит тот же загрузчик', () => {
    expect(() => withUnknownPath(LAZY, { loadNotFound: lobby }))
      .toThrowError(/тем же загрузчиком, что рабочая страница «\/»/);
  });

  it('ловит тот же модуль, объявленный рядом', () => {
    expect(() => withUnknownPath(LAZY, { loadNotFound: () => import('./index').then(() => NotFoundPage) }))
      .toThrowError(/из того же модуля, что рабочая страница «\/inventory»/);
  });

  it('чужой загрузчик из другого модуля пропускается', () => {
    const routes = withUnknownPath(LAZY, { loadNotFound: () => import('@angular/router').then(() => NotFoundPage) });

    expect(routes).toHaveLength(LAZY.length + 1);
    expect(routes.at(-1)?.path).toBe(UNKNOWN_PATH);
    expect(routes.at(-1)?.loadComponent).toBeTypeOf('function');
  });

  it('отказывает, когда сравнивать не с чем', () => {
    expect(() => withUnknownPath(LAZY, { notFound: NotFoundPage }))
      .toThrowError(/сравнить не с чем[\s\S]*loadNotFound/);

    expect(() => withUnknownPath(APPLICATION, { loadNotFound: () => Promise.resolve(NotFoundPage) }))
      .toThrowError(/сравнить не с чем[\s\S]*notFound/);
  });
});

// REQ-QUALITY-012, REQ-DEPLOYMENT-018
describe('маршрутизация с портом', () => {
  it('неизвестный адрес показывает страницу «не найдено», а глубокая ссылка остаётся рабочей', async () => {
    TestBed.configureTestingModule({
      providers: [provideRouter(withUnknownPath(APPLICATION, { notFound: NotFoundPage }))],
    });
    const harness = await RouterTestingHarness.create();

    await harness.navigateByUrl('/нет-такого-адреса');
    expect(harness.routeNativeElement?.textContent).toContain('адреса не существует');

    await harness.navigateByUrl('/inventory');
    expect(harness.routeNativeElement?.textContent).toContain('склад');
  });
});
