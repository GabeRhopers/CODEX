#!/usr/bin/env bash
# Convenience wrapper to fetch submodules and build the TheXTech engine.
# See README.md for details and manual steps.
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
build_type="${1:-Release}"

cd "$repo_root"
git submodule update --init --recursive

mkdir -p TheXTech/build
cd TheXTech/build
cmake .. -G Ninja -DCMAKE_BUILD_TYPE="$build_type"
ninja

echo "Build complete: $repo_root/TheXTech/build/output/bin/thextech"
