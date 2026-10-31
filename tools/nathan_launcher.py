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
from contextlib import contextmanager
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

def _install(launch=True):
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
        if launch:
            subprocess.Popen([str(exe)],cwd=str(exe.parent),
                creationflags=getattr(subprocess,"CREATE_NEW_PROCESS_GROUP",0))
        return True
    _shortcut(exe)
    return False


def _upgrade_existing():
    """Opt-in migration for Nathan's existing installation; no user data is replaced."""
    import sqlite3
    from datetime import datetime
    safe()
    base,code,data,exe,profile=paths()
    if not code.is_dir() or not exe.is_file() or not data.is_dir():
        raise RuntimeError("Ancienne installation Nathan introuvable. N'utilise pas cette mise à jour.")
    if _busy():
        raise RuntimeError("Ferme d'abord L'Atelier de Nathan et ses Post-it avant la mise à jour.")
    source=_bundled()
    manifest=json.loads((source/"manifest.json").read_text(encoding="utf-8"))
    files=manifest.get("files",[])
    if not files or any(row.get("path") in ("public/jdr.html","public/jdr-mj.html") for row in files):
        raise RuntimeError("Cette édition Nathan ne garantit pas l'exclusion du JDR.")
    for row in files:
        candidate=source/"app"/row["path"]
        if not candidate.is_file() or hashlib.sha256(candidate.read_bytes()).hexdigest()!=row["sha256"]:
            raise RuntimeError("Fichier du paquet non vérifié : "+str(row["path"]))
    stamp=datetime.now().strftime("%Y%m%d_%H%M%S")
    backup=base/"backups"/("NATHAN_AVANT_MAJ_"+stamp)
    if backup.exists() or backup.parent.is_symlink() or getattr(backup.parent,"is_junction",lambda:False)():
        raise RuntimeError("Dossier de sauvegarde Nathan non sûr.")
    staged=base/"code.nathan-new"
    previous=base/"code.nathan-previous"
    new_exe=exe.with_suffix(".new")
    old_exe=exe.with_suffix(".previous")
    if any(p.exists() for p in (staged,previous,new_exe,old_exe)):
        raise RuntimeError("Une ancienne tentative de mise à jour doit être examinée avant de continuer.")
    with one_window(data):
        backup.mkdir(parents=True)
        shutil.copytree(code,backup/"code")
        shutil.copy2(exe,backup/exe.name)
        db=data/"atelier.db"
        if db.is_file():
            with sqlite3.connect(str(db)) as src,sqlite3.connect(str(backup/"atelier.db")) as dst:
                src.backup(dst)
        for item in data.iterdir():
            if item.is_file() and not item.name.endswith((".db",".db-wal",".db-shm",".lock")):
                shutil.copy2(item,backup/item.name)
        shutil.copytree(source,staged)
        # Refuse to touch the old installation if staging is incomplete.
        if not (staged/"app"/"app.py").is_file() or not (staged/"manifest.json").is_file():
            raise RuntimeError("Préparation Nathan incomplète, ancienne installation intacte.")
        current=Path(sys.executable).resolve()
        shutil.copy2(current,new_exe)
        if not _same(current,new_exe):
            new_exe.unlink(missing_ok=True)
            raise RuntimeError("Copie du nouvel exécutable invalide.")
        revision_file=data/"installed-revision.txt"
        previous_revision=revision_file.read_bytes() if revision_file.exists() else None
        code_swapped=False
        exe_swapped=False
        try:
            code.rename(previous)
            code_swapped=True
            staged.rename(code)
            exe.rename(old_exe)
            exe_swapped=True
            new_exe.rename(exe)
            revision=(code/"nathan-build-revision.txt").read_text(encoding="ascii").strip()
            (data/"installed-revision.txt").write_text(revision,encoding="ascii")
            _shortcut(exe)
        except BaseException:
            # Leave a complete backup and restore previous installation.
            if exe_swapped:
                if exe.exists():exe.unlink()
                old_exe.rename(exe)
            if code_swapped:
                if code.exists():shutil.rmtree(code)
                previous.rename(code)
            if previous_revision is None:
                revision_file.unlink(missing_ok=True)
            else:
                revision_file.write_bytes(previous_revision)
            if new_exe.exists():new_exe.unlink()
            raise
        shutil.rmtree(previous)
        old_exe.unlink(missing_ok=True)
    return backup


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

@contextmanager
def one_window(data):
    """Protect Nathan's own GUI from duplicate windows, never TEST or stable."""
    if os.name != "nt":
        yield
        return
    import msvcrt
    data.mkdir(parents=True, exist_ok=True)
    with (data / "desktop-window.lock").open("a+b") as handle:
        if handle.seek(0, os.SEEK_END) == 0:
            handle.write(b"1")
            handle.flush()
        handle.seek(0)
        try:
            msvcrt.locking(handle.fileno(), msvcrt.LK_NBLCK, 1)
        except OSError as exc:
            raise RuntimeError("Une fenêtre de L’Atelier Nathan est déjà ouverte.") from exc
        try:
            yield
        finally:
            handle.seek(0)
            msvcrt.locking(handle.fileno(), msvcrt.LK_UNLCK, 1)


def stop_own_server(child):
    """Stop Nathan's server on GUI close, including after an in-app update."""
    if child is None:
        return
    try:
        if not _probe():
            return
        base = "http://127.0.0.1:8877/"
        with urlopen(base + "api/update/status", timeout=2) as r:
            phase = json.load(r).get("phase")
        if phase in ("starting", "download", "stopping", "backup", "installing"):
            return
        with urlopen(Request(base + "api/shutdown", data=b"{}", method="POST",
                             headers={"Content-Type": "application/json"}), timeout=3) as r:
            if not r.headers.get("Server", "").startswith("AtelierLocal/"):
                raise RuntimeError("Serveur Nathan non reconnu.")
        for _ in range(30):
            if not _busy():
                return
            time.sleep(.2)
        if child.poll() is None:
            child.terminate()
            try:
                child.wait(timeout=3)
            except subprocess.TimeoutExpired:
                pass
    except Exception as exc:
        try:
            data=paths()[2]
            data.mkdir(exist_ok=True)
            with (data/"desktop-launch.log").open("a",encoding="utf-8") as out:
                out.write("Nathan server shutdown: "+repr(exc)+"\\n")
        except OSError:
            pass


def main():
    if "--self-test" in sys.argv:
        assert PORT==8877 and VERSION=="0.18.0"
        assert "LATELIER_TEST_0180" not in str(location()).upper()
        print("PASS: Nathan port, private profile, isolated data")
        return
    # A single frozen Python distribution services WebView, Post-it and updater.
    if "--nathan-upgrade" in sys.argv:
        saved=_upgrade_existing()
        print("PASS: mise à jour Nathan en sécurité. Sauvegarde :", saved, flush=True)
        return
    if "--nathan-install-only" in sys.argv:
        _install(launch=False)
        print("PASS: Nathan private app and shortcut installed without launching GUI")
        return
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
        with one_window(data):
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
                stop_own_server(child)
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
