---
id: RELEASE-12-2-0
type: release
status: released
scope: release
authority: supporting
opened-on: 2026-09-27
released-on: 2026-09-27
commit: 976ae1cf46cd444fbfb383f605534c98a15bd2b3
---

# Выпуск 12.2.0

Правила выпуска — `REQ-RELEASE` в поставке пакета правил. [Каталог](INDEX.md)

## Цель

Выпустить состояние сервиса, накопленное после предыдущего выпуска, и исполнить обязательства ядра, попавшие в этот выпуск.

## Состав

| Задача | Причина включения |
|---|---|
| [CORE-ARC-020](../tickets/closed/CORE-ARC-020-access-keys.md) | Закрыта в этом выпуске, приоритет P2 |

## Критерии выхода

- [x] Набор `verify` пройден на выпускаемом коммите — расписка 2026-09-27T08:12:10.351Z, наборы: check, verify, прогон `mise run verify-set`
- [x] Тег выпуска создан на проверенном коммите — `v12.2.0`
- [x] Обязательства ядра этого выпуска закрыты или перенесены записью с причиной — ядро не объявляет обязательств самому себе
- [x] Завершающий шаг выполнен — публикация артефактов ядра: mise run install-local

## Не входит

Задачи, не закрытые к моменту закрытия выпуска: они попадут в состав следующего по факту закрытия.

## Результат

Выпущено с коммита `976ae1cf46cd444fbfb383f605534c98a15bd2b3`, тег `v12.2.0`.

Расписка о проверках получена 2026-09-27T08:12:10.351Z; выполненные наборы: check, verify.

Прогон наблюдён командой `mise run verify-set` с кодом возврата 0.

Развёртывание выполняется этим тегом: REQ-RELEASE-016.

## Цена обновления

Несовместимого нет: обновление не делает check красным и не меняет объявленного поведения.

Добавлено (21):
- положений добавлено: 7
- в контракте — platform-auth: ответ 200 у GET /api/auth/keys
- в контракте — platform-auth: ответ 201 у POST /api/auth/keys
- в контракте — platform-auth: ответ 204 у DELETE /api/auth/keys
- в контракте — platform-auth: ответ 204 у DELETE /api/auth/keys/{id}
- в контракте — platform-auth: поле AccessKey.createdAt
- в контракте — platform-auth: поле AccessKey.expiresAt
- в контракте — platform-auth: поле AccessKey.id
- в контракте — platform-auth: поле AccessKey.lastUsedAt
- в контракте — platform-auth: поле AccessKey.name
- в контракте — platform-auth: поле IssuedKey.createdAt
- в контракте — platform-auth: поле IssuedKey.expiresAt
- в контракте — platform-auth: поле IssuedKey.id
- в контракте — platform-auth: поле IssuedKey.name
- в контракте — platform-auth: поле IssuedKey.value
- в контракте — platform-auth: поле KeyRequest.days
- в контракте — platform-auth: поле KeyRequest.name
- в контракте — platform-auth: точка DELETE /api/auth/keys
- в контракте — platform-auth: точка DELETE /api/auth/keys/{id}
- в контракте — platform-auth: точка GET /api/auth/keys
- в контракте — platform-auth: точка POST /api/auth/keys
