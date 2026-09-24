---
id: RELEASE-5-0-0
type: release
status: released
scope: release
authority: supporting
opened-on: 2026-09-24
released-on: 2026-09-24
commit: 05b01b6064beddec86981fd07ae2de573bf4ff4b
---

# Выпуск 5.0.0

Правила выпуска — `REQ-RELEASE` в поставке пакета правил. [Каталог](INDEX.md)

## Цель

Выпустить состояние сервиса, накопленное после предыдущего выпуска, и исполнить обязательства ядра, попавшие в этот выпуск.

## Состав

| Задача | Причина включения |
|---|---|
| [CORE-ARC-011](../tickets/closed/CORE-ARC-011-client-update-framework.md) | Закрыта в этом выпуске, приоритет P1 |
| [CORE-OPS-084](../tickets/closed/CORE-OPS-084-client-chunks-survive-a-rollout.md) | Закрыта в этом выпуске, приоритет P1 |

## Критерии выхода

- [x] Набор `verify` пройден на выпускаемом коммите — расписка 2026-09-24T12:41:48.559Z, наборы: check, verify, прогон `mise run verify-set`
- [x] Тег выпуска создан на проверенном коммите — `v5.0.0`
- [x] Обязательства ядра этого выпуска закрыты или перенесены записью с причиной — ядро не объявляет обязательств самому себе
- [x] Завершающий шаг выполнен — публикация артефактов ядра: mise run install-local

## Не входит

Задачи, не закрытые к моменту закрытия выпуска: они попадут в состав следующего по факту закрытия.

## Миграция

Три новых правила-директивы действуют сразу, работа по ним — по обязательствам со сроком в три выпуска.

- **`client-update`**, обязательство `client-update`. Клиент подключает пакет `@apocarteres/app-update`: `provideAppUpdate({ apiVersion, available, required })` и `appUpdateInterceptor` в `provideHttpClient(withInterceptors([...]))`. `available` и `required` — компоненты проекта, отказ от первого — `UPDATE_IGNORED`. Служба подключает `platform-api-version` и задаёт `platform.api.min-supported-version`; без неё служба не стартует. Вызовы чужих систем перечисляются в `platform.api.version-exempt-paths`. Свои опрос сборки, плашка и сверка версии снимаются.
- **`defer-error`**, обязательство `defer-error`. У каждого `@defer` есть `@error`; его содержимое несёт `apcrChunkFailure`.
- **`bundle-budgets`**, обязательство `bundle-budgets`. В `angular.json` — бюджет начального пакета с `maximumError`; `maximumWarning` и `minimumWarning` снимаются.

Архив прежних кусков и кэширование статики (`REQ-DEPLOYMENT-022`, `REQ-DEPLOYMENT-023`) исполняет развёртывание проекта, по обязательству `static-archive`. Проверка стенда — `conventions static-check --url <сайт> --component <клиент> --previous <кусок прежней сборки>`.

## Результат

Выпущено с коммита `05b01b6064beddec86981fd07ae2de573bf4ff4b`, тег `v5.0.0`.

Расписка о проверках получена 2026-09-24T12:41:48.559Z; выполненные наборы: check, verify.

Прогон наблюдён командой `mise run verify-set` с кодом возврата 0.

Развёртывание выполняется этим тегом: REQ-RELEASE-016.

## Цена обновления

Несовместимо (3) — версия обязана быть старшей:
- новое правило-директива client-update: check потребителя может стать красным
- новое правило-директива defer-error: check потребителя может стать красным
- новое правило-директива bundle-budgets: check потребителя может стать красным

Обязывает (4):
- обязательство client-update (директива, REQ-CLIENT-UPDATE-001): срок 3 выпуск(ов) после принятия
- обязательство defer-error (директива, REQ-CLIENT-UPDATE-009): срок 3 выпуск(ов) после принятия
- обязательство bundle-budgets (директива, REQ-BUILD-014): срок 3 выпуск(ов) после принятия
- обязательство static-archive (директива, REQ-DEPLOYMENT-022): срок 3 выпуск(ов) после принятия

Добавлено (2):
- команда conventions static-check
- положений добавлено: 16
