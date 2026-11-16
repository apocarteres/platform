---
id: RUN-EXTERNAL-IDENTITY
type: runbook
status: active
scope: backend, security, personal-data
authority: supporting
related: REQ-AUTH, REQ-TELEGRAM
---
# Подключение внешней личности

Норма — [`REQ-AUTH`](../requirements/auth.md), положения `REQ-AUTH-037`–`REQ-AUTH-040`. Внешняя личность — клиент без учётной записи ядра: пользователь мессенджера из его веб-приложения, сервер мессенджера с обновлениями бота, вход по стороннему удостоверению.

1. Роли клиентов — отдельным перечнем, без пересечения с ролями сотрудников:

   ```properties
   platform.auth.roles=STAFF,ADMIN
   platform.auth.external.roles=CLIENT
   platform.auth.external.requests-per-minute=120
   ```

2. Mini App Telegram проверяет модуль `platform-telegram` (`REQ-TELEGRAM-018`): пути и роли объявляются у бота, своего порта проекту писать не нужно.

   ```properties
   platform.telegram.bots.shop.mini-app.paths=/api/app/**
   platform.telegram.bots.shop.mini-app.roles=CLIENT
   platform.telegram.mini-app.max-age=PT1H
   ```

   Клиент Mini App шлёт `Telegram.WebApp.initData` в заголовке `X-Telegram-Init-Data`. Код проекта узнаёт бот и пользователя `TelegramMiniApp.user()`, а связанную учётную запись — `TelegramLinks.account(bot, user.id())`. Webhook бота модуль удостоверяет сам, на своём пути (`REQ-TELEGRAM-003`).

   Для другого мессенджера или стороннего удостоверения — свой бин `RequestAuthenticator`: свои пути под `/api/**` (не `/api/auth/**`) и проверка подписи запроса.

   ```java
   @Bean
   RequestAuthenticator partner(PartnerSignature signature) {
     return new RequestAuthenticator() {
       public Set<String> paths() {
         return Set.of("/api/partner/**");
       }

       public Optional<ExternalIdentity> authenticate(HttpServletRequest request) {
         return signature.verified(request.getHeader("X-Partner-Signature"))
           .map(partner -> new ExternalIdentity("partner", partner.id(), Set.of("CLIENT")));
       }
     };
   }
   ```

   Свежесть и защиту от повтора проверяет порт: срок подписи, постоянное сравнение секрета.

3. Правила доступа — как обычно, в `ApiAccess`: `rules.requestMatchers("/api/app/**").hasRole("CLIENT")`.
4. В коде проекта: `CurrentIdentity.get()` — вид, идентификатор, роли; `CurrentAccount.id()` для внешней личности пуст.

На путях порта cookie сессии и ключ доступа не принимаются, защиты от подделки запроса путь не требует. Отказ — `identity-rejected` (401).

Идентификатор внешней личности — персональные данные (152-ФЗ): не пишите его в журналы и метки метрик.
