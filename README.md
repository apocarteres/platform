# platform

## English

**An AI-friendly way to run a software project.** The core is a rules package,
`@apocarteres/project-conventions`, that turns how a project is built, checked,
documented and released into checks a coding agent can read, follow and
cannot quietly bypass. It does not depend on your stack: a project in any
language can adopt only the rules.

**Why agents work well with it**

- **The rules travel with the package.** Normative texts with stable clause
  IDs are installed next to the code. `conventions sync` writes a pointer into
  `AGENTS.md`, so an agent reads the rules locally instead of guessing them.
- **Every refusal names the way out.** A failed check names the file, the line,
  the clause and what to do next, not just "failed".
- **Violations can only go down.** A baseline records existing findings; an
  agent cannot add new ones silently, and lowering the baseline is a command.
- **"Tests passed" is proven, not claimed.** The full suite writes a receipt
  for the exact code tree; the push gate and the release check the receipt.
- **Agents' commands have limits.** `conventions run` stops a hung process by
  overall and idle time and reports what happened.
- **Rules for the agent itself.** Confirm a hypothesis before changing code,
  prove a fix by reproducing the failure before and its absence after, and ask
  before anything irreversible: a release, a push, a published answer
  (`REQ-AGENT-WORK`).
- **The process is code.** Tickets, releases, obligations and documentation
  indexes are files the package checks. A release closes only with a receipt
  and with every obligation handled.

**Adopting the rules.** Add the package, run `conventions sync`, declare your
sources and your stack in `.conventions.json` (`"stack": []` if you only want
the rules), wire `check` and `verify` into your task runner and a `pre-push`
hook, then open the first release with `conventions release adopt`. Only
obligations that apply to your declared stack become tickets.

**Optional libraries.** For projects that want them, the core also ships
Spring Boot starters (`platform-auth`, `platform-persistence`,
`platform-web-errors`, `platform-notifications`, `platform-support` and
others) and Angular libraries (`@apocarteres/http`, `modal`, `auth` and
others). They are an offer, not a condition: a project may use its own
implementation of the same contract.

**Getting the artifacts.** Nothing is published to Maven Central or npm. Pin a
release tag, check it out and run `mise run install-local`; see
[local publishing](docs/runbooks/local-publishing.md). Tools are pinned in
`mise.toml`.

**Documentation** is written in Russian: [docs/INDEX.md](docs/INDEX.md).
The ideas behind the rules are explained in English in
[docs/OVERVIEW.md](docs/OVERVIEW.md). The
rules for agents working on the core itself are in [AGENTS.md](AGENTS.md).

**Reporting problems.** See [CONTRIBUTING.md](CONTRIBUTING.md); vulnerabilities
privately, see [SECURITY.md](SECURITY.md).

**License.** Apache-2.0; see [LICENSE](LICENSE) and [NOTICE](NOTICE).
Dependencies keep their own licenses. Liquibase 5.x, which
`platform-persistence` brings in, is licensed under **FSL-1.1-ALv2**
(Functional Source License). It is not an OSI-approved license: it forbids
building a product that competes with Liquibase, and each version converts to
Apache-2.0 two years after its release.

## Русский

**Порядок ведения проекта, удобный для AI-агентов.** Основа ядра — пакет
правил `@apocarteres/project-conventions`. Он превращает то, как проект
собирается, проверяется, документируется и выпускается, в проверки, которые
агент читает, исполняет и не может тихо обойти. Пакет не зависит от стека:
проект на любом языке может подключить только правила.

**Почему агентам с ним удобно**

- **Правила приходят вместе с пакетом.** Нормативные тексты с постоянными
  номерами положений лежат рядом с кодом, `conventions sync` вписывает указатель
  на них в `AGENTS.md`: агент читает правила, а не угадывает их.
- **Каждый отказ называет выход.** Непройденная проверка называет файл,
  строку, положение и что делать дальше, а не только «не пройдено».
- **Нарушения могут только убывать.** Ограничитель фиксирует существующие
  находки: новую агент молча не добавит, а опускается ограничитель командой.
- **«Тесты прошли» доказывается, а не утверждается.** Полный набор пишет
  расписку на точное дерево кода; её проверяют шлагбаум перед отправкой и
  выпуск.
- **У команд агента есть пределы.** `conventions run` останавливает зависший
  процесс по общему времени и по бездействию и сообщает, что произошло.
- **Правила для самого агента.** Подтвердить гипотезу до правки кода, доказать
  исправление отказом до и его отсутствием после, спросить перед необратимым:
  выпуском, отправкой, публикацией ответа (`REQ-AGENT-WORK`).
- **Процесс — тоже код.** Задачи, выпуски, обязательства и сводки
  документации — файлы, которые пакет проверяет. Выпуск закрывается только с
  распиской и разобранными обязательствами.

**Подключение правил.** Поставить пакет, выполнить `conventions sync`, объявить
в `.conventions.json` каталоги с исходниками и свой стек (`"stack": []`, если
нужны только правила), подключить `check` и `verify` к задачам и хуку
`pre-push`, открыть первый выпуск командой `conventions release adopt`.
Задачами заводятся только обязательства, относящиеся к объявленному стеку.

**Библиотеки по желанию.** Тем, кому они нужны, ядро даёт стартеры Spring Boot
(`platform-auth`, `platform-persistence`, `platform-web-errors`,
`platform-notifications`, `platform-support` и другие) и библиотеки Angular
(`@apocarteres/http`, `modal`, `auth` и другие). Это предложение, а не
условие: проект вправе держать свою реализацию того же контракта.

**Получение артефактов.** Ничего не публикуется в Maven Central и npm.
Закрепить тег выпуска, переключиться на него и выполнить
`mise run install-local`, см. [локальная публикация](docs/runbooks/local-publishing.md).
Инструменты закреплены в `mise.toml`.

**Документация** — [docs/INDEX.md](docs/INDEX.md); обзор идей на английском —
[docs/OVERVIEW.md](docs/OVERVIEW.md). Правила для агентов,
работающих над самим ядром, — [AGENTS.md](AGENTS.md).

**Сообщить о проблеме** — см. [CONTRIBUTING.md](CONTRIBUTING.md); об
уязвимости — закрыто, см. [SECURITY.md](SECURITY.md).

**Лицензия** — Apache-2.0, см. [LICENSE](LICENSE) и [NOTICE](NOTICE).
Зависимости сохраняют свои лицензии. Liquibase 5.x, который приносит
`platform-persistence`, распространяется под **FSL-1.1-ALv2** (Functional
Source License). Это не лицензия, одобренная OSI: она запрещает делать продукт,
конкурирующий с Liquibase, а каждая версия переходит на Apache-2.0 через два
года после выхода.
