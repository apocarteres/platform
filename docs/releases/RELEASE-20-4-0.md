---
id: RELEASE-20-4-0
type: release
status: released
scope: release
authority: supporting
opened-on: 2026-11-24
released-on: 2026-11-24
commit: dfca41e1c1de76bfd2799b30a5eb195cba0dfbad
---

# Выпуск 20.4.0

Правила выпуска — `REQ-RELEASE` в поставке пакета правил. [Каталог](INDEX.md)

## Цель

Выпустить состояние сервиса, накопленное после предыдущего выпуска, и исполнить обязательства ядра, попавшие в этот выпуск.

## Для хранилища

Выпуск минорный, контракт 3 (`REQ-STORE-028`). Проект без e2e объявляет `"e2e": {"required": false, "reason": "…"}` в `.conventions.json`, и `release open --task` передаёт `openRelease` аргументы `e2eRequired: false` и `e2eReason`. Хранилище держит их у выпуска, отдаёт `e2eRequired` в ответе о выпуске и не отказывает такому выпуску кодом `release-commit-unchecked` в `closeRelease` и `recloseRelease`. Пока хранилище этого не делает, закрытие такого выпуска упрётся в его отказ.

## Состав

| Задача | Причина включения | Порядок |
|---|---|---|
| [CORE-OPS-137](../tickets/closed/CORE-OPS-137-e2e-not-required.md) | Закрыта в этом выпуске, приоритет P1 | 1 |

## Критерии выхода

- [x] Набор `verify` пройден на выпускаемом коммите — расписка 2026-11-24T21:33:21.422Z, наборы: check, verify, прогон `conventions receipt --parts: mise run verify-part-checks && mise run verify-part-rules && mise run verify-part-web && mise run java-test`
- [x] Тег выпуска создан на проверенном коммите — `v20.4.0`
- [x] Обязательства ядра этого выпуска закрыты или перенесены записью с причиной — ядро не объявляет обязательств самому себе
- [x] Завершающий шаг выполнен — публикация артефактов ядра: mise run install-local

## Не входит

Задачи, не закрытые к моменту закрытия выпуска: они попадут в состав следующего по факту закрытия.

## Результат

Выпущено с коммита `dfca41e1c1de76bfd2799b30a5eb195cba0dfbad`, тег `v20.4.0`.

Расписка о проверках получена 2026-11-24T21:33:21.422Z; выполненные наборы: check, verify.

Прогон наблюдён командой `conventions receipt --parts: mise run verify-part-checks && mise run verify-part-rules && mise run verify-part-web && mise run java-test` с кодом возврата 0.

Развёртывание выполняется этим тегом: REQ-RELEASE-016.

## Цена обновления

Несовместимого нет: обновление не делает check красным и не меняет объявленного поведения.

Добавлено (1):
- положений добавлено: 1
