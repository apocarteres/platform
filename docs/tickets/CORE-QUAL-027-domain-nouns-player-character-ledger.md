---
id: CORE-QUAL-027
type: ticket
status: done
scope: quality, java
authority: supporting
priority: P3
release: unassigned
related: REQ-JAVA-NAMING
---

# Доменные существительные `Player`, `Character`, `Ledger`

## Проблема

Правило `REQ-JAVA-NAMING-001` метит тип, названный по действию. У
потребителя под ограничителем остались три имени, и все — существительные
предметной области, а не исполнители: `Player`, `GameCharacter`,
`ClanJournalLedger`. Переименовывать их — уйти от словаря предметной области
ради рекомендации.

## Подтверждение

Заявка потребителя [issue #49](https://github.com/apocarteres/platform/issues/49)
(clanlog, ядро 9.1.0). Сверено 2026-09-25: слов нет в
`REQ-JAVA-NAMING-003`; у самого ядра под ограничителем по той же причине
стояли `Letter` и `Player` в тестах.

## Последствия при сохранении текущего поведения

Проверка сообщает о словах предметной области как о процедурах в объекте, и
потребитель держит их под ограничителем без надежды снять.

## Требуется

Дополнить `REQ-JAVA-NAMING-003` по причине перечня (`REQ-JAVA-NAMING-004`).

## Критерии приёмки

- Имена проходят правило, имя исполнителя — нет.
- Перечни правила и требования не расходятся.

## Что сделано

- В перечень добавлены `Player`, `Character`, `Ledger` и `Letter`.
- Тест `java-naming.test.mjs`: перечни правила равны перечням требования;
  `Player`, `GameCharacter`, `ClanJournalLedger`, `Letter` проходят, `Fetcher` —
  нет. Отдельного теста на перечни раньше не было.
- Ограничитель ядра сужен: записи `Letter` и `Player` сняты.

## Откуда пришла задача

[issue #49](https://github.com/apocarteres/platform/issues/49).
