# platform

Общее ядро сервисов: библиотеки Java и Angular и пакет процессных правил
с инструментами документации. Ядро не знает о предметных областях
подключивших его проектов.

- [Документация](docs/INDEX.md) — точка входа: требования, решения, задачи, выпуски.
- [ADR-0001: общее ядро](docs/decisions/ADR-0001-shared-core.md) — анализ дублирования,
  форма ядра, состав пакетов, принятые решения и открытые вопросы.

Модули: `platform-bom`, `platform-service-parent`, `platform-arch-rules`, `platform-persistence`, `platform-time`, `platform-web-errors`, `platform-api-version`, `platform-rate-limit`, `platform-auth`; пакеты `packages/project-conventions`, `packages/http`, `packages/routing`, `packages/modal`, `packages/action`, `packages/app-update`, `packages/auth`.
Проверки: `mise run build` (документация и Java-тесты). Публикация: тег `vX.Y.Z`, см. [runbook](docs/runbooks/local-publishing.md). Правила для агентов: [AGENTS.md](AGENTS.md).
