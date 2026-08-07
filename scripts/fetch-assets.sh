#!/usr/bin/env bash
# Fetches "Adventures of Demo" - the official, original-IP (non-Mario) demo
# game content that the TheXTech project itself publishes to showcase the
# engine - directly from its official GitHub release. This script downloads
# it fresh every time rather than the repository vendoring a copy, because
# the pack's own License.txt restricts most of its content to use within
# "this project" (i.e. played through TheXTech, as published) and does not
# grant general redistribution rights. Do not point this script at the
# Mario/Nintendo-derived packs (e.g. "Super Mario Bros. X", "Sarasaland
# Adventure") - those carry real trademark/copyright risk and are not
# supported here.
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
dest="$repo_root/game-data/adventures-of-demo"
tag="v1.3.7.3-1"
asset="adventures-of-demo-thextech-v1.3.7.3-linux-generic-u20.04-amd64.tar.gz"
url="https://github.com/TheXTech/TheXTech/releases/download/${tag}/${asset}"

if [ -f "$dest/thextech.ini" ]; then
    echo "Assets already present at $dest (remove it to re-fetch)."
    exit 0
fi

tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT

echo "Downloading Adventures of Demo content pack from the official TheXTech GitHub release..."
curl -sSL -o "$tmp/pack.tar.gz" "$url"

echo "Extracting..."
tar -xzf "$tmp/pack.tar.gz" -C "$tmp"

pack_dir="$(find "$tmp" -mindepth 1 -maxdepth 1 -type d | head -n1)"
if [ -z "$pack_dir" ]; then
    echo "Could not locate extracted pack directory." >&2
    exit 1
fi

mkdir -p "$dest"
# Only take the game-data files (graphics/music/sound/worlds/levels/inis/
# license+credit notices); skip the prebuilt engine binary bundled in the
# tarball since this project builds its own from the TheXTech submodule.
find "$pack_dir" -mindepth 1 -maxdepth 1 -type f ! -name "thextech" -exec cp -a {} "$dest/" \;
find "$pack_dir" -mindepth 1 -maxdepth 1 -type d -exec cp -a {} "$dest/" \;

echo "Done. Assets installed to: $dest"
echo "See $dest/License.txt and $dest/credits.txt for this content's licensing and required credits."
