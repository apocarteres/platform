#!/usr/bin/env bash
set -euo pipefail

# REQ-BUILD-003: команда npm-пакетов ядра вызывается задачей менеджера окружения.
# Выполняет объявленный npm-скрипт в каждом пакете, который его объявил.

SCRIPT="${1:-}"
if [ -z "$SCRIPT" ]; then
  echo "использование: scripts/web.sh <npm-скрипт>" >&2
  exit 2
fi

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
FOUND=0

# CORE-OPS-088: зависимости ставятся всем пакетам до первого сценария. Пакеты
# берут общую настройку разбора из project-conventions, и на чистом дереве её
# зависимостей не было, пока очередь не дошла до самого пакета правил.
for manifest in "$ROOT_DIR"/packages/*/package.json; do
  [ -f "$manifest" ] || continue
  dir="$(dirname "$manifest")"
  if [ ! -d "$dir/node_modules" ] && node -e "process.exit(Object.keys(require('$manifest').devDependencies ?? {}).length ? 0 : 1)"; then
    echo "[web] $(basename "$dir"): установка зависимостей по файлу блокировки"
    (cd "$dir" && npm ci --silent)
  fi
done

for manifest in "$ROOT_DIR"/packages/*/package.json; do
  [ -f "$manifest" ] || continue
  dir="$(dirname "$manifest")"
  if ! node -e "process.exit(require('$manifest').scripts?.['$SCRIPT'] ? 0 : 1)"; then
    continue
  fi
  FOUND=1
  echo "[web] $(basename "$dir"): $SCRIPT"
  (cd "$dir" && npm run --silent "$SCRIPT")
done

if [ "$FOUND" = 0 ]; then
  echo "[web] ни один пакет не объявляет скрипт $SCRIPT" >&2
  exit 1
fi
