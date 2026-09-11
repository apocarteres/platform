#!/usr/bin/env bash
set -euo pipefail

# Локальная публикация ядра: артефакты попадают в локальный репозиторий Maven и в tar-архив npm.
# Версия берётся из тега, как при публикации в registry: REQ-PUBLISHING-002.

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
VERSION="${1:-}"

log() {
  printf '[install-local] %s\n' "$*"
}

if [ -z "$VERSION" ]; then
  VERSION="$(git -C "$ROOT_DIR" describe --tags --exact-match 2>/dev/null || true)"
  VERSION="${VERSION#v}"
fi

if [ -z "$VERSION" ]; then
  echo "Версия не задана и текущий коммит не помечен тегом: install-local <версия>" >&2
  exit 2
fi

case "$VERSION" in
  *-SNAPSHOT)
    echo "SNAPSHOT не публикуется: REQ-PUBLISHING-003" >&2
    exit 2
    ;;
esac

log "версия $VERSION"

log "Maven: установка в локальный репозиторий"
(cd "$ROOT_DIR" && ./mvnw --batch-mode --no-transfer-progress -Drevision="$VERSION" -Prelease install)

DIST_DIR="$ROOT_DIR/target/local-packages"
mkdir -p "$DIST_DIR"

# REQ-PUBLISHING-011: публикуется каждый пакет, объявивший себя публикуемым.
pack_package() {
  local source_dir="$1"
  local name
  name="$(basename "$source_dir")"
  local pack_dir="$source_dir"

  if node -e "process.exit(require('$source_dir/package.json').scripts?.build ? 0 : 1)"; then
    log "npm: сборка пакета $name"
    (cd "$ROOT_DIR" && scripts/web.sh build > /dev/null)
    pack_dir="$ROOT_DIR/target/packages/$name"
  fi

  log "npm: архив пакета $name"
  (cd "$pack_dir" && npm version "$VERSION" --no-git-tag-version --allow-same-version > /dev/null)
  local archive
  archive="$(cd "$pack_dir" && npm pack --pack-destination "$DIST_DIR" --silent | tail -1)"
  (cd "$pack_dir" && npm version 0.0.0 --no-git-tag-version --allow-same-version > /dev/null)
  log "готово: $DIST_DIR/$archive"
}

for manifest in "$ROOT_DIR"/packages/*/package.json; do
  [ -f "$manifest" ] || continue
  node -e "process.exit(require('$manifest').publishable === false ? 1 : 0)" || continue
  pack_package "$(dirname "$manifest")"
done

log "потребитель ставит архивы как file:-зависимости или через scripts/platform/install.sh"
