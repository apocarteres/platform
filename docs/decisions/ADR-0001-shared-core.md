---
id: ADR-0001
type: decision
status: proposed
scope: platform, process, backend, frontend
authority: supporting
related: TICKET-CONVENTIONS-PACKAGE, TICKET-GITHUB-PACKAGES-PUBLISHING, TICKET-PLATFORM-PERSISTENCE, TICKET-PLATFORM-WEB-ERRORS, TICKET-NOTIFICATION-SERVICE-RESEARCH
---

# ADR-0001: общее ядро для zavpn и clanlog

Дата анализа: 2026-09-06. Документ для обсуждения; часть решений принята
владельцем 2026-09-06 и записана в разделе 6. После снятия оставшихся вопросов
инварианты переносятся в требования платформы, а решение получает статус
`accepted`.

## 1. Исходные данные

| | zavpn | clanlog |
|---|---|---|
| Репозиторий | `github.com/apocarteres/zavpn` | `github.com/apocarteres/dcp` |
| Backend | `backend/`, пакеты `ru.zavpn`, 561 файл | корень, пакеты `net.clanlog`, 387 файлов |
| Spring Boot / Modulith | 4.0.4 / 2.0.7 | 4.0.4 / 2.0.4 |
| Java / Node / Angular | 21 / 22.22.3 / 22.0.6 | 21.0.2 / 24.20.0 / 22.1.5 |
| Данные | JDBC без ORM, Liquibase (162 changelog), SQL в `resources/sql` | JDBC без ORM, Liquibase (96 changelog), SQL в `resources/sql` (435 файлов) |
| Сессии | Redis, cookie, CSRF double-submit, BCrypt | То же |
| Фоновые задачи | Планировщики запрещены требованием; тик от agent sync | `@Scheduled` (сверка хранилища, ретенция аудита) |
| Ошибки API | Общий `@RestControllerAdvice`, `ApiError(code, message)`, метрики, локализатор | 13 локальных `@ExceptionHandler`, `{code}` |
| i18n | Нет, интерфейс на русском | Клиентский, 5 языков |
| Docs | YAML front matter, `docs-check` на Node с тестами | Bold-строки шапки, `check-docs.py` + `tickets-index.mjs` |
| CI | GitHub Actions `quality.yml`, 6 job | GitHub Actions `ci.yml`, 7 job, включая Playwright |
| Линтеры | Нет | Нет |

Стек совпадает до версии. Технического барьера для общей библиотеки нет.

## 2. Инвентаризация дублирования

### 2.1 Код backend

| Компонент | zavpn | clanlog | Состояние |
|---|---|---|---|
| SQL-каталог и условная запись | `persistence/{SqlCatalog,SqlStatements,ConditionalWriteResult}`, `persistence/internal/{LoadedSqlCatalog,ResourceSqlStatements}` | `platform/persistence/…` те же имена | Дословная копия. Разошлись: нормализация путей (`\\`, `//`), `Map.copyOf`, javadoc только в clanlog |
| Jackson | `config/JacksonConfig` | `platform/config/JacksonConfig` | Копия |
| Email | `mail/EmailDeliveryService` (smtp + resend) | `auth/internal/RegistrationService`, `PasswordResetService` (resend, встроенный HttpClient) | Копия идеи; шаблонов и локализации нет ни у кого; HTML собирается строкой в коде |
| Rate limit | `auth/internal/AuthRateLimitService`: Redis+Lua, `requireAllowed` / `requireWithinLimit` | `auth/internal/AuthRateLimitService`: Redis+Lua, лимиты по действию, fail-closed при недоступности Redis | Две реализации одной идеи |
| Security | `config/SecurityConfig`: 3 цепочки (`/internal`, client API, browser), access-mode | `platform/config/SecurityConfig`: одна цепочка, `ClientVersionCompatibilityFilter` | Общая база: сессии, CSRF-cookie, BCrypt, голый 401 |
| Защита конфигурации | `config/internal/ProductionSecurityValidator` (дефолтные секреты в production) | `platform/config/SecretConfigurationValidator` (обязательные `CLANLOG_*`) | Две реализации, объединяются в одну |
| reCAPTCHA v3 | `auth/internal/RecaptchaV3Verifier` | `auth/internal/RecaptchaVerificationService` | Копия |
| Токены действий над аккаунтом | `auth/AccountActionToken*`, SHA-256, TTL, cleanup | `RegistrationService` / `PasswordResetService`: SHA-256, TTL, cooldown | Копия идеи |
| Деньги | `money/Money`, `BigDecimal` | `shared/dkp`, `BigDecimal`, `check-money-types.sh` | Одинаковое правило, разные типы |
| Пагинация | Spring `Pageable` | `platform/paging/PageLimit` (ADR-0007) | Только в clanlog |
| Аудит | Разрозненно: Redis-журналы, provenance | `shared/audit`: `AuditLog`, `AuditSink`, fan-out, ретенция | Только в clanlog |
| Хранилище файлов | `AgentReleaseService` (артефакты релизов) | `platform/storage` с портом `StorageReferenceProvider` и сверкой | Только в clanlog как переиспользуемое |
| Метрики ошибок API | `config/internal/ApiErrorMetrics` | нет | Только в zavpn |
| Тесты: база IT | `it/BackendIntegrationTest`: `@DynamicPropertySource` | `support/AbstractIntegrationIT`: статические контейнеры, `@TestPropertySource` | Две реализации |
| Тесты: ArchUnit | `ModuleBoundaryArchitectureTests`, `JdbcDaoContractArchitectureTests`, `OperationSourceArchitectureTests` | `ModuleBoundaryArchitectureTests`, `ApplicationModulesTest` | Общие правила: запрет `@Lazy`, циклы, закрытый `internal`, `Jdbc*` не public |

