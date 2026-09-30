---
id: RUN-ACCESS-KEYS
type: runbook
status: active
scope: backend, frontend, security, personal-data
authority: supporting
related: REQ-AUTH
---
# Подключение ключей доступа

Норма — [`REQ-AUTH`](../requirements/auth.md), положения `REQ-AUTH-028`–`REQ-AUTH-034`. Ключ доступа — второй способ аутентификации ядра, для программного клиента: сервера инструментов, скрипта, агента.

## Сервер

1. Таблица — журналом ядра `platform/changelog/platform-auth.yaml` ([переход на журналы ядра](liquibase-adoption.md)).
2. Настройка `platform.auth.keys.enabled=true`. По желанию: `platform.auth.keys.max-days` (365, не больше 365), `platform.auth.keys.max-per-account` (10), `platform.auth.keys.requests-per-minute` (60), `platform.auth.keys.changes-per-minute` (20).
3. Бин `KeyAccess` — что открыто по ключу. Без него служба не стартует; `/api/auth/**` по ключу закрыты всегда.

   ```java
   @Bean
   KeyAccess keyAccess() {
     RequestMatcher opened = new OrRequestMatcher(
       PathPatternRequestMatcher.withDefaults().matcher("/mcp/**"),
       PathPatternRequestMatcher.withDefaults().matcher(HttpMethod.GET, "/api/raids/**"));
     return opened::matches;
   }
   ```

   Перечень разрешающий: новая точка по ключу закрыта, пока её не добавили сюда. Роли проверяются как обычно — `ApiAccess` действует и для запроса по ключу.
4. Аудит: `CurrentAccount.key()` — идентификатор и имя ключа, для запроса сессией пусто. Пишите их в запись журнала: «человек через ключ <имя>».
5. Отзыв согласия человека — `AccessKeys.revokeAll(account)`. Истёкшие ключи удаляет та же команда, что и просроченные ключи писем: `Accounts.purgeTokens(olderThan)` из своего планировщика.

Имя ключа и время его использования — персональные данные учётной записи (152-ФЗ): они удаляются вместе с ней, а в журнал аудита попадают только в тех пределах, что и остальные данные записи.

## Клиент

`AuthSession`: `keys()` — список без значений; `issueKey(name, days)` — значение ключа в поле `value`, **единственный раз**: покажите его человеку сразу и не храните; `revokeKey(id)`, `revokeKeys()`.

## Программный клиент

```
Authorization: Bearer pak_…
```

Ни cookie, ни токена CSRF. Отказы: `key-rejected` (401) — ключ неизвестен, отозван или истёк; `key-closed` (403) — точка по ключу закрыта; `account-blocked`, `email-unverified` (403); `rate-limited` (429) с заголовком `Retry-After`.
