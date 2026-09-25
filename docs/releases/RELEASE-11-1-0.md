---
id: RELEASE-11-1-0
type: release
status: draft
scope: release
authority: supporting
opened-on: 2026-09-25
---

# Выпуск 11.1.0

Правила выпуска — `REQ-RELEASE` в поставке пакета правил. [Каталог](INDEX.md)

## Цель

Выпустить состояние сервиса, накопленное после предыдущего выпуска, и исполнить обязательства ядра, попавшие в этот выпуск.

## Состав

| Задача | Причина включения |
|---|---|
| [CORE-ARC-018](../tickets/closed/CORE-ARC-018-notification-bell.md) | Указана при открытии выпуска |
| [CORE-SEC-002](../tickets/closed/CORE-SEC-002-terminated-session-survives-a-clock-step.md) | Указана при открытии выпуска |
| [CORE-QUAL-028](../tickets/closed/CORE-QUAL-028-auth-code-behind-sanitising-interceptor.md) | Указана при открытии выпуска |
| [CORE-OPS-095](../tickets/closed/CORE-OPS-095-obligation-ticket-listed-twice-at-open.md) | Указана при открытии выпуска |
| [CORE-OPS-096](../tickets/closed/CORE-OPS-096-static-check-crashes-without-index.md) | Указана при открытии выпуска |
| [CORE-DOC-018](../tickets/closed/CORE-DOC-018-core-writes-its-own-forbidden-word.md) | Указана при открытии выпуска |

## Критерии выхода

- [ ] Набор `verify` пройден на выпускаемом коммите — расписка получена командой выпуска
- [ ] Тег выпуска создан на проверенном коммите — ставится командой выпуска
- [ ] Обязательства ядра этого выпуска закрыты или перенесены записью с причиной
- [ ] Завершающий шаг выполнен — развёртывание в производственную среду или публикация артефактов

## Не входит

Задачи, не закрытые к моменту закрытия выпуска: они попадут в состав следующего по факту закрытия.

## Миграция

Правок не требуется.

- **Колокольчик** необязателен; подключение — [RUN-NOTIFICATION-BELL](../runbooks/notification-bell.md): зависимость `platform-notifications`, таблица по образцу `sql/platform-notifications/create-notification.sql`, `provideNotifications()` в клиенте, команды `Notifications.purgeExpired()` и `erase(account)` из своего планировщика. С подключённым колокольчиком центр поддержки звонит в него сам.
- **Сессии** (`REQ-AUTH-026`): завершённая сессия недействительна сразу и при шаге часов назад; прежде она жила, пока часы не догонят её последнее обращение.
- **Клиенты ядра за `sanitisingInterceptor`** (CORE-QUAL-028): `authFailureCode`, `SupportUnread` и `NotificationBell` читают отказ и у `ApiFailure`. Обход с порядком перехватчиков можно снять.
- `Accounts.withRole(role)` — новый метод (`REQ-AUTH-025`).

## Результат

Заполняется при закрытии из расписки о проверках.
