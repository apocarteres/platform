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

  it('отказывает, когда порт страницы не объявляет', () => {
    const empty = {} as { notFound: typeof NotFoundPage };

    expect(() => withUnknownPath(APPLICATION, empty))
      .toThrowError(/ядро требует решения, а не подставляет своё/);
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
