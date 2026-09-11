---
id: RELEASE-1-7-0
type: release
status: released
scope: release
authority: supporting
opened-on: 2026-09-11
released-on: 2026-09-11
commit: c5a2894c05a529d6c07bc26575f6d0f33b9b43a8
---

# Выпуск 1.7.0

Правила выпуска — `REQ-RELEASE` в поставке пакета правил. [Каталог](INDEX.md)

## Цель

Выпустить состояние сервиса, накопленное после предыдущего выпуска, и исполнить обязательства ядра, попавшие в этот выпуск.

## Состав

| Задача | Причина включения |
|---|---|
| [CORE-API-004](../tickets/closed/CORE-API-004-service-cannot-add-an-extension-to-the-error-body.md) | Закрыта в этом выпуске, приоритет P2 |
| [CORE-API-005](../tickets/closed/CORE-API-005-session-handler-cannot-tell-a-failed-login.md) | Закрыта в этом выпуске, приоритет P2 |
| [CORE-API-006](../tickets/closed/CORE-API-006-error-response-cannot-carry-headers.md) | Закрыта в этом выпуске, приоритет P2 |
| [CORE-OPS-032](../tickets/closed/CORE-OPS-032-name-migration-does-not-apply-the-project-prefix.md) | Закрыта в этом выпуске, приоритет P2 |
| [CORE-QUAL-006](../tickets/closed/CORE-QUAL-006-release-status-fails-on-a-normal-state.md) | Закрыта в этом выпуске, приоритет P2 |

## Критерии выхода

- [x] Набор `verify` пройден на выпускаемом коммите — расписка 2026-09-11T14:19:03.693Z, наборы: check, verify, прогон `mise run verify-set`
- [x] Тег выпуска создан на проверенном коммите — `v1.7.0`
- [x] Обязательства ядра этого выпуска закрыты или перенесены записью с причиной — ядро не объявляет обязательств самому себе
- [x] Завершающий шаг выполнен — публикация артефактов ядра: mise run install-local

## Не входит

Задачи, не закрытые к моменту закрытия выпуска: они попадут в состав следующего по факту закрытия.

## Результат

Выпущено с коммита `c5a2894c05a529d6c07bc26575f6d0f33b9b43a8`, тег `v1.7.0`.

Расписка о проверках получена 2026-09-11T14:19:03.693Z; выполненные наборы: check, verify.

Прогон наблюдён командой `mise run verify-set` с кодом возврата 0.

Развёртывание выполняется этим тегом: REQ-RELEASE-016.
