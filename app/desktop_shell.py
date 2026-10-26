"""L'Atelier TEST desktop application for Windows (Edge WebView2, not Brave).

The executable is a GUI shell for the existing local Python server. It is
installed only into E:\LATELIER_TEST_0180\desktop, without administrator rights.
It deliberately never touches E:\00_LATELIER or any other user's files.
"""
from __future__ import annotations

import ctypes
import hashlib
import json
import os
from pathlib import Path
import shutil
import socket
import subprocess
import sys
import time
import traceback
from urllib.request import urlopen

TEST_ROOT = Path(r"E:\LATELIER_TEST_0180")
CODE = TEST_ROOT / "code_0180"
DATA = TEST_ROOT / "data"
DESKTOP_APP = TEST_ROOT / "desktop" / "LAtelier_TEST.exe"
PROFILE = TEST_ROOT / "desktop-profile"
URL = "http://127.0.0.1:8876/"
PORT = 8876
WINDOW_TITLE = "L'Atelier — TEST 0.18.0"


def _message(text: str, error: bool = False) -> None:
    ctypes.windll.user32.MessageBoxW(0, str(text), "L'Atelier TEST",
                                     0x10 if error else 0x40)


def _log(message: str) -> None:
    try:
        DATA.mkdir(parents=True, exist_ok=True)
        with (DATA / "desktop-launch.log").open("a", encoding="utf-8") as stream:
            stream.write(time.strftime("%Y-%m-%d %H:%M:%S") + " " + message + "\n")
    except OSError:
        pass


def _redirected(path: Path) -> bool:
    return path.is_symlink() or bool(getattr(path, "is_junction", lambda: False)())


def guard() -> None:
    if os.name != "nt":
        raise RuntimeError("Cette application est réservée à Windows.")
    # Do not accept a junction leading outside the dedicated TEST directory.
    for path in (TEST_ROOT, CODE, CODE / "app", DATA, TEST_ROOT / "desktop",
                 PROFILE):
        if path.exists() and _redirected(path):
            raise RuntimeError("Dossier TEST redirigé, installation refusée : " + str(path))
    if not (CODE / "app" / "app.py").is_file():
        raise RuntimeError("L'installation TEST est introuvable sur E:.")
    if not (CODE / "manifest.json").is_file() or not (DATA / "atelier.db").is_file():
        raise RuntimeError("Les fichiers ou les données TEST sont introuvables.")
    if (CODE / "app" / "VERSION").read_text(encoding="utf-8").strip() != "0.18.0":
        raise RuntimeError("La version TEST attendue n'est pas installée.")


def _same_file(a: Path, b: Path) -> bool:
    if a.stat().st_size != b.stat().st_size:
        return False
    def digest(path):
        sha = hashlib.sha256()
        with path.open("rb") as stream:
            for block in iter(lambda: stream.read(1024 * 1024), b""):
                sha.update(block)
        return sha.digest()
    return digest(a) == digest(b)


def _shortcut(target: Path) -> None:
    # WScript.Shell resolves Desktop even when OneDrive redirects it.
    quoted = lambda text: str(text).replace("'", "''")
    exe = quoted(target)
    script = (
        "$ErrorActionPreference='Stop';"
        "$shell=New-Object -ComObject WScript.Shell;"
        "$desktop=$shell.SpecialFolders.Item('Desktop');"
        "$link=Join-Path $desktop 'L''Atelier TEST.lnk';"
        "$shortcut=$shell.CreateShortcut($link);"
        "$shortcut.TargetPath='" + exe + "';"
        "$shortcut.WorkingDirectory='" + quoted(target.parent) + "';"
        "$shortcut.Description='L''Atelier — application Windows TEST';"
        "$shortcut.IconLocation='" + exe + ",0';"
        "$shortcut.Save();"
        "if(-not(Test-Path $link)){throw 'Raccourci introuvable.'}"
    )
    encoded = __import__("base64").b64encode(script.encode("utf-16-le")).decode("ascii")
    run = subprocess.run(
        ["powershell.exe", "-NoProfile", "-NonInteractive",
         "-EncodedCommand", encoded],
        capture_output=True, text=True, timeout=22,
        creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0),
    )
    if run.returncode:
        raise RuntimeError("Impossible de créer le raccourci Bureau : " +
                           (run.stderr or run.stdout)[-350:])


