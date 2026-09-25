---
id: RELEASE-10-0-0
type: release
status: released
scope: release
authority: supporting
opened-on: 2026-09-25
released-on: 2026-09-25
commit: ad5d5e30586f2573a452d95b4d13a4cd3ffa4ae4
---

# Выпуск 10.0.0

Правила выпуска — `REQ-RELEASE` в поставке пакета правил. [Каталог](INDEX.md)

## Цель

Выпустить состояние сервиса, накопленное после предыдущего выпуска, и исполнить обязательства ядра, попавшие в этот выпуск.

## Состав

| Задача | Причина включения |
|---|---|
| [CORE-ARC-019](../tickets/closed/CORE-ARC-019-change-email-and-delete-account.md) | Закрыта в этом выпуске, приоритет P1 |

## Критерии выхода

- [x] Набор `verify` пройден на выпускаемом коммите — расписка 2026-09-25T06:28:50.870Z, наборы: check, verify, прогон `mise run verify-set`
- [x] Тег выпуска создан на проверенном коммите — `v10.0.0`
- [x] Обязательства ядра этого выпуска закрыты или перенесены записью с причиной — ядро не объявляет обязательств самому себе
- [x] Завершающий шаг выполнен — публикация артефактов ядра: mise run install-local

## Не входит

Задачи, не закрытые к моменту закрытия выпуска: они попадут в состав следующего по факту закрытия.

## Несовместимые изменения

- `AuthLetters` получил два метода — `emailChange(email, link, locale)` и `emailChanged(previousEmail, locale)` (`REQ-AUTH-023`): реализация проекта без них не компилируется.
- В таблице `platform_account_token` появился столбец `email`: без него смена почты самим человеком отказывает ошибкой базы.

## Миграция

1. Дописать в свою реализацию `AuthLetters` два письма: подтверждение новой почты со ссылкой и извещение прежней почты о смене. Язык — из `locale`.
2. Переходом базы добавить столбец: `ALTER TABLE platform_account_token ADD COLUMN email VARCHAR(320)`. Образец таблицы — `sql/platform-auth/create-token.sql`.
3. По желанию: страница клиента для ссылки смены почты — путь `platform.auth.links.email-change`, по умолчанию `/auth/email?token={token}`; ключ из строки запроса передаётся в `AuthSession.confirmEmail(token)`. Форма смены — `AuthSession.changeEmail(current, email)`.
4. Экраны администратора: `Accounts.changeEmail(id, email, locale)` и `Accounts.delete(id)` вместо своего SQL по таблицам ядра. Исход `HELD` значит, что запись держат данные проекта или обращения центра поддержки: их сначала стирают (`SupportRetention.erase`).

Удаление учётной записи и смена почты касаются персональных данных по 152-ФЗ: прежняя почта не остаётся ни в журналах, ни в записи; удаление записи — часть ответа на запрос субъекта.

## Результат

Выпущено с коммита `ad5d5e30586f2573a452d95b4d13a4cd3ffa4ae4`, тег `v10.0.0`.

Расписка о проверках получена 2026-09-25T06:28:50.870Z; выполненные наборы: check, verify.

Прогон наблюдён командой `mise run verify-set` с кодом возврата 0.

Развёртывание выполняется этим тегом: REQ-RELEASE-016.

## Цена обновления

Несовместимо (2) — версия обязана быть старшей:
- `AuthLetters` получил два метода — `emailChange(email, link, locale)` и `emailChanged(previousEmail, locale)` (`REQ-AUTH-023`): реализация проекта без них не компилируется.
- В таблице `platform_account_token` появился столбец `email`: без него смена почты самим человеком отказывает ошибкой базы.

Добавлено (7):
- положений добавлено: 2
- в контракте — platform-auth: ответ 202 у POST /api/auth/email
- в контракте — platform-auth: ответ 204 у POST /api/auth/email/confirm
- в контракте — platform-auth: поле EmailChangeRequest.current
- в контракте — platform-auth: поле EmailChangeRequest.email
- в контракте — platform-auth: точка POST /api/auth/email
- в контракте — platform-auth: точка POST /api/auth/email/confirm
