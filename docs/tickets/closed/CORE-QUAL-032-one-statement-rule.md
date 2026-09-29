---
id: CORE-QUAL-032
type: ticket
status: done
scope: java, quality, data-access
authority: supporting
priority: P2
release: RELEASE-13-2-0
related: REQ-DATA-ACCESS
---

# Правило «один оператор на метод DAO»

## Проблема

`REQ-DATA-ACCESS-002` не проверялось правилом, в отличие от соседних
положений того же требования. Нарушение не видели ни сборка, ни проверки.
Само ядро нарушало положение в трёх местах: `TokenStore.issue`,
`RequestStore.erase`, `JdbcJobLock.claim`.

## Подтверждение

Заявка потребителя [issue #66](https://github.com/apocarteres/platform/issues/66):
18 постраничных методов «число, затем страница» нашлись ручным разбором.
Нарушения ядра найдены при разборе 2026-09-29.

## Последствия при сохранении текущего поведения

Новые методы повторяют прежний образец; ядро требует от потребителей того,
чего не делает само.

## Решение владельца

Решение владельца от 2026-09-29: поставить правило и применить его к ядру.

## Требуется

Правило `dataAccessMethodsRunOneStatement`; хранилища ядра — по одному
оператору на метод, а собирает их прикладной слой.

## Критерии приёмки

- Тест первым: DAO «число, затем страница», с ветвлением между операторами и
  с двумя вызовами `JdbcTemplate` отвергается, DAO с одним оператором на метод
  и прикладной класс проходят. Тест падал на заготовке правила. Для хранилищ
  ядра правило падало на `JdbcJobLock.claim`. Для `TokenStore` и
  `RequestStore` красным шагом стали пробы c1 и c2: возврат двух операторов в
  метод правило отвергает.

## Что сделано

- `PlatformArchRules.dataAccessMethodsRunOneStatement`; `REQ-DATA-ACCESS-002`
  называет правило и его границы.
- Ядро: `TokenStore.retire` отдельно от `issue`, гасит прежние токены
  `AuthService`; `RequestStore.eraseEntries` отдельно от `erase`, собирает их
  `RetentionService`; операторы замка работы — в `JobLockStore`, решение
  «занят — вставить» — в `JdbcJobLock`, SQL прежний. Правило применено
  к хранилищам `platform-auth`, `platform-notifications`, `platform-support`,
  `platform-persistence`.
- Пробы: 3 на правиле (одна сначала не собралась из-за Error Prone и
  переписана) и 6 на ядре — все пойманы. Вариант замка одним `MERGE` отвергнут:
  его нет в PostgreSQL до 15.

## Откуда пришла задача

[issue #66](https://github.com/apocarteres/platform/issues/66).
