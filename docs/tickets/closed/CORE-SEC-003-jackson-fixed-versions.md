---
id: CORE-SEC-003
type: ticket
status: done
scope: security, java, dependencies
authority: supporting
priority: P1
release: RELEASE-13-2-1
related: REQ-DEPS
---

# Ядро отдавало уязвимый jackson-databind 3.1.5

## Проблема

Версию Jackson задавал импорт Spring Boot 4.0.8: `tools.jackson.core:jackson-databind`
3.1.5, управляемая версия `com.fasterxml.jackson.core:jackson-databind` — 2.21.5.
2026-09-28 опубликованы уязвимости обеих веток, исправленные в 3.1.6 и
2.21.6. Потребители наследуют управление версиями от ядра
(`REQ-DEPS-001`), поэтому получали уязвимую версию все. Spring Boot ветки
4.0 новее 4.0.8 нет.

## Подтверждение

Сканер зависимостей потребителя уронил сценарии на стенде. Сверено
2026-09-29: дерево зависимостей ядра — 3.1.5 в компиляции `platform-auth`,
`platform-notifications`, `platform-support`; GitHub Advisory —
GHSA-q4xh-88c3-wmh7 (High, отказ в обслуживании при разборе `Duration` и
`XMLGregorianCalendar`), GHSA-gx83-3vf8-gh7j, GHSA-wjgm-6hv5-3cvf (Medium).
Точки ядра этих типов не принимают и полиморфную типизацию не включают;
типы в запросах потребителя ядро не видит.

## Последствия при сохранении текущего поведения

Сборки потребителей со сканером падают; обход у каждого свой, мимо ядра
(`REQ-DEPS-004`).

## Решение владельца

Решение владельца от 2026-09-29: закрепить исправленные версии выпуском ядра.

## Требуется

Наборы `tools.jackson:jackson-bom` и `com.fasterxml.jackson:jackson-bom`
с исправленными версиями — раньше `spring-boot-dependencies` (`REQ-DEPS-005`).

## Критерии приёмки

- Тесты первыми: разрешённый `jackson-databind` не ниже 3.1.6; корневой POM
  импортирует оба набора не ниже исправленных и раньше Spring Boot. Тесты
  падали до правки: разрешалась 3.1.5, наборов не было.

## Что сделано

- Корневой `pom.xml`: `jackson-bom` 3.1.7 и 2.21.7 — последние исправления тех
  же младших версий, что у Spring Boot 4.0.8.
- `JacksonVersionTest`, `core-jackson.test.mjs`. 3 пробы — все пойманы;
  ветку 2.x ловит только проверка POM: её `databind` в ядре нет в пути классов.

## Откуда пришла задача

Сообщение владельца 2026-09-29: сканер потребителя на стенде.
