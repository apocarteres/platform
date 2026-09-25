---
id: CORE-OPS-096
type: ticket
status: done
scope: deployment, tooling
authority: supporting
priority: P2
release: RELEASE-11-1-0
related: REQ-DEPLOYMENT
---

# `static-check` падает на сборке без `index.html`

## Проблема

`checkStatic` на сборке без точки входа возвращался рано без поля `warnings`,
а команда перебирала `answer.warnings`: вместо отказа с причиной человек
видел `TypeError: answer.warnings is not iterable`.

## Подтверждение

Заявка потребителя [issue #53](https://github.com/apocarteres/platform/issues/53)
(clanlog). Сверено 2026-09-25 по `lib/static-check.mjs`.

## Последствия при сохранении текущего поведения

Неверно названная составляющая клиента выглядит как дефект инструмента.

## Требуется

Ранний возврат несёт `warnings: []`, команда печатает причину и код отказа.

## Критерии приёмки

- Тест на сборку без `index.html`.

## Что сделано

- Ранний возврат несёт `warnings`; тест; проба без поля его роняет.

## Откуда пришла задача

[issue #53](https://github.com/apocarteres/platform/issues/53).
