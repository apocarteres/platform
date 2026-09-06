---
id: TICKET-PLATFORM-PERSISTENCE
type: ticket
status: backlog
scope: backend, persistence
authority: supporting
priority: P2
release: unassigned
depends-on: TICKET-GITHUB-PACKAGES-PUBLISHING
related: ADR-0001
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
