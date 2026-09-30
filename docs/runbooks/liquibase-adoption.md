---
id: RUN-LIQUIBASE-ADOPTION
type: runbook
status: active
scope: persistence, deployment
authority: supporting
related: REQ-DATA-ACCESS
---
# Переход на журналы Liquibase ядра

Норма — [`REQ-DATA-ACCESS`](../requirements/data-access.md), положения `REQ-DATA-ACCESS-007` и `REQ-DATA-ACCESS-008`, обязательство `liquibase-migrations`.

## Главный журнал проекта

```yaml
databaseChangeLog:
  - include:
      file: classpath:platform/changelog/platform-auth.yaml
  - include:
      file: classpath:platform/changelog/platform-notifications.yaml
  - include:
      file: classpath:platform/changelog/platform-support.yaml
  - include:
      file: classpath:platform/changelog/platform-job-lock.yaml
  - includeAll:
      path: db/changelog/project/
```

Журнал `platform-auth` идёт первым: на `platform_account` ссылаются таблицы других модулей. Подключайте только журналы тех модулей, которые есть у проекта. Liquibase приходит от ядра вместе с `platform-persistence` (с 14.0.0): свою зависимость `spring-boot-starter-liquibase` объявлять не нужно, её можно убрать. Путь главного журнала — `spring.liquibase.change-log` либо путь Spring Boot по умолчанию `db/changelog/db.changelog-master.yaml`.

## База уже есть

Таблицы ядра созданы раньше, образцами или своими переходами. Их схема должна совпадать с образцами `create-*.sql` той версии ядра, на которую вы переходите; сверьте её до отметки.

1. Остановите запуск переходов при старте службы: `spring.liquibase.enabled=false` на время отметки. Проект на Flyway держит эту настройку до конца переезда: без главного журнала служба с Liquibase не запускается.
2. Один раз отметьте наборы применёнными: `liquibase changelog-sync --changelog-file=<главный журнал>`.
3. Проверьте: `liquibase status` не называет невыполненных наборов.
4. Верните `spring.liquibase.enabled=true`. Следующий запуск ничего не меняет, а новые наборы ядра применяются обычным порядком.

## Проект на Flyway

1. Перенесите свои переходы в журнал Liquibase: один набор на переход, `sqlFile` с тем же SQL, идентификатор — имя перехода Flyway.
2. Отметьте всё уже применённое тем же `changelog-sync`: и журналы ядра, и перенесённые наборы.
3. Уберите Flyway из зависимостей; правило `migration-tool` перестанет его называть.
4. Таблица `flyway_schema_history` больше не нужна; удалите её отдельным набором изменений, когда перестанете откатываться на прежнюю сборку.
