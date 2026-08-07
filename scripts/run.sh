#!/usr/bin/env bash
# Runs the built engine against the fetched "Adventures of Demo" content.
# Usage: ./scripts/run.sh [extra thextech args...]
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
bin="$repo_root/TheXTech/build/output/bin/thextech"
assets="$repo_root/game-data/adventures-of-demo"

if [ ! -x "$bin" ]; then
    echo "Engine binary not found. Run ./scripts/build.sh first." >&2
    exit 1
fi

if [ ! -f "$assets/thextech.ini" ]; then
    echo "Game assets not found. Run ./scripts/fetch-assets.sh first." >&2
    exit 1
fi

exec "$bin" --asset-pack "$assets" "$@"
