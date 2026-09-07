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

log "npm: сборка архива пакета правил"
PACKAGE_DIR="$ROOT_DIR/packages/project-conventions"
DIST_DIR="$ROOT_DIR/target/local-packages"
mkdir -p "$DIST_DIR"
(cd "$PACKAGE_DIR" && npm version "$VERSION" --no-git-tag-version --allow-same-version > /dev/null)
ARCHIVE="$(cd "$PACKAGE_DIR" && npm pack --pack-destination "$DIST_DIR" --silent | tail -1)"
(cd "$PACKAGE_DIR" && npm version 0.0.0 --no-git-tag-version --allow-same-version > /dev/null)

log "готово: $DIST_DIR/$ARCHIVE"
log "потребитель ставит его как file:-зависимость или через scripts/platform/install.sh"
