"""L'Atelier du Goblin — Nathan: self-contained, per-Windows-user native app.

One EXE bundles Python and all application source; no Python setup, no Brave.
Installs under %LOCALAPPDATA%\PetitGoblin\LAtelierNathan. NEVER reads E: or
the owner's TEST and stable installations, and never copies their SQLite data.
"""
from __future__ import annotations

import base64
import ctypes
import hashlib
import json
import os
from pathlib import Path
import runpy
import shutil
import socket
import subprocess
import sys
import time
import traceback
from urllib.request import Request,urlopen

from nathan_bundle import EXE_NAME,PORT,user_home,verify_payload


BASE=user_home()
CODE=BASE/"code"
DATA=BASE/"data"
EXE=BASE/"desktop"/EXE_NAME
PROFILE=BASE/"webview-profile"
URL=f"http://127.0.0.1:{PORT}/"
TITLE="L'Atelier du Goblin — Nathan"


def log(message):
    try:
        DATA.mkdir(parents=True,exist_ok=True)
        with (DATA/"desktop-launch.log").open("a",encoding="utf-8") as f:
            f.write(time.strftime("%Y-%m-%d %H:%M:%S")+" "+str(message)+"\n")
    except OSError:
        pass


def message(msg,error=False):
    ctypes.windll.user32.MessageBoxW(0,str(msg),TITLE,0x10 if error else 0x40)


def no_links():
    for path in (BASE,CODE,CODE/"app",DATA,BASE/"desktop",PROFILE):
        if path.exists() and (path.is_symlink() or
                getattr(path,"is_junction",lambda:False)()):
            raise RuntimeError("Dossier personnel redirigé : installation refusée.")
    # The user's E:\ TEST and stable copies are never destinations.
    if "LATELIER_TEST_0180" in str(BASE).upper() or "00_LATELIER" in str(BASE).upper():
        raise RuntimeError("Chemin commun avec une installation protégée.")


def payload():
    bundled=Path(getattr(sys,"_MEIPASS",Path(__file__).resolve().parents[1]))
    return bundled/"payload_code"


def install_code():
    no_links()
    DATA.mkdir(parents=True,exist_ok=True)
    if CODE.exists():
        verify_payload(CODE)
        return
    source=payload()
    verify_payload(source)
    CODE.parent.mkdir(parents=True,exist_ok=True)
    staging=BASE/"code.installing"
    if staging.exists():
        raise RuntimeError("Installation interrompue. Vérification manuelle nécessaire.")
    shutil.copytree(source,staging)
    try:
        verify_payload(staging)
        staging.rename(CODE)
    except BaseException:
        shutil.rmtree(staging,ignore_errors=True)
        raise


def same_file(a,b):
    if a.stat().st_size!=b.stat().st_size:
        return False
    def digest(p):
        h=hashlib.sha256()
        with p.open("rb") as f:
            for data in iter(lambda:f.read(1024*1024),b""):
                h.update(data)
        return h.digest()
    return digest(a)==digest(b)


def shortcut():
    escaped=lambda text:str(text).replace("'","''")
    path=escaped(EXE)
    script=(
        "$ErrorActionPreference='Stop';"
        "$shell=New-Object -ComObject WScript.Shell;"
        "$desktop=$shell.SpecialFolders.Item('Desktop');"
        "$link=Join-Path $desktop 'L''Atelier du Goblin - Nathan.lnk';"
        "$shortcut=$shell.CreateShortcut($link);"
        "$shortcut.TargetPath='"+path+"';"
        "$shortcut.WorkingDirectory='"+escaped(EXE.parent)+"';"
        "$shortcut.IconLocation='"+path+",0';"
        "$shortcut.Description='L''Atelier du Goblin - installation personnelle Nathan';"
        "$shortcut.Save();"
        "if(-not(Test-Path $link)){throw 'Raccourci Nathan introuvable.'}"
    )
    encoded=base64.b64encode(script.encode("utf-16-le")).decode("ascii")
    run=subprocess.run(["powershell.exe","-NoProfile","-NonInteractive",
                        "-EncodedCommand",encoded],capture_output=True,text=True,
                       timeout=25,creationflags=getattr(subprocess,"CREATE_NO_WINDOW",0))
    if run.returncode:
        raise RuntimeError("Raccourci impossible : "+(run.stderr or run.stdout)[-400:])


def install_exe():
    if not getattr(sys,"frozen",False):
        raise RuntimeError("L’installateur personnel nécessite un EXE Windows.")
    source=Path(sys.executable).resolve()
    EXE.parent.mkdir(parents=True,exist_ok=True)
    if source!=EXE.resolve():
        if EXE.exists() and not same_file(source,EXE):
            raise RuntimeError("Un ancien EXE Nathan existe déjà. Ferme-le avant "
                               "de réinstaller une nouvelle version; tes données restent conservées.")
        if not EXE.exists():
            stage=EXE.with_suffix(".installing")
            if stage.exists():
                raise RuntimeError("Installation EXE antérieure incomplète.")
            shutil.copyfile(source,stage)
            if not same_file(source,stage):
                stage.unlink(missing_ok=True)
                raise RuntimeError("Copie de l’EXE invalide.")
            stage.replace(EXE)
    shortcut()
    return source!=EXE.resolve()


