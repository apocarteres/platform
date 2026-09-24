#!/usr/bin/env bash
set -euo pipefail

# CORE-OPS-088: набор verify ядра в сборочном контейнере на машине, чей Docker
# выбран текущим контекстом. Тесты с Testcontainers обращаются к Docker и к
# опубликованным портам изнутри той же машины, а расписка переносится обратно.

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
PREFIX="${PLATFORM_RUNNER_PREFIX:-platform}"
IMAGE="${PREFIX}-verify-runner:bookworm"
CONTAINER="${PREFIX}-verify-runner"
SRC_VOLUME="${PREFIX}-verify-runner-src"
HOME_VOLUME="${PREFIX}-verify-runner-home"

log() {
  printf '[verify-runner] %s\n' "$*"
}

fail() {
  printf '[verify-runner] ERROR: %s\n' "$*" >&2
  exit 1
}

usage() {
  cat <<'USAGE'
Usage:
  mise run verify-runner-prepare              подготовить образ и контейнер
  mise run verify-runner -- [--commit REF]    прогнать verify в контейнере

Docker выбирается текущим контекстом: DOCKER_CONTEXT=<контекст> mise run verify-runner
USAGE
}

require_docker() {
  docker version >/dev/null 2>&1 \
    || fail "Docker текущего контекста $(docker context show 2>/dev/null || echo '?') недоступен: выберите машину сборки ключом окружения DOCKER_CONTEXT"
}

prepare() {
  require_docker
  log "контекст Docker: $(docker context show)"
  log "собираю образ $IMAGE"
  docker build -f "$ROOT_DIR/scripts/verify-runner/Dockerfile" -t "$IMAGE" "$ROOT_DIR/scripts/verify-runner"
  local socket_gid
  socket_gid="$(docker run --rm -v /var/run/docker.sock:/var/run/docker.sock debian:bookworm-slim stat -c %g /var/run/docker.sock)"
  for volume in "$SRC_VOLUME" "$HOME_VOLUME"; do
    docker volume inspect "$volume" >/dev/null 2>&1 || docker volume create "$volume" >/dev/null
  done
  docker rm -f "$CONTAINER" >/dev/null 2>&1 || true
  docker create \
    --name "$CONTAINER" \
    --user 1000:1000 \
    --group-add "$socket_gid" \
    --add-host host.docker.internal:host-gateway \
    -v /var/run/docker.sock:/var/run/docker.sock \
    -e TESTCONTAINERS_HOST_OVERRIDE=host.docker.internal \
    -e HOME=/work/home \
    -e LC_ALL=C.UTF-8 \
    -e LANG=C.UTF-8 \
    -v "$SRC_VOLUME:/work/src" \
    -v "$HOME_VOLUME:/work/home" \
    "$IMAGE" >/dev/null
  docker start "$CONTAINER" >/dev/null
  docker exec --user 0 "$CONTAINER" chown -R 1000:1000 /work/src /work/home
  log "контейнер $CONTAINER готов"
}

require_container() {
  require_docker
  docker container inspect "$CONTAINER" >/dev/null 2>&1 \
    || fail "сборочного контейнера $CONTAINER нет: подготовьте его командой mise run verify-runner-prepare"
  [ "$(docker inspect -f '{{.State.Running}}' "$CONTAINER")" = "true" ] || docker start "$CONTAINER" >/dev/null
}

in_container() {
  docker exec -w /work/src "$CONTAINER" bash -lc "$1"
}

verify() {
  local commit="HEAD"
  while [ "$#" -gt 0 ]; do
    case "$1" in
      --commit) commit="${2:?--commit требует значения}"; shift 2 ;;
      -h|--help) usage; exit 0 ;;
      *) usage >&2; fail "неизвестный ключ: $1" ;;
    esac
  done
  commit="$(git -C "$ROOT_DIR" rev-parse "$commit^{commit}")"
  require_container
  log "контекст Docker: $(docker context show); коммит $commit"
  docker restart "$CONTAINER" >/dev/null
  in_container 'find /work/src -mindepth 1 -maxdepth 1 -exec rm -rf {} +'
  git -C "$ROOT_DIR" bundle create - --all | docker exec -i "$CONTAINER" bash -lc 'cat > /tmp/platform.bundle'
  docker exec "$CONTAINER" bash -lc "
    set -eu
    git clone --quiet --no-checkout /tmp/platform.bundle /work/src
    git -C /work/src checkout --quiet --force --detach '$commit'
    git -C /work/src config user.email verify-runner@localhost
    git -C /work/src config user.name verify-runner
    rm -f /tmp/platform.bundle
  "
  in_container 'mise trust --yes >/dev/null && mise install -y'
  in_container 'eval "$(mise activate bash --shims)" && mise run verify'
  mkdir -p "$ROOT_DIR/target/verify"
  docker cp "$CONTAINER:/work/src/target/verify/$commit.json" "$ROOT_DIR/target/verify/$commit.json"
  log "набор пройден в контейнере; расписка перенесена: target/verify/$commit.json"
}

case "${1:-}" in
  prepare) shift; prepare "$@" ;;
  verify) shift; verify "$@" ;;
  *) usage >&2; exit 2 ;;
esac
