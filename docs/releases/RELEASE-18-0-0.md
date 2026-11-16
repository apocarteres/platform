---
id: RELEASE-18-0-0
type: release
status: draft
scope: release
authority: supporting
opened-on: 2026-11-16
---

# Выпуск 18.0.0

Правила выпуска — `REQ-RELEASE` в поставке пакета правил. [Каталог](INDEX.md)

## Цель

Выпустить состояние сервиса, накопленное после предыдущего выпуска, и исполнить обязательства ядра, попавшие в этот выпуск.

## Миграция

Касается только проектов с `platform-telegram` 17.9.0; остальные переходят без изменений.

1. Настройки бота: `platform.telegram.bot-token`, `bot-name`, `webhook-secret` заменить на `platform.telegram.bots.main.token`, `.name`, `.webhook-secret`. Идентификатор `main` сохраняет связи и ссылки 17.9.0: набор журнала `platform-telegram:003-bots` относит их к боту `main`. С другим идентификатором — после перехода обновить столбец `bot` в `platform_telegram_link` и `platform_telegram_invite`.
2. Webhook: путь `/api/telegram/webhook` стал `/api/telegram/main/webhook` — зарегистрировать заново: `TelegramBots.bot("main").useWebhook(url)`.
3. Точки связи: `POST` и `DELETE /api/telegram/link` стали `/api/telegram/main/link`; `GET /api/telegram/link` заменён на `GET /api/telegram/links` — связи со всеми ботами.
4. Java: бин `TelegramBot` заменён на `TelegramBots.bot(id)`; `TelegramLinks.chat(account)` и `unlink(account)` — `chat(account, bot)` и `unlink(account, bot)`; `TelegramReplies.linked(language)` и `refused(language)` — `linked(bot, language)` и `refused(bot, language)`.
5. Клиент `@apocarteres/telegram`: сигнал `state` заменён на `bots` (связи по ботам) и `linked` (боты со связью); `invite()` и `unlink()` — `invite(bot)` и `unlink(bot)`.

Новое без миграции: доставка уведомлений за пределы приложения (`REQ-NOTIFICATIONS-011`…`014`) — таблица `platform_notification_delivery` приходит журналом `platform-notifications`; уведомления в Telegram включает бин проекта `TelegramTexts` (`REQ-TELEGRAM-014`).

## Состав

| Задача | Причина включения |
|---|---|
| [CORE-ARC-031](../tickets/closed/CORE-ARC-031-telegram-notifications.md) | Указана при открытии выпуска |
| [CORE-ARC-034](../tickets/closed/CORE-ARC-034-telegram-several-bots.md) | Указана при открытии выпуска |

## Критерии выхода

- [ ] Набор `verify` пройден на выпускаемом коммите — расписка получена командой выпуска
- [ ] Тег выпуска создан на проверенном коммите — ставится командой выпуска
- [ ] Обязательства ядра этого выпуска закрыты или перенесены записью с причиной
- [ ] Завершающий шаг выполнен — развёртывание в производственную среду или публикация артефактов

## Не входит

Задачи, не закрытые к моменту закрытия выпуска: они попадут в состав следующего по факту закрытия.

## Результат

Заполняется при закрытии из расписки о проверках.
