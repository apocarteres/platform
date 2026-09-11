---
id: RUN-GITHUB-PACKAGES
type: runbook
status: active
scope: build, delivery
authority: supporting
related: REQ-PUBLISHING
---
# Публикация ядра локально и подключение потребителя

[Инструкции](INDEX.md) · [Версионирование и публикация](../requirements/publishing.md) · [ADR-0003](../decisions/ADR-0003-local-artifact-publishing.md)

## Что публикуется

Ядро отдаёт потребителю Java-артефакты (`platform-bom`, `platform-persistence`, `platform-time`, `platform-web-errors`) и npm-пакеты: правила `@apocarteres/project-conventions` и библиотеки для клиента, например `@apocarteres/http`. Registry не используется: артефакты попадают в локальный репозиторий Maven, npm-пакет собирается архивом. Координаты и версии не изменились: версия берётся из тега, `REQ-PUBLISHING-002`.

## Публикация

1. Поставить тег на коммит `main`, прошедший проверки: `git tag v0.17.0 && git push origin v0.17.0`.
2. Выполнить `mise run install-local`. Версия берётся из тега текущего коммита; можно задать явно: `mise run install-local 0.17.0`.

Команда делает две вещи: `mvnw -Prelease install` с версией из тега, поэтому `-SNAPSHOT` отклоняется, и `npm pack` пакета правил в `target/local-packages`.

## Подключение потребителя

Потребитель фиксирует версию ядра ссылкой на тег и собирает ядро из этого состояния. В zavpn это делает `mise run platform-install`: скрипт `scripts/platform/install.sh` получает ядро в `target/platform`, переключается на закреплённый тег из файла `.platform-version`, выполняет там локальную публикацию и ставит npm-архив как зависимость.

Java-артефакты после этого доступны из локального репозитория Maven, поэтому `repository` в `pom.xml` потребителя не нужен и учётные данные тоже.

## Смена версии ядра у потребителя

1. Записать новый тег в `.platform-version`.
2. Выполнить `mise run platform-install`.
3. Прогнать проверки потребителя и зафиксировать изменение `package-lock.json` вместе с `.platform-version`.

## Ошибочный выпуск

Опубликованная версия неизменна, `REQ-PUBLISHING-009`. Ошибочный тег не переписывается: выпускается следующий patch. Локальный репозиторий Maven при этом придётся почистить руками, если ошибочная версия успела там осесть: `rm -rf ~/.m2/repository/io/github/apocarteres/platform/*/<версия>`.

## Подключение npm-библиотеки клиентом

Библиотеки собираются перед упаковкой, поэтому в архив попадает результат
сборки: `fesm2022/*.mjs`, `types/*.d.ts` и `package.json` с полем `exports`.
Потребитель ставит архив как обычную зависимость:

```
npm install <ядро>/target/local-packages/apocarteres-http-<версия>.tgz
```

После установки библиотека доступна по имени пакета:

```ts
import { problemDetailOf } from '@apocarteres/http';
```

Версия Angular библиотекой не навязывается: она объявлена одноимённой
зависимостью `peerDependencies`, и подходящей считается та, что уже стоит у
потребителя.
