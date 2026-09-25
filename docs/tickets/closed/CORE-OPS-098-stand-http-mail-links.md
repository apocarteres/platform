---
id: CORE-OPS-098
type: ticket
status: done
scope: security, backend, testing
authority: supporting
priority: P2
release: RELEASE-11-3-0
related: REQ-AUTH, CORE-OPS-099
---

# Ссылки писем стенда ведут на localhost

## Проблема

`platform.auth.link-base` принимал `http` только для `localhost`, иначе служба
не стартовала. Стенд QA открыт по `http` на своём имени, и ссылка в письме
вынужденно вела на `localhost`: путь «письмо → щелчок → подтверждение» на
стенде не проверялся, токен вырезали руками.

## Подтверждение

Заявка потребителя [issue #56](https://github.com/apocarteres/platform/issues/56)
(clanlog, ядро 11.2.0). Сверено 2026-09-25 по `AuthSettings`.

## Последствия при сохранении текущего поведения

Письма стенда не проверяются тем путём, каким по ним идёт человек.

## Решение владельца

Решение владельца от 2026-09-25: по образцу `REQ-AUTH-027` — `http` на любом
имени вне профиля `production`, с этим профилем — отказ запуска. Пробел —
рабочая среда без профиля `production` — закрывается отдельной задачей
CORE-OPS-099.

## Требуется

`http`-адрес ссылок на стенде; в профиле `production` — только `https`.

## Критерии приёмки

- Тест: `https` везде, `http` на `localhost` и стенде, отказ в `production` и
  для чужой схемы.

## Что сделано

- `AuthSettings`: `http` вне профиля `production` с предупреждением при
  запуске; в `production` и для иной схемы — отказ. `REQ-AUTH-010` уточнено.
- `AuthSettingsTest`; 3 пробы — все пойманы.

## Откуда пришла задача

[issue #56](https://github.com/apocarteres/platform/issues/56).
