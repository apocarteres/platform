---
id: CORE-OPS-108
type: ticket
status: backlog
scope: tooling, testing
authority: supporting
priority: P3
release: unassigned
related: REQ-QUALITY
---

# Сборочный контейнер не работает с rootless Docker

## Проблема

`scripts/verify-runner/runner.sh` подключает в контейнер сокет
`/var/run/docker.sock` и запускает набор от пользователя 1000. У rootless
Docker, как в Lima-инстансе `pulse`, демон слушает `/run/user/<uid>/docker.sock`,
а смонтированный сокет rootful-демона контейнеру недоступен. Testcontainers
внутри отказывает: `Could not find a valid Docker environment`,
`BindException: Permission denied`.

## Подтверждение

2026-09-30: машина сборки `mini` недоступна из офиса, `verify-runner` на Docker
`pulse` упал на всех тестах с контейнерами. Обход — прогон на Mac с
`DOCKER_HOST`, `TESTCONTAINERS_DOCKER_SOCKET_OVERRIDE=/run/user/501/docker.sock`
и `TESTCONTAINERS_HOST_OVERRIDE=127.0.0.1`.

## Последствия при сохранении текущего поведения

Без `mini` набор идёт мимо сборочного контейнера, и выпуск держится на
ручных переменных окружения.

## Решение владельца

Заведено по правилу ядра: ручной обход инструмента становится задачей.

## Требуется

`verify-runner` распознаёт rootless Docker и подключает его сокет: путь
сокета демона, пользователь в контейнере и адрес опубликованных портов для
Testcontainers.

## Критерии приёмки

- Проверка на rootless Docker: `mise run verify-runner` проходит тесты с
  контейнерами и переносит расписку.
