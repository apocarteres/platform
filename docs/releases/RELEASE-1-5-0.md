---
id: RELEASE-1-5-0
type: release
status: released
scope: release
authority: supporting
opened-on: 2026-09-11
released-on: 2026-09-11
commit: 94a76feeed1190d592a03875d8bb20ee19a6035a
---

# Выпуск 1.5.0

Правила выпуска — `REQ-RELEASE` в поставке пакета правил. [Каталог](INDEX.md)

## Цель

Выпустить состояние сервиса, накопленное после предыдущего выпуска, и исполнить обязательства ядра, попавшие в этот выпуск.

## Состав

| Задача | Причина включения |
|---|---|
| [CORE-API-001](../tickets/closed/CORE-API-001-platform-web-errors.md) | Закрыта в этом выпуске, приоритет P2 |
| [CORE-API-002](../tickets/closed/CORE-API-002-angular-http-error-package.md) | Закрыта в этом выпуске, приоритет P2 |
| [CORE-API-003](../tickets/closed/CORE-API-003-client-contract-hides-its-demands.md) | Закрыта в этом выпуске, приоритет P1 |
| [CORE-DOC-010](../tickets/closed/CORE-DOC-010-consumer-feedback-channel.md) | Закрыта в этом выпуске, приоритет P2 |
| [CORE-OPS-027](../tickets/closed/CORE-OPS-027-obligation-ticket-name-fails-naming.md) | Закрыта в этом выпуске, приоритет P1 |
| [CORE-OPS-029](../tickets/closed/CORE-OPS-029-angular-library-build-and-publishing.md) | Закрыта в этом выпуске, приоритет P2 |

## Критерии выхода

- [x] Набор `verify` пройден на выпускаемом коммите — расписка 2026-09-11T09:28:53.080Z, наборы: check, verify, прогон `mise run verify-set`
- [x] Тег выпуска создан на проверенном коммите — `v1.5.0`
- [x] Обязательства ядра этого выпуска закрыты или перенесены записью с причиной — ядро не объявляет обязательств самому себе
- [x] Завершающий шаг выполнен — публикация артефактов ядра: mise run install-local

## Не входит

Задачи, не закрытые к моменту закрытия выпуска: они попадут в состав следующего по факту закрытия.

## Результат

Выпущено с коммита `94a76feeed1190d592a03875d8bb20ee19a6035a`, тег `v1.5.0`.

Расписка о проверках получена 2026-09-11T09:28:53.080Z; выполненные наборы: check, verify.

Прогон наблюдён командой `mise run verify-set` с кодом возврата 0.

Развёртывание выполняется этим тегом: REQ-RELEASE-016.
