---
id: TICKET-GITHUB-PACKAGES-PUBLISHING
type: ticket
status: in_progress
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

Решения об именах и registry приняты 2026-09-06 ([ADR-0001](../decisions/ADR-0001-shared-core.md), раздел 6). Без публикации ни один пакет нельзя подключить к zavpn и clanlog иначе как копированием, то есть тем способом, от которого ядро призвано уйти.

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
- Первый публикуемый starter — `platform-persistence`; его перенос идёт по [TICKET-PLATFORM-PERSISTENCE](platform-persistence.md), здесь он нужен как реальный артефакт для проверки канала публикации.
- Workflow `publish.yml` по тегу `vX.Y.Z`: Maven `deploy` с `-Drevision` и профилем `release`, npm `publish` заглушки `@apocarteres/project-conventions` под той же версией. Workflow `ci.yml`: документация, Java, поиск секретов.
- Требование [REQ-PUBLISHING](../requirements/publishing.md) с семью положениями и инструкция [RUN-GITHUB-PACKAGES](../runbooks/github-packages.md).

Не проверено и требует владельца: чтение опубликованных пакетов из чистого окружения по личному токену `read:packages` (критерии приёмки 1 и 2) и прогон инструкции на второй машине (критерий 3).
