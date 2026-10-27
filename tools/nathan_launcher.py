"""L'Atelier du Goblin — Nathan's standalone, PRIVATE Windows app.

Separate %LOCALAPPDATA% data/ SQLite, WebView2 profile, desktop shortcut and
port 8877. Bundled Python runs the HTTP server, updater and Post-its too.
No E: paths or shared data. Never clones the original user's DB.
"""
from __future__ import annotations
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
from urllib.request import urlopen, Request

NAME = "L'Atelier du Goblin — Nathan"
VERSION = "0.18.0"
PORT = 8877

def location():
    if os.name != "nt" or not os.environ.get("LOCALAPPDATA"):
        raise RuntimeError("Cette installation personnelle nécessite Windows.")
    return Path(os.environ["LOCALAPPDATA"]) / "LAtelierDuGoblinNathan"

def paths():
    base=location()
    return base,base/"code",base/"data",base/"desktop"/"LAtelierDuGoblin_Nathan.exe",base/"profile"

def safe():
    base,code,data,exe,profile=paths()
    for item in (base,code,data,exe.parent,profile):
        if item.exists() and (item.is_symlink() or getattr(item,"is_junction",lambda:False)()):
            raise RuntimeError("Installation Nathan redirigée : refusée.")
    # Do not accidentally impersonate or copy the existing TEST install.
    if "LATELIER_TEST_0180" in str(base).upper() or str(base).upper().startswith("E:\\"):
        raise RuntimeError("Dossier de données partagé refusé.")

def _same(a,b):
    if a.stat().st_size!=b.stat().st_size:return False
    def digest(p):
        h=hashlib.sha256()
        with p.open("rb") as s:
            for part in iter(lambda:s.read(1024*1024),b""):h.update(part)
        return h.digest()
    return digest(a)==digest(b)

def _notice(message):
    try:ctypes.windll.user32.MessageBoxW(0,str(message),"L'Atelier du Goblin — Nathan",0x10)
    except Exception:pass

def _shortcut(target):
    encoded=lambda s:s.replace("'","''")
    script=(
        "$ErrorActionPreference='Stop';$s=New-Object -ComObject WScript.Shell;"
        "$d=$s.SpecialFolders.Item('Desktop');"
        "$l=Join-Path $d 'L''Atelier du Goblin - Nathan.lnk';"
        "$c=$s.CreateShortcut($l);"
        "$c.TargetPath='"+encoded(str(target))+"';"
        "$c.WorkingDirectory='"+encoded(str(target.parent))+"';"
        "$c.IconLocation='"+encoded(str(target))+",0';"
        "$c.Description='L''Atelier du Goblin - espace personnel Nathan';"
        "$c.Save();if(-not(Test-Path $l)){throw 'Raccourci absent'}"
    )
    import base64
    args=["powershell.exe","-NoProfile","-NonInteractive","-EncodedCommand",
          base64.b64encode(script.encode("utf-16-le")).decode("ascii")]
    done=subprocess.run(args,timeout=25,text=True,capture_output=True,
                        creationflags=getattr(subprocess,"CREATE_NO_WINDOW",0))
    if done.returncode:raise RuntimeError("Raccourci Nathan : "+done.stderr[-400:])

def _bundled():
    root=Path(getattr(sys,"_MEIPASS",Path(__file__).parent))
    return root/"nathan_code"

def _install():
    safe()
    base,code,data,exe,profile=paths()
    if code.exists():
        if not (code/"app"/"app.py").is_file() or not (code/"manifest.json").is_file():
            raise RuntimeError("Installation Nathan incomplète. Ne rien écraser automatiquement.")
    else:
        source=_bundled()
        if not (source/"app"/"app.py").is_file():
            raise RuntimeError("Fichiers de l'application manquants dans l'installateur.")
        base.mkdir(parents=True,exist_ok=True)
        staging=base/"code-new"
        if staging.exists():raise RuntimeError("Ancienne préparation présente : contrôle nécessaire.")
        shutil.copytree(source,staging)
        # Check initial files match our bundled manifest (not a shared DB).
        manifest=json.loads((staging/"manifest.json").read_text(encoding="utf-8"))
        for row in manifest["files"]:
            file=staging/"app"/row["path"]
            if not file.is_file() or hashlib.sha256(file.read_bytes()).hexdigest()!=row["sha256"]:
                raise RuntimeError("Fichier Nathan incorrect : "+row["path"])
        staging.rename(code)
        data.mkdir(exist_ok=True)
        (data/"installed-revision.txt").write_text(
            (code/"nathan-build-revision.txt").read_text(encoding="ascii").strip(),
            encoding="ascii")
    data.mkdir(exist_ok=True)
    exe.parent.mkdir(exist_ok=True)
    current=Path(sys.executable).resolve()
    if current!=exe.resolve():
        if exe.exists() and not _same(current,exe):
            raise RuntimeError("Une ancienne appli Nathan est déjà installée. Refus d'écraser sans sauvegarde.")
        if not exe.exists():
            dest=exe.with_suffix(".new")
            if dest.exists():raise RuntimeError("Installation incomplète : fichier temporaire.")
            shutil.copy2(current,dest)
            if not _same(current,dest):raise RuntimeError("Copie de l'exécutable non vérifiée.")
            dest.rename(exe)
        _shortcut(exe)
        subprocess.Popen([str(exe)],cwd=str(exe.parent),
            creationflags=getattr(subprocess,"CREATE_NEW_PROCESS_GROUP",0))
        return True
    _shortcut(exe)
    return False

