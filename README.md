# CODEX

This repository hosts **[TheXTech](https://github.com/TheXTech/TheXTech)**, a free/open-source, cross-platform
C++ engine that reimplements the SMBX 1.3 (Super Mario Bros. X) engine. It is included here as a git
submodule pinned to a specific upstream commit, so the exact engine source used by this project is
tracked and reproducible.

TheXTech is licensed under the **GNU GPL v3.0** (see `TheXTech/LICENSE`); all credit for the engine
itself belongs to the Wohlstand / TheXTech project and its contributors.

## Quick start

```sh
git clone <this-repo-url> && cd CODEX
git submodule update --init --recursive   # fetch the engine source
./scripts/build.sh                        # build the engine
./scripts/fetch-assets.sh                 # download the official demo content pack
./scripts/run.sh                          # play it
```

See below for dependencies, what each script does, and why game content isn't committed to git.

## Getting the source

Clone this repository and pull in the engine submodule (and its own nested dependencies):

```sh
git clone <this-repo-url>
cd CODEX
git submodule update --init --recursive
```

If you already have a checkout without the submodule populated, run the `submodule update` command
above from the repository root.

## Build dependencies

The engine can build fully self-contained (all third-party libraries compiled in place from their
own submodules), or it can link against system-installed libraries to speed up the build. For a
self-contained build you only need:

- CMake (>= 3.5)
- Ninja (optional, recommended)
- A C/C++ compiler (GCC, Clang, or MSVC)
- Git (to resolve nested submodules)
- Mercurial (only needed if you want CMake to fetch and build SDL2 itself instead of using a
  system copy)

On Debian/Ubuntu, installing the following system packages lets the build reuse them instead of
compiling everything from scratch, which is considerably faster:

```sh
sudo apt-get install -y build-essential cmake ninja-build libsdl2-dev libsdl2-mixer-dev \
    libfreeimage-dev
```

## Building

Either run the wrapper script, which does the submodule fetch and the steps below for you:

```sh
./scripts/build.sh          # defaults to a Release build
./scripts/build.sh Debug    # or pass a CMAKE_BUILD_TYPE explicitly
```

or do it by hand:

```sh
cd TheXTech
mkdir -p build && cd build
cmake .. -G Ninja -DCMAKE_BUILD_TYPE=Release
ninja
```

Either way, the resulting binary is written to `TheXTech/build/output/bin/thextech`. Running it with
`--version` is a good smoke test that the build is healthy:

```sh
TheXTech/build/output/bin/thextech --version
```

A GitHub Actions workflow (`.github/workflows/build.yml`) builds this same configuration on every
push/PR, so a broken submodule pin or build regression shows up in CI.

See the upstream build guide for the full list of CMake options and platform-specific notes:
https://github.com/Wohlstand/TheXTech/wiki/Building-the-game

## Game assets are not vendored in git

This repository vendors only the **engine source code**. TheXTech's own source (under `TheXTech/`)
is GPLv3, but the graphics/audio/level content needed to actually play something is a separate work
with its own licensing, and upstream does not distribute it from the engine source repository either
— a build with nothing pointed at it is the documented default ("engine build", `USE_BUNDLED_ASSETS`
off). This project follows the same rule: **no game-content files are committed to this repo**, and
`game-data/` is gitignored.

Instead, `scripts/fetch-assets.sh` downloads **"Adventures of Demo"** — an original, non-Mario
content pack (its own characters/world, from the TheXTech/A2XT community) that the TheXTech project
itself publishes as an official demo, directly from TheXTech's GitHub Releases — into `game-data/`
at setup time, fresh on every run, rather than this repo rehosting a copy of it. That pack ships its
own `License.txt`/`credits.txt`; the short version is that most of its content is usable *as played
through TheXTech* (which is what this setup does) but is not generally cleared for further
redistribution, so treat `game-data/` as a local, non-committed download, not part of this project's
own licensed output.

Deliberately **not** supported here: the Mario/Nintendo-derived packs upstream also links (e.g.
"Super Mario Bros. X", "Sarasaland Adventure", "Nostalgic Paradise"). Those reproduce recognizable
Nintendo characters and carry real trademark/copyright risk, so this project does not fetch, vendor,
or provide tooling for them. If you own a legitimate copy of SMBX 1.3 and want to use its assets
instead, you can point `scripts/run.sh` / the engine's `--asset-pack` flag at your own copy — that's
on you to source and license, not something this repo automates.

```sh
./scripts/fetch-assets.sh   # downloads game-data/adventures-of-demo/ (gitignored, ~74 MB)
./scripts/run.sh            # launches TheXTech with that asset pack
```

## Updating the engine

To pull a newer upstream commit of TheXTech:

```sh
cd TheXTech
git fetch origin
git checkout origin/main   # or a specific tagged release
cd ..
git add TheXTech
git commit -m "Update TheXTech submodule"
```
