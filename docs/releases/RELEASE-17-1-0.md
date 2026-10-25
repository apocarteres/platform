---
id: RELEASE-17-1-0
type: release
status: released
scope: release
authority: supporting
opened-on: 2026-10-25
released-on: 2026-10-25
commit: 18fc413910d85ea8349665a2456ece1e8941de49
---

# Выпуск 17.1.0

Правила выпуска — `REQ-RELEASE` в поставке пакета правил. [Каталог](INDEX.md)

## Цель

Выпустить состояние сервиса, накопленное после предыдущего выпуска, и исполнить обязательства ядра, попавшие в этот выпуск.

## Состав

| Задача | Причина включения |
|---|---|
| [CORE-SEC-009](../tickets/closed/CORE-SEC-009-sessions-are-invisible-to-their-owner.md) | Закрыта в этом выпуске, приоритет P2 |

## Критерии выхода

- [x] Набор `verify` пройден на выпускаемом коммите — расписка 2026-10-25T11:26:26.395Z, наборы: check, verify, прогон `mise run verify-set`
- [x] Тег выпуска создан на проверенном коммите — `v17.1.0`
- [x] Обязательства ядра этого выпуска закрыты или перенесены записью с причиной — ядро не объявляет обязательств самому себе
- [x] Завершающий шаг выполнен — публикация артефактов ядра: mise run install-local

## Не входит

Задачи, не закрытые к моменту закрытия выпуска: они попадут в состав следующего по факту закрытия.

## Результат

Выпущено с коммита `18fc413910d85ea8349665a2456ece1e8941de49`, тег `v17.1.0`.

Расписка о проверках получена 2026-10-25T11:26:26.395Z; выполненные наборы: check, verify.

Прогон наблюдён командой `mise run verify-set` с кодом возврата 0.

Развёртывание выполняется этим тегом: REQ-RELEASE-016.

## Цена обновления

Несовместимого нет: обновление не делает check красным и не меняет объявленного поведения.

Добавлено (13):
- положений добавлено: 1
- в контракте — platform-auth: ответ 200 у GET /api/auth/sessions
- в контракте — platform-auth: ответ 204 у DELETE /api/auth/sessions
- в контракте — platform-auth: ответ 204 у DELETE /api/auth/sessions/{id}
- в контракте — platform-auth: поле OpenedSession.address
- в контракте — platform-auth: поле OpenedSession.agent
- в контракте — platform-auth: поле OpenedSession.current
- в контракте — platform-auth: поле OpenedSession.id
- в контракте — platform-auth: поле OpenedSession.lastSeenAt
- в контракте — platform-auth: поле OpenedSession.signedInAt
- в контракте — platform-auth: точка DELETE /api/auth/sessions
- в контракте — platform-auth: точка DELETE /api/auth/sessions/{id}
- в контракте — platform-auth: точка GET /api/auth/sessions
