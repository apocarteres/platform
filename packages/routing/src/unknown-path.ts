import type { Type } from '@angular/core';
import type { Route, Routes } from '@angular/router';

// REQ-DEPLOYMENT-018
export const UNKNOWN_PATH = '**';

// REQ-DEPLOYMENT-018
export interface UnknownPath {
  readonly notFound: Type<unknown>;
}

const UNDECLARED = 'Порт неизвестного адреса не объявляет страницы «не найдено»: '
  + 'передайте { notFound: <компонент> } — ядро требует решения, а не подставляет своё';

const ALREADY = 'Маршруты уже отвечают на неизвестный адрес: два ответа на один вопрос. '
  + `Снимите свой маршрут «${UNKNOWN_PATH}» — на него отвечает порт ядра`;

// REQ-DEPLOYMENT-018
function pathsOf(routes: Routes, prefix = ''): { path: string; component: unknown }[] {
  const found: { path: string; component: unknown }[] = [];
  for (const route of routes) {
    const here = `${prefix}/${route.path ?? ''}`.replace(/\/+/g, '/');
    found.push({ path: here, component: route.component });
    if (route.children !== undefined) {
      found.push(...pathsOf(route.children, here));
    }
  }
  return found;
}

// REQ-DEPLOYMENT-018
export function withUnknownPath(routes: Routes, port: UnknownPath): Routes {
  if (typeof port?.notFound !== 'function') {
    throw new Error(UNDECLARED);
  }
  const declared = pathsOf(routes);
  if (declared.some((route) => route.path.endsWith(UNKNOWN_PATH))) {
    throw new Error(ALREADY);
  }
  const working = declared.find((route) => route.component === port.notFound);
  if (working !== undefined) {
    throw new Error(
      `Страница «не найдено» совпадает с рабочей страницей «${working.path}»: `
      + 'неизвестный адрес отвечал бы рабочей страницей, а это и есть то, что требование запрещает',
    );
  }
  const unknown: Route = { path: UNKNOWN_PATH, component: port.notFound };
  return [...routes, unknown];
}