def _run_python(path,argv):
    safe()
    base,code,data,exe,profile=paths()
    if not (code/"app"/path).is_file():raise RuntimeError("Code Nathan manquant.")
    os.environ.update(ATELIER_DATA_DIR=str(data),ATELIER_PORT=str(PORT),
                      ATELIER_NO_BROWSER="1")
    sys.path.insert(0,str(code/"app"))
    sys.argv=[str(code/"app"/path)]+argv
    runpy.run_path(str(code/"app"/path),run_name="__main__")

def _probe():
    try:
        with urlopen("http://127.0.0.1:8877/api/runtime-version",timeout=1) as r:
            return (r.headers.get("Server","").startswith("AtelierLocal/") and
                    json.load(r).get("version")==VERSION)
    except (OSError,ValueError):
        return False

def _busy():
    with socket.socket() as s:
        s.settimeout(.4)
        return s.connect_ex(("127.0.0.1",PORT))==0

def main():
    if "--self-test" in sys.argv:
        assert PORT==8877 and VERSION=="0.18.0"
        assert "LATELIER_TEST_0180" not in str(location()).upper()
        print("PASS: Nathan port, private profile, isolated data")
        return
    # A single frozen Python distribution services WebView, Post-it and updater.
    if "--nathan-server" in sys.argv:
        _run_python("app.py",[])
        return
    if "--nathan-postits" in sys.argv:
        _run_python("desktop_postits.py",[])
        return
    if "--nathan-update-worker" in sys.argv:
        ix=sys.argv.index("--nathan-update-worker")
        _run_python("updater.py",["--worker",sys.argv[ix+1]])
        return
    try:
        if _install():return
        safe()
        base,code,data,exe,profile=paths()
        import webview
        if not _probe() and _busy():
            raise RuntimeError("Le port 8877 est déjà utilisé par un autre programme.")
        child=None
        if not _probe():
            with (data/"desktop-server.log").open("ab",buffering=0) as log:
                child=subprocess.Popen([sys.executable,"--nathan-server"],
                    cwd=str(code),stdin=subprocess.DEVNULL,
                    stdout=log,stderr=subprocess.STDOUT,close_fds=True,
                    creationflags=getattr(subprocess,"CREATE_NO_WINDOW",0))
            for _ in range(95):
                if child.poll() is not None:raise RuntimeError("Serveur Nathan arrêté au démarrage.")
                if _probe():break
                time.sleep(.3)
            else:raise RuntimeError("Serveur Nathan inaccessible. Voir desktop-server.log.")
        profile.mkdir(exist_ok=True)
        try:
            webview.create_window(NAME,"http://127.0.0.1:8877/",width=1360,
                height=860,min_size=(870,590),background_color="#211B17",
                confirm_close=False,text_select=True)
            webview.start(gui="edgechromium",private_mode=False,
                          storage_path=str(profile),debug=False)
        finally:
            if child is not None and child.poll() is None and _probe():
                try:
                    with urlopen("http://127.0.0.1:8877/api/update/status",timeout=2) as r:
                        phase=json.load(r).get("phase")
                    if phase not in ("starting","download","stopping","backup","installing"):
                        with urlopen(Request("http://127.0.0.1:8877/api/shutdown",
                            data=b"{}",method="POST",headers={"Content-Type":"application/json"}),
                            timeout=2):pass
                except Exception:pass
    except Exception as exc:
        try:
            d=paths()[2]
            d.mkdir(exist_ok=True)
            with (d/"desktop-launch.log").open("a",encoding="utf-8") as f:
                f.write(time.strftime("%Y-%m-%d %H:%M:%S")+" "+traceback.format_exc()+"\n")
        except Exception:pass
        _notice(str(exc))
        raise SystemExit(1)

if __name__=="__main__":main()
