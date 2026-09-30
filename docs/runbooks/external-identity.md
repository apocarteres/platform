---
id: RUN-EXTERNAL-IDENTITY
type: runbook
status: active
scope: backend, security, personal-data
authority: supporting
related: REQ-AUTH
---
# Подключение внешней личности

Норма — [`REQ-AUTH`](../requirements/auth.md), положения `REQ-AUTH-037`–`REQ-AUTH-040`. Внешняя личность — клиент без учётной записи ядра: пользователь мессенджера из его веб-приложения, сервер мессенджера с обновлениями бота, вход по стороннему удостоверению.

1. Роли клиентов — отдельным перечнем, без пересечения с ролями сотрудников:

   ```properties
   platform.auth.roles=STAFF,ADMIN
   platform.auth.external.roles=CLIENT
   platform.auth.external.requests-per-minute=120
   ```

2. Бин `RequestAuthenticator`: свои пути под `/api/**` (не `/api/auth/**`) и проверка подписи запроса.

   ```java
   @Bean
   RequestAuthenticator miniApp(TelegramSignature signature) {
     return new RequestAuthenticator() {
       public Set<String> paths() {
         return Set.of("/api/app/**");
       }

       public Optional<ExternalIdentity> authenticate(HttpServletRequest request) {
         return signature.verified(request.getHeader("X-Telegram-Init-Data"))
           .map(user -> new ExternalIdentity("telegram", user.id(), Set.of("CLIENT")));
       }
     };
   }
   ```

   Свежесть и защиту от повтора проверяет порт: срок `auth_date` у `initData`, постоянное сравнение секрета webhook. Webhook — отдельный порт на своём пути, с личностью вида сервера мессенджера; предел частоты для неё задаётся по потоку обновлений.

3. Правила доступа — как обычно, в `ApiAccess`: `rules.requestMatchers("/api/app/**").hasRole("CLIENT")`.
4. В коде проекта: `CurrentIdentity.get()` — вид, идентификатор, роли; `CurrentAccount.id()` для внешней личности пуст.

На путях порта cookie сессии и ключ доступа не принимаются, защиты от подделки запроса путь не требует. Отказ — `identity-rejected` (401).

Идентификатор внешней личности — персональные данные (152-ФЗ): не пишите его в журналы и метки метрик.