### 2.2 Код frontend

| Компонент | zavpn | clanlog |
|---|---|---|
| Контракт модалок | `shared/modal-interaction.service`, `modal-autofocus.directive`, `scripts/check-dialog-contract.mjs` | `shared/modal-autofocus.directive`, `dialog-backdrop-close-guard.directive`, `scripts/check-dialog-footers.mjs` |
| Интерсепторы | `localized-api-error.interceptor` (санитизация сообщений) | `session-expired`, `client-version`, `clan-access` |
| HTTP-клиент | `api/typed-api-client.service` (типы из OpenAPI) | Прямой `HttpClient` |
| Форматтеры | `localized-date-formatter`, `money-formatter` | `shared/date-time`, `time-zone`, `formatted-integer-input` |
| Пагинация | нет общего | `smart-paginator`, `paginated-content`, `list-paging` |
| i18n | нет | `i18n.service`, словари на 5 языков |
| CSRF | `withXhr()` | `csrf.service` + `APP_INITIALIZER` |

### 2.3 Требования и процесс

| Артефакт | Состояние |
|---|---|
| Требования к модалкам | Раздел скопирован из clanlog в zavpn (`ui-modals.md`) с пометкой «перенесены из ClanLog» и разошёлся: из общего текста осталось 4 совпадающие строки |
| Правила тикетов | Одна идея (подтверждение, критерии приёмки, открытые вопросы блокируют работу, генерируемые индексы), два несовместимых формата: front matter против bold-строк |
| Правила релизов | Та же идея (цель, состав, критерии выхода, не входит, двусторонняя сверка состава), два формата |
| Скрипты проверки docs | zavpn: 1274 строки Node с тестами (`check-docs`, `tickets-index`, `releases-index`, модели). clanlog: 730 строк, Python + Node, без тестов, плюс `check-release-scope.mjs` |
| Скрипты-храповики | Только в clanlog: `check-file-sizes.mjs`, `check-toolchain-pins.sh`, `check-money-types.sh`, `check-config-secrets.sh`, `check-shell-imports.mjs` |
| AGENTS.md | Общая часть: RULES.md по каталогам, тикет на каждую находку, запрет отключать тесты, запуск через mise, порядок работы над релизом. Проектная часть: агент и Docker в zavpn, Telegram в clanlog |
| mise.toml | Одинаковый набор базовых задач с разными именами и составом `build` |
| CI | Одинаковые job: backend, integration, frontend, secrets (trufflehog), docs. Различия: OWASP dependency-check и SBOM только в zavpn, Playwright и храповики только в clanlog |

### 2.4 Уведомления: дублирование прямо сейчас

Одна подсистема проектируется параллельно в двух репозиториях:

- zavpn: `account-user-notifications-2026-09-06`, `admin-notification-templates-2026-09-06`, `admin-notification-broadcast-2026-09-06` (backlog, вопросы сняты);
- clanlog: `FEAT-003` (локализация писем), `FEAT-004` (брендирование), `RES-001` (исследование рендера через Angular; блокирует оба).

Обоим нужны: шаблоны с подстановками, локализация, брендирование, текстовая часть письма, история отправок, канал email с двумя транспортами.

## 3. Что ядром быть не может

Ограничения, которые библиотека обязана уважать, иначе один из проектов её не примет:

1. **Триггеры фоновой работы.** zavpn запрещает `@Scheduled`, cron, startup hooks с изменением данных и автономные события (`REQ-BACKEND-ARCHITECTURE-OPERATION-SOURCES-001`). clanlog использует `@Scheduled`. Библиотека экспортирует команды (`drain()`, `retain()`), а не триггеры; вызывающий выбирает источник сам.
2. **Обратная совместимость.** Оба `AGENTS.md` запрещают compat-адаптеры, fallback-ветки и dual-read/dual-write. Переход проекта на общий контракт выполняется одним релизом с миграцией данных, без переходного периода.
3. **Read-only без побочных эффектов.** Правило zavpn о методах `list/find/get/…` распространяется на API библиотеки.
4. **Modulith.** Внешние jar не являются модулями Modulith и в граф зависимостей проекта не входят. Это удобно, но означает, что правило «platform ни от кого не зависит» переезжает из ArchUnit проекта в структуру самой библиотеки.
5. **Неймспейс.** `ru.zavpn` и `net.clanlog` не годятся; нужен нейтральный groupId и npm scope.

## 4. Варианты формы

| Вариант | Плюсы | Минусы | Вывод |
|---|---|---|---|
| A. Монорепозиторий обоих проектов с общими модулями | Атомарные изменения ядра и потребителей | Слияние двух репозиториев с разной историей, CI и деплоем; общий релизный цикл двух продуктов | Отклонить |
| B. Git subtree/submodule общего каталога | Просто начать | Нет версионирования, конфликтные обновления, для docs-скриптов и правил не решает сверку | Отклонить |
| C. Отдельный репозиторий платформы, версионируемые пакеты: Maven BOM + starters, npm scope, пакет процесса | Явные версии, независимый темп обновления проектов, правило и его проверка в одной версии | Нужен registry и дисциплина релизов ядра | **Рекомендуется** |

Registry: GitHub Packages, оба проекта уже на GitHub; Maven и npm в одном месте с одним токеном. Токен нужен и для чтения, это плата за приватность.

## 5. Предлагаемый состав

### 5.1 Java: `platform-bom` и starters

Каждый starter содержит автоконфигурацию и порты для проектных расширений по образцу `StorageReferenceProvider` из clanlog.

| Артефакт | Содержание | База |
|---|---|---|
| `platform-persistence` | `SqlCatalog`, `SqlStatements`, `ConditionalWriteResult`, загрузчик каталогов | clanlog (javadoc) + нормализация путей из zavpn |
| `platform-money` | `Money`, правила масштаба и округления, проверка `check-money-types` | zavpn `Money`, clanlog ADR-0002 |
| `platform-jackson` | `JsonMapper` с модулями | любой |
| `platform-web-errors` | `@RestControllerAdvice`, единый контракт ошибки, метрики ошибок с нормализацией URI, порт локализации сообщений | zavpn |
| `platform-security-session` | Сессионная цепочка, CSRF-cookie, `SessionInvalidationService`, порт для добавления цепочек проекта, объединённый валидатор секретов, reCAPTCHA v3 | обе |
| `platform-ratelimit` | Redis+Lua, API `requireAllowed` / `requireWithinLimit`, fail-closed, метрики | zavpn API + clanlog fail-closed |
| `platform-audit` | `AuditLog`, `AuditSink`, fan-out в транзакции, ретенция как команда | clanlog |
| `platform-paging` | `PageLimit` | clanlog |
| `platform-storage` | Локальное хранилище с проверкой сигнатур, порт ссылок, сверка как команда | clanlog |
| `platform-account-tokens` | Одноразовые токены действий над аккаунтом: хэш, TTL, cooldown, cleanup как команда | zavpn |
| `notification-client` | Тонкий клиент отдельного сервиса уведомлений: идемпотентные команды `send` и `broadcast`, статусы доставки. Сам сервис (шаблоны, каналы, рассылки, история) — отдельное приложение, см. раздел 5.4 | новое, по итогам исследования |
| `platform-test` | База интеграционного теста с Postgres и Redis, общие ArchUnit-правила | clanlog статические контейнеры + zavpn правила DAO |