def env():
    values=os.environ.copy()
    values.update(ATELIER_EDITION="NATHAN",ATELIER_DATA_DIR=str(DATA),
                  ATELIER_PORT=str(PORT),ATELIER_NO_BROWSER="1")
    return values


def run_source(relative,argv):
    install_code()
    app=CODE/"app"
    if not (app/relative).is_file():
        raise RuntimeError("Fichier personnel manquant.")
    sys.path.insert(0,str(app))
    os.environ.update(env())
    sys.argv=[str(app/relative),*argv]
    return runpy.run_path(str(app/relative),run_name="__main__")


def probe():
    try:
        with urlopen(URL+"api/runtime-version",timeout=.8) as r:
            if not r.headers.get("Server","").startswith("AtelierLocal/Nathan/"):
                return False
            return json.load(r).get("version")=="0.18.0"
    except (OSError,ValueError):
        return False


def port_busy():
    with socket.socket() as s:
        s.settimeout(.3)
        return s.connect_ex(("127.0.0.1",PORT))==0


def start_server():
    if probe():
        return None
    if port_busy():
        raise RuntimeError(f"Le port {PORT} est occupé par un autre programme.")
    with (DATA/"desktop-server.log").open("ab",buffering=0) as output:
        child=subprocess.Popen([str(EXE),"--server"],cwd=str(BASE),
            env=env(),stdin=subprocess.DEVNULL,
            stdout=output,stderr=subprocess.STDOUT,close_fds=True,
            creationflags=(getattr(subprocess,"CREATE_NEW_PROCESS_GROUP",0) |
                           getattr(subprocess,"CREATE_NO_WINDOW",0)))
    for _ in range(110):
        if child.poll() is not None:
            raise RuntimeError("Le serveur privé Nathan ne démarre pas. "
                               "Consulte desktop-server.log.")
        if probe():
            return child
        time.sleep(.2)
    raise RuntimeError("Le serveur privé Nathan ne répond pas.")


def stop_own(child):
    if child is None or child.poll() is not None or not probe():
        return
    try:
        with urlopen(URL+"api/update/status",timeout=1) as r:
            if json.load(r).get("phase") in (
                    "starting","download","stopping","backup","installing"):
                return
        with urlopen(Request(URL+"api/shutdown",data=b"{}",
                             method="POST",headers={"Content-Type":"application/json"}),timeout=2):
            pass
    except (OSError,ValueError) as exc:
        log("Server shutdown skipped: "+repr(exc))


def self_test():
    if not getattr(sys,"frozen",False):
        raise RuntimeError("Le test exige l’EXE autonome.")
    verify_payload(payload())
    if PORT==8876 or "LATELIER_TEST_0180" in str(BASE).upper():
        raise RuntimeError("Collision avec le TEST.")
    app=(payload()/"app")
    if "nathan_updater as updater" not in (app/"app_part1.py").read_text(encoding="utf-8"):
        raise RuntimeError("L’éditeur personnel importe le mauvais assistant.")
    print("PASS: standalone per-user Nathan EXE, independent source and port",flush=True)


def main():
    if "--self-test" in sys.argv:
        self_test()
        return
    try:
        if "--server" in sys.argv:
            run_source("app.py",[])
            return
        if "--postits" in sys.argv:
            run_source("nathan_postits.py",[])
            return
        if "--update-worker" in sys.argv:
            idx=sys.argv.index("--update-worker")
            revision=sys.argv[idx+1] if len(sys.argv)>idx+1 else ""
            run_source("nathan_updater.py",["--worker",revision])
            return
        if "--install-only" in sys.argv:
            install_code()
            install_exe()
            return
        install_code()
        transferred=install_exe()
        if transferred:
            subprocess.Popen([str(EXE)],cwd=str(EXE.parent),env=env(),
                close_fds=True,creationflags=getattr(subprocess,"CREATE_NEW_PROCESS_GROUP",0))
            return
        import webview
        PROFILE.mkdir(parents=True,exist_ok=True)
        child=start_server()
        try:
            webview.create_window(TITLE,URL,width=1360,height=860,
                min_size=(870,590),background_color="#211B17",
                confirm_close=False,text_select=True)
            webview.start(gui="edgechromium",private_mode=False,
                          storage_path=str(PROFILE),debug=False)
        finally:
            stop_own(child)
    except BaseException as exc:
        log(traceback.format_exc())
        message(str(exc),error=True)
        raise SystemExit(1)


if __name__=="__main__":
    main()