def _install_self(launch: bool = True) -> bool:
    """Copy the first launch to its permanent directory and run that copy.

    Return True only for the temporary executable that has passed control to
    the installed executable. Never replace an active binary.
    """
    source = Path(sys.executable).resolve()
    destination = DESKTOP_APP
    if source == destination.resolve():
        _shortcut(destination)
        return False
    destination.parent.mkdir(parents=True, exist_ok=True)
    if destination.exists() and not _same_file(source, destination):
        raise RuntimeError(
            "Une autre version du lanceur Windows existe déjà.\n"
            "Elle n'a pas été écrasée. Ferme l'ancienne application avant toute modification."
        )
    if not destination.exists():
        staging = destination.with_suffix(".new")
        if staging.exists():
            raise RuntimeError("Une installation incomplète nécessite une vérification.")
        shutil.copy2(source, staging)
        if not _same_file(source, staging):
            staging.unlink(missing_ok=True)
            raise RuntimeError("La copie du fichier .exe n'a pas passé sa vérification.")
        staging.rename(destination)
    _shortcut(destination)
    if launch:
        subprocess.Popen([str(destination)], cwd=str(destination.parent),
                         close_fds=True,
                         creationflags=getattr(subprocess, "CREATE_NEW_PROCESS_GROUP", 0))
    return True


def _probe() -> bool:
    try:
        with urlopen(URL + "api/runtime-version", timeout=1) as response:
            if not response.headers.get("Server", "").startswith("AtelierLocal/"):
                raise RuntimeError("Le port 8876 est utilisé par une autre application.")
            version = json.load(response).get("version")
            if version != "0.18.0":
                raise RuntimeError("Version de serveur inattendue sur le port 8876.")
        return True
    except (OSError, ValueError):
        return False


def _port_open() -> bool:
    with socket.socket() as s:
        s.settimeout(.3)
        return s.connect_ex(("127.0.0.1", PORT)) == 0


def _python_command() -> list[str]:
    # The TEST installation already uses Python. The GUI exe bundles only the
    # native window, and continues running the verified, updatable server code.
    interpreter = shutil.which("python")
    if interpreter:
        return [interpreter, "-u"]
    py = shutil.which("py")
    if py:
        return [py, "-3", "-u"]
    raise RuntimeError("Python est introuvable. L'Atelier TEST nécessite encore Python pour son serveur.")


def _start_local_server():
    if _probe():
        return None
    if _port_open():
        raise RuntimeError("Le port 8876 est occupé par un serveur non reconnu.")
    env = os.environ.copy()
    env.update(ATELIER_DATA_DIR=str(DATA), ATELIER_PORT=str(PORT),
               ATELIER_NO_BROWSER="1")
    cmd = _python_command() + [str(CODE / "app" / "app.py")]
    logfile = (DATA / "desktop-server.log").open("ab", buffering=0)
    try:
        child = subprocess.Popen(
            cmd, cwd=str(CODE), env=env,
            stdin=subprocess.DEVNULL, stdout=logfile, stderr=subprocess.STDOUT,
            close_fds=True,
            creationflags=(getattr(subprocess, "CREATE_NO_WINDOW", 0) |
                           getattr(subprocess, "CREATE_NEW_PROCESS_GROUP", 0))
        )
    finally:
        logfile.close()
    for _ in range(70):
        if child.poll() is not None:
            raise RuntimeError("Le serveur TEST ne démarre pas. Voir desktop-server.log.")
        if _probe():
            return child
        time.sleep(.35)
    raise RuntimeError("L'Atelier TEST ne répond pas sur le port 8876.")


def _stop_own_server(child) -> None:
    # Never stop another server, including the server replaced by the in-app
    # updater while the WebView window remained open.
    if child is None or child.poll() is not None:
        return
    try:
        if not _probe():
            return
        with urlopen(URL + "api/update/status", timeout=1) as r:
            phase = json.load(r).get("phase")
        if phase in ("starting", "download", "stopping", "backup", "installing"):
            return
        from urllib.request import Request
        request = Request(URL + "api/shutdown", data=b"{}", method="POST",
                          headers={"Content-Type": "application/json"})
        with urlopen(request, timeout=2):
            pass
    except Exception as error:
        _log("Stopping own server skipped: " + repr(error))


def main():
    if "--self-test" in sys.argv:
        assert PORT == 8876 and "LATELIER_TEST_0180" in str(TEST_ROOT)
        assert DESKTOP_APP.name == "LAtelier_TEST.exe"
        print("PASS: desktop entrypoint and TEST isolation")
        return
    try:
        guard()
        if "--install-only" in sys.argv:
            if not getattr(sys, "frozen", False):
                raise RuntimeError("L’installation nécessite le fichier .exe Windows.")
            _install_self(launch=False)
            return
        if getattr(sys, "frozen", False) and _install_self():
            return
        import webview
        PROFILE.mkdir(parents=True, exist_ok=True)
        child = _start_local_server()
        try:
            webview.create_window(WINDOW_TITLE, URL, width=1360, height=860,
                                  min_size=(870, 590), background_color="#211B17",
                                  confirm_close=False, text_select=True)
            webview.start(gui="edgechromium", private_mode=False,
                          storage_path=str(PROFILE), debug=False)
        finally:
            _stop_own_server(child)
    except Exception as error:
        _log(traceback.format_exc())
        _message(str(error), error=True)
        raise SystemExit(1)


if __name__ == "__main__":
    main()