### 5.2 Angular: пакеты в одном npm scope

| Пакет | Содержание | База |
|---|---|---|
| `ui-kit` | Контракт модалок, `modal-autofocus`, `dialog-backdrop-close-guard`, единый `check-dialog-contract` | обе |
| `http` | Интерсепторы истёкшей сессии, версии клиента, санитизации ошибок; типизированный API-клиент; CSRF-инициализация | обе |
| `format` | Локализованные даты, деньги, целые с разделителями | обе |
| `paging` | `smart-paginator`, `paginated-content`, `list-paging` | clanlog |
| `i18n` | Сервис словарей, `tCode()` для серверных кодов | clanlog, опционально |

### 5.3 Процесс: пакет `project-conventions`

CLI с командами `check`, `tickets-index`, `releases-index`, `file-sizes`, `toolchain-pins`, `money-types`, `config-secrets`, `sync`. В пакете лежат тексты `RULES.md` тикетов и релизов, `TEMPLATE.md`, общий фрагмент `AGENTS.md`, единый документ требований к UI, фрагмент `mise.toml`, reusable GitHub workflow (`workflow_call`).

Механизм: `sync` вписывает тексты в проект между маркерами `<!-- conventions:begin -->` и `<!-- conventions:end -->`; `check` отказывает при ручной правке внутри маркеров и при отставании версии. Правило и его проверка обновляются одной версией пакета. Проектная часть `AGENTS.md` остаётся вне маркеров.

### 5.4 Сервис уведомлений

По решению владельца от 2026-09-06 уведомления выносятся не в библиотеку,
а в отдельное приложение: конструктор и хранилище шаблонов, каналы доставки,
рассылки по аудиториям, история. zavpn и clanlog становятся его клиентами.
Границы, контракт клиента, мультиарендность, обработка персональных данных
и цена эксплуатации определяются исследованием
[TICKET-NOTIFICATION-SERVICE-RESEARCH](../tickets/notification-service-research.md);
до его итогов пять тикетов по уведомлениям в обоих проектах не берутся в работу.

## 6. Открытые вопросы

Работа по разделам 5.x не начинается, пока вопросы, от которых они зависят, не сняты. Ответ записывается рядом с вопросом с датой.

Вопросы 1, 2, 5 и 6 сняты 2026-09-06; вопросы 3 и 4 получили новое направление
и переведены в исследование; вопросы 7 и 8 открыты.

1. **Формат метаданных документов.** YAML front matter (zavpn) или bold-строки (clanlog)?
   Рекомендация: front matter. Типизирован, проверяется с тестами, поддерживает `depends-on`, `related`, `superseded-by`. От clanlog взять статус `cancelled` с обязательным разделом причины. Миграция ~110 тикетов clanlog скриптом.
   Зависит: 5.3.
   Ответ владельца, 2026-09-06: **YAML front matter.** Принято; этот репозиторий ведётся в нём с первого дня, отменённая задача обязана содержать раздел «Почему не делаем» (проверяется). Имя индексного файла и разрез по областям остались вопросами тикета [TICKET-CONVENTIONS-PACKAGE](../tickets/conventions-package.md).

2. **Контракт ошибок API.** RFC 9457 `ProblemDetail` с расширением `code` или сохранение `{code, message}`?
   Рекомендация: `ProblemDetail`, штатный механизм Spring Boot 4. Оба frontend адаптируются одним релизом каждый.
   Зависит: 5.1 `platform-web-errors`, 5.2 `http`.
   Ответ владельца, 2026-09-06: **`ProblemDetail` RFC 9457 с расширением `code`.** Принято; реализация — [TICKET-PLATFORM-WEB-ERRORS](../tickets/platform-web-errors.md).

