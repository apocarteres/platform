---
id: CORE-OPS-115
type: ticket
status: done
scope: deployment, operations
authority: supporting
priority: P2
release: unassigned
related: REQ-TELEMETRY
---

# Правила оповещений telemetry не проходят линтер promtool

## Проблема

`conventions telemetry --alerts prometheus` печатает на каждый узел правило
`TelemetryNodeAbsent` с одинаковыми метками `{ severity: critical }`: узел есть
только в выражении. `promtool` сравнивает правила по имени и меткам и считает
их дублями.

## Подтверждение

Заявка [apocarteres/platform#75](https://github.com/apocarteres/platform/issues/75)
проекта ZAVPN (ядро 15.1.0), задача ZAVPN-OPS-132, с уточнением от 2026-10-09:
тревоги различаются меткой `node` из выражения, находка — только линтер.
Воспроизведено 2026-10-09: правила для двух узлов, `promtool check rules
--lint-fatal` из `prom/prometheus:v3.9.1` — «lint error 1 duplicate rule(s)
found», код 3.

## Последствия при сохранении текущего поведения

Проверка правил перед перезагрузкой Prometheus отказывает при двух узлах и
больше; обход `--lint=none` отключает проверку и собственных правил проекта.

## Решение владельца

Решение владельца от 2026-10-09 по разбору заявки: правило на узел несёт
метку `node`, и в Prometheus, и в Loki.

## Требуется

1. `TelemetryNodeAbsent` и `TelemetryNodeSilent` получают в `labels` метку
   `node` с именем узла.
2. Уточнить `REQ-TELEMETRY-004` и `RUN-TELEMETRY-NODES`.

## Критерии приёмки

- Тест первым: у правил одного вида нет пары с одинаковыми именем и метками;
  метка `node` на месте в правилах Prometheus и Loki.
- `promtool check rules --lint-fatal` на правилах для двух узлов — код 0.
- Проба: правило Loki без метки `node` — тест падает.

## Откуда пришла задача

Заявка [apocarteres/platform#75](https://github.com/apocarteres/platform/issues/75),
задача ZAVPN-OPS-132 проекта ZAVPN.
