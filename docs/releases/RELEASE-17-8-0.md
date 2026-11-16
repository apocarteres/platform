---
id: RELEASE-17-8-0
type: release
status: released
scope: release
authority: supporting
opened-on: 2026-11-16
released-on: 2026-11-16
commit: da2b64224ae78c5f8e84b24539da738df0861f98
---

# Выпуск 17.8.0

Правила выпуска — `REQ-RELEASE` в поставке пакета правил. [Каталог](INDEX.md)

## Цель

Выпустить состояние сервиса, накопленное после предыдущего выпуска, и исполнить обязательства ядра, попавшие в этот выпуск.

## Состав

| Задача | Причина включения | Порядок |
|---|---|---|
| [CORE-API-010](../tickets/closed/CORE-API-010-operator-list-filters.md) | Закрыта в этом выпуске, приоритет P2 | 1 |

## Критерии выхода

- [x] Набор `verify` пройден на выпускаемом коммите — расписка 2026-11-16T13:25:59.694Z, наборы: check, verify, прогон `conventions receipt --parts: mise run verify-part-checks && mise run verify-part-rules && mise run verify-part-web && mise run java-test`
- [x] Тег выпуска создан на проверенном коммите — `v17.8.0`
- [x] Обязательства ядра этого выпуска закрыты или перенесены записью с причиной — ядро не объявляет обязательств самому себе
- [x] Завершающий шаг выполнен — публикация артефактов ядра: mise run install-local

## Не входит

Задачи, не закрытые к моменту закрытия выпуска: они попадут в состав следующего по факту закрытия.

## Результат

Выпущено с коммита `da2b64224ae78c5f8e84b24539da738df0861f98`, тег `v17.8.0`.

Расписка о проверках получена 2026-11-16T13:25:59.694Z; выполненные наборы: check, verify.

Прогон наблюдён командой `conventions receipt --parts: mise run verify-part-checks && mise run verify-part-rules && mise run verify-part-web && mise run java-test` с кодом возврата 0.

Развёртывание выполняется этим тегом: REQ-RELEASE-016.

## Цена обновления

Несовместимого нет: обновление не делает check красным и не меняет объявленного поведения.

Добавлено (8):
- положений добавлено: 1
- в контракте — platform-support: значение RequestOrder ACTIVITY
- в контракте — platform-support: значение RequestOrder CREATED
- в контракте — platform-support: ответ 200 у GET /api/support/operator/counts
- в контракте — platform-support: поле Count.state
- в контракте — platform-support: поле Count.total
- в контракте — platform-support: поле Counts.states
- в контракте — platform-support: точка GET /api/support/operator/counts
