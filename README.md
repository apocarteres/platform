# platform

Общее ядро для проектов zavpn и clanlog: библиотеки Java и Angular и пакет
процессных правил с инструментами документации.

- [Документация](docs/README.md) — точка входа: требования, решения, задачи, выпуски.
- [ADR-0001: общее ядро](docs/decisions/ADR-0001-shared-core.md) — анализ дублирования,
  форма ядра, состав пакетов, принятые решения и открытые вопросы.

Модули: `platform-bom`, `platform-persistence`; пакет `packages/project-conventions`.
Проверки: `mise run build` (документация и Java-тесты). Публикация: тег `vX.Y.Z`, см. [runbook](docs/runbooks/github-packages.md). Правила для агентов: [AGENTS.md](AGENTS.md).
