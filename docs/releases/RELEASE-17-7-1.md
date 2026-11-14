---
id: RELEASE-17-7-1
type: release
status: released
scope: release
authority: supporting
opened-on: 2026-11-14
released-on: 2026-11-14
commit: a3b491bc96f20d6f84377d7ea52c75a735c603ee
---

# Выпуск 17.7.1

Правила выпуска — `REQ-RELEASE` в поставке пакета правил. [Каталог](INDEX.md)

## Цель

Выпустить состояние сервиса, накопленное после предыдущего выпуска, и исполнить обязательства ядра, попавшие в этот выпуск.

## Состав

| Задача | Причина включения | Порядок |
|---|---|---|
| [CORE-SEC-010](../tickets/closed/CORE-SEC-010-secret-cipher-reaches-every-stack.md) | Закрыта в этом выпуске, приоритет P2 | 1 |

## Критерии выхода

- [x] Набор `verify` пройден на выпускаемом коммите — расписка 2026-11-14T04:38:30.557Z, наборы: check, verify, прогон `conventions receipt --parts: mise run verify-part-checks && mise run verify-part-rules && mise run verify-part-web && mise run java-test`
- [x] Тег выпуска создан на проверенном коммите — `v17.7.1`
- [x] Обязательства ядра этого выпуска закрыты или перенесены записью с причиной — ядро не объявляет обязательств самому себе
- [x] Завершающий шаг выполнен — публикация артефактов ядра: mise run install-local

## Не входит

Задачи, не закрытые к моменту закрытия выпуска: они попадут в состав следующего по факту закрытия.

## Результат

Выпущено с коммита `a3b491bc96f20d6f84377d7ea52c75a735c603ee`, тег `v17.7.1`.

Расписка о проверках получена 2026-11-14T04:38:30.557Z; выполненные наборы: check, verify.

Прогон наблюдён командой `conventions receipt --parts: mise run verify-part-checks && mise run verify-part-rules && mise run verify-part-web && mise run java-test` с кодом возврата 0.

Развёртывание выполняется этим тегом: REQ-RELEASE-016.

## Цена обновления

Несовместимого нет: обновление не делает check красным и не меняет объявленного поведения.
