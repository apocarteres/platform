---
id: CORE-OPS-125
type: ticket
status: backlog
scope: tooling, build
authority: supporting
priority: P2
release: unassigned
related: REQ-DEPS, CORE-OPS-124
---

# Закреплённый npm 10.9.4 не разбирает дерево зависимостей с vitest 4.1

## Проблема

`mise.toml` закрепляет npm 10.9.4. На дереве Angular-пакетов ядра с `vitest`
4.1.x он падает при построении дерева, и lock-файл пересобрать нельзя ни
`npm install`, ни `npm install --package-lock-only`, ни с удалённым
lock-файлом:

```
npm error Cannot read properties of null (reading 'edgesOut')
  at #loadPeerSet (@npmcli/arborist/lib/arborist/build-ideal-tree.js:1289)
```

## Подтверждение

2026-11-05, работа CORE-OPS-124, пакет `auth`. Подъём только `vitest`
4.0.6 → 4.1.12 (и 4.1.11) — отказ; подъём `@angular/*` и `ng-packagr` без
`vitest` — успех; явное закрепление `vite` 7.3.7 не помогает. npm 11.21.1
(`npx npm@11.21.1 install --package-lock-only`) то же дерево строит, а
закреплённый npm 10.9.4 полученный lock-файл ставит `npm ci` без ошибок.

## Обход, которым он закрыт сейчас

Lock-файлы девяти Angular-пакетов в CORE-OPS-124 собраны npm 11.21.1 через
`npx`, а не закреплённым инструментом. Следующий подъём зависимостей упрётся в
тот же отказ.

## Последствия при сохранении текущего поведения

Обновить devDependencies Angular-пакетов закреплённым npm невозможно; каждый
подъём требует того же обхода и знания о нём.

## Требуется

1. Поднять закрепление npm в `mise.toml` до версии, которая строит дерево, —
   npm 11 — либо найти причину отказа npm 10 и устранить её в дереве.
2. Проверить последствия npm 11 для набора: npm 11 не запускает скрипты
   установки без одобрения (`npm install-scripts`) — убедиться, что сборка и
   тесты пакетов и сборочный контейнер (`verify-runner`) от них не зависят.

## Критерии приёмки

- Закреплённый npm пересобирает lock-файл любого Angular-пакета ядра без
  отказа.
- `mise run verify` и `mise run verify-runner` зелёные на закреплённом npm.
