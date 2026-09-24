---
id: RELEASE-9-0-0
type: release
status: released
scope: release
authority: supporting
opened-on: 2026-09-24
released-on: 2026-09-24
commit: 04df41716465db146715ca6eb24e048304c97239
---

# Выпуск 9.0.0

Правила выпуска — `REQ-RELEASE` в поставке пакета правил. [Каталог](INDEX.md)

## Цель

Выпустить состояние сервиса, накопленное после предыдущего выпуска, и исполнить обязательства ядра, попавшие в этот выпуск.

## Состав

| Задача | Причина включения |
|---|---|
| [CORE-ARC-015](../tickets/closed/CORE-ARC-015-openapi-contract-for-core-auth.md) | Закрыта в этом выпуске, приоритет P2 |

## Критерии выхода

- [x] Набор `verify` пройден на выпускаемом коммите — расписка 2026-09-24T20:28:40.146Z, наборы: check, verify, прогон `mise run verify-set`
- [x] Тег выпуска создан на проверенном коммите — `v9.0.0`
- [x] Обязательства ядра этого выпуска закрыты или перенесены записью с причиной — ядро не объявляет обязательств самому себе
- [x] Завершающий шаг выполнен — публикация артефактов ядра: mise run install-local

## Не входит

Задачи, не закрытые к моменту закрытия выпуска: они попадут в состав следующего по факту закрытия.

## Несовместимые изменения

- `RegistrationHook` типизирован: `RegistrationHook<P>` называет класс профиля методом `profile()` и получает профиль экземпляром этого класса, а не словарём (`REQ-AUTH-021`).
- Профиль регистрации разбирается строго: поле, которого нет в классе проекта, и неверное значение — отказ `400 profile-rejected`. `RegistrationHook.NONE` принимает только пустой профиль.
- `Accounts.create` принимает профиль экземпляром класса проекта либо словарём (`Object` вместо `Map<String, Object>`).

## Миграция

Аутентификацию ядра ещё не подключил ни один потребитель. Переходящий по обязательству `core-auth` объявляет класс профиля — запись с аннотациями Bean Validation — и `RegistrationHook<ЭтотКласс>`; без профиля — `RegistrationHook.NONE`. Контракт точек ядра — `platform-auth.openapi.json` в `platform-auth` и в `@apocarteres/auth`; подключение к своей спецификации — инструкция `RUN-CORE-AUTH-CONTRACT`. Клиент передаёт профиль своим типом: `register<P>`.

## Результат

Выпущено с коммита `04df41716465db146715ca6eb24e048304c97239`, тег `v9.0.0`.

Расписка о проверках получена 2026-09-24T20:28:40.146Z; выполненные наборы: check, verify.

Прогон наблюдён командой `mise run verify-set` с кодом возврата 0.

Развёртывание выполняется этим тегом: REQ-RELEASE-016.

## Цена обновления

Несовместимо (3) — версия обязана быть старшей:
- `RegistrationHook` типизирован: `RegistrationHook<P>` называет класс профиля методом `profile()` и получает профиль экземпляром этого класса, а не словарём (`REQ-AUTH-021`).
- Профиль регистрации разбирается строго: поле, которого нет в классе проекта, и неверное значение — отказ `400 profile-rejected`. `RegistrationHook.NONE` принимает только пустой профиль.
- `Accounts.create` принимает профиль экземпляром класса проекта либо словарём (`Object` вместо `Map<String, Object>`).

Добавлено (51):
- положений добавлено: 2
- в контракте — platform-auth: ответ 200 у GET /api/auth/csrf
- в контракте — platform-auth: ответ 200 у GET /api/auth/me
- в контракте — platform-auth: ответ 200 у GET /api/auth/policy
- в контракте — platform-auth: ответ 200 у POST /api/auth/login
- в контракте — platform-auth: ответ 202 у POST /api/auth/password-reset/request
- в контракте — platform-auth: ответ 202 у POST /api/auth/register
- в контракте — platform-auth: ответ 202 у POST /api/auth/resend
- в контракте — platform-auth: ответ 204 у POST /api/auth/logout
- в контракте — platform-auth: ответ 204 у POST /api/auth/password
- в контракте — platform-auth: ответ 204 у POST /api/auth/password-reset/confirm
- в контракте — platform-auth: ответ 204 у POST /api/auth/verify
- в контракте — platform-auth: поле Account.email
- в контракте — platform-auth: поле Account.id
- в контракте — platform-auth: поле Account.roles
- в контракте — platform-auth: поле Csrf.headerName
- в контракте — platform-auth: поле Csrf.parameterName
- в контракте — platform-auth: поле Csrf.token
- в контракте — platform-auth: поле EmailRequest.email
- в контракте — platform-auth: поле EmailRequest.human
- в контракте — platform-auth: поле LoginRequest.email
- в контракте — platform-auth: поле LoginRequest.human
- в контракте — platform-auth: поле LoginRequest.password
- в контракте — platform-auth: поле PasswordChangeRequest.current
- в контракте — platform-auth: поле PasswordChangeRequest.password
- в контракте — platform-auth: поле Policy.passwordMaxBytes
- в контракте — platform-auth: поле Policy.passwordMinBytes
- в контракте — platform-auth: поле ProblemDetail.code
- в контракте — platform-auth: поле ProblemDetail.detail
- в контракте — platform-auth: поле ProblemDetail.instance
- в контракте — platform-auth: поле ProblemDetail.status
- в контракте — platform-auth: поле ProblemDetail.title
- в контракте — platform-auth: поле ProblemDetail.type
- в контракте — platform-auth: поле RegisterRequest.email
- в контракте — platform-auth: поле RegisterRequest.human
- в контракте — platform-auth: поле RegisterRequest.password
- в контракте — platform-auth: поле RegisterRequest.profile
- в контракте — platform-auth: поле ResetRequest.password
- в контракте — platform-auth: поле ResetRequest.token
- в контракте — platform-auth: поле TokenRequest.token
- в контракте — platform-auth: точка GET /api/auth/csrf
- в контракте — platform-auth: точка GET /api/auth/me
- в контракте — platform-auth: точка GET /api/auth/policy
- в контракте — platform-auth: точка POST /api/auth/login
- в контракте — platform-auth: точка POST /api/auth/logout
- в контракте — platform-auth: точка POST /api/auth/password
- в контракте — platform-auth: точка POST /api/auth/password-reset/confirm
- в контракте — platform-auth: точка POST /api/auth/password-reset/request
- в контракте — platform-auth: точка POST /api/auth/register
- в контракте — platform-auth: точка POST /api/auth/resend
- в контракте — platform-auth: точка POST /api/auth/verify
