---
id: RELEASE-11-1-0
type: release
status: released
scope: release
authority: supporting
opened-on: 2026-09-25
released-on: 2026-09-25
commit: 817984fc660eb1a066af8a98d64e7168d2a9a411
---

# Выпуск 11.1.0

Правила выпуска — `REQ-RELEASE` в поставке пакета правил. [Каталог](INDEX.md)

## Цель

Выпустить состояние сервиса, накопленное после предыдущего выпуска, и исполнить обязательства ядра, попавшие в этот выпуск.

## Состав

| Задача | Причина включения |
|---|---|
| [CORE-ARC-018](../tickets/closed/CORE-ARC-018-notification-bell.md) | Закрыта в этом выпуске, приоритет P2 |
| [CORE-DOC-018](../tickets/closed/CORE-DOC-018-core-writes-its-own-forbidden-word.md) | Закрыта в этом выпуске, приоритет P2 |
| [CORE-OPS-095](../tickets/closed/CORE-OPS-095-obligation-ticket-listed-twice-at-open.md) | Закрыта в этом выпуске, приоритет P2 |
| [CORE-OPS-096](../tickets/closed/CORE-OPS-096-static-check-crashes-without-index.md) | Закрыта в этом выпуске, приоритет P2 |
| [CORE-QUAL-028](../tickets/closed/CORE-QUAL-028-auth-code-behind-sanitising-interceptor.md) | Закрыта в этом выпуске, приоритет P1 |
| [CORE-SEC-002](../tickets/closed/CORE-SEC-002-terminated-session-survives-a-clock-step.md) | Закрыта в этом выпуске, приоритет P1 |

## Учтённые коммиты

| Коммит | Заголовок | Причина |
|---|---|---|
| 87a9be4a | CORE-DOC-011 The core writes ограничитель where its own dictionary forbids the other word | Работа задачи CORE-DOC-018 (заявка #54): коммит ошибочно подписан занятым номером CORE-DOC-011, номер исправлен следующим коммитом |

## Критерии выхода

- [x] Набор `verify` пройден на выпускаемом коммите — расписка 2026-09-25T08:38:23.109Z, наборы: check, verify, прогон `mise run verify-set`
- [x] Тег выпуска создан на проверенном коммите — `v11.1.0`
- [x] Обязательства ядра этого выпуска закрыты или перенесены записью с причиной — ядро не объявляет обязательств самому себе
- [x] Завершающий шаг выполнен — публикация артефактов ядра: mise run install-local

## Не входит

Задачи, не закрытые к моменту закрытия выпуска: они попадут в состав следующего по факту закрытия.

## Миграция

Правок не требуется.

- **Колокольчик** необязателен; подключение — [RUN-NOTIFICATION-BELL](../runbooks/notification-bell.md): зависимость `platform-notifications`, таблица по образцу `sql/platform-notifications/create-notification.sql`, `provideNotifications()` в клиенте, команды `Notifications.purgeExpired()` и `erase(account)` из своего планировщика. С подключённым колокольчиком центр поддержки звонит в него сам.
- **Сессии** (`REQ-AUTH-026`): завершённая сессия недействительна сразу и при шаге часов назад; прежде она жила, пока часы не догонят её последнее обращение.
- **Клиенты ядра за `sanitisingInterceptor`** (CORE-QUAL-028): `authFailureCode`, `SupportUnread` и `NotificationBell` читают отказ и у `ApiFailure`. Обход с порядком перехватчиков можно снять.
- `Accounts.withRole(role)` — новый метод (`REQ-AUTH-025`).

## Результат

Выпущено с коммита `817984fc660eb1a066af8a98d64e7168d2a9a411`, тег `v11.1.0`.

Расписка о проверках получена 2026-09-25T08:38:23.109Z; выполненные наборы: check, verify.

Прогон наблюдён командой `mise run verify-set` с кодом возврата 0.

Развёртывание выполняется этим тегом: REQ-RELEASE-016.

## Цена обновления

Несовместимого нет: обновление не делает check красным и не меняет объявленного поведения.

Добавлено (24):
- положений добавлено: 11
- в контракте — platform-notifications: ответ 200 у GET /api/notifications
- в контракте — platform-notifications: ответ 200 у GET /api/notifications/unread
- в контракте — platform-notifications: ответ 204 у POST /api/notifications/read-all
- в контракте — platform-notifications: ответ 204 у POST /api/notifications/{id}/read
- в контракте — platform-notifications: поле Bell.items
- в контракте — platform-notifications: поле Bell.unread
- в контракте — platform-notifications: поле Notice.createdAt
- в контракте — platform-notifications: поле Notice.id
- в контракте — platform-notifications: поле Notice.kind
- в контракте — platform-notifications: поле Notice.link
- в контракте — platform-notifications: поле Notice.params
- в контракте — platform-notifications: поле Notice.read
- в контракте — platform-notifications: поле ProblemDetail.code
- в контракте — platform-notifications: поле ProblemDetail.detail
- в контракте — platform-notifications: поле ProblemDetail.instance
- в контракте — platform-notifications: поле ProblemDetail.status
- в контракте — platform-notifications: поле ProblemDetail.title
- в контракте — platform-notifications: поле ProblemDetail.type
- в контракте — platform-notifications: поле Unread.count
- в контракте — platform-notifications: точка GET /api/notifications
- в контракте — platform-notifications: точка GET /api/notifications/unread
- в контракте — platform-notifications: точка POST /api/notifications/read-all
- в контракте — platform-notifications: точка POST /api/notifications/{id}/read
