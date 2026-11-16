---
id: CORE-ARC-032
type: ticket
status: done
scope: backend, security
authority: supporting
priority: P2
release: RELEASE-18-1-0
related: REQ-AUTH, REQ-TELEGRAM, CORE-ARC-030, CORE-ARC-034
---

# Подпись Mini App каждый проект проверяет своим кодом

## Проблема

Порт `RequestAuthenticator` (`REQ-AUTH-037`) пускает внешнюю личность, но
проверку `initData` Telegram Mini App — HMAC по правилам Telegram и срок
`auth_date` — каждый проект пишет сам (`docs/runbooks/external-identity.md`).
Ошибка в этой проверке открывает API клиента любому.

## Подтверждение

Просьбы потребителей, разговор с владельцем 2026-11-16; образец проверки в
runbook — код проекта, не ядра.

## Последствия при сохранении текущего поведения

Проверка подписи — место, где ошибка не видна в работе, — повторяется в
каждом проекте.

## Решение владельца

Решение владельца от 2026-11-16 — в `CORE-ARC-030`: этап 3 модуля
`platform-telegram`.

## Требуется

1. Проверка `initData` в `platform-telegram`: ключ из токена бота,
   постоянное сравнение подписи, срок `auth_date` настраивается, но только
   конечный.
2. Готовый `RequestAuthenticator`: проект называет пути и роли внешней
   личности (`REQ-AUTH-039`); идентификатор — пользователь Telegram.
3. Runbook внешней личности — на готовую проверку.

## Критерии приёмки

- Подделанная, просроченная и неполная `initData` — отказ
  `identity-rejected`.
- Верная — личность вида `telegram` с ролями проекта.
- `mise run verify` зелёный.

## Ход работы

- 2026-11-16 — проверка `initData` (`REQ-TELEGRAM-018`): поля без `hash`
  по алфавиту, ключ — HMAC-SHA256 токена бота с ключом `WebAppData`,
  постоянное сравнение; `auth_date` не старше `platform.telegram.mini-app.max-age`
  (час по умолчанию, не больше 7 суток) и не из будущего дальше минуты;
  повтор поля и пользователь без `id` — отказ.
- С учётом нескольких ботов (`CORE-ARC-034`): пути и роли Mini App
  объявляются у бота — `platform.telegram.bots.<бот>.mini-app.paths`,
  `.roles`; подпись проверяется ботом, чей путь.
- Личность — вид `telegram`, идентификатор — пользователь Telegram;
  `TelegramMiniApp.user()` даёт бот и данные пользователя,
  `TelegramLinks.account(bot, user)` — связанную учётную запись.
- Личность webhook стала видом `telegram-webhook`, чтобы вид `telegram`
  означал только человека.
- Заголовок — `X-Telegram-Init-Data`, как в runbook внешней личности;
  runbook переведён на готовую проверку.

## Откуда пришла задача

Разговор с владельцем 2026-11-16 о поддержке Telegram; этап 3 из 4.
