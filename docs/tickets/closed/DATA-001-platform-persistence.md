---
id: DATA-001
type: ticket
status: done
scope: backend, persistence
authority: supporting
priority: P2
release: RELEASE-1-0-0
depends-on: OPS-007
related: ADR-0001
legacy-id: TICKET-PLATFORM-PERSISTENCE
---

# Starter `platform-persistence`: SQL-каталог и условная запись

## Цель

Вынести в общий starter пять классов, скопированных между проектами: `SqlCatalog`, `SqlStatements`, `LoadedSqlCatalog`, `ResourceSqlStatements`, `ConditionalWriteResult`. Удалить копии в zavpn и clanlog.

## Основание

1. Файлы совпадают по именам и назначению в `zavpn/backend/src/main/java/ru/zavpn/persistence` и `clanlog/src/main/java/net/clanlog/platform/persistence`; сравнение 2026-09-06 показало различия только в форматировании и мелочах.
2. Расхождения уже накоплены: zavpn нормализует `\` и `//` в пути каталога, clanlog возвращает `Map.copyOf` и несёт javadoc с объяснением, зачем sealed-тип вместо исключения.
3. У clanlog есть `ResourceSqlStatementsTest`, `PersistenceLayerGuardTest`, `SqlCatalogSchemaIT`; у zavpn проверка идёт через архитектурные тесты DAO.

## Последствия при сохранении текущего поведения

Исправление в загрузчике каталогов делается дважды или не делается во втором проекте.

## Требуется

1. Объединённая реализация: нормализация путей из zavpn, неизменяемые карты и javadoc из clanlog.
2. Автоконфигурация `SqlStatements` как бина; каталоги ищутся по `classpath*:sql/<каталог>/*.sql`, как сейчас в обоих проектах.
3. Перенос unit-тестов; интеграционная проверка соответствия каталогов схеме остаётся в проектах, потому что зависит от их SQL.
4. В обоих проектах замена импортов и удаление пакетов одним изменением на проект, без переходного периода.

## Критерии приёмки

- В zavpn и clanlog не остаётся собственных классов с этими именами; сборка и тесты обоих проектов проходят.
- ArchUnit-правила проектов, ссылающиеся на `Jdbc*` и DAO, продолжают работать.
- Поведение при отсутствующем каталоге, пустом файле и повторяющемся имени запроса покрыто тестами starter.

## Ход выполнения

### Шаг 1 (2026-09-06)

Пункты 1–3 требований не зависят от публикации и выполнены в этом репозитории; зависимость `depends-on` относится к пункту 4, замене импортов в проектах.

- Объединённая реализация в `platform-persistence/src/main/java/io/github/apocarteres/platform/persistence`: нормализация путей из zavpn (`\\`, `//`), неизменяемые карты и javadoc из clanlog. Порт `SqlCommandWriter` с `JsonSqlCommandWriter` перенесён из clanlog как optional-часть: Jackson 2 объявлен `optional`, бин появляется только при его наличии на classpath.
- Автоконфигурация `PersistenceAutoConfiguration` регистрирует `SqlStatements` и `SqlCommandWriter` с `@ConditionalOnMissingBean`.
- Тесты: `ResourceSqlStatementsTest` (перенесён из clanlog, добавлены случаи нормализации и `//`), `PersistenceAutoConfigurationTest` (бины по умолчанию, приоритет бина потребителя, отсутствие Jackson 2), `ConditionalWriteResultTest`.

Осталось: пункт 4 после публикации `v0.1.0` — замена импортов и удаление копий в zavpn и clanlog, проверка ArchUnit-правил проектов.

### Шаг 2 (2026-09-06)

В starter добавлен `StoredInstant`: приведение момента времени к точности хранилища. Он появился в проекте-потребителе при разборе отказа теста DAO, но описывает свойство слоя хранения, а не предметную область, поэтому его место в ядре. Инварианты закреплены пунктами REQ-PERSISTENCE-013 и REQ-PERSISTENCE-014.

Держать его у потребителя означало бы копию: код в одном репозитории, а нормативный текст в другом, что запрещено REQ-RULE-DISTRIBUTION-001.

Тестов модуля стало 15.

### Шаг 3 (2026-09-09)

Закрыт последний незакрытый критерий приёмки на стороне starter: поведение при
повторяющемся имени запроса реализация отвергала (`Duplicate SQL statement`),
но тестом это закреплено не было. Добавлен случай с двумя корнями classpath,
в которых лежит файл с одним именем: `ResourceSqlStatementsTest`
`rejectsDuplicateStatementName`. Тестов модуля стало 19.

Пункт 4 требований выполнен в проектах-потребителях до этой задачи, отдельными
изменениями в их репозиториях:

- zavpn — `1ee2ec47` «Take the persistence layer from the shared core»,
  2026-09-07; собственного пакета `ru.zavpn.persistence` нет, на пакет ядра
  ссылаются 103 файла.
- clanlog — `85cfc269` «Take persistence from the core starter and drop our
  copy», 2026-09-08; собственного пакета `net.clanlog.platform.persistence`
  нет, на пакет ядра ссылаются 51 файл.

ArchUnit-правила, ссылающиеся на `Jdbc*` и DAO, живы в обоих проектах:
`ModuleBoundaryArchitectureTests` (zavpn — правила по именам `*Dao` и
`Jdbc*Dao`, clanlog — `onlyDaoClassesTouchTheSqlCatalog`).

Прогоны потребителей 2026-09-09:

- clanlog — `mise run backend-test` пройден целиком, 35 с.
- zavpn — прогон в рабочем дереве непригоден: там незакоммиченная работа и
  недособранное состояние, из-за которого архитектурные правила отказывали с
  «failed to check any classes». Прогон выполнен на чистом клоне HEAD
  (`ef0bf51e`) в песочнице: тестов 816, отказов проверок 0, ошибок 129, из них
  117 — отказ инициализации `ru.zavpn.it.MigrationIntegrationTest`, базового
  класса лана на Testcontainers, остальные каскадом от него. Ни один отказ не
  относится к персистентности: `ru.zavpn.persistence.ProjectSqlCatalogsTests`,
  `JdbcDaoContractArchitectureTests` (7 правил) и
  `ModuleBoundaryArchitectureTests` (34 правила) пройдены.

## Как закрыта

Критерии приёмки:

- Собственных классов с этими именами в zavpn и clanlog нет; на пакет ядра
  ссылаются 103 и 51 файл соответственно.
- ArchUnit-правила по `Jdbc*` и DAO работают: в zavpn пройдены оба
  архитектурных набора, в clanlog — `onlyDaoClassesTouchTheSqlCatalog`.
- Отсутствующий каталог, пустой файл и повторяющееся имя запроса покрыты
  тестами starter: `rejectsMissingDirectory`, `rejectsEmptyStatementFile`,
  `rejectsDuplicateStatementName`.

Непроверенная часть названа явно: лан интеграционных тестов zavpn на
Testcontainers в песочнице не поднимается, поэтому «тесты проходят» для zavpn
подтверждены модульным и архитектурным прогоном, а не полным `verify`. Косвенное
подтверждение — шесть выпусков zavpn (`2026.09.1`–`2026.09.6`) после
миграционного коммита `1ee2ec47`: по REQ-RELEASE-017 тег ставится только на
коммит с распиской о `verify`.
