# @apocarteres/e2e-timing

Время прогона e2e на Playwright: репортёр тестов и шагов `test.step`, запись
прогона формата 1, история стенда, сводка и отправка в приём наблюдения.
Норма — [REQ-E2E-TIMING](../../docs/requirements/e2e-timing.md).

## Репортёр

```ts
// playwright.config.ts
reporter: [
  ['list'],
  ...(process.env.E2E_TIMING_PART ? [['@apocarteres/e2e-timing/reporter'] as const] : []),
],
```

Файл части — опция `file` или переменная `E2E_TIMING_PART`. Несколько запусков
Playwright подряд (фазы) пишут каждый свою часть.

## Сборщик

```sh
npx e2e-timing collect --root . --stand "$STAND" --out test-results/e2e-timing.json \
  --history-dir "$HOME/.config/<проект>-e2e" --workers "$E2E_WORKERS" --full \
  test-results/timing-*.json
```

- `--full` — полный прогон: история `<history-dir>/<стенд>/e2e-timing.jsonl`
  (последние 50) и отправка; без него — только `--out` и сводка.
- `--deploy <файл>` — выкатка на стенд (`commit`, `started`, `duration`,
  `status`, `phases`, `tasks`): берётся, если коммит тот же, что у прогона.
- `--phases <файл>` и `--phases-started <ISO>` — фазы подъёма стека,
  строки «название<TAB>секунды».

Переменные: `E2E_RUNNER`, `E2E_MACHINE` — метки; `E2E_TIMING_URL` — приём
(https, http — только localhost); `E2E_TIMING_TOKEN_FILE` — файл ключа.
Сбой записи или отправки — код 0 и сообщение; код 2 — ошибка аргументов.
