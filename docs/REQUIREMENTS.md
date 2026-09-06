---
id: REQ-PROJECT
type: requirement
status: active
scope: project
authority: normative
---

# Требования platform

Входная точка требований к общему ядру. Детальные требования лежат в [`requirements`](requirements/) и появляются вместе с первым пакетом, который они описывают.

## Карта требований

- [Версионирование и публикация](requirements/publishing.md) — координаты артефактов, версия из тега, запрет SNAPSHOT, semver и миграции, состав BOM, registry.

Контракты отдельных пакетов появляются вместе с пакетами; порядок задан [ADR-0001](decisions/ADR-0001-shared-core.md).
