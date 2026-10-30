#!/usr/bin/env bash
# macOS counterpart of tools/native.ps1: setup | build | test | run (default run).
# Needs the Xcode command line tools (xcode-select --install), python3 and node.
set -euo pipefail
action="${1:-run}"
root="$(cd "$(dirname "$0")/.." && pwd)"
cd "$root"
case "$action" in setup|build|test|run) ;; *) echo "usage: tools/native.sh [setup|build|test|run]" >&2; exit 2 ;; esac

if [ "$action" = setup ]; then
    exec python3 tools/setup-native.py
fi

bindings="$root/.tools/bindings/godot-cpp-e83fd0904c13356ed1d4c3d09f8bb9132bdc6b77"
godot="$root/.tools/godot/Godot.app/Contents/MacOS/Godot"
cmake="$(command -v cmake || true)"
[ -n "$cmake" ] || cmake="$(find "$root/.tools/python/cmake/data" -path '*/bin/cmake' -type f 2>/dev/null | head -n 1)"
ninja="$(command -v ninja || true)"
[ -n "$ninja" ] || ninja="$(find "$root/.tools/python/ninja/data" -path '*/bin/ninja' -type f 2>/dev/null | head -n 1)"
if [ -z "$cmake" ] || [ ! -f "$bindings/CMakeLists.txt" ] || [ ! -x "$godot" ]; then
    echo "Native tools are missing. First run: tools/native.sh setup" >&2
    exit 1
fi

node tools/export-native-data.mjs
node tools/export-sandbox-data.mjs
if [ ! -f native/build/CMakeCache.txt ]; then
    generator=(-G "Unix Makefiles")
    [ -n "$ninja" ] && generator=(-G Ninja "-DCMAKE_MAKE_PROGRAM=$ninja")
    "$cmake" -S native -B native/build "${generator[@]}" -DCMAKE_BUILD_TYPE=Release "-DGODOT_CPP_DIR=$bindings"
fi
"$cmake" --build native/build --parallel "$(sysctl -n hw.ncpu 2>/dev/null || echo 4)"
[ "$action" = build ] && exit 0

mkdir -p .test-artifacts
# Import once so the editor's caches exist before scripted runs.
"$godot" --headless --path godot --editor --import --quit --log-file "$root/.test-artifacts/godot-import.log" >/dev/null
if [ "$action" = test ]; then
    node tools/check-native.mjs native/build/ecologist-core
    native/build/ecologist-chemistry-tests
    native/build/ecologist-sandbox-tests
    "$godot" --headless --path godot --script res://tests/workshop.gd --log-file "$root/.test-artifacts/workshop-test.log"
    "$godot" --headless --path godot --script res://tests/integration.gd --log-file "$root/.test-artifacts/godot-test.log"
    exit 0
fi
exec "$godot" --path godot --log-file "$root/.test-artifacts/godot-play.log"
