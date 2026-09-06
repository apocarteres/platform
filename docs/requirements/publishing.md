---
id: REQ-PUBLISHING
type: requirement
status: active
scope: build, delivery
authority: normative
clause-id-prefix: REQ-PUBLISHING
---

# Версионирование и публикация артефактов ядра

[Карта требований](../REQUIREMENTS.md) · [Инструкция по GitHub Packages](../runbooks/github-packages.md)

## Координаты

1. <a id="REQ-PUBLISHING-001"></a> **REQ-PUBLISHING-001** — Java-артефакты публикуются с groupId `io.github.apocarteres.platform`, npm-пакеты в scope `@apocarteres`. Координаты не зависят от registry и не меняются при его смене.
2. <a id="REQ-PUBLISHING-002"></a> **REQ-PUBLISHING-002** — Версия артефактов задаётся тегом `vX.Y.Z` в репозитории ядра и совпадает с ним без префикса. Все артефакты одного тега имеют одну версию; в POM версия не хранится и подставляется при сборке.
3. <a id="REQ-PUBLISHING-003"></a> **REQ-PUBLISHING-003** — В registry публикуются только версии из тега. Версии с суффиксом `-SNAPSHOT` и зависимости на такие версии отклоняются сборкой публикации.

## Совместимость

4. <a id="REQ-PUBLISHING-004"></a> **REQ-PUBLISHING-004** — Версии следуют semver: patch и minor не ломают потребителя, major означает несовместимое изменение. Несовместимое изменение не сопровождается сохранением старого контракта рядом с новым.
5. <a id="REQ-PUBLISHING-005"></a> **REQ-PUBLISHING-005** — Каждая major-версия сопровождается описанием миграции потребителя в документе выпуска. Потребитель переходит на неё одним изменением, без переходного периода с двумя контрактами.

## Состав публикации

6. <a id="REQ-PUBLISHING-006"></a> **REQ-PUBLISHING-006** — `platform-bom` перечисляет все публикуемые Java-артефакты ядра одной версии. Потребитель импортирует BOM и подключает артефакты без указания версий.
7. <a id="REQ-PUBLISHING-007"></a> **REQ-PUBLISHING-007** — Registry по умолчанию — GitHub Packages репозитория `apocarteres/platform` для Maven и npm. Потребитель читает пакеты личным токеном с правом `read:packages`; токен не хранится в репозиториях потребителей.
