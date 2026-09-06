---
id: REQ-CODE-CLOCK
type: requirement
status: active
scope: process, tooling
authority: normative
clause-id-prefix: REQ-CODE-CLOCK
related: REQ-CODE-COMMENTS
---

# Работа со временем: контракт проверки

[Карта требований](../REQUIREMENTS.md)

Документ нормативен для платформы и для всех проектов, подключивших пакет `@apocarteres/project-conventions`. Он не копируется в репозитории потребителей: пакет доставляет этот файл вместе с собой.

## Правило

1. <a id="REQ-CODE-CLOCK-000"></a> **REQ-CODE-CLOCK-000** — Прямое обращение к системным часам запрещено и в рабочем коде, и в тестах. Время получают через интерфейс часов: в рабочем коде он реализован системными часами, в тестах всегда возвращает заданное значение.

Тест, зависящий от текущего момента, ничего не доказывает: его исход определяют обстоятельства машины, а не поведение кода.

## Что запрещено

1. <a id="REQ-CODE-CLOCK-001"></a> **REQ-CODE-CLOCK-001** — В файлах `.java` запрещены вызовы `Instant.now`, `LocalDate.now`, `LocalDateTime.now`, `LocalTime.now`, `OffsetDateTime.now`, `ZonedDateTime.now`, `Year.now`, `YearMonth.now`, `System.currentTimeMillis`, `System.nanoTime`, `Clock.systemUTC`, `Clock.systemDefaultZone`, `Clock.system`.
2. <a id="REQ-CODE-CLOCK-002"></a> **REQ-CODE-CLOCK-002** — В файлах `.ts`, `.mjs`, `.js` запрещены `Date.now`, `performance.now`, `process.hrtime` и `new Date()` без аргументов. `new Date(value)` с аргументом разрешён: он не обращается к часам.
3. <a id="REQ-CODE-CLOCK-003"></a> **REQ-CODE-CLOCK-003** — Запрет действует одинаково в рабочем коде и в тестах. Тест, зависящий от текущего момента, недоказуем: его исход определяют обстоятельства машины.

## Что разрешено

4. <a id="REQ-CODE-CLOCK-004"></a> **REQ-CODE-CLOCK-004** — Время получают через интерфейс часов: в рабочем коде он реализован системными часами, в тестах возвращает заданное значение.
5. <a id="REQ-CODE-CLOCK-005"></a> **REQ-CODE-CLOCK-005** — Файлы, реализующие часы для рабочего кода, перечисляются в `.conventions.json` полем `clockAllowlist` и проверкой не рассматриваются. Перечень задаётся путями относительно корня проекта.
6. <a id="REQ-CODE-CLOCK-006"></a> **REQ-CODE-CLOCK-006** — Обращения внутри строковых литералов и комментариев нарушением не считаются.

## Существующий код

7. <a id="REQ-CODE-CLOCK-007"></a> **REQ-CODE-CLOCK-007** — Существующие обращения фиксируются храповиком `.conventions/baseline.json` отдельным разделом правила. Первичное засеивание разрешено без ключей, последующий рост требует `--allow-growth`.
