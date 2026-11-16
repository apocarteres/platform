---
id: RELEASE-17-9-0
type: release
status: released
scope: release
authority: supporting
opened-on: 2026-11-16
released-on: 2026-11-16
commit: 83c881a2d8861e2fc4824c60d32a35d4374c86a8
---

# Выпуск 17.9.0

Правила выпуска — `REQ-RELEASE` в поставке пакета правил. [Каталог](INDEX.md)

## Цель

Выпустить состояние сервиса, накопленное после предыдущего выпуска, и исполнить обязательства ядра, попавшие в этот выпуск.

## Состав

| Задача | Причина включения | Порядок |
|---|---|---|
| [CORE-ARC-030](../tickets/closed/CORE-ARC-030-telegram-link.md) | Закрыта в этом выпуске, приоритет P2 | 1 |

## Критерии выхода

- [x] Набор `verify` пройден на выпускаемом коммите — расписка 2026-11-16T15:40:35.645Z, наборы: check, verify, прогон `conventions receipt --parts: mise run verify-part-checks && mise run verify-part-rules && mise run verify-part-web && mise run java-test`
- [x] Тег выпуска создан на проверенном коммите — `v17.9.0`
- [x] Обязательства ядра этого выпуска закрыты или перенесены записью с причиной — ядро не объявляет обязательств самому себе
- [x] Завершающий шаг выполнен — публикация артефактов ядра: mise run install-local

## Не входит

Задачи, не закрытые к моменту закрытия выпуска: они попадут в состав следующего по факту закрытия.

## Результат

Выпущено с коммита `83c881a2d8861e2fc4824c60d32a35d4374c86a8`, тег `v17.9.0`.

Расписка о проверках получена 2026-11-16T15:40:35.645Z; выполненные наборы: check, verify.

Прогон наблюдён командой `conventions receipt --parts: mise run verify-part-checks && mise run verify-part-rules && mise run verify-part-web && mise run java-test` с кодом возврата 0.

Развёртывание выполняется этим тегом: REQ-RELEASE-016.

## Цена обновления

Несовместимого нет: обновление не делает check красным и не меняет объявленного поведения.

Добавлено (24):
- положений добавлено: 13
- в контракте — platform-telegram: ответ 200 у GET /api/telegram/link
- в контракте — platform-telegram: ответ 200 у POST /api/telegram/link
- в контракте — platform-telegram: ответ 200 у POST /api/telegram/webhook
- в контракте — platform-telegram: ответ 204 у DELETE /api/telegram/link
- в контракте — platform-telegram: поле Invitation.expiresAt
- в контракте — platform-telegram: поле Invitation.url
- в контракте — platform-telegram: поле LinkState.linked
- в контракте — platform-telegram: поле LinkState.linkedAt
- в контракте — platform-telegram: поле ProblemDetail.code
- в контракте — platform-telegram: поле ProblemDetail.detail
- в контракте — platform-telegram: поле ProblemDetail.instance
- в контракте — platform-telegram: поле ProblemDetail.status
- в контракте — platform-telegram: поле ProblemDetail.title
- в контракте — platform-telegram: поле ProblemDetail.type
- в контракте — platform-telegram: поле Reply.chat_id
- в контракте — platform-telegram: поле Reply.method
- в контракте — platform-telegram: поле Reply.text
- в контракте — platform-telegram: поле Update.message
- в контракте — platform-telegram: поле Update.update_id
- в контракте — platform-telegram: точка DELETE /api/telegram/link
- в контракте — platform-telegram: точка GET /api/telegram/link
- в контракте — platform-telegram: точка POST /api/telegram/link
- в контракте — platform-telegram: точка POST /api/telegram/webhook
