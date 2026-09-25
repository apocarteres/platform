---
id: CORE-QUAL-028
type: ticket
status: done
scope: frontend, typescript
authority: supporting
priority: P1
release: RELEASE-11-1-0
related: REQ-AUTH, REQ-API, REQ-SUPPORT, REQ-NOTIFICATIONS
---

# Код отказа не читается за `sanitisingInterceptor` ядра

## Проблема

`sanitisingInterceptor` (`@apocarteres/http`, `REQ-API-003`) заменяет отказ
`HttpErrorResponse` на `ApiFailure`. `authFailureCode` читал код только у
`HttpErrorResponse`: у гостя `AuthSession.ready()` отклонялся вместо
`account() = null`, а `authInterceptor`, стоящий дальше от сервера, чем
`sanitisingInterceptor`, не снимал истёкшую сессию. Тот же изъян — у счётчиков
центра поддержки и у колокольчика: «нет входа» они узнавали только по
`HttpErrorResponse`.

## Подтверждение

Заявка потребителя [issue #50](https://github.com/apocarteres/platform/issues/50)
(clanlog, ядро 11.0.0). Сверено 2026-09-25 по `auth.ts`, `support.ts`, `bell.ts`.

## Последствия при сохранении текущего поведения

Два пакета ядра, подключённые по требованиям ядра, не работают вместе:
охрана маршрутов у гостя падает, счётчики центра и колокольчик у вышедшего —
отказ вместо нуля.

## Требуется

Код и статус отказа читаются и у `ApiFailure` (`problem`).

## Критерии приёмки

- Тесты каждого пакета на цепочке с настоящим `sanitisingInterceptor`.

## Что сделано

- `authFailureCode` читает `problem.code`; `SupportUnread` и `NotificationBell`
  узнают выход по `problem.status`.
- Тесты на цепочке с `sanitisingInterceptor` в `@apocarteres/auth`,
  `@apocarteres/support`, `@apocarteres/notifications`; пробы без исправления
  роняют их во всех трёх.

## Откуда пришла задача

[issue #50](https://github.com/apocarteres/platform/issues/50).
