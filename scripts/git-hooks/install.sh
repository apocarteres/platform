#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
HOOKS_DIR="$(git -C "$ROOT_DIR" rev-parse --git-path hooks)"

mkdir -p "$HOOKS_DIR"
ln -sf "$ROOT_DIR/scripts/git-hooks/pre-push" "$HOOKS_DIR/pre-push"
printf '[git-hooks] pre-push установлен: %s\n' "$HOOKS_DIR/pre-push"
