"""Install pinned build tools locally (Windows x64 or macOS), without changing system settings."""
from concurrent.futures import ThreadPoolExecutor
import hashlib
from pathlib import Path
import subprocess
import sys
import urllib.request
import zipfile

ROOT = Path(__file__).resolve().parents[1]
TOOLS = ROOT / ".tools"
BINDINGS = "e83fd0904c13356ed1d4c3d09f8bb9132bdc6b77"
GODOT_MAC = ("godot", "https://github.com/godotengine/godot-builds/releases/download/4.7.2-stable/Godot_v4.7.2-stable_macos.universal.zip",
             "c58a24e31d720be9d62f60cb5627c4e695fb72f21b0cfe1bc9ccaa9a3b3ba63e")
ARCHIVES = [
    ("godot", "https://github.com/godotengine/godot-builds/releases/download/4.7.2-stable/Godot_v4.7.2-stable_win64.exe.zip",
     "731980f9608d61333e5baf54a2ef17210acc7a538446c0cb9969f002aca1e953"),
    ("llvm", "https://github.com/mstorsjo/llvm-mingw/releases/download/20261020/llvm-mingw-20261020-ucrt-x86_64.zip",
     "fd5462b7f5d93b2ff981fcd3f9c7e427e47f3203c64ea91c27bcc444eebd74cd"),
    ("bindings", f"https://codeload.github.com/godotengine/godot-cpp/zip/{BINDINGS}",
     "579af30c5f62c1084edb28216788188227d80a583f0114463699ac4edd22140f"),
]


def digest(path):
    # Chunked by hand: macOS ships Python 3.9, which has no hashlib.file_digest.
    sha = hashlib.sha256()
    with path.open("rb") as stream:
        while chunk := stream.read(1024 * 1024):
            sha.update(chunk)
    return sha.hexdigest()


def install(spec):
    name, url, expected = spec
    archive = TOOLS / f"{name}.zip"
    target = TOOLS / name
    marker = target / ".ecologist-version"
    if marker.exists() and marker.read_text() == expected:
        print(f"{name}: already installed", flush=True)
        return
    if not archive.exists() or digest(archive) != expected:
        print(f"{name}: downloading pinned release", flush=True)
        partial = archive.with_suffix(".download")
        request = urllib.request.Request(url, headers={"User-Agent": "Ecologist-local-setup"})
        with urllib.request.urlopen(request, timeout=120) as response, partial.open("wb") as output:
            while chunk := response.read(1024 * 1024):
                output.write(chunk)
        if digest(partial) != expected:
            raise RuntimeError(f"{name}: checksum mismatch; refusing to install")
        partial.replace(archive)
    target.mkdir(exist_ok=True)
    if sys.platform == "darwin" and name == "godot":
        # ditto keeps the app bundle's permissions, symlinks and code signature, which zipfile drops.
        subprocess.run(["ditto", "-x", "-k", str(archive), str(target)], check=True)
        marker.write_text(expected)
        print(f"{name}: verified and installed", flush=True)
        return
    with zipfile.ZipFile(archive) as zipped:
        for member in zipped.infolist():
            if not (target / member.filename).resolve().is_relative_to(target.resolve()):
                raise RuntimeError(f"{name}: archive member escapes its folder")
        zipped.extractall(target)
    marker.write_text(expected)
    print(f"{name}: verified and installed", flush=True)


def setup_mac():
    if subprocess.run(["xcrun", "--find", "clang++"], capture_output=True).returncode != 0:
        raise SystemExit("Install the Xcode command line tools first: xcode-select --install")
    TOOLS.mkdir(exist_ok=True)
    with ThreadPoolExecutor(max_workers=2) as pool:
        list(pool.map(install, [GODOT_MAC, ARCHIVES[2]]))
    if not list((TOOLS / "python").glob("cmake/data/**/bin/cmake")):
        subprocess.run([sys.executable, "-m", "pip", "install", "--target", str(TOOLS / "python"),
                        "cmake==3.31.6", "ninja==1.11.1.4"], check=True)
    print("Ready. Run tools/native.sh build, then tools/native.sh run.")


if __name__ == "__main__":
    if sys.platform == "darwin":
        setup_mac()
        raise SystemExit(0)
    if sys.platform != "win32":
        raise SystemExit("This portable setup targets Windows x64 and macOS; other platforms can use native/CMakeLists.txt.")
    TOOLS.mkdir(exist_ok=True)
    with ThreadPoolExecutor(max_workers=3) as pool:
        list(pool.map(install, ARCHIVES))
    # Keep the editor's settings/cache beside this portable installation.
    (TOOLS / "godot/._sc_").touch()
    if not (TOOLS / "python/cmake/data/bin/cmake.exe").exists() or not (TOOLS / "python/bin/ninja.exe").exists():
        subprocess.run([sys.executable, "-m", "pip", "install", "--target", str(TOOLS / "python"),
                        "cmake==3.31.6", "ninja==1.11.1.4"], check=True)
    print("Ready. Run tools/native.ps1 -Action build, or double-click run-ecologist.cmd.")
