"""Safe, per-user native updater for L'Atelier du Goblin — Nathan.

Reuse the thoroughly-tested transactional TEST updater *algorithms* only after
re-binding every installation path, network port, restart command and guard.
No E: drive path can pass through a Nathan update operation. Existing SQLite
content is backed up with SQLite's online snapshot API before updating code.
"""
from __future__ import annotations

import hashlib
import os
from pathlib import Path
import shutil
import sqlite3
import subprocess
import sys
import time
from urllib.request import urlopen

import updater as core
from nathan_bundle import user_home, personalize_payload, verify_payload, PORT, EXE_NAME

BASE = user_home()
CODE = BASE/"code"
DATA = BASE/"data"
PORT = 18877
EXE = BASE/"desktop"/EXE_NAME


def guard():
    if os.name!="nt" or os.environ.get("ATELIER_EDITION")!="NATHAN":
        raise RuntimeError("Mise à jour réservée à L’Atelier de Nathan.")
    if Path(__file__).resolve()!=(CODE/"app"/"nathan_updater.py").resolve():
        raise RuntimeError("Un assistant de mise à jour extérieur a été refusé.")
    if (Path(os.environ.get("ATELIER_DATA_DIR", ".")).resolve()!=DATA.resolve() or
            os.environ.get("ATELIER_PORT")!="18877"):
        raise RuntimeError("Session ou données non autorisées pour Nathan.")
    if not EXE.is_file() or not (CODE/"manifest.json").is_file() or not (DATA/"atelier.db").is_file():
        raise RuntimeError("Installation personnelle de Nathan incomplète.")
    for folder in (BASE,CODE,DATA,BASE/"desktop"):
        if folder.is_symlink() or getattr(folder,"is_junction",lambda:False)():
            raise RuntimeError("Dossier utilisateur redirigé : mise à jour bloquée.")
    if (CODE/"app"/"VERSION").read_text(encoding="utf-8").strip()!="0.18.0":
        raise RuntimeError("Version personnelle inattendue.")


# Native TEST module uses these names as globals. Patch every one of them.
core.BASE=BASE
core.CODE=CODE
core.DATA=DATA
core.PORT=PORT
core.STATUS=DATA/"updater-state.json"
core.LOCK=DATA/"updater.lock"
core.LOG=DATA/"updater-worker.log"
core.guard=guard
core.BRANCH="feature/0180-progression-foundations"


def _stage(revision):
    guard()
    stage=ORIGINAL_STAGE(revision)
    try:
        personalize_payload(stage)
        verify_payload(stage)
        return stage
    except BaseException:
        if stage.exists():
            shutil.rmtree(stage)
        raise


def _start():
    guard()
    env=os.environ.copy()
    env.update(ATELIER_EDITION="NATHAN",ATELIER_DATA_DIR=str(DATA),
               ATELIER_PORT=str(PORT),ATELIER_NO_BROWSER="1")
    flags=(getattr(subprocess,"CREATE_NEW_PROCESS_GROUP",0) |
           getattr(subprocess,"CREATE_NO_WINDOW",0))
    with (DATA/"updater-worker.log").open("ab",buffering=0) as output:
        child=subprocess.Popen([str(EXE),"--server"],cwd=str(BASE),
            env=env,stdin=subprocess.DEVNULL,stdout=output,
            stderr=subprocess.STDOUT,close_fds=True,creationflags=flags)
    for _ in range(100):
        if child.poll() is not None:
            raise RuntimeError("Le serveur personnel ne redémarre pas.")
        try:
            with urlopen(f"http://127.0.0.1:{PORT}/api/runtime-version",timeout=.5) as r:
                if (r.headers.get("Server","").startswith("AtelierLocal/") and
                        r.read(1000).find(b"0.18.0")>=0):
                    return
        except (OSError,ValueError):
            pass
        time.sleep(.2)
    raise RuntimeError("L’Atelier de Nathan reste inaccessible après mise à jour.")


ORIGINAL_STAGE=core._stage
core._stage=_stage
core._start=_start


def check():
    guard()
    return core.check()


def status():
    return core.status()


def worker(revision):
    guard()
    return core.worker(revision)


def begin(revision):
    guard()
    if not isinstance(revision,str) or len(revision)!=40 or any(ch not in "0123456789abcdef" for ch in revision):
        raise RuntimeError("Révision incorrecte.")
    if core.LOCK.exists() or status().get("phase") in (
            "starting","download","stopping","backup","installing"):
        raise RuntimeError("Une mise à jour est déjà en cours.")
    current=check()
    if not current["available"] or current["revision"]!=revision:
        raise RuntimeError("La version a changé : vérifie à nouveau les mises à jour.")
    core._status("starting","Préparation de la mise à jour de Nathan…",revision)
    env=os.environ.copy()
    env.update(ATELIER_EDITION="NATHAN",ATELIER_DATA_DIR=str(DATA),
               ATELIER_PORT=str(PORT),ATELIER_NO_BROWSER="1")
    flags=(getattr(subprocess,"CREATE_NEW_PROCESS_GROUP",0) |
           getattr(subprocess,"CREATE_NO_WINDOW",0))
    try:
        with core.LOG.open("ab",buffering=0) as output:
            subprocess.Popen([str(EXE),"--update-worker",revision],
                cwd=str(BASE),env=env,stdin=subprocess.DEVNULL,
                stdout=output,stderr=subprocess.STDOUT,
                close_fds=True,creationflags=flags)
    except Exception:
        core._status("error","Impossible de démarrer la mise à jour personnelle.",revision)
        raise
    return {"ok":True,"revision":revision}


if __name__=="__main__":
    if len(sys.argv)==3 and sys.argv[1]=="--worker":
        worker(sys.argv[2])
    else:
        raise SystemExit("Lancement direct de la mise à jour désactivé.")
