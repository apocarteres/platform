---
id: RUN-SUPPORT-CENTRE
type: runbook
status: active
scope: backend, frontend, personal-data
authority: supporting
related: REQ-SUPPORT, REQ-CLIENT-JOURNAL, REQ-AUTH
---
# Подключение центра поддержки

Центр работает поверх аутентификации ядра (`REQ-AUTH`): сначала подключается она. Норма — [`REQ-SUPPORT`](../requirements/support.md); здесь — порядок действий.

## Сервер

1. Зависимость `io.github.apocarteres.platform:platform-support` из BOM ядра.
2. Таблицы — журналом ядра `platform/changelog/platform-support.yaml` после `platform-auth.yaml` ([переход на журналы ядра](liquibase-adoption.md)).
3. Настройки:

   ```yaml
   platform:
     support:
       operator-role: ADMIN            # объявлена в platform.auth.roles
       # retention.attachments / journal / guest-email: 365d по умолчанию
       # answer-link.ttl: 7d
       # links.request / links.operator / links.answer — пути клиента
   spring:
     servlet:
       multipart:
         max-file-size: 5MB
         max-request-size: 16MB
   ```

   Предел multipart ниже этих значений служба не примет: вложение отказало бы раньше центра.
4. Бины проекта:
   - `GuestIntake` — `GuestIntake.OPEN`, `GuestIntake.CLOSED` или своё условие;
   - `SupportLetters` — письмо автору об ответе и извещение оператора; невошедшему текст ответа не приходит, только ссылка;
   - `AttachmentStore` — только если вложения живут в объектном хранилище; удаление должно быть повторяемым.
5. Команды — из своего планировщика:
   - `SupportRetention.purgeExpired()` — раз в сутки; одновременный запуск на двух экземплярах безопасен;
   - `SupportRetention.erase(UUID)` и `erase(String)` — по запросу субъекта, до удаления учётной записи.

## Клиент

```ts
provideClientJournal({ skip: ['/api/support'] }),
provideSupport({ journal: ClientJournal, clientVersion: '1.4.0' }),
provideHttpClient(withInterceptors([clientJournalInterceptor, /* … */])),
```

Без журнала — `journal: NO_JOURNAL`. Путь отправки обращения исключается из журнала: иначе журнал записывает собственную отправку (`REQ-CLIENT-JOURNAL-007`).

- `SupportDesk` — `policy()`, `submit({ message, email, files })`, `mine()`, `request(id)`, `write(id, text)`, `seen(id)`, `answer(token)`; `refusedFiles(files, policy)` — проверка вложений до отправки.
- `SupportOperator` — `list(state)`, `request(id)`, `answer(id, text)`, `change(id, state)`, `seen(id)`.
- `SupportUnread` — сигналы `mine` и `operator`, опрос раз в минуту.

Страницы проекта: форма обращения, «мои обращения», страница ответа по ссылке (`links.answer`, ключ из строки запроса передаётся в `answer(token)`), место оператора.

## Персональные данные

Центр обрабатывает почту, текст, снимки экрана и журнал клиента (152-ФЗ). Проекту остаются: цель обработки в тексте соглашения, уведомление в форме, что к обращению прикладываются технический снимок и журнал, порядок ответа на запрос субъекта — он вызывает `erase`.
