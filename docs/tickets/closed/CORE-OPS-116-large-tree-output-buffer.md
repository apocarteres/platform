---
id: CORE-OPS-116
type: ticket
status: done
scope: tooling, release
authority: supporting
priority: P1
release: RELEASE-15-1-2
related: REQ-RELEASE, REQ-QUALITY, REQ-DEPLOYMENT
---

# Расписка и выпуск отказывают на крупном репозитории: буфер вывода git

## Проблема

`conventions attested`, `release status`, `release close` и расписка `verify` у потребителя с крупным деревом падают с `RangeError [ERR_CHILD_PROCESS_STDIO_MAXBUFFER]`. `codeTree` (`lib/release/git.mjs`) читает `git ls-tree -r --full-tree` через `git()`, а тот вызывает `execFile` без `maxBuffer` — по умолчанию 1 МиБ. Тот же предел у `uncommitted` (`git status --untracked-files=all`) и у списка отслеживаемых файлов в `lib/environment-config.mjs` (`git ls-files -z`); последний отказ ловится, и проверка молча переходит на обход диска, включая неотслеживаемые файлы.

## Подтверждение

Потребитель legacy-store (ядро 15.1.1), задача legacy-store/LS-OPS-021: `git ls-tree -r --full-tree HEAD` — 3 646 196 байт (около 30 тыс. файлов OpenCart), `conventions attested --commit HEAD` — код 1, `ERR_CHILD_PROCESS_STDIO_MAXBUFFER`; `release status` — «stdout maxBuffer length exceeded». Воспроизведено тестом `test/large-tree.test.mjs` на синтетическом дереве из 14 000 записей: до правки оба теста падают тем же отказом.

## Последствия при сохранении текущего поведения

У крупного потребителя хук `pre-push` отказывает на любой отправке, выпуск не закрывается; отправка возможна только обходом `--no-verify`. Проверка настройки среды молча меняет семантику.

## Требуется

1. Вызовы git, вывод которых растёт с репозиторием, задают буфер `OUTPUT_BUFFER` (256 МиБ, как `HISTORY_BUFFER` истории).

## Критерии приёмки

- Тест первым: `codeTree` и `uncommitted` на дереве больше 1 МиБ вывода — без отказа; до правки тест падает.
- Набор `conventions-test` проходит.

## Ход работы

2026-10-15: `git()`, `uncommitted` (`lib/release/git.mjs`) и `tracked` (`lib/environment-config.mjs`) получили `maxBuffer: OUTPUT_BUFFER`. Тест `test/large-tree.test.mjs` (две проверки) падал до правки с `stdout maxBuffer length exceeded` и проходит после; `conventions-test` — 455 тестов, отказов нет. Для `tracked` отдельного теста нет: отказ там ловится, и наблюдаемая разница — только подмена списка обходом диска; правка та же, что проверена на `git()` и `uncommitted`.

## Откуда пришла задача

Потребитель legacy-store, задача legacy-store/LS-OPS-021; исправление по решению владельца от 2026-10-15 без заявки.
