#!/usr/bin/env bash
set -euo pipefail

# REQ-BUILD-003: команда npm-пакетов ядра вызывается задачей менеджера окружения.
# Выполняет объявленный npm-скрипт в каждом пакете, который его объявил.
# CORE-OPS-129: install ставит зависимости и сценария не выполняет; --only и
# --except ограничивают пакеты, чтобы часть набора не гоняла чужие сценарии.

usage() {
  echo "использование: scripts/web.sh <npm-скрипт>|install [--only <пакет>] [--except <пакет>]" >&2
}

SCRIPT="${1:-}"
if [ -z "$SCRIPT" ]; then
  usage
  exit 2
fi
shift
ONLY=""
EXCEPT=""
while [ "$#" -gt 0 ]; do
  case "$1" in
    --only) ONLY="${2:?--only требует имени пакета}"; shift 2 ;;
    --except) EXCEPT="${2:?--except требует имени пакета}"; shift 2 ;;
    *) usage; echo "неизвестный аргумент: $1" >&2; exit 2 ;;
  esac
done

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
RULES_DIR="$ROOT_DIR/packages/project-conventions"
CONVENTIONS="$RULES_DIR/bin/conventions.mjs"
FOUND=0

# CORE-OPS-117: зависимости ставятся по отпечатку файла блокировки
# и версий инструментов, а не по наличию каталога node_modules.
install_dependencies() {
  local dir="$1" name state
  name="$(basename "$dir")"
  state="target/deps-$name.sha256"
  if node "$CONVENTIONS" deps --dir "packages/$name" --state "$state" --root "$ROOT_DIR" >/dev/null 2>&1; then
    return
  fi
  echo "[web] $name: установка зависимостей по файлу блокировки"
  (cd "$dir" && npm ci --silent)
  node "$CONVENTIONS" deps --dir "packages/$name" --state "$state" --record --root "$ROOT_DIR" >/dev/null
}

# CORE-OPS-088: зависимости ставятся всем пакетам до первого сценария. Пакеты
# берут общую настройку разбора из project-conventions, и на чистом дереве её
# зависимостей не было, пока очередь не дошла до самого пакета правил.
[ -d "$RULES_DIR/node_modules/yaml" ] || (cd "$RULES_DIR" && npm ci --silent)
for manifest in "$ROOT_DIR"/packages/*/package.json; do
  [ -f "$manifest" ] || continue
  dir="$(dirname "$manifest")"
  if node -e "process.exit(Object.keys(require('$manifest').devDependencies ?? {}).length ? 0 : 1)"; then
    install_dependencies "$dir"
  fi
done
[ "$SCRIPT" = "install" ] && exit 0

for manifest in "$ROOT_DIR"/packages/*/package.json; do
  [ -f "$manifest" ] || continue
  dir="$(dirname "$manifest")"
  name="$(basename "$dir")"
  if [ -n "$ONLY" ] && [ "$name" != "$ONLY" ]; then continue; fi
  if [ -n "$EXCEPT" ] && [ "$name" = "$EXCEPT" ]; then continue; fi
  if ! node -e "process.exit(require('$manifest').scripts?.['$SCRIPT'] ? 0 : 1)"; then
    continue
  fi
  FOUND=1
  echo "[web] $name: $SCRIPT"
  (cd "$dir" && npm run --silent "$SCRIPT")
done

if [ "$FOUND" = 0 ]; then
  echo "[web] ни один пакет не объявляет скрипт $SCRIPT" >&2
  exit 1
fi
