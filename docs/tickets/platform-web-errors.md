---
id: TICKET-PLATFORM-WEB-ERRORS
type: ticket
status: backlog
scope: backend, api, frontend
authority: supporting
priority: P2
release: unassigned
depends-on: TICKET-GITHUB-PACKAGES-PUBLISHING
related: ADR-0001
---

# Starter `platform-web-errors`: единый контракт ошибок API

## Цель

Общий `@RestControllerAdvice` с контрактом RFC 9457 `ProblemDetail` и расширением `code`, метриками ошибок и портом локализации сообщений. Оба проекта переходят на него одним релизом каждый.

## Основание

1. Решение о контракте принято 2026-09-06 ([ADR-0001](../decisions/ADR-0001-shared-core.md), раздел 6).
2. zavpn: `config/ApiExceptionHandler` с `ApiError(code, message)`, `ApiErrorMetrics` с нормализацией URI, `ApiErrorMessageLocalizer`; отдельный advice для Client API с полем `requestId`.
3. clanlog: глобального advice нет, около тринадцати локальных `@ExceptionHandler` однотипно отображают `NoSuchElementException` в 404 и `IllegalArgumentException` в 400; коды ошибок передаются строкой в сообщении исключения и разбираются клиентом в `shared/http-error.ts`.

## Последствия при сохранении текущего поведения

Два несовместимых формата ошибок в одном проекте (zavpn) и дублирование обработчиков в другом (clanlog); контракт кодов держится на совпадении литералов и ничем не проверяется.

## Требуется

1. `ProblemDetail` с полями `type`, `title`, `status`, `detail`, `instance` и расширениями `code`, при необходимости `requestId`.
2. Порт `ErrorCodeResolver`: проект сопоставляет свои исключения кодам и статусам; порт `ErrorMessageLocalizer` с реализацией по умолчанию, не раскрывающей внутренние сообщения.
3. Метрики ошибок с нормализацией URI по лучшему совпадению шаблона, как в zavpn.
4. Angular-пакет `@apocarteres/http`: разбор `ProblemDetail`, интерсептор санитизации, интерсептор истёкшей сессии.
5. Переход каждого проекта одним изменением: серверный контракт и клиентский разбор вместе, без поддержки старого формата.

## Критерии приёмки

- В обоих проектах не остаётся локальных `@ExceptionHandler` для общих исключений и собственных типов тела ошибки.
- Контрактные тесты starter проверяют каждый статус и форму тела; e2e-сценарии clanlog и live-тесты zavpn, читающие ошибки, проходят.
- Список кодов ошибок проекта проверяется тестом на соответствие словарю клиента.