3. **Где рендерятся письма.** Сервер (шаблонизатор в Java-библиотеке) или сборка из Angular (предмет `RES-001` в clanlog)?
   Рекомендация: сервер. Общее ядро уведомлений в Java-библиотеке делает серверный рендер следствием; `RES-001` закрывается отрицательным ответом с этим обоснованием.
   Зависит: раздел 5.4, пять тикетов по уведомлениям в обоих проектах.
   Ответ владельца, 2026-09-06: **ни то, ни другое в предложенном виде.** Вопрос требует отдельной проработки: возможно, нужно отдельное приложение, которое даёт собирать шаблоны, хранить их и делать рассылку; zavpn и clanlog становятся клиентами этого сервиса. Заведено исследование [TICKET-NOTIFICATION-SERVICE-RESEARCH](../tickets/notification-service-research.md), раздел 5 переписан.

4. **Первый потребитель уведомлений.** zavpn или clanlog?
   Ответ, 2026-09-06: вопрос снят как преждевременный. Порядок потребителей определит исследование сервиса уведомлений.

5. **Имена.** groupId для Maven, scope для npm, имя репозитория платформы.
   Ответ владельца, 2026-09-06: **`io.github.apocarteres.platform`, `@apocarteres`, репозиторий `apocarteres/platform`.**

6. **Registry.** GitHub Packages или иное?
   Ответ владельца, 2026-09-06: **GitHub Packages.** Настройка — [TICKET-GITHUB-PACKAGES-PUBLISHING](../tickets/github-packages-publishing.md).

7. **Единый набор версий Node.** zavpn на 22.x, clanlog на 24.x. Пакеты платформы должны собираться под обе или проекты выравниваются?
   Ответ: —

8. **Стек и границы сервиса уведомлений.** Вынесено в открытые вопросы исследования [TICKET-NOTIFICATION-SERVICE-RESEARCH](../tickets/notification-service-research.md).
   Ответ: —

## 7. Порядок внедрения

Порядок по соотношению выигрыша и риска. Каждый этап заканчивается удалением копий в обоих проектах, без переходного периода.

1. **Решения.** Снять вопросы раздела 6, завести репозиторий и registry.
2. **`project-conventions`.** Единые скрипты, миграция clanlog на выбранный формат, общий фрагмент `AGENTS.md`, единый документ UI-требований, reusable workflow. Снимает самое дорогое дублирование: сейчас каждое правило пишется дважды.
3. **Чистый перенос кода.** `platform-persistence`, `money`, `jackson`, `test`. Проектирования не требует.
4. **Инфраструктура web.** `web-errors`, `security-session`, `ratelimit`, `audit`, `account-tokens`. В clanlog заодно закрывает 13 локальных обработчиков ошибок.
5. **Сервис уведомлений.** Исследование, затем ADR, затем сервис и клиентская библиотека `notification-client`. Пять тикетов по уведомлениям в проектах ждут его итогов.
6. **Angular-пакеты** после стабилизации серверной части.

## 8. Персональные данные

Уведомления и рассылки означают обработку email и IP-адресов пользователей, в zavpn также данных о трафике. Это персональные данные в смысле 152-ФЗ. Отдельный сервис уведомлений станет ещё одним оператором хранения адресов и истории отправок. До реализации рассылок в требованиях сервиса и проектов должны появиться: основание обработки, согласие на рассылку и его отзыв, сроки хранения истории уведомлений и журналов доступа, порядок удаления по запросу. В `auth-and-mail.md` и `cabinet.md` zavpn и в `common-lk.md` clanlog этого сейчас нет.

## 9. Побочные находки

Не входят в предмет документа, заводятся тикетами в своих проектах:

- Оба проекта: нет линтеров и форматтеров ни для Java, ни для TypeScript; стиль держится на ревью и ArchUnit.
- clanlog: пароль ограничен 16 символами сверху при BCrypt (`RegistrationService.ensurePasswordLength`); контракт кодов ошибок держится на совпадении строковых литералов Java и словарей i18n и ничем не проверяется; легаси-скрипты `deploy-backend.sh` и `frontend/deploy-ui.sh` с абсолютным `JAVA_HOME`.
- zavpn: `new ApiErrorMessageLocalizer()` на каждое исключение в `ApiExceptionHandler`; в дереве `scripts/__pycache__`, архивы zig в `scripts/agent-release/.cache`, корневой `target/`, `.DS_Store`; `EmailDeliveryService` без собственного unit-теста.
