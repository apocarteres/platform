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

Всего: 36. Включены самостоятельные задачи и этапы планов функций.

| Задача | Приоритет | Статус | Выпуск | Области |
|---|---|---|---|---|
| [Закрепление версии компонента платформы у потребителя молча перестало действовать](OPS-004-core-owns-application-platform-versions.md) | P0 | Выполнена | [RELEASE-0-34-0](../../releases/RELEASE-0-34-0.md) | build, backend, platform |
| [Правила подключения ядра нигде не записаны](DOC-004-core-adoption-rules.md) | P1 | Выполнена | [RELEASE-0-24-0](../../releases/RELEASE-0-24-0.md) | process, platform |
| [Версия платформы приложений задавалась дважды и разошлась](OPS-001-application-platform-version-declared-twice.md) | P1 | Выполнена | [RELEASE-0-30-0](../../releases/RELEASE-0-30-0.md) | build, platform |
| [Правила из платформы: контракт, доставка и внедрение](OPS-002-code-comments-rule.md) | P1 | Выполнена | [RELEASE-0-19-0](../../releases/RELEASE-0-19-0.md) | process, tooling, backend, frontend |
| [Пакет процессных правил и инструментов документации](OPS-003-conventions-package.md) | P1 | Выполнена | [RELEASE-0-29-0](../../releases/RELEASE-0-29-0.md) | process, documentation, tooling |
| [Проверки документации не знали о собственных данных цикла выпусков](OPS-005-docs-checks-unaware-of-release-cycle.md) | P1 | Выполнена | [RELEASE-0-22-0](../../releases/RELEASE-0-22-0.md) | documentation, release |
| [Публикация пакетов ядра в GitHub Packages](OPS-007-github-packages-publishing.md) | P1 | Выполнена | [RELEASE-0-19-0](../../releases/RELEASE-0-19-0.md) | build, delivery, tooling |
| [Состав выпуска не видел запланированные обязательства](OPS-008-release-composition-misses-planned-obligations.md) | P1 | Выполнена | [RELEASE-0-21-0](../../releases/RELEASE-0-21-0.md) | release |
| [Принятие цикла выпусков репозиторием с историей](OPS-009-release-cycle-adoption.md) | P1 | Выполнена | [RELEASE-0-20-0](../../releases/RELEASE-0-20-0.md) | release |
| [Повторный номер выпуска перезаписывал закрытый документ](OPS-010-release-number-reused-overwrote-a-closed-release.md) | P1 | Выполнена | [RELEASE-0-29-0](../../releases/RELEASE-0-29-0.md) | release |
| [Родитель сервиса терял классы проекта в интеграционных тестах](OPS-013-service-parent-lost-the-integration-test-classpath.md) | P1 | Выполнена | [RELEASE-0-31-0](../../releases/RELEASE-0-31-0.md) | build, platform |
| [Невыполненное обязательство оставалось в закрытом выпуске](OPS-015-unfinished-obligation-stranded-in-closed-release.md) | P1 | Выполнена | [RELEASE-0-23-0](../../releases/RELEASE-0-23-0.md) | release |
| [Подстановка версии и присоединение исходников протекали в потребителя](OPS-016-version-substitution-leaked-into-the-consumer.md) | P1 | Выполнена | [RELEASE-0-33-0](../../releases/RELEASE-0-33-0.md) | build, platform |
| [Процесс, запущенный исполнителем, мог висеть без предела](OPS-017-bounded-process-runs-for-agents.md) | P1 | Выполнена | [RELEASE-0-38-0](../../releases/RELEASE-0-38-0.md) | process, tooling |
| [Команды выпуска действуют на репозиторий из окружения](OPS-022-release-commands-act-on-ambient-repository.md) | P1 | Выполнена | [RELEASE-1-1-0](../../releases/RELEASE-1-1-0.md) | quality, tooling, release |
| [Starter `platform-time`: порт часов](QUAL-001-platform-time.md) | P1 | Выполнена | [RELEASE-0-19-0](../../releases/RELEASE-0-19-0.md) | backend, java |
| [Starter `platform-persistence`: SQL-каталог и условная запись](DATA-001-platform-persistence.md) | P2 | Выполнена | [RELEASE-1-0-0](../../releases/RELEASE-1-0-0.md) | backend, persistence |
| [Подключение к проекту без каталогов документации падало трассировкой](DOC-001-adoption-on-a-bare-repository.md) | P2 | Выполнена | [RELEASE-0-25-0](../../releases/RELEASE-0-25-0.md) | process, platform |
| [Правила каталогов задач и выпусков жили копиями в каждом репозитории](DOC-002-catalog-rules-into-the-core.md) | P2 | Выполнена | [RELEASE-0-26-0](../../releases/RELEASE-0-26-0.md) | documentation, process |
| [Миграция формата задач clanlog](DOC-003-clanlog-ticket-format-migration.md) | P2 | Выполнена | [RELEASE-0-42-0](../../releases/RELEASE-0-42-0.md) | process, documentation |
| [Ссылка на нормативный документ ядра считалась ссылкой в пустоту](DOC-005-references-to-delivered-core-documents.md) | P2 | Выполнена | [RELEASE-0-22-0](../../releases/RELEASE-0-22-0.md) | documentation |
| [Имена документов и идентификаторы задавались по-разному в каждом репозитории](DOC-006-document-naming-scheme.md) | P2 | Выполнена | [RELEASE-0-35-0](../../releases/RELEASE-0-35-0.md) | documentation, process |
| [Четыре проверки жили скриптами одного репозитория](OPS-006-four-checks-from-a-second-consumer.md) | P2 | Выполнена | [RELEASE-0-27-0](../../releases/RELEASE-0-27-0.md) | quality, tooling |
| [Закрытие обязательства ссылкой оставляло задачу-заготовку](OPS-011-satisfied-obligation-leaves-draft-ticket.md) | P2 | Выполнена | [RELEASE-0-21-0](../../releases/RELEASE-0-21-0.md) | release |
| [Сборка сервиса оставляла в дереве плоский POM](OPS-012-service-build-left-a-flattened-pom.md) | P2 | Выполнена | [RELEASE-0-32-0](../../releases/RELEASE-0-32-0.md) | build, platform |
| [Правило размера считало наборы тестов на Python и Ruby рабочим кодом](OPS-014-size-rule-knew-only-java-and-js-tests.md) | P2 | Выполнена | [RELEASE-0-28-0](../../releases/RELEASE-0-28-0.md) | quality, tooling |
| [Переход на схему имён сохранял область вне закрытого перечня](OPS-018-migration-kept-areas-outside-the-list.md) | P2 | Выполнена | [RELEASE-0-39-0](../../releases/RELEASE-0-39-0.md) | documentation, tooling, process |
| [Правило версий срабатывало там, где ядро версиями не управляет](OPS-020-dependency-rule-fired-outside-its-scope.md) | P2 | Выполнена | [RELEASE-0-41-0](../../releases/RELEASE-0-41-0.md) | build, tooling |
| [Отменённая задача не даёт закрыть выпуск](OPS-023-cancelled-ticket-blocks-release-close.md) | P2 | Выполнена | Не назначен | release, tooling |
| [Принятие цикла теряет номер выпуска и падает трассировкой](OPS-024-adopt-drops-the-release-number.md) | P2 | Выполнена | Не назначен | release, tooling |
| [Монотонный счётчик считался обращением к часам](QUAL-002-monotonic-timer-counted-as-a-clock.md) | P2 | Выполнена | [RELEASE-0-43-0](../../releases/RELEASE-0-43-0.md) | quality, tooling |
| [Обращение к часам внутри шаблонной строки правило не видело](QUAL-003-clock-hidden-in-a-template-string.md) | P2 | Выполнена | [RELEASE-0-44-0](../../releases/RELEASE-0-44-0.md) | quality, tooling |
| [Команда расписки подтверждает проверки, которых не было](QUAL-004-receipt-attests-without-checks.md) | P2 | Выполнена | [RELEASE-1-0-0](../../releases/RELEASE-1-0-0.md) | quality, tooling, release |
| [Схема имён не знала об этапах плана функции](DOC-007-feature-plan-stage-names.md) | P3 | Выполнена | [RELEASE-0-36-0](../../releases/RELEASE-0-36-0.md) | documentation, process |
| [План функции из одного файла оставался вне перехода на схему](DOC-008-single-file-feature-plans.md) | P3 | Выполнена | [RELEASE-0-37-0](../../releases/RELEASE-0-37-0.md) | documentation, process |
| [Прежний идентификатор оставался внутри нового имени файла](OPS-019-old-identifier-stayed-in-the-slug.md) | P3 | Выполнена | [RELEASE-0-40-0](../../releases/RELEASE-0-40-0.md) | documentation, tooling |
