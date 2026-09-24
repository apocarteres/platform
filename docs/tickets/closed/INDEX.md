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

Всего: 159. Включены самостоятельные задачи и этапы планов функций.

| Задача | Приоритет | Статус | Выпуск | Области |
|---|---|---|---|---|
| [Неопознанный отказ не оставлял следа](CORE-API-008-unexplained-failure-left-no-trace.md) | P0 | Выполнена | [RELEASE-1-47-0](../../releases/RELEASE-1-47-0.md) | api, observability |
| [Модальное окно с удалённым действием закрывалось до ответа сервера](CORE-ARC-008-modal-closes-before-the-server-answers.md) | P0 | Выполнена | [RELEASE-3-0-0](../../releases/RELEASE-3-0-0.md) | frontend, architecture |
| [Окно закрывалось во время своего вызова, а отказ показывался где придётся](CORE-ARC-010-window-closable-during-its-call.md) | P0 | Выполнена | [RELEASE-4-0-0](../../releases/RELEASE-4-0-0.md) | frontend, architecture |
| [Закрепление версии компонента платформы у потребителя молча перестало действовать](CORE-OPS-004-core-owns-application-platform-versions.md) | P0 | Выполнена | [RELEASE-0-34-0](../../releases/RELEASE-0-34-0.md) | build, backend, platform |
| [Правило разбирало чужие рабочие копии](CORE-OPS-048-rule-reads-a-neighbours-working-copy.md) | P0 | Выполнена | [RELEASE-1-21-0](../../releases/RELEASE-1-21-0.md) | tooling, quality |
| [Забытая строка признака цикла исправлялась только перезаписью истории](CORE-OPS-053-forgotten-cycle-line-forces-a-rewrite.md) | P0 | Выполнена | [RELEASE-1-25-0](../../releases/RELEASE-1-25-0.md) | tooling, release |
| [Судьба выпуска зависела от порядка задач в заголовке](CORE-OPS-055-only-the-first-named-ticket-counted.md) | P0 | Выполнена | [RELEASE-1-26-0](../../releases/RELEASE-1-26-0.md) | tooling, release |
| [Отменённая задача держала закрытие выпуска](CORE-OPS-056-cancelled-ticket-held-the-release.md) | P0 | Выполнена | [RELEASE-1-26-0](../../releases/RELEASE-1-26-0.md) | tooling, release |
| [Два требования одной поставки исключали друг друга](CORE-OPS-058-two-requirements-exclude-each-other.md) | P0 | Выполнена | [RELEASE-1-27-0](../../releases/RELEASE-1-27-0.md) | deployment |
| [Проверка работоспособности соответствовала требованию и не проверяла ничего](CORE-OPS-060-health-check-confirmed-nothing.md) | P0 | Выполнена | [RELEASE-1-32-0](../../releases/RELEASE-1-32-0.md) | deployment, tooling |
| [Отмена выпуска запирает задачи состава навсегда](CORE-OPS-069-cancel-locks-tickets-in-a-cancelled-release.md) | P0 | Выполнена | [RELEASE-1-41-0](../../releases/RELEASE-1-41-0.md) | release, tooling |
| [Артефакт составляющей может быть каталогом, а сумма считалась только с файла](CORE-OPS-070-artifact-may-be-a-directory.md) | P0 | Выполнена | [RELEASE-1-41-0](../../releases/RELEASE-1-41-0.md) | deployment, tooling |
| [Развёртывание везло только собранное](CORE-OPS-074-deployment-carried-only-what-was-built.md) | P0 | Выполнена | [RELEASE-1-44-0](../../releases/RELEASE-1-44-0.md) | deployment, operations |
| [Порт неизвестного адреса не видел лениво загружаемых страниц](CORE-OPS-075-port-did-not-see-lazy-pages.md) | P0 | Выполнена | [RELEASE-1-45-0](../../releases/RELEASE-1-45-0.md) | deployment, client |
| [Тег до раската сжигал номер выпуска](CORE-OPS-076-tag-before-rollout-burned-the-number.md) | P0 | Выполнена | [RELEASE-1-45-0](../../releases/RELEASE-1-45-0.md) | release, tooling |
| [Закрытая грамматика входа не оставила потребителю законного хода](CORE-OPS-077-closed-grammar-left-no-lawful-move.md) | P0 | Выполнена | [RELEASE-1-46-0](../../releases/RELEASE-1-46-0.md) | deployment, build |
| [Номер версии перестал говорить, во что обойдётся обновление](CORE-OPS-078-version-number-stopped-telling-the-cost.md) | P0 | Выполнена | [RELEASE-1-48-0](../../releases/RELEASE-1-48-0.md) | publishing, release, tooling |
| [Пробное подключение третьего потребителя](CORE-OPS-081-third-consumer-pilot-adoption.md) | P0 | Выполнена | [RELEASE-1-51-0](../../releases/RELEASE-1-51-0.md) | adoption, tooling |
| [Ядро не исполняет собственного требования о статическом разборе](CORE-QUAL-011-core-does-not-do-what-it-requires.md) | P0 | Выполнена | [RELEASE-1-20-0](../../releases/RELEASE-1-20-0.md) | quality, build |
| [Доставленная настройка полагалась на состав группы, а не объявляла правило](CORE-QUAL-019-delivered-config-relied-on-a-lint-group.md) | P0 | Выполнена | [RELEASE-1-27-0](../../releases/RELEASE-1-27-0.md) | rust, quality |
| [Аннотация времени жизни ослепляет разбор Rust](CORE-QUAL-021-lifetime-blinds-the-rust-rules.md) | P0 | Выполнена | [RELEASE-1-31-0](../../releases/RELEASE-1-31-0.md) | rust, quality |
| [Условие о чужом бине решает раньше, чем бин появляется](CORE-QUAL-022-conditional-bean-decides-before-the-registry-exists.md) | P0 | Выполнена | [RELEASE-1-40-0](../../releases/RELEASE-1-40-0.md) | quality, api, wiring |
| [Проверки ядра доказывали случай, который ядро себе представило](CORE-QUAL-023-checks-proved-the-case-the-core-imagined.md) | P0 | Выполнена | [RELEASE-1-49-0](../../releases/RELEASE-1-49-0.md) | quality, tooling |
| [Правило modal-escape обрывало тег на «>» внутри атрибута](CORE-QUAL-025-modal-rule-cut-a-tag-at-an-arrow.md) | P0 | Выполнена | [RELEASE-2-0-1](../../releases/RELEASE-2-0-1.md) | quality, frontend |
| [Клиентская половина контракта молчит о своих требованиях и не проверена в конвейере](CORE-API-003-client-contract-hides-its-demands.md) | P1 | Выполнена | [RELEASE-1-5-0](../../releases/RELEASE-1-5-0.md) | frontend, api, quality |
| [Клиентский пакет отбрасывает поля расширения](CORE-API-007-client-drops-extension-fields.md) | P1 | Выполнена | [RELEASE-1-9-0](../../releases/RELEASE-1-9-0.md) | frontend, api |
| [Исследование: правила ядра проверяются только на ядре](CORE-ARC-005-rules-are-verified-only-on-the-core.md) | P1 | Выполнена | [RELEASE-1-14-0](../../releases/RELEASE-1-14-0.md) | process, tooling, architecture, research |
| [Исследование: правило запрещает шире, чем сказано в требовании](CORE-ARC-006-rules-wider-than-the-requirement.md) | P1 | Выполнена | [RELEASE-1-17-0](../../releases/RELEASE-1-17-0.md) | process, tooling, architecture, research |
| [Модальное окно явно решает, что делать по Escape](CORE-ARC-007-modal-escape-decision-is-explicit.md) | P1 | Выполнена | [RELEASE-2-0-0](../../releases/RELEASE-2-0-0.md) | frontend, architecture |
| [Клиент узнаёт о новой сборке и об устаревшем API: готовая реализация ядра](CORE-ARC-011-client-update-framework.md) | P1 | Выполнена | [RELEASE-5-0-0](../../releases/RELEASE-5-0-0.md) | frontend, backend, architecture |
| [Вход в ядре: учётная запись, регистрация, сессия, роли проекта](CORE-ARC-013-core-authentication.md) | P1 | Выполнена | [RELEASE-6-1-0](../../releases/RELEASE-6-1-0.md) | backend, frontend, security, architecture |
| [Аутентификация ядра не покрывает то, что у потребителя уже работает](CORE-ARC-014-core-auth-covers-the-consumer.md) | P1 | Выполнена | [RELEASE-8-0-0](../../releases/RELEASE-8-0-0.md) | backend, frontend, security |
| [Подключение ядра сняло границу вокруг каталога запросов](CORE-DATA-002-core-package-escapes-the-module-model.md) | P1 | Выполнена | [RELEASE-1-9-0](../../releases/RELEASE-1-9-0.md) | backend, java, persistence |
| [Сериализатор команд требует Jackson 2, которого в платформе приложений уже нет](CORE-DATA-003-command-writer-depends-on-jackson-2.md) | P1 | Выполнена | [RELEASE-1-10-0](../../releases/RELEASE-1-10-0.md) | backend, java, persistence |
| [Правила подключения ядра нигде не записаны](CORE-DOC-004-core-adoption-rules.md) | P1 | Выполнена | [RELEASE-0-24-0](../../releases/RELEASE-0-24-0.md) | process, platform |
| [Терминология ядра не закреплена](CORE-DOC-011-terminology-is-not-fixed.md) | P1 | Выполнена | [RELEASE-1-16-0](../../releases/RELEASE-1-16-0.md) | documentation, process |
| [Продолжение закрытой заявки теряется](CORE-DOC-014-a-closed-report-swallows-its-continuation.md) | P1 | Выполнена | [RELEASE-1-28-0](../../releases/RELEASE-1-28-0.md) | process, documentation |
| [Запрет на комментарии к закрытой заявке вместо обещания их читать](CORE-DOC-015-closed-report-accepts-no-comments.md) | P1 | Выполнена | [RELEASE-1-29-0](../../releases/RELEASE-1-29-0.md) | process, documentation |
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
| [Готовые правила запрещают шире, чем сказано в требовании](CORE-OPS-041-rules-forbid-more-than-the-requirement-says.md) | P1 | Выполнена | [RELEASE-1-15-0](../../releases/RELEASE-1-15-0.md) | backend, java, tooling |
| [Обязательство, исполненное задачей вне открытия выпуска, не закрывается](CORE-OPS-042-obligation-closed-by-a-ticket-declaring-it.md) | P1 | Выполнена | [RELEASE-1-18-0](../../releases/RELEASE-1-18-0.md) | tooling, process |
| [Правило вложенных модулей было псевдонимом соседнего](CORE-OPS-043-submodule-rule-was-an-alias.md) | P1 | Выполнена | [RELEASE-1-18-0](../../releases/RELEASE-1-18-0.md) | backend, java, tooling |
| [Запрос справки открывает выпуск](CORE-OPS-044-help-opens-a-release.md) | P1 | Выполнена | [RELEASE-1-19-0](../../releases/RELEASE-1-19-0.md) | tooling |
| [Этапом плана нельзя назвать коммит](CORE-OPS-045-plan-stage-cannot-name-a-commit.md) | P1 | Выполнена | [RELEASE-1-19-0](../../releases/RELEASE-1-19-0.md) | tooling |
| [Отказ коммиту без задачи не называет выхода](CORE-OPS-046-refusal-without-a-way-out.md) | P1 | Выполнена | [RELEASE-1-19-0](../../releases/RELEASE-1-19-0.md) | tooling |
| [Наличие статического разбора не проверяется ничем](CORE-OPS-047-nothing-checks-that-analysis-exists.md) | P1 | Выполнена | [RELEASE-1-20-0](../../releases/RELEASE-1-20-0.md) | tooling, quality |
| [Замена компонента шла без описи его поведений](CORE-OPS-049-component-replacement-without-an-inventory.md) | P1 | Выполнена | [RELEASE-1-22-0](../../releases/RELEASE-1-22-0.md) | process, documentation |
| [Правило не смотрит внутрь настройки clippy](CORE-OPS-052-rule-does-not-look-inside-clippy-config.md) | P1 | Выполнена | [RELEASE-1-23-0](../../releases/RELEASE-1-23-0.md) | tooling, quality |
| [Сверка коммитов срабатывала после отправки, а не до](CORE-OPS-054-commit-rule-fires-after-the-push.md) | P1 | Выполнена | [RELEASE-1-25-0](../../releases/RELEASE-1-25-0.md) | tooling, release |
| [Учёт коммита был сужен до безымянных без основания](CORE-OPS-057-accounting-was-narrowed-to-unnamed-commits.md) | P1 | Выполнена | [RELEASE-1-26-0](../../releases/RELEASE-1-26-0.md) | tooling, release |
| [У кеша AOT две тихих ловушки, и одна из них не покрыта прежним текстом](CORE-OPS-059-aot-cache-has-two-silent-traps.md) | P1 | Выполнена | [RELEASE-1-28-0](../../releases/RELEASE-1-28-0.md) | deployment |
| [Повторное закрепление версии в сборочном образе ничем не ловилось](CORE-OPS-061-second-pinning-in-the-build-image.md) | P1 | Выполнена | [RELEASE-1-33-0](../../releases/RELEASE-1-33-0.md) | build, tooling |
| [Дерево сборки без истории роняет проверки непонятным отказом](CORE-OPS-062-build-tree-without-history.md) | P1 | Выполнена | [RELEASE-1-34-0](../../releases/RELEASE-1-34-0.md) | build, tooling |
| [Шаг сборки и отпечаток зависимостей написаны дважды](CORE-OPS-063-step-contract-and-dependency-fingerprint.md) | P1 | Выполнена | [RELEASE-1-35-0](../../releases/RELEASE-1-35-0.md) | build, tooling |
| [У развёртывания нет общего интерфейса](CORE-OPS-065-deployment-interface.md) | P1 | Выполнена | [RELEASE-1-37-0](../../releases/RELEASE-1-37-0.md) | deployment, tooling |
| [Развёрнутое ничем не доказывает, что оно — собранное](CORE-OPS-066-deployed-proves-it-is-what-was-built.md) | P1 | Выполнена | [RELEASE-1-38-0](../../releases/RELEASE-1-38-0.md) | deployment, tooling |
| [Манифест и журнал развёртывания написаны дважды](CORE-OPS-067-manifest-and-journal-from-the-declaration.md) | P1 | Выполнена | [RELEASE-1-39-0](../../releases/RELEASE-1-39-0.md) | deployment, tooling |
| [Команды цикла правят задачи и оставляют сводки устаревшими](CORE-OPS-068-cycle-commands-leave-summaries-stale.md) | P1 | Выполнена | [RELEASE-1-41-0](../../releases/RELEASE-1-41-0.md) | release, tooling |
| [Неизвестный адрес отвечает рабочей страницей](CORE-OPS-071-unknown-address-answers-as-a-working-page.md) | P1 | Выполнена | [RELEASE-1-42-0](../../releases/RELEASE-1-42-0.md) | deployment, client |
| [Написание входа в развёртывание описывалось, а не поставлялось](CORE-OPS-072-entry-spelling-is-delivered-not-described.md) | P1 | Выполнена | [RELEASE-1-43-0](../../releases/RELEASE-1-43-0.md) | deployment, build |
| [Служебный коммит выпуска обесценивал прогон](CORE-OPS-073-receipt-belongs-to-the-code-tree.md) | P1 | Выполнена | [RELEASE-1-43-0](../../releases/RELEASE-1-43-0.md) | release, tooling |
| [Отказы констатировали без выхода](CORE-OPS-079-refusals-stated-without-a-way-out.md) | P1 | Выполнена | [RELEASE-1-49-0](../../releases/RELEASE-1-49-0.md) | release, deployment, tooling |
| [Выпущенный выпуск числил за собой невыполненную задачу обязательства](CORE-OPS-083-closed-release-keeps-undone-obligation.md) | P1 | Выполнена | [RELEASE-4-0-1](../../releases/RELEASE-4-0-1.md) | release, tooling |
| [Куски клиента переживают раскат, их размер держит проверка](CORE-OPS-084-client-chunks-survive-a-rollout.md) | P1 | Выполнена | [RELEASE-5-0-0](../../releases/RELEASE-5-0-0.md) | frontend, deployment, tooling |
| [Развёртывание службы без простоя: второй экземпляр и переключение](CORE-OPS-085-deployment-without-downtime.md) | P1 | Выполнена | [RELEASE-6-0-0](../../releases/RELEASE-6-0-0.md) | deployment, persistence, tooling |
| [Набор проверок ядра в сборочном контейнере на машине сборки](CORE-OPS-088-verify-runner-on-a-build-machine.md) | P1 | Выполнена | [RELEASE-6-1-0](../../releases/RELEASE-6-1-0.md) | build, tooling |
| [Версия API требуется от всех запросов: забытое исключение кладёт машинных клиентов](CORE-OPS-089-api-version-only-for-browsers.md) | P1 | Выполнена | [RELEASE-7-0-0](../../releases/RELEASE-7-0-0.md) | backend, api |
| [Шлагбаум перед отправкой перестал проверять документы, принятая идея не проходила проверку](CORE-OPS-091-hook-lost-docs-check.md) | P1 | Выполнена | [RELEASE-8-1-1](../../releases/RELEASE-8-1-1.md) | tickets, tooling, quality |
| [Starter `platform-time`: порт часов](CORE-QUAL-001-platform-time.md) | P1 | Выполнена | [RELEASE-0-19-0](../../releases/RELEASE-0-19-0.md) | backend, java |
| [Документ открытого выпуска приходится править руками](CORE-QUAL-007-open-release-document-needs-hand-edits.md) | P1 | Выполнена | [RELEASE-1-10-0](../../releases/RELEASE-1-10-0.md) | tooling, process |
| [Ограничитель предполагает, что находки только убывают](CORE-QUAL-008-ratchet-assumes-findings-only-shrink.md) | P1 | Выполнена | [RELEASE-1-20-0](../../releases/RELEASE-1-20-0.md) | quality, tooling |
| [Статический разбор назван и доставляется, а не выводится каждым заново](CORE-QUAL-010-static-analysis-is-named-and-delivered.md) | P1 | Выполнена | [RELEASE-1-20-0](../../releases/RELEASE-1-20-0.md) | quality, build |
| [Запрет без права на послабление делал обоснованный код непроходимым](CORE-QUAL-013-forbid-leaves-no-way-to-declare-an-exemption.md) | P1 | Выполнена | [RELEASE-1-21-0](../../releases/RELEASE-1-21-0.md) | quality, rust |
| [Часы в Rust ядром не нормированы и не проверяются](CORE-QUAL-014-rust-clock.md) | P1 | Выполнена | [RELEASE-1-23-0](../../releases/RELEASE-1-23-0.md) | rust, quality |
| [Правило комментариев воевало бы с документацией Rust](CORE-QUAL-016-comments-rule-would-fight-rust-docs.md) | P1 | Выполнена | [RELEASE-1-24-0](../../releases/RELEASE-1-24-0.md) | rust, quality |
| [У Rust нет средства засева, хотя правило его разрешает](CORE-QUAL-020-rust-has-no-seeding-mechanism.md) | P1 | Выполнена | [RELEASE-1-27-0](../../releases/RELEASE-1-27-0.md) | rust, quality |
| [Положения о поведении при работе писались раньше запуска](CORE-QUAL-024-runtime-clauses-written-before-a-run.md) | P1 | Выполнена | [RELEASE-1-50-0](../../releases/RELEASE-1-50-0.md) | quality, deployment |
| [Правила ядра не видят девяти его модулей](CORE-QUAL-026-core-rules-miss-nine-modules.md) | P1 | Выполнена | [RELEASE-9-1-0](../../releases/RELEASE-9-1-0.md) | quality, tooling |
| [Starter `platform-web-errors`: единый контракт ошибок API](CORE-API-001-platform-web-errors.md) | P2 | Выполнена | [RELEASE-1-5-0](../../releases/RELEASE-1-5-0.md) | backend, api, frontend |
| [Angular-пакет разбора ошибок `@apocarteres/http`](CORE-API-002-angular-http-error-package.md) | P2 | Выполнена | [RELEASE-1-5-0](../../releases/RELEASE-1-5-0.md) | frontend, api |
| [Сервис не может добавить расширение в тело ошибки](CORE-API-004-service-cannot-add-an-extension-to-the-error-body.md) | P2 | Выполнена | [RELEASE-1-7-0](../../releases/RELEASE-1-7-0.md) | api, backend |
| [Обработчик истёкшей сессии не отличает её от неудачного входа](CORE-API-005-session-handler-cannot-tell-a-failed-login.md) | P2 | Выполнена | [RELEASE-1-7-0](../../releases/RELEASE-1-7-0.md) | frontend, api |
| [Ответ об ошибке не может нести заголовки](CORE-API-006-error-response-cannot-carry-headers.md) | P2 | Выполнена | [RELEASE-1-7-0](../../releases/RELEASE-1-7-0.md) | backend, api |
| [Исследование: единообразное поведение модалок — контракт и код](CORE-ARC-002-shared-modal-behaviour-research.md) | P2 | Выполнена | [RELEASE-1-9-0](../../releases/RELEASE-1-9-0.md) | frontend, architecture, research |
| [Исследование: поведение кнопки, ждущей удалённого вызова](CORE-ARC-003-async-action-button-behaviour-research.md) | P2 | Выполнена | [RELEASE-1-9-0](../../releases/RELEASE-1-9-0.md) | frontend, architecture, research |
| [Исследование: здоровье и метрики как контракт ядра](CORE-ARC-004-health-and-metrics-contracts-research.md) | P2 | Выполнена | [RELEASE-1-9-0](../../releases/RELEASE-1-9-0.md) | backend, architecture, observability, research |
| [Префикс директив ядра — apcr](CORE-ARC-009-directive-prefix-apcr.md) | P2 | Выполнена | [RELEASE-3-0-0](../../releases/RELEASE-3-0-0.md) | frontend, naming |
| [Исследование: центр поддержки пользователей](CORE-ARC-012-user-support-centre-research.md) | P2 | Выполнена | [RELEASE-9-1-0](../../releases/RELEASE-9-1-0.md) | frontend, backend, architecture, research |
| [OpenAPI-контракт аутентификации ядра и типизированный профиль проекта](CORE-ARC-015-openapi-contract-for-core-auth.md) | P2 | Выполнена | [RELEASE-9-0-0](../../releases/RELEASE-9-0-0.md) | backend, frontend, api, tooling |
| [Журнал клиента: пакет `@apocarteres/client-journal`](CORE-ARC-016-client-journal.md) | P2 | Выполнена | [RELEASE-9-1-0](../../releases/RELEASE-9-1-0.md) | frontend, typescript, personal-data |
| [Starter `platform-persistence`: SQL-каталог и условная запись](CORE-DATA-001-platform-persistence.md) | P2 | Выполнена | [RELEASE-1-0-0](../../releases/RELEASE-1-0-0.md) | backend, persistence |
| [Подключение к проекту без каталогов документации падало трассировкой](CORE-DOC-001-adoption-on-a-bare-repository.md) | P2 | Выполнена | [RELEASE-0-25-0](../../releases/RELEASE-0-25-0.md) | process, platform |
| [Правила каталогов задач и выпусков жили копиями в каждом репозитории](CORE-DOC-002-catalog-rules-into-the-core.md) | P2 | Выполнена | [RELEASE-0-26-0](../../releases/RELEASE-0-26-0.md) | documentation, process |
| [Миграция формата задач clanlog](CORE-DOC-003-clanlog-ticket-format-migration.md) | P2 | Выполнена | [RELEASE-0-42-0](../../releases/RELEASE-0-42-0.md) | process, documentation |
| [Ссылка на нормативный документ ядра считалась ссылкой в пустоту](CORE-DOC-005-references-to-delivered-core-documents.md) | P2 | Выполнена | [RELEASE-0-22-0](../../releases/RELEASE-0-22-0.md) | documentation |
| [Имена документов и идентификаторы задавались по-разному в каждом репозитории](CORE-DOC-006-document-naming-scheme.md) | P2 | Выполнена | [RELEASE-0-35-0](../../releases/RELEASE-0-35-0.md) | documentation, process |
| [Между выпусками нет фазы планирования](CORE-DOC-009-planning-phase-between-releases.md) | P2 | Выполнена | [RELEASE-1-2-0](../../releases/RELEASE-1-2-0.md) | process, release |
| [У потребителя нет способа прислать заявку в ядро](CORE-DOC-010-consumer-feedback-channel.md) | P2 | Выполнена | [RELEASE-1-5-0](../../releases/RELEASE-1-5-0.md) | process, documentation |
| [Исполнитель останавливается без повода](CORE-DOC-012-executor-stops-without-a-reason.md) | P2 | Выполнена | [RELEASE-1-17-0](../../releases/RELEASE-1-17-0.md) | documentation, process |
| [Три образа вместо терминов](CORE-DOC-013-three-images-instead-of-terms.md) | P2 | Выполнена | [RELEASE-1-18-0](../../releases/RELEASE-1-18-0.md) | documentation |
| [Не сказано, где живёт опись поведений](CORE-DOC-016-where-the-inventory-lives.md) | P2 | Выполнена | [RELEASE-1-30-0](../../releases/RELEASE-1-30-0.md) | process, documentation |
| [Выпуск интеграции был записан дефектом](CORE-DOC-017-integration-release-was-called-a-defect.md) | P2 | Выполнена | [RELEASE-1-52-0](../../releases/RELEASE-1-52-0.md) | adoption, documentation |
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
| [Отказ ядра не называет дверь в ядро](CORE-OPS-035-refusals-do-not-name-the-door-into-the-core.md) | P2 | Выполнена | [RELEASE-1-14-0](../../releases/RELEASE-1-14-0.md) | tooling, process |
| [Ядро собирает артефакт и молчит о том, чем его запускать](CORE-OPS-050-core-builds-the-artifact-but-says-nothing-about-launching-it.md) | P2 | Выполнена | [RELEASE-1-22-0](../../releases/RELEASE-1-22-0.md) | deployment, build |
| [Машина развёртывания доказывается, а не подразумевается](CORE-OPS-064-deployment-target-is-proved-not-trusted.md) | P2 | Выполнена | [RELEASE-1-36-0](../../releases/RELEASE-1-36-0.md) | deployment |
| [Обходы, сделанные руками, не заводились задачами](CORE-OPS-080-manual-workarounds-went-unfiled.md) | P2 | Выполнена | [RELEASE-1-50-0](../../releases/RELEASE-1-50-0.md) | process, agents |
| [Исправление слепой проверки — не несовместимость, но и не молчание](CORE-OPS-082-sharper-check-is-not-incompatible.md) | P2 | Выполнена | [RELEASE-3-1-0](../../releases/RELEASE-3-1-0.md) | publishing, release, tooling |
| [Задачи с открытыми вопросами копятся без напоминания](CORE-OPS-086-open-questions-pile-up.md) | P2 | Выполнена | [RELEASE-6-0-0](../../releases/RELEASE-6-0-0.md) | release, tickets, tooling |
| [Идеи с вопросами держали выпуск наравне с задачами](CORE-OPS-090-ideas-are-not-tickets.md) | P2 | Выполнена | [RELEASE-8-1-0](../../releases/RELEASE-8-1-0.md) | tickets, release, tooling |
| [Монотонный счётчик считался обращением к часам](CORE-QUAL-002-monotonic-timer-counted-as-a-clock.md) | P2 | Выполнена | [RELEASE-0-43-0](../../releases/RELEASE-0-43-0.md) | quality, tooling |
| [Обращение к часам внутри шаблонной строки правило не видело](CORE-QUAL-003-clock-hidden-in-a-template-string.md) | P2 | Выполнена | [RELEASE-0-44-0](../../releases/RELEASE-0-44-0.md) | quality, tooling |
| [Команда расписки подтверждает проверки, которых не было](CORE-QUAL-004-receipt-attests-without-checks.md) | P2 | Выполнена | [RELEASE-1-0-0](../../releases/RELEASE-1-0-0.md) | quality, tooling, release |
| [Показ состояния выпуска отказывает на обычном состоянии](CORE-QUAL-006-release-status-fails-on-a-normal-state.md) | P2 | Выполнена | [RELEASE-1-7-0](../../releases/RELEASE-1-7-0.md) | release, tooling |
| [Послабление для тестов оформляется исключением, которое некогда снять](CORE-QUAL-009-test-relaxation-is-not-an-exception.md) | P2 | Выполнена | [RELEASE-1-20-0](../../releases/RELEASE-1-20-0.md) | quality |
| [Модульность Rust: сказать, что даёт язык и где остаётся дыра](CORE-QUAL-015-rust-modules.md) | P2 | Выполнена | [RELEASE-1-23-0](../../releases/RELEASE-1-23-0.md) | rust, architecture |
| [Правило денежных величин слепо к Rust](CORE-QUAL-017-money-rule-is-blind-to-rust.md) | P2 | Выполнена | [RELEASE-1-24-0](../../releases/RELEASE-1-24-0.md) | rust, quality |
| [Именование Rust: сказать, чего ядро не требует, и почему](CORE-QUAL-018-rust-naming-is-not-java-naming.md) | P2 | Выполнена | [RELEASE-1-24-0](../../releases/RELEASE-1-24-0.md) | rust, documentation |
| [Схема имён не знала об этапах плана функции](CORE-DOC-007-feature-plan-stage-names.md) | P3 | Выполнена | [RELEASE-0-36-0](../../releases/RELEASE-0-36-0.md) | documentation, process |
| [План функции из одного файла оставался вне перехода на схему](CORE-DOC-008-single-file-feature-plans.md) | P3 | Выполнена | [RELEASE-0-37-0](../../releases/RELEASE-0-37-0.md) | documentation, process |
| [Прежний идентификатор оставался внутри нового имени файла](CORE-OPS-019-old-identifier-stayed-in-the-slug.md) | P3 | Выполнена | [RELEASE-0-40-0](../../releases/RELEASE-0-40-0.md) | documentation, tooling |
| [Шлагбаум перед отправкой не видит отказов проводки](CORE-OPS-021-push-gate-cannot-see-wiring-failures.md) | P3 | Выполнена | [RELEASE-1-3-0](../../releases/RELEASE-1-3-0.md) | quality, operations |
| [Задача менеджера окружения объявляет аргументы устаревшим способом](CORE-OPS-026-deprecated-task-arguments.md) | P3 | Выполнена | [RELEASE-1-4-0](../../releases/RELEASE-1-4-0.md) | build, tooling |
| [Кеш AOT: сказать положением, а не молчанием](CORE-OPS-051-aot-cache-as-a-recommendation.md) | P3 | Выполнена | [RELEASE-1-22-0](../../releases/RELEASE-1-22-0.md) | deployment |
| [Отказ по документу задачи печатается дважды](CORE-QUAL-005-ticket-refusal-printed-twice.md) | P3 | Выполнена | [RELEASE-1-4-0](../../releases/RELEASE-1-4-0.md) | quality, tooling, documentation |
| [Шифр секрета повторяется у каждого потребителя](CORE-SEC-001-secret-cipher-belongs-to-the-platform.md) | P3 | Выполнена | [RELEASE-1-6-0](../../releases/RELEASE-1-6-0.md) | backend, security |
