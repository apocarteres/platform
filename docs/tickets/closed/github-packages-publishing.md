---
id: TICKET-GITHUB-PACKAGES-PUBLISHING
type: ticket
status: done
scope: build, delivery, tooling
authority: supporting
priority: P1
release: unassigned
related: ADR-0001, REQ-PUBLISHING, RUN-GITHUB-PACKAGES, TICKET-PLATFORM-PERSISTENCE
---

# Публикация пакетов ядра в GitHub Packages

## Цель

Настроить сборку и публикацию артефактов ядра: Maven BOM и starters с groupId `io.github.apocarteres.platform`, npm-пакеты в scope `@apocarteres`. Потребители подключают registry одним токеном.

## Основание

Решения об именах и registry приняты 2026-09-06 ([ADR-0001](../../decisions/ADR-0001-shared-core.md), раздел 6). Без публикации ни один пакет нельзя подключить к zavpn и clanlog иначе как копированием, то есть тем способом, от которого ядро призвано уйти.

## Последствия при сохранении текущего поведения

Извлечённый код останется в этом репозитории без потребителей, а копии в проектах продолжат расходиться.

## Требуется

1. Корневой `pom.xml` с модулями `platform-bom` и первыми starters; версия по semver, `-SNAPSHOT` не публикуется.
2. Workflow публикации по тегу `v*`: Maven в GitHub Packages, npm в GitHub Packages с `publishConfig.registry`.
3. Runbook для потребителя: настройка `~/.m2/settings.xml` и `.npmrc` с токеном чтения, без токена в репозитории.
4. Правило ветвления и версионирования ядра зафиксировано в требованиях: несовместимое изменение — мажорная версия с описанной миграцией потребителя.

## Критерии приёмки

- Тег `v0.1.0` публикует BOM и хотя бы один starter; `mvn dependency:get` из чистого окружения с токеном скачивает его.
- npm-пакет-заглушка публикуется тем же workflow и устанавливается в чистом каталоге.
- Runbook проверен на втором компьютере или в контейнере без сохранённых учётных данных.

## Ход выполнения

### Шаг 1 (2026-09-06)

Решение владельца: registry остаётся GitHub Packages, сравнение с собственным реестром и CI записано в обсуждении и не изменило выбор.

Сделано:

- Корневой `pom.xml` (`platform-parent`): версия `${revision}` с подстановкой `flatten-maven-plugin`, импорт `spring-boot-dependencies` 4.0.4, `distributionManagement` на GitHub Packages, профиль `release` с `requireReleaseVersion` и `requireReleaseDeps`.
- `platform-bom` без родителя, чтобы потребитель не наследовал импорт Spring Boot BOM.
- Первый публикуемый starter — `platform-persistence`; его перенос идёт по [TICKET-PLATFORM-PERSISTENCE](../platform-persistence.md), здесь он нужен как реальный артефакт для проверки канала публикации.
- Workflow `publish.yml` по тегу `vX.Y.Z`: Maven `deploy` с `-Drevision` и профилем `release`, npm `publish` заглушки `@apocarteres/project-conventions` под той же версией. Workflow `ci.yml`: документация, Java, поиск секретов.
- Требование [REQ-PUBLISHING](../../requirements/publishing.md) с семью положениями и инструкция [RUN-GITHUB-PACKAGES](../../runbooks/github-packages.md).

Не проверено и требует владельца: чтение опубликованных пакетов из чистого окружения по личному токену `read:packages` (критерии приёмки 1 и 2) и прогон инструкции на второй машине (критерий 3).

### Шаг 2 (2026-09-06)

- `ci` на `fd69fa6` зелёный; тег `v0.1.0` поставлен, прогон `publish #1` завершился успешно за 38 с: job `maven` 34 с, job `npm` 7 с.
- В разделе Packages репозитория появились четыре пакета версии `0.1.0`: `platform-parent`, `platform-bom`, `platform-persistence`, `@apocarteres/project-conventions`. Критерий приёмки 1 в части публикации выполнен; критерий 2 в части публикации выполнен.
- Предупреждения прогона: `actions/setup-java@v4` объявлен устаревшим, `checkout@v4` и `setup-node@v4` собраны под Node 20. Все три подняты до v5.
- Локально до тега проверено: `deploy` в файловый репозиторий подставляет `0.1.0` во все POM, включая состав BOM; профиль `release` отклоняет `0.1.0-SNAPSHOT`; `npm pack --dry-run` заглушки проходит.

Осталось владельцу: личный токен с правом `read:packages`, затем проверка чтения по инструкции `RUN-GITHUB-PACKAGES` командой `mvn dependency:get` и `npm install` из чистого каталога; прогон инструкции на второй машине или в контейнере. После этого критерии 1–3 закрываются и задача переводится в `done`.

### Шаг 3 (2026-09-06)

- Владелец выдал личный токен с правом `read:packages`; он записан в `~/.m2/settings.xml` как сервер `github-platform` и в `~/.npmrc` для `npm.pkg.github.com`, оба файла с правами `600`. В репозитории значение не хранится.
- Критерий 1 выполнен: `dependency:get` с пустым `-Dmaven.repo.local` скачал из реестра `platform-bom-0.1.0.pom`, `platform-persistence-0.1.0.jar` с его POM и `platform-parent-0.1.0.pom`.
- Критерий 2 выполнен: `npm view @apocarteres/project-conventions` с `.npmrc`, указывающим scope на GitHub Packages, возвращает версию `0.1.0` и адрес архива.

Открыт критерий 3: прогон инструкции на второй машине или в контейнере без сохранённых учётных данных. Проверка с пустым локальным репозиторием Maven на той же машине подтверждает скачивание из реестра, но не воспроизводимость инструкции с нуля.

### Шаг 4 (2026-09-06)

Критерий 3 закрыт прогоном инструкции в чистых контейнерах на локальном Docker
(`docker context` `zavpn-dev`, сервер 29.7.2). Учётные данные хоста в контейнеры
не пробрасывались, `~/.m2` и `~/.npmrc` создавались внутри с нуля.

| Проверка | Образ | Итог |
|---|---|---|
| `dependency:get` для BOM | `maven:3.9-eclipse-temurin-21` | скачан из registry |
| Сборка потребителя с импортом BOM и starter без версии | тот же | `compile` пройден, разрешилось `platform-persistence:jar:0.1.0` |
| `npm install` в пустом каталоге | `node:24-alpine` | установлен `@apocarteres/project-conventions@0.1.0`, записан в `devDependencies` |

Первый прогон дал `401 Unauthorized`: файл с токеном был удалён, и переменная
окружения ушла в контейнер пустой. Это подтверждает, что чтение действительно
требует токена, а не проходит анонимно.

Пункт 4 требований закрыт положениями REQ-PUBLISHING-008 и REQ-PUBLISHING-009:
работа в `main`, тег на её коммите, отсутствие релизных веток, неизменность
опубликованной версии.

Рецепт проверки канала добавлен в инструкцию, чтобы его можно было повторить
после смены registry или ротации токена.

Все критерии приёмки выполнены, задача закрыта.
