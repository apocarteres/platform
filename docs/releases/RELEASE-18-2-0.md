---
id: RELEASE-18-2-0
type: release
status: released
scope: release
authority: supporting
opened-on: 2026-11-16
released-on: 2026-11-16
commit: aa016435bc37ccac36588eba7df5dd651fcf1adc
---

# Выпуск 18.2.0

Правила выпуска — `REQ-RELEASE` в поставке пакета правил. [Каталог](INDEX.md)

## Цель

Выпустить состояние сервиса, накопленное после предыдущего выпуска, и исполнить обязательства ядра, попавшие в этот выпуск.

## Состав

| Задача | Причина включения | Порядок |
|---|---|---|
| [CORE-ARC-033](../tickets/closed/CORE-ARC-033-telegram-sign-in.md) | Закрыта в этом выпуске, приоритет P2 | 1 |

## Критерии выхода

- [x] Набор `verify` пройден на выпускаемом коммите — расписка 2026-11-16T19:56:36.850Z, наборы: check, verify, прогон `conventions receipt --parts: mise run verify-part-checks && mise run verify-part-rules && mise run verify-part-web && mise run java-test`
- [x] Тег выпуска создан на проверенном коммите — `v18.2.0`
- [x] Обязательства ядра этого выпуска закрыты или перенесены записью с причиной — ядро не объявляет обязательств самому себе
- [x] Завершающий шаг выполнен — публикация артефактов ядра: mise run install-local

## Не входит

Задачи, не закрытые к моменту закрытия выпуска: они попадут в состав следующего по факту закрытия.

## Результат

Выпущено с коммита `aa016435bc37ccac36588eba7df5dd651fcf1adc`, тег `v18.2.0`.

Расписка о проверках получена 2026-11-16T19:56:36.850Z; выполненные наборы: check, verify.

Прогон наблюдён командой `conventions receipt --parts: mise run verify-part-checks && mise run verify-part-rules && mise run verify-part-web && mise run java-test` с кодом возврата 0.

Развёртывание выполняется этим тегом: REQ-RELEASE-016.

## Цена обновления

Несовместимого нет: обновление не делает check красным и не меняет объявленного поведения.

Добавлено (13):
- положений добавлено: 3
- в контракте — platform-telegram: ответ 200 у POST /api/telegram/{bot}/login
- в контракте — platform-telegram: поле LoginWidget.auth_date
- в контракте — platform-telegram: поле LoginWidget.first_name
- в контракте — platform-telegram: поле LoginWidget.hash
- в контракте — platform-telegram: поле LoginWidget.id
- в контракте — platform-telegram: поле LoginWidget.last_name
- в контракте — platform-telegram: поле LoginWidget.photo_url
- в контракте — platform-telegram: поле LoginWidget.username
- в контракте — platform-telegram: поле SignedIn.email
- в контракте — platform-telegram: поле SignedIn.id
- в контракте — platform-telegram: поле SignedIn.roles
- в контракте — platform-telegram: точка POST /api/telegram/{bot}/login
