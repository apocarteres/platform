---
id: RELEASE-18-2-1
type: release
status: released
scope: release
authority: supporting
opened-on: 2026-11-16
released-on: 2026-11-16
commit: 93212810ffa6765f623eff8935da4e9904a318b9
---

# Выпуск 18.2.1

Правила выпуска — `REQ-RELEASE` в поставке пакета правил. [Каталог](INDEX.md)

## Цель

Выпустить состояние сервиса, накопленное после предыдущего выпуска, и исполнить обязательства ядра, попавшие в этот выпуск.

## Состав

| Задача | Причина включения | Порядок |
|---|---|---|
| [CORE-SEC-011](../tickets/closed/CORE-SEC-011-tomcat-11-0-25-vulnerabilities.md) | Закрыта в этом выпуске, приоритет P1 | 1 |

## Критерии выхода

- [x] Набор `verify` пройден на выпускаемом коммите — расписка 2026-11-16T21:28:39.274Z, наборы: check, verify, прогон `conventions receipt --parts: mise run verify-part-checks && mise run verify-part-rules && mise run verify-part-web && mise run java-test`
- [x] Тег выпуска создан на проверенном коммите — `v18.2.1`
- [x] Обязательства ядра этого выпуска закрыты или перенесены записью с причиной — ядро не объявляет обязательств самому себе
- [x] Завершающий шаг выполнен — публикация артефактов ядра: mise run install-local

## Не входит

Задачи, не закрытые к моменту закрытия выпуска: они попадут в состав следующего по факту закрытия.

## Результат

Выпущено с коммита `93212810ffa6765f623eff8935da4e9904a318b9`, тег `v18.2.1`.

Расписка о проверках получена 2026-11-16T21:28:39.274Z; выполненные наборы: check, verify.

Прогон наблюдён командой `conventions receipt --parts: mise run verify-part-checks && mise run verify-part-rules && mise run verify-part-web && mise run java-test` с кодом возврата 0.

Развёртывание выполняется этим тегом: REQ-RELEASE-016.

## Цена обновления

Несовместимого нет: обновление не делает check красным и не меняет объявленного поведения.

Версии компонентов (3) — полный прогон потребителя обязателен (REQ-DEPS-010):
- org.apache.tomcat.embed:tomcat-embed-core 11.0.25 → 11.0.27
- org.apache.tomcat.embed:tomcat-embed-el 11.0.25 → 11.0.27
- org.apache.tomcat.embed:tomcat-embed-websocket 11.0.25 → 11.0.27

Обязывает (1):
- обязательство full-run-18-2-1 (директива, REQ-DEPS-010): срок 1 выпуск(ов) после принятия
