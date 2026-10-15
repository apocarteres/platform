# platform

## English

A shared core for Spring Boot services and Angular clients: Java starters, client
libraries, and a package of process rules with documentation tooling. The core
knows nothing about the domains of the projects that adopt it; they extend it
through ports.

**What is inside**

- Java (Spring Boot 4, Java 25): `platform-bom`, `platform-service-parent`,
  `platform-arch-rules`, `platform-persistence`, `platform-time`,
  `platform-web-errors`, `platform-api-version`, `platform-rate-limit`,
  `platform-auth`, `platform-notifications`, `platform-support`.
- Angular libraries: `@apocarteres/http`, `routing`, `modal`, `action`,
  `app-update`, `auth`, `client-journal`, `support`, `notifications`.
- `@apocarteres/project-conventions`: the rules package. It checks code and
  documentation, runs the release cycle, and ships the normative texts.

**Using it**

Artifacts are not published to Maven Central or npm. A project pins a release
tag and builds the core from it: check out the tag and run
`mise run install-local`. Java artifacts land in the local Maven repository;
npm packages are packed into `target/local-packages`. See
[local publishing](docs/runbooks/local-publishing.md) and
[ADR-0003](docs/decisions/ADR-0003-local-artifact-publishing.md).

The tools are pinned in `mise.toml`. `mise run check` is the quick gate and
`mise run verify` is the full suite.

**Documentation** is written in Russian: [docs/INDEX.md](docs/INDEX.md).
Rules for AI agents are in [AGENTS.md](AGENTS.md).

**Reporting problems.** Defects and rules a project ran into are reported as
issues using the issue template; see [CONTRIBUTING.md](CONTRIBUTING.md).
Vulnerabilities are reported privately; see [SECURITY.md](SECURITY.md).

**License.** Apache-2.0; see [LICENSE](LICENSE) and [NOTICE](NOTICE).
Dependencies keep their own licenses. Note that Liquibase 5.x, which
`platform-persistence` brings in, is licensed under **FSL-1.1-ALv2**
(Functional Source License). It is not an OSI-approved license: it forbids
building a product that competes with Liquibase, and each version converts to
Apache-2.0 two years after its release.

## Русский

Общее ядро сервисов на Spring Boot и клиентов на Angular: Java-стартеры,
клиентские библиотеки и пакет процессных правил с инструментами документации.
Ядро не знает о предметных областях подключивших его проектов; они расширяют
его через порты.

**Состав**

- Java (Spring Boot 4, Java 25): `platform-bom`, `platform-service-parent`,
  `platform-arch-rules`, `platform-persistence`, `platform-time`,
  `platform-web-errors`, `platform-api-version`, `platform-rate-limit`,
  `platform-auth`, `platform-notifications`, `platform-support`.
- Библиотеки Angular: `@apocarteres/http`, `routing`, `modal`, `action`,
  `app-update`, `auth`, `client-journal`, `support`, `notifications`.
- `@apocarteres/project-conventions` — пакет правил: проверки кода и
  документации, цикл выпуска, доставка нормативных текстов.

**Подключение**

Артефакты не публикуются ни в Maven Central, ни в npm. Проект закрепляет тег
выпуска и собирает ядро из него: переключиться на тег и выполнить
`mise run install-local`. Java-артефакты попадают в локальный репозиторий
Maven, npm-пакеты собираются архивами в `target/local-packages`. Подробно —
[локальная публикация](docs/runbooks/local-publishing.md) и
[ADR-0003](docs/decisions/ADR-0003-local-artifact-publishing.md).

Инструменты закреплены в `mise.toml`. `mise run check` — быстрый шлагбаум,
`mise run verify` — полный набор.

**Документация** — [docs/INDEX.md](docs/INDEX.md). Правила для AI-агентов —
[AGENTS.md](AGENTS.md).

**Сообщить о проблеме.** Дефект ядра или правило, в которое упёрся проект, —
заявкой по шаблону, см. [CONTRIBUTING.md](CONTRIBUTING.md). Уязвимость —
закрыто, см. [SECURITY.md](SECURITY.md).

**Лицензия** — Apache-2.0, см. [LICENSE](LICENSE) и [NOTICE](NOTICE).
Зависимости сохраняют свои лицензии. Liquibase 5.x, который приносит
`platform-persistence`, распространяется под **FSL-1.1-ALv2** (Functional
Source License). Это не лицензия, одобренная OSI: она запрещает делать продукт,
конкурирующий с Liquibase, а каждая версия переходит на Apache-2.0 через два
года после выхода.
