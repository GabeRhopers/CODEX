# CODEX

This repository hosts **[TheXTech](https://github.com/TheXTech/TheXTech)**, a free/open-source, cross-platform
C++ engine that reimplements the SMBX 1.3 (Super Mario Bros. X) engine. It is included here as a git
submodule pinned to a specific upstream commit, so the exact engine source used by this project is
tracked and reproducible.

TheXTech is licensed under the **GNU GPL v3.0** (see `TheXTech/LICENSE`); all credit for the engine
itself belongs to the Wohlstand / TheXTech project and its contributors.

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

## Game assets are not included

This repository intentionally vendors only the **engine source code**. TheXTech's own source (the
code under `TheXTech/`) is GPLv3, but the graphics/audio/level assets needed to actually play a game
with it are a separate work with separate licensing, and upstream does not distribute them from the
source repository either — a build with no assets pointed at it is the documented default ("engine
build" / `USE_BUNDLED_ASSETS` off). Because of that, this project does not fetch, vendor, or bundle
any asset pack.

To run a playable game with this engine, supply your own legally-obtained set of assets (graphics,
sounds, music, and world/level files) yourself, e.g. by:

- Pointing the engine at an assets directory via its `thextech.ini` / command-line options, or
- Placing the assets in the per-user data directory the engine reads at runtime (see the upstream
  README's "Where does it take resources from?" section for the exact path on your OS).

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
