import type { Type } from '@angular/core';
import type { Route, Routes } from '@angular/router';

// REQ-DEPLOYMENT-018
export const UNKNOWN_PATH = '**';

// REQ-DEPLOYMENT-018
export type PageLoader = () => Promise<unknown>;

// REQ-DEPLOYMENT-018
export interface UnknownPath {
  readonly notFound?: Type<unknown>;
  readonly loadNotFound?: PageLoader;
}

interface Declared {
  readonly path: string;
  readonly component?: Type<unknown>;
  readonly loadComponent?: PageLoader;
}

const UNDECLARED = 'Порт неизвестного адреса не объявляет страницы «не найдено»: '
  + 'передайте { notFound: <компонент> } либо { loadNotFound: <загрузчик> } — '
  + 'ядро требует решения, а не подставляет своё';

const BOTH = 'Порт неизвестного адреса объявляет страницу дважды — значением и загрузчиком: '
  + 'оставьте один вид, тот же, каким объявлены остальные страницы';

const ALREADY = 'Маршруты уже отвечают на неизвестный адрес: два ответа на один вопрос. '
  + `Снимите свой маршрут «${UNKNOWN_PATH}» — на него отвечает порт ядра`;

// REQ-DEPLOYMENT-018
const IMPORTED = /import[A-Za-z0-9_$]*\s*\(\s*['"`]([^'"`]+)['"`]/;

// REQ-DEPLOYMENT-018
function moduleOf(loader: PageLoader): string | null {
  try {
    return IMPORTED.exec(loader.toString())?.[1] ?? null;
  } catch {
    return null;
  }
}

// REQ-DEPLOYMENT-018
function pathsOf(routes: Routes, prefix = ''): Declared[] {
  const found: Declared[] = [];
  for (const route of routes) {
    const here = `${prefix}/${route.path ?? ''}`.replace(/\/+/g, '/');
    found.push({
      path: here,
      component: route.component as Type<unknown> | undefined,
      loadComponent: route.loadComponent as PageLoader | undefined,
    });
    if (route.children !== undefined) found.push(...pathsOf(route.children, here));
  }
  return found;
}

// REQ-DEPLOYMENT-018
function collidingValue(declared: Declared[], page: Type<unknown>): string | null {
  const working = declared.find((route) => route.component === page);
  if (working === undefined) return null;
  return `Страница «не найдено» совпадает с рабочей страницей «${working.path}»: `
    + 'неизвестный адрес отвечал бы рабочей страницей, а это и есть то, что требование запрещает';
}

// REQ-DEPLOYMENT-018
function collidingLoader(declared: Declared[], load: PageLoader): string | null {
  const same = declared.find((route) => route.loadComponent === load);
  if (same !== undefined) {
    return `Страница «не найдено» загружается тем же загрузчиком, что рабочая страница «${same.path}»: `
      + 'неизвестный адрес отвечал бы рабочей страницей, а это и есть то, что требование запрещает';
  }
  const source = moduleOf(load);
  if (source === null) return null;
  const twin = declared.find((route) => route.loadComponent !== undefined
    && moduleOf(route.loadComponent) === source);
  if (twin === undefined) return null;
  return `Страница «не найдено» загружается из того же модуля, что рабочая страница «${twin.path}» `
    + `(«${source}»): неизвестный адрес отвечал бы рабочей страницей`;
}

// REQ-DEPLOYMENT-018
function nothingToCompare(declared: Declared[], lazy: boolean): string | null {
  if (declared.length === 0) return null;
  const comparable = declared.filter((route) => (lazy ? route.loadComponent : route.component) !== undefined);
  if (comparable.length > 0) return null;
  return lazy
    ? 'Страница «не найдено» объявлена загрузчиком, а все маршруты объявлены значением: сравнить не с чем. '
      + 'Объявите её полем notFound — тем же видом, каким объявлены остальные страницы'
    : 'Страница «не найдено» объявлена значением, а все маршруты объявлены загрузчиком: сравнить не с чем. '
      + 'Объявите её полем loadNotFound — тем же видом, каким объявлены остальные страницы';
}

// REQ-DEPLOYMENT-018
export function withUnknownPath(routes: Routes, port: UnknownPath): Routes {
  const page = port?.notFound;
  const load = port?.loadNotFound;
  if (typeof page === 'function' && typeof load === 'function') throw new Error(BOTH);
  if (typeof page !== 'function' && typeof load !== 'function') throw new Error(UNDECLARED);
  const declared = pathsOf(routes);
  if (declared.some((route) => route.path.endsWith(UNKNOWN_PATH))) throw new Error(ALREADY);
  const vacuous = nothingToCompare(declared, load !== undefined);
  if (vacuous !== null) throw new Error(vacuous);
  const collision = page === undefined
    ? collidingLoader(declared, load as PageLoader)
    : collidingValue(declared, page);
  if (collision !== null) throw new Error(collision);
  const unknown: Route = page === undefined
    ? { path: UNKNOWN_PATH, loadComponent: load as () => Promise<Type<unknown>> }
    : { path: UNKNOWN_PATH, component: page };
  return [...routes, unknown];
}
