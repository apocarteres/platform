---
id: RELEASE-18-0-0
type: release
status: released
scope: release
authority: supporting
opened-on: 2026-11-16
released-on: 2026-11-16
commit: add8124ec63089c8b05b9367b7d65d81e07702eb
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

| Задача | Причина включения | Порядок |
|---|---|---|
| [CORE-ARC-031](../tickets/closed/CORE-ARC-031-telegram-notifications.md) | Закрыта в этом выпуске, приоритет P2 | 1 |
| [CORE-ARC-034](../tickets/closed/CORE-ARC-034-telegram-several-bots.md) | Закрыта в этом выпуске, приоритет P2 | 1 |

## Критерии выхода

- [x] Набор `verify` пройден на выпускаемом коммите — расписка 2026-11-16T18:30:38.847Z, наборы: check, verify, прогон `conventions receipt --parts: mise run verify-part-checks && mise run verify-part-rules && mise run verify-part-web && mise run java-test`
- [x] Тег выпуска создан на проверенном коммите — `v18.0.0`
- [x] Обязательства ядра этого выпуска закрыты или перенесены записью с причиной — ядро не объявляет обязательств самому себе
- [x] Завершающий шаг выполнен — публикация артефактов ядра: mise run install-local

## Не входит

Задачи, не закрытые к моменту закрытия выпуска: они попадут в состав следующего по факту закрытия.

## Результат

Выпущено с коммита `add8124ec63089c8b05b9367b7d65d81e07702eb`, тег `v18.0.0`.

Расписка о проверках получена 2026-11-16T18:30:38.847Z; выполненные наборы: check, verify.

Прогон наблюдён командой `conventions receipt --parts: mise run verify-part-checks && mise run verify-part-rules && mise run verify-part-web && mise run java-test` с кодом возврата 0.

Развёртывание выполняется этим тегом: REQ-RELEASE-016.

## Цена обновления

Несовместимо (10) — версия обязана быть старшей:
- снято в контракте — platform-telegram: ответ 200 у GET /api/telegram/link: клиент, опиравшийся на это, сломается
- снято в контракте — platform-telegram: ответ 200 у POST /api/telegram/link: клиент, опиравшийся на это, сломается
- снято в контракте — platform-telegram: ответ 200 у POST /api/telegram/webhook: клиент, опиравшийся на это, сломается
- снято в контракте — platform-telegram: ответ 204 у DELETE /api/telegram/link: клиент, опиравшийся на это, сломается
- снято в контракте — platform-telegram: поле LinkState.linked: клиент, опиравшийся на это, сломается
- снято в контракте — platform-telegram: поле LinkState.linkedAt: клиент, опиравшийся на это, сломается
- снято в контракте — platform-telegram: точка DELETE /api/telegram/link: клиент, опиравшийся на это, сломается
- снято в контракте — platform-telegram: точка GET /api/telegram/link: клиент, опиравшийся на это, сломается
- снято в контракте — platform-telegram: точка POST /api/telegram/link: клиент, опиравшийся на это, сломается
- снято в контракте — platform-telegram: точка POST /api/telegram/webhook: клиент, опиравшийся на это, сломается

Добавлено (14):
- положений добавлено: 8
- в контракте — platform-telegram: ответ 200 у GET /api/telegram/links
- в контракте — platform-telegram: ответ 200 у POST /api/telegram/{bot}/link
- в контракте — platform-telegram: ответ 200 у POST /api/telegram/{bot}/webhook
- в контракте — platform-telegram: ответ 204 у DELETE /api/telegram/{bot}/link
- в контракте — platform-telegram: поле BotLink.bot
- в контракте — platform-telegram: поле BotLink.linked
- в контракте — platform-telegram: поле BotLink.linkedAt
- в контракте — platform-telegram: поле BotLink.name
- в контракте — platform-telegram: поле Links.bots
- в контракте — platform-telegram: точка DELETE /api/telegram/{bot}/link
- в контракте — platform-telegram: точка GET /api/telegram/links
- в контракте — platform-telegram: точка POST /api/telegram/{bot}/link
- в контракте — platform-telegram: точка POST /api/telegram/{bot}/webhook
