---
id: IDX-TICKETS-CLOSED
type: index
status: active
scope: planning
authority: navigation
---

# Закрытые задачи

Сгенерировано командой `mise run tickets-index`. Вручную не редактировать.

[Открытые задачи](../INDEX.md) · [Планы функций](../features/INDEX.md)

Правила ведения задач — `REQ-TICKETS` в поставке пакета правил.

Всего: 72. Включены самостоятельные задачи и этапы планов функций.

| Задача | Приоритет | Статус | Выпуск | Области |
|---|---|---|---|---|
| [Закрепление версии компонента платформы у потребителя молча перестало действовать](CORE-OPS-004-core-owns-application-platform-versions.md) | P0 | Выполнена | [RELEASE-0-34-0](../../releases/RELEASE-0-34-0.md) | build, backend, platform |
| [Клиентская половина контракта молчит о своих требованиях и не проверена в конвейере](CORE-API-003-client-contract-hides-its-demands.md) | P1 | Выполнена | [RELEASE-1-5-0](../../releases/RELEASE-1-5-0.md) | frontend, api, quality |
| [Клиентский пакет отбрасывает поля расширения](CORE-API-007-client-drops-extension-fields.md) | P1 | Выполнена | [RELEASE-1-9-0](../../releases/RELEASE-1-9-0.md) | frontend, api |
| [Исследование: правила ядра проверяются только на ядре](CORE-ARC-005-rules-are-verified-only-on-the-core.md) | P1 | Выполнена | Не назначен | process, tooling, architecture, research |
| [Подключение ядра сняло границу вокруг каталога запросов](CORE-DATA-002-core-package-escapes-the-module-model.md) | P1 | Выполнена | [RELEASE-1-9-0](../../releases/RELEASE-1-9-0.md) | backend, java, persistence |
| [Сериализатор команд требует Jackson 2, которого в платформе приложений уже нет](CORE-DATA-003-command-writer-depends-on-jackson-2.md) | P1 | Выполнена | [RELEASE-1-10-0](../../releases/RELEASE-1-10-0.md) | backend, java, persistence |
| [Правила подключения ядра нигде не записаны](CORE-DOC-004-core-adoption-rules.md) | P1 | Выполнена | [RELEASE-0-24-0](../../releases/RELEASE-0-24-0.md) | process, platform |
| [Версия платформы приложений задавалась дважды и разошлась](CORE-OPS-001-application-platform-version-declared-twice.md) | P1 | Выполнена | [RELEASE-0-30-0](../../releases/RELEASE-0-30-0.md) | build, platform |
| [Правила из платформы: контракт, доставка и внедрение](CORE-OPS-002-code-comments-rule.md) | P1 | Выполнена | [RELEASE-0-19-0](../../releases/RELEASE-0-19-0.md) | process, tooling, backend, frontend |
| [Пакет процессных правил и инструментов документации](CORE-OPS-003-conventions-package.md) | P1 | Выполнена | [RELEASE-0-29-0](../../releases/RELEASE-0-29-0.md) | process, documentation, tooling |
| [Проверки документации не знали о собственных данных цикла выпусков](CORE-OPS-005-docs-checks-unaware-of-release-cycle.md) | P1 | Выполнена | [RELEASE-0-22-0](../../releases/RELEASE-0-22-0.md) | documentation, release |
| [Публикация пакетов ядра в GitHub Packages](CORE-OPS-007-github-packages-publishing.md) | P1 | Выполнена | [RELEASE-0-19-0](../../releases/RELEASE-0-19-0.md) | build, delivery, tooling |
| [Состав выпуска не видел запланированные обязательства](CORE-OPS-008-release-composition-misses-planned-obligations.md) | P1 | Выполнена | [RELEASE-0-21-0](../../releases/RELEASE-0-21-0.md) | release |
| [Принятие цикла выпусков репозиторием с историей](CORE-OPS-009-release-cycle-adoption.md) | P1 | Выполнена | [RELEASE-0-20-0](../../releases/RELEASE-0-20-0.md) | release |
| [Повторный номер выпуска перезаписывал закрытый документ](CORE-OPS-010-release-number-reused-overwrote-a-closed-release.md) | P1 | Выполнена | [RELEASE-0-29-0](../../releases/RELEASE-0-29-0.md) | release |
| [Родитель сервиса терял классы проекта в интеграционных тестах](CORE-OPS-013-service-parent-lost-the-integration-test-classpath.md) | P1 | Выполнена | [RELEASE-0-31-0](../../releases/RELEASE-0-31-0.md) | build, platform |
| [Невыполненное обязательство оставалось в закрытом выпуске](CORE-OPS-015-unfinished-obligation-stranded-in-closed-release.md) | P1 | Выполнена | [RELEASE-0-23-0](../../releases/RELEASE-0-23-0.md) | release |
| [Подстановка версии и присоединение исходников протекали в потребителя](CORE-OPS-016-version-substitution-leaked-into-the-consumer.md) | P1 | Выполнена | [RELEASE-0-33-0](../../releases/RELEASE-0-33-0.md) | build, platform |
| [Процесс, запущенный исполнителем, мог висеть без предела](CORE-OPS-017-bounded-process-runs-for-agents.md) | P1 | Выполнена | [RELEASE-0-38-0](../../releases/RELEASE-0-38-0.md) | process, tooling |
| [Команды выпуска действуют на репозиторий из окружения](CORE-OPS-022-release-commands-act-on-ambient-repository.md) | P1 | Выполнена | [RELEASE-1-1-0](../../releases/RELEASE-1-1-0.md) | quality, tooling, release |
| [Обязательство ядра закрывается отказом от работы](CORE-OPS-025-obligation-closed-by-declined-work.md) | P1 | Выполнена | [RELEASE-1-2-0](../../releases/RELEASE-1-2-0.md) | release, tooling |
| [Открытие выпуска создаёт задачу обязательства с именем, которое отвергает проверка правил](CORE-OPS-027-obligation-ticket-name-fails-naming.md) | P1 | Выполнена | [RELEASE-1-5-0](../../releases/RELEASE-1-5-0.md) | release, tooling |
| [Состав выпуска не сверяется с тем, что в него вошло коммитами](CORE-OPS-030-release-verifies-commit-attribution.md) | P1 | Выполнена | [RELEASE-1-6-0](../../releases/RELEASE-1-6-0.md) | release, process, tooling |
| [Отменённая работа продолжает удерживать выпуск](CORE-OPS-031-revert-label-frees-a-dropped-ticket.md) | P1 | Выполнена | [RELEASE-1-6-0](../../releases/RELEASE-1-6-0.md) | release, process, tooling |
| [Закрытие выпуска требует в состав задачи уже вышедшего выпуска](CORE-OPS-033-release-close-demands-tickets-of-a-shipped-release.md) | P1 | Выполнена | [RELEASE-1-8-0](../../releases/RELEASE-1-8-0.md) | tooling, process |
| [Миграция имён удваивает префикс в именах файлов и присваивает его чужим задачам](CORE-OPS-034-name-migration-doubles-the-prefix-in-file-names.md) | P1 | Выполнена | [RELEASE-1-9-0](../../releases/RELEASE-1-9-0.md) | tooling, process |
| [У правила модульности нет исполняемой проверки](CORE-OPS-036-module-graph-has-no-executable-check.md) | P1 | Выполнена | [RELEASE-1-9-0](../../releases/RELEASE-1-9-0.md) | backend, java, tooling |
| [Обязательство data-access ссылается на недоставляемый документ](CORE-OPS-037-data-access-obligation-points-at-an-undelivered-document.md) | P1 | Выполнена | [RELEASE-1-11-0](../../releases/RELEASE-1-11-0.md) | tooling, process, adoption |
| [Коммит слияния удерживает выпуск](CORE-OPS-038-merge-commit-holds-the-release.md) | P1 | Выполнена | [RELEASE-1-11-0](../../releases/RELEASE-1-11-0.md) | tooling, process |
| [Запись решения по незавершённой задаче удерживает закрытие выпуска](CORE-OPS-039-decision-record-holds-the-release.md) | P1 | Выполнена | [RELEASE-1-12-0](../../releases/RELEASE-1-12-0.md) | tooling, process |
| [Готовое правило строже требования, которое проверяет](CORE-OPS-040-inner-package-rule-is-stricter-than-the-requirement.md) | P1 | Выполнена | [RELEASE-1-13-0](../../releases/RELEASE-1-13-0.md) | backend, java, tooling |
| [Starter `platform-time`: порт часов](CORE-QUAL-001-platform-time.md) | P1 | Выполнена | [RELEASE-0-19-0](../../releases/RELEASE-0-19-0.md) | backend, java |
| [Документ открытого выпуска приходится править руками](CORE-QUAL-007-open-release-document-needs-hand-edits.md) | P1 | Выполнена | [RELEASE-1-10-0](../../releases/RELEASE-1-10-0.md) | tooling, process |
| [Starter `platform-web-errors`: единый контракт ошибок API](CORE-API-001-platform-web-errors.md) | P2 | Выполнена | [RELEASE-1-5-0](../../releases/RELEASE-1-5-0.md) | backend, api, frontend |
| [Angular-пакет разбора ошибок `@apocarteres/http`](CORE-API-002-angular-http-error-package.md) | P2 | Выполнена | [RELEASE-1-5-0](../../releases/RELEASE-1-5-0.md) | frontend, api |
| [Сервис не может добавить расширение в тело ошибки](CORE-API-004-service-cannot-add-an-extension-to-the-error-body.md) | P2 | Выполнена | [RELEASE-1-7-0](../../releases/RELEASE-1-7-0.md) | api, backend |
| [Обработчик истёкшей сессии не отличает её от неудачного входа](CORE-API-005-session-handler-cannot-tell-a-failed-login.md) | P2 | Выполнена | [RELEASE-1-7-0](../../releases/RELEASE-1-7-0.md) | frontend, api |
| [Ответ об ошибке не может нести заголовки](CORE-API-006-error-response-cannot-carry-headers.md) | P2 | Выполнена | [RELEASE-1-7-0](../../releases/RELEASE-1-7-0.md) | backend, api |
| [Исследование: единообразное поведение модалок — контракт и код](CORE-ARC-002-shared-modal-behaviour-research.md) | P2 | Выполнена | [RELEASE-1-9-0](../../releases/RELEASE-1-9-0.md) | frontend, architecture, research |
| [Исследование: поведение кнопки, ждущей удалённого вызова](CORE-ARC-003-async-action-button-behaviour-research.md) | P2 | Выполнена | [RELEASE-1-9-0](../../releases/RELEASE-1-9-0.md) | frontend, architecture, research |
| [Исследование: здоровье и метрики как контракт ядра](CORE-ARC-004-health-and-metrics-contracts-research.md) | P2 | Выполнена | [RELEASE-1-9-0](../../releases/RELEASE-1-9-0.md) | backend, architecture, observability, research |
| [Starter `platform-persistence`: SQL-каталог и условная запись](CORE-DATA-001-platform-persistence.md) | P2 | Выполнена | [RELEASE-1-0-0](../../releases/RELEASE-1-0-0.md) | backend, persistence |
| [Подключение к проекту без каталогов документации падало трассировкой](CORE-DOC-001-adoption-on-a-bare-repository.md) | P2 | Выполнена | [RELEASE-0-25-0](../../releases/RELEASE-0-25-0.md) | process, platform |
| [Правила каталогов задач и выпусков жили копиями в каждом репозитории](CORE-DOC-002-catalog-rules-into-the-core.md) | P2 | Выполнена | [RELEASE-0-26-0](../../releases/RELEASE-0-26-0.md) | documentation, process |
| [Миграция формата задач clanlog](CORE-DOC-003-clanlog-ticket-format-migration.md) | P2 | Выполнена | [RELEASE-0-42-0](../../releases/RELEASE-0-42-0.md) | process, documentation |
| [Ссылка на нормативный документ ядра считалась ссылкой в пустоту](CORE-DOC-005-references-to-delivered-core-documents.md) | P2 | Выполнена | [RELEASE-0-22-0](../../releases/RELEASE-0-22-0.md) | documentation |
| [Имена документов и идентификаторы задавались по-разному в каждом репозитории](CORE-DOC-006-document-naming-scheme.md) | P2 | Выполнена | [RELEASE-0-35-0](../../releases/RELEASE-0-35-0.md) | documentation, process |
| [Между выпусками нет фазы планирования](CORE-DOC-009-planning-phase-between-releases.md) | P2 | Выполнена | [RELEASE-1-2-0](../../releases/RELEASE-1-2-0.md) | process, release |
| [У потребителя нет способа прислать заявку в ядро](CORE-DOC-010-consumer-feedback-channel.md) | P2 | Выполнена | [RELEASE-1-5-0](../../releases/RELEASE-1-5-0.md) | process, documentation |
| [Четыре проверки жили скриптами одного репозитория](CORE-OPS-006-four-checks-from-a-second-consumer.md) | P2 | Выполнена | [RELEASE-0-27-0](../../releases/RELEASE-0-27-0.md) | quality, tooling |
| [Закрытие обязательства ссылкой оставляло задачу-заготовку](CORE-OPS-011-satisfied-obligation-leaves-draft-ticket.md) | P2 | Выполнена | [RELEASE-0-21-0](../../releases/RELEASE-0-21-0.md) | release |
| [Сборка сервиса оставляла в дереве плоский POM](CORE-OPS-012-service-build-left-a-flattened-pom.md) | P2 | Выполнена | [RELEASE-0-32-0](../../releases/RELEASE-0-32-0.md) | build, platform |
| [Правило размера считало наборы тестов на Python и Ruby рабочим кодом](CORE-OPS-014-size-rule-knew-only-java-and-js-tests.md) | P2 | Выполнена | [RELEASE-0-28-0](../../releases/RELEASE-0-28-0.md) | quality, tooling |
| [Переход на схему имён сохранял область вне закрытого перечня](CORE-OPS-018-migration-kept-areas-outside-the-list.md) | P2 | Выполнена | [RELEASE-0-39-0](../../releases/RELEASE-0-39-0.md) | documentation, tooling, process |
| [Правило версий срабатывало там, где ядро версиями не управляет](CORE-OPS-020-dependency-rule-fired-outside-its-scope.md) | P2 | Выполнена | [RELEASE-0-41-0](../../releases/RELEASE-0-41-0.md) | build, tooling |
| [Отменённая задача не даёт закрыть выпуск](CORE-OPS-023-cancelled-ticket-blocks-release-close.md) | P2 | Выполнена | [RELEASE-1-2-0](../../releases/RELEASE-1-2-0.md) | release, tooling |
| [Принятие цикла теряет номер выпуска и падает трассировкой](CORE-OPS-024-adopt-drops-the-release-number.md) | P2 | Выполнена | [RELEASE-1-2-0](../../releases/RELEASE-1-2-0.md) | release, tooling |
| [Ядро переходит на собственный префикс идентификаторов задач](CORE-OPS-028-core-adopts-its-ticket-prefix.md) | P2 | Выполнена | [RELEASE-1-4-0](../../releases/RELEASE-1-4-0.md) | process, documentation, tooling |
| [Ядро не умеет собирать и публиковать Angular-библиотеку](CORE-OPS-029-angular-library-build-and-publishing.md) | P2 | Выполнена | [RELEASE-1-5-0](../../releases/RELEASE-1-5-0.md) | build, frontend, tooling |
| [Миграция имён не проставляет префикс проекта](CORE-OPS-032-name-migration-does-not-apply-the-project-prefix.md) | P2 | Выполнена | [RELEASE-1-7-0](../../releases/RELEASE-1-7-0.md) | tooling, process |
| [Отказ ядра не называет дверь в ядро](CORE-OPS-035-refusals-do-not-name-the-door-into-the-core.md) | P2 | Выполнена | Не назначен | tooling, process |
| [Монотонный счётчик считался обращением к часам](CORE-QUAL-002-monotonic-timer-counted-as-a-clock.md) | P2 | Выполнена | [RELEASE-0-43-0](../../releases/RELEASE-0-43-0.md) | quality, tooling |
| [Обращение к часам внутри шаблонной строки правило не видело](CORE-QUAL-003-clock-hidden-in-a-template-string.md) | P2 | Выполнена | [RELEASE-0-44-0](../../releases/RELEASE-0-44-0.md) | quality, tooling |
| [Команда расписки подтверждает проверки, которых не было](CORE-QUAL-004-receipt-attests-without-checks.md) | P2 | Выполнена | [RELEASE-1-0-0](../../releases/RELEASE-1-0-0.md) | quality, tooling, release |
| [Показ состояния выпуска отказывает на обычном состоянии](CORE-QUAL-006-release-status-fails-on-a-normal-state.md) | P2 | Выполнена | [RELEASE-1-7-0](../../releases/RELEASE-1-7-0.md) | release, tooling |
| [Схема имён не знала об этапах плана функции](CORE-DOC-007-feature-plan-stage-names.md) | P3 | Выполнена | [RELEASE-0-36-0](../../releases/RELEASE-0-36-0.md) | documentation, process |
| [План функции из одного файла оставался вне перехода на схему](CORE-DOC-008-single-file-feature-plans.md) | P3 | Выполнена | [RELEASE-0-37-0](../../releases/RELEASE-0-37-0.md) | documentation, process |
| [Прежний идентификатор оставался внутри нового имени файла](CORE-OPS-019-old-identifier-stayed-in-the-slug.md) | P3 | Выполнена | [RELEASE-0-40-0](../../releases/RELEASE-0-40-0.md) | documentation, tooling |
| [Шлагбаум перед отправкой не видит отказов проводки](CORE-OPS-021-push-gate-cannot-see-wiring-failures.md) | P3 | Выполнена | [RELEASE-1-3-0](../../releases/RELEASE-1-3-0.md) | quality, operations |
| [Задача менеджера окружения объявляет аргументы устаревшим способом](CORE-OPS-026-deprecated-task-arguments.md) | P3 | Выполнена | [RELEASE-1-4-0](../../releases/RELEASE-1-4-0.md) | build, tooling |
| [Отказ по документу задачи печатается дважды](CORE-QUAL-005-ticket-refusal-printed-twice.md) | P3 | Выполнена | [RELEASE-1-4-0](../../releases/RELEASE-1-4-0.md) | quality, tooling, documentation |
| [Шифр секрета повторяется у каждого потребителя](CORE-SEC-001-secret-cipher-belongs-to-the-platform.md) | P3 | Выполнена | [RELEASE-1-6-0](../../releases/RELEASE-1-6-0.md) | backend, security |
