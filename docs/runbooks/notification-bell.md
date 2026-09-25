---
id: RUN-NOTIFICATION-BELL
type: runbook
status: active
scope: backend, frontend, personal-data
authority: supporting
related: REQ-NOTIFICATIONS, REQ-AUTH
---
# Подключение колокольчика уведомлений

Норма — [`REQ-NOTIFICATIONS`](../requirements/notifications.md). Колокольчик работает поверх аутентификации ядра.

## Сервер

1. Зависимость `io.github.apocarteres.platform:platform-notifications` из BOM ядра.
2. Таблица — своим переходом базы по образцу `sql/platform-notifications/create-notification.sql`.
3. Настройки по желанию: `platform.notifications.keep` (по умолчанию `90d`), `platform.notifications.list-size` (20, не больше 50).
4. Создание — в той же транзакции, что и работа:

   ```java
   notifications.notify(account, "order.shipped", Map.of("number", "1042"), "/orders/1042");
   ```

   Параметры — чем собрать текст (номер, название), а не почта и свободный текст человека.
5. Команды из своего планировщика: `Notifications.purgeExpired()` — раз в сутки; `Notifications.erase(account)` — по запросу субъекта.

С подключённым центром поддержки колокольчик звонит сам: `support.answered` автору, `support.arrived` операторам.

## Клиент

```ts
provideNotifications({ limit: 10 }),
```

`NotificationBell`: сигналы `unread`, `items`; `open()` по щелчку на колокольчик, `read(id)`, `readAll()`. Текст — по `kind` и `params` своим переводом:

```ts
const TEXT: Record<string, (params: Readonly<Record<string, string>>) => string> = {
  'support.answered': (p) => `Ответ поддержки на обращение №${p['number']}`,
  'support.arrived': (p) => `Новое сообщение в обращении №${p['number']}`,
};
```
