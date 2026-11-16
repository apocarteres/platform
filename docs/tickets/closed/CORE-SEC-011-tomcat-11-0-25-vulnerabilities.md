---
id: CORE-SEC-011
type: ticket
status: done
scope: backend, security, dependencies
authority: supporting
priority: P1
release: RELEASE-18-2-1
related: REQ-DEPS
---

# Tomcat 11.0.25 в ядре несёт критические уязвимости

## Проблема

Корневой `pom.xml` ядра закрепляет `tomcat.version` 11.0.25
(`REQ-DEPS-005`). Сканер зависимостей потребителя находит в собранном jar
уязвимости `tomcat-embed-core` и `tomcat-embed-websocket` 11.0.25, в том
числе критические, и держит его `verify`.

## Подтверждение

Заявка Clan Log 2026-11-16 (задача потребителя CL-OPS-154), задача
`backend-audit` их `verify` на ядре 18.2.0:

- `tomcat-embed-core` 11.0.25, исправлено в 11.0.27: CVE-2026-103119,
  CVE-2026-101296, CVE-2026-101356, CVE-2026-86248, CVE-2026-86350
  (Critical), CVE-2026-93446, CVE-2026-88041, CVE-2026-75973,
  CVE-2026-78437, CVE-2026-78383, CVE-2026-77762 (High), CVE-2026-74048,
  CVE-2026-73581 (Medium), CVE-2026-77756 (Low);
- `tomcat-embed-websocket` 11.0.25, исправлено в 11.0.26: CVE-2026-76183
  (Critical), CVE-2026-77791, CVE-2026-87022, CVE-2026-79677 (High).

Версия 11.0.27 всех трёх артефактов (`core`, `el`, `websocket`) есть в
Maven Central.

## Последствия при сохранении текущего поведения

Потребитель не проходит свой `verify` и не может выпуститься; поднять
версию сам не вправе (`REQ-DEPS-004`).

## Требуется

1. `tomcat.version` — 11.0.27 для `tomcat-embed-core`, `-el`, `-websocket`.
2. Патч-выпуск ядра.

## Критерии приёмки

- Ядро закрепляет Tomcat 11.0.27.
- `mise run verify` зелёный.

## Ход работы

- 2026-11-16 — `tomcat.version` 11.0.25 → 11.0.27 в корневом `pom.xml`;
  одна запись закрепляет все три артефакта.

## Откуда пришла задача

Заявка Clan Log 2026-11-16 через сессию Manager потребителя.
