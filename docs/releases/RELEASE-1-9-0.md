---
id: RELEASE-1-9-0
type: release
status: released
scope: release
authority: supporting
opened-on: 2026-09-12
released-on: 2026-09-12
commit: abc791b353f7d9d130cefacdb3f52b32101bb61b
---

# Выпуск 1.9.0

Правила выпуска — `REQ-RELEASE` в поставке пакета правил. [Каталог](INDEX.md)

## Цель

Выпустить состояние сервиса, накопленное после предыдущего выпуска, и исполнить обязательства ядра, попавшие в этот выпуск.

## Состав

| Задача | Причина включения |
|---|---|
| [CORE-API-007](../tickets/closed/CORE-API-007-client-drops-extension-fields.md) | Закрыта в этом выпуске, приоритет P1 |
| [CORE-ARC-002](../tickets/closed/CORE-ARC-002-shared-modal-behaviour-research.md) | Закрыта в этом выпуске, приоритет P2 |
| [CORE-ARC-003](../tickets/closed/CORE-ARC-003-async-action-button-behaviour-research.md) | Закрыта в этом выпуске, приоритет P2 |
| [CORE-ARC-004](../tickets/closed/CORE-ARC-004-health-and-metrics-contracts-research.md) | Закрыта в этом выпуске, приоритет P2 |
| [CORE-DATA-002](../tickets/closed/CORE-DATA-002-core-package-escapes-the-module-model.md) | Закрыта в этом выпуске, приоритет P1 |
| [CORE-OPS-034](../tickets/closed/CORE-OPS-034-name-migration-doubles-the-prefix-in-file-names.md) | Закрыта в этом выпуске, приоритет P1 |
| [CORE-OPS-036](../tickets/closed/CORE-OPS-036-module-graph-has-no-executable-check.md) | Закрыта в этом выпуске, приоритет P1 |

## Критерии выхода

- [x] Набор `verify` пройден на выпускаемом коммите — расписка 2026-09-12T05:54:45.943Z, наборы: check, verify, прогон `mise run verify-set`
- [x] Тег выпуска создан на проверенном коммите — `v1.9.0`
- [x] Обязательства ядра этого выпуска закрыты или перенесены записью с причиной — ядро не объявляет обязательств самому себе
- [x] Завершающий шаг выполнен — публикация артефактов ядра: mise run install-local

## Не входит

Задачи, не закрытые к моменту закрытия выпуска: они попадут в состав следующего по факту закрытия.

## Результат

Выпущено с коммита `abc791b353f7d9d130cefacdb3f52b32101bb61b`, тег `v1.9.0`.

Расписка о проверках получена 2026-09-12T05:54:45.943Z; выполненные наборы: check, verify.

Прогон наблюдён командой `mise run verify-set` с кодом возврата 0.

Развёртывание выполняется этим тегом: REQ-RELEASE-016.
