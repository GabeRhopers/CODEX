#!/usr/bin/env bash
# Runs the built engine against a content pack.
# Usage:
#   ./scripts/run.sh                 # play the original "Grampa's Dream Quest" episode (committed to this repo)
#   ./scripts/run.sh demo            # play the fetched "Adventures of Demo" pack (run fetch-assets.sh first)
#   ./scripts/run.sh <path> [args]   # play an arbitrary asset-pack directory
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
bin="$repo_root/TheXTech/build/output/bin/thextech"

case "${1:-}" in
    demo)
        assets="$repo_root/game-data/adventures-of-demo"
        shift
        ;;
    "" | -*)
        assets="$repo_root/content/grampa-dreamquest"
        ;;
    *)
        assets="$1"
        shift
        ;;
esac

if [ ! -x "$bin" ]; then
    echo "Engine binary not found. Run ./scripts/build.sh first." >&2
    exit 1
fi

if [ ! -f "$assets/thextech.ini" ]; then
    echo "Game assets not found at: $assets" >&2
    echo "(for the fetched demo pack, run ./scripts/fetch-assets.sh first)" >&2
    exit 1
fi

exec "$bin" --asset-pack "$assets" "$@"
