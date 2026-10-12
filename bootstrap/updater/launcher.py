from __future__ import annotations

import json
import os
import subprocess
import sys
import time
import urllib.request
import webbrowser
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent
APP = ROOT / "app" / "app.py"
VERSION_FILE = ROOT / "app" / "VERSION"
DATA = ROOT / "data"
PID_FILE = DATA / "server.pid"
OUT_LOG = DATA / "server.out.log"
ERR_LOG = DATA / "server.err.log"
URL = "http://127.0.0.1:8765/"
RUNTIME = URL + "api/runtime-version"


def installed_version() -> str:
    try:
        return VERSION_FILE.read_text(encoding="utf-8").strip()
    except Exception:
        return ""


def runtime_version() -> str:
    try:
        with urllib.request.urlopen(RUNTIME, timeout=0.6) as r:
            if r.status != 200:
                return ""
            return str(json.loads(r.read().decode("utf-8")).get("version") or "")
    except Exception:
        return ""


def request_shutdown() -> None:
    try:
        req = urllib.request.Request(
            URL + "api/shutdown",
            data=b"{}",
            method="POST",
            headers={"Content-Type": "application/json"},
        )
        with urllib.request.urlopen(req, timeout=1):
            pass
    except Exception:
        pass


def show_error(message: str) -> int:
    print(f"[ERREUR] {message}")
    if ERR_LOG.exists():
        try:
            detail = ERR_LOG.read_text(encoding="utf-8", errors="replace").strip()
        except Exception:
            detail = ""
        if detail:
            print("\n--- Message du serveur ---")
            print(detail)
    return 1


def main() -> int:
    DATA.mkdir(parents=True, exist_ok=True)
    if not APP.exists():
        return show_error(f"Fichier introuvable : {APP}")

    expected = installed_version()
    active = runtime_version()
    if active and active == expected:
        print(f"L'Atelier {active} est deja lance. Ouverture...")
        webbrowser.open(URL)
        return 0
    if active and active != expected:
        print(f"Ancien serveur detecte ({active}); version installee : {expected}. Redemarrage...")
        request_shutdown()
        deadline = time.time() + 5
        while time.time() < deadline and runtime_version():
            time.sleep(0.2)

    for log in (OUT_LOG, ERR_LOG):
        try:
            log.unlink(missing_ok=True)
        except Exception:
            pass

    print("Demarrage du serveur local...")
    env = os.environ.copy()
    env["ATELIER_DATA_DIR"] = str(DATA)
    creationflags = 0
    if os.name == "nt":
        creationflags |= getattr(subprocess, "CREATE_NO_WINDOW", 0)
        creationflags |= getattr(subprocess, "CREATE_NEW_PROCESS_GROUP", 0)

    try:
        out = OUT_LOG.open("wb")
        err = ERR_LOG.open("wb")
        proc = subprocess.Popen(
            [sys.executable, str(APP)],
            cwd=str(ROOT),
            env=env,
            stdout=out,
            stderr=err,
            stdin=subprocess.DEVNULL,
            creationflags=creationflags,
        )
        out.close()
        err.close()
    except Exception as exc:
        return show_error(f"Impossible de demarrer le serveur : {exc}")

    PID_FILE.write_text(str(proc.pid), encoding="ascii")
    for _ in range(80):
        active = runtime_version()
        if active:
            if active != expected:
                proc.terminate()
                return show_error(f"Le serveur a demarre en {active}, mais {expected} est installe.")
            print(f"L'Atelier {active} est pret c:")
            webbrowser.open(URL)
            return 0
        if proc.poll() is not None:
            break
        time.sleep(0.25)

    try:
        if proc.poll() is None:
            proc.terminate()
    except Exception:
        pass
    return show_error("L'Atelier n'a pas repondu.")


if __name__ == "__main__":
    raise SystemExit(main())
