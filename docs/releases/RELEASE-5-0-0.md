---
id: RELEASE-5-0-0
type: release
status: draft
scope: release
authority: supporting
opened-on: 2026-09-24
---

# Выпуск 5.0.0

Правила выпуска — `REQ-RELEASE` в поставке пакета правил. [Каталог](INDEX.md)

## Цель

Выпустить состояние сервиса, накопленное после предыдущего выпуска, и исполнить обязательства ядра, попавшие в этот выпуск.

## Состав

| Задача | Причина включения |
|---|---|
| [CORE-ARC-011](../tickets/closed/CORE-ARC-011-client-update-framework.md) | Указана при открытии выпуска |
| [CORE-OPS-084](../tickets/closed/CORE-OPS-084-client-chunks-survive-a-rollout.md) | Указана при открытии выпуска |

## Критерии выхода

- [ ] Набор `verify` пройден на выпускаемом коммите — расписка получена командой выпуска
- [ ] Тег выпуска создан на проверенном коммите — ставится командой выпуска
- [ ] Обязательства ядра этого выпуска закрыты или перенесены записью с причиной
- [ ] Завершающий шаг выполнен — развёртывание в производственную среду или публикация артефактов

## Не входит

Задачи, не закрытые к моменту закрытия выпуска: они попадут в состав следующего по факту закрытия.

## Миграция

Три новых правила-директивы действуют сразу, работа по ним — по обязательствам со сроком в три выпуска.

- **`client-update`**, обязательство `client-update`. Клиент подключает пакет `@apocarteres/app-update`: `provideAppUpdate({ apiVersion, available, required })` и `appUpdateInterceptor` в `provideHttpClient(withInterceptors([...]))`. `available` и `required` — компоненты проекта, отказ от первого — `UPDATE_IGNORED`. Служба подключает `platform-api-version` и задаёт `platform.api.min-supported-version`; без неё служба не стартует. Вызовы чужих систем перечисляются в `platform.api.version-exempt-paths`. Свои опрос сборки, плашка и сверка версии снимаются.
- **`defer-error`**, обязательство `defer-error`. У каждого `@defer` есть `@error`; его содержимое несёт `apcrChunkFailure`.
- **`bundle-budgets`**, обязательство `bundle-budgets`. В `angular.json` — бюджет начального пакета с `maximumError`; `maximumWarning` и `minimumWarning` снимаются.

Архив прежних кусков и кэширование статики (`REQ-DEPLOYMENT-022`, `REQ-DEPLOYMENT-023`) исполняет развёртывание проекта, по обязательству `static-archive`. Проверка стенда — `conventions static-check --url <сайт> --component <клиент> --previous <кусок прежней сборки>`.

## Результат

Заполняется при закрытии из расписки о проверках.
