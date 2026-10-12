from __future__ import annotations

import hashlib
import http.client
import json
import os
import shutil
import subprocess
import sys
import tempfile
import time
import urllib.parse
import urllib.request
import zipfile
from datetime import datetime
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent
APP = ROOT / "app"
CONFIG = HERE / "config.json"
BACKUPS = HERE / "backups"
USER_AGENT = "L-Atelier-Updater/3.0"
TEST_PORT = 18766


def version_tuple(v: str):
    parts = []
    for p in v.strip().lstrip("v").split("."):
        try:
            parts.append(int(p))
        except ValueError:
            parts.append(0)
    return tuple((parts + [0, 0, 0])[:3])


def read_current_version() -> str:
    p = APP / "VERSION"
    return p.read_text(encoding="utf-8").strip() if p.exists() else "0.0.0"


def no_cache_url(url: str) -> str:
    sep = "&" if "?" in url else "?"
    return f"{url}{sep}atelier_ts={int(time.time() * 1000)}"


def request(url: str, timeout: int = 30, *, no_cache: bool = False):
    if no_cache:
        url = no_cache_url(url)
    req = urllib.request.Request(
        url,
        headers={
            "User-Agent": USER_AGENT,
            "Cache-Control": "no-cache",
            "Pragma": "no-cache",
        },
    )
    return urllib.request.urlopen(req, timeout=timeout)


def get_json(url: str) -> dict:
    with request(url, 20, no_cache=True) as r:
        return json.loads(r.read().decode("utf-8"))


def download(url: str, target: Path):
    target.parent.mkdir(parents=True, exist_ok=True)
    with request(url, 60, no_cache=True) as r, target.open("wb") as f:
        shutil.copyfileobj(r, f)


def sha256(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()


def keep_three_backups():
    if not BACKUPS.exists():
        return
    items = sorted(
        (p for p in BACKUPS.iterdir() if p.is_dir()),
        key=lambda p: p.stat().st_mtime,
        reverse=True,
    )
    for old in items[3:]:
        shutil.rmtree(old, ignore_errors=True)


def backup_current(current: str) -> Path | None:
    if not APP.exists():
        return None
    BACKUPS.mkdir(exist_ok=True)
    stamp = datetime.now().strftime("%Y%m%d-%H%M%S")
    backup = BACKUPS / f"app-{current}-{stamp}"
    print("Sauvegarde de l'ancienne application...")
    shutil.copytree(APP, backup)
    return backup


def install_staged(staged: Path):
    old = ROOT / "app.__old__"
    shutil.rmtree(old, ignore_errors=True)
    try:
        if APP.exists():
            APP.rename(old)
        staged.rename(APP)
        shutil.rmtree(old, ignore_errors=True)
    except Exception:
        if APP.exists():
            shutil.rmtree(APP, ignore_errors=True)
        if old.exists():
            old.rename(APP)
        raise


def safe_extract_zip(archive: Path, extracted: Path):
    extracted_root = extracted.resolve()
    with zipfile.ZipFile(archive) as z:
        for member in z.infolist():
            target = (extracted / member.filename).resolve()
            if target != extracted_root and extracted_root not in target.parents:
                raise RuntimeError(f"Chemin ZIP dangereux : {member.filename!r}")
        z.extractall(extracted)


def install_zip(manifest: dict, temp: Path, latest: str):
    package_url = str(manifest.get("package_url", "")).strip()
    expected_hash = str(manifest.get("sha256", "")).strip().lower()
    if not package_url or not expected_hash:
        raise RuntimeError("Manifeste ZIP incomplet.")

    archive = temp / "app.zip"
    extracted = temp / "new_app"
    print("Telechargement du paquet...")
    download(package_url, archive)
    if sha256(archive).lower() != expected_hash:
        raise RuntimeError("Le SHA-256 du paquet ne correspond pas au manifeste.")

    extracted.mkdir()
    safe_extract_zip(archive, extracted)

    if not (extracted / "app.py").exists() or not (extracted / "VERSION").exists():
        raise RuntimeError("Le paquet ne contient pas une application L'Atelier valide.")
    if (extracted / "VERSION").read_text(encoding="utf-8").strip() != latest:
        raise RuntimeError("La version du paquet ne correspond pas au manifeste.")
    return extracted


def install_files(manifest: dict, temp: Path, latest: str):
    base_url = str(manifest.get("base_url", "")).strip().rstrip("/")
    files = manifest.get("files") or []
    if not base_url or not isinstance(files, list) or not files:
        raise RuntimeError("Manifeste fichiers incomplet.")

    staged = temp / "new_app"
    staged.mkdir()
    print(f"Telechargement de {len(files)} fichier(s)...")

    for i, item in enumerate(files, 1):
        rel = str((item or {}).get("path", "")).strip().replace("\\", "/")
        expected = str((item or {}).get("sha256", "")).strip().lower()
        if not rel or rel.startswith("/") or ".." in Path(rel).parts or not expected:
            raise RuntimeError(f"Entree de fichier invalide dans le manifeste : {rel!r}")
        target = staged / rel
        print(f"  [{i}/{len(files)}] {rel}")
        download(f"{base_url}/{rel}", target)
        if sha256(target).lower() != expected:
            raise RuntimeError(f"SHA-256 incorrect pour {rel}")

    if not (staged / "app.py").exists() or not (staged / "VERSION").exists():
        raise RuntimeError("La mise a jour ne contient pas une application valide.")
    if (staged / "VERSION").read_text(encoding="utf-8").strip() != latest:
        raise RuntimeError("La version telechargee ne correspond pas au manifeste.")
    return staged


def _test_request(method: str, path: str, payload=None):
    conn = http.client.HTTPConnection("127.0.0.1", TEST_PORT, timeout=1)
    raw = json.dumps(payload).encode("utf-8") if payload is not None else None
    headers = {"Content-Type": "application/json"} if raw is not None else {}
    conn.request(method, path, body=raw, headers=headers)
    res = conn.getresponse()
    body = res.read()
    conn.close()
    data = json.loads(body.decode("utf-8")) if body else {}
    return res.status, data


def preflight(staged: Path, latest: str, temp: Path):
    print("Verification de la nouvelle version avant installation...")
    for path in staged.glob("*.py"):
        compile(path.read_text(encoding="utf-8"), str(path), "exec")

    test_data = temp / "test-data"
    test_data.mkdir()
    env = os.environ.copy()
    env["ATELIER_DATA_DIR"] = str(test_data)
    env["ATELIER_NO_BROWSER"] = "1"
    env["ATELIER_PORT"] = str(TEST_PORT)
    proc = subprocess.Popen(
        [sys.executable, str(staged / "app.py")],
        cwd=str(staged.parent),
        env=env,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
    )
    try:
        deadline = time.time() + 12
        while time.time() < deadline:
            if proc.poll() is not None:
                out, err = proc.communicate()
                raise RuntimeError("La nouvelle version ne demarre pas.\n" + (err or out)[-2500:])
            try:
                status, data = _test_request("GET", "/api/runtime-version")
                if status == 200:
                    if data.get("version") != latest:
                        raise RuntimeError("La version runtime testee ne correspond pas au manifeste.")
                    break
            except OSError:
                pass
            time.sleep(0.15)
        else:
            raise RuntimeError("La nouvelle version ne repond pas au test de demarrage.")

        status, _ = _test_request("GET", "/api/events?start=2027-01-01&end=2027-01-02")
        if status != 200:
            raise RuntimeError("L'API essentielle de L'Atelier ne repond pas correctement.")
    finally:
        try:
            _test_request("POST", "/api/shutdown", {})
        except Exception:
            pass
        try:
            proc.wait(timeout=4)
        except subprocess.TimeoutExpired:
            proc.terminate()
            proc.wait(timeout=4)


def main() -> int:
    if not CONFIG.exists():
        print("[ERREUR] updater/config.json manquant.")
        return 1

    cfg = json.loads(CONFIG.read_text(encoding="utf-8"))
    manifest_url = str(cfg.get("manifest_url") or "").strip()
    if not manifest_url:
        print("[ERREUR] manifest_url n'est pas configure.")
        return 1

    current = read_current_version()
    print(f"Version installee : {current}")
    print("Recherche d'une mise a jour...")
    try:
        manifest = get_json(manifest_url)
    except Exception as e:
        print(f"[ERREUR] Impossible de lire le manifeste : {e}")
        return 1

    latest = str(manifest.get("version", "")).strip()
    notes = str(manifest.get("notes", "")).strip()
    if not latest:
        print("[ERREUR] Version absente du manifeste.")
        return 1

    if version_tuple(latest) <= version_tuple(current):
        print("L'Atelier est deja a jour c:")
        return 0

    print(f"Nouvelle version disponible : {latest}")
    if notes:
        print(f"Notes : {notes}")

    try:
        with tempfile.TemporaryDirectory(prefix="atelier-update-", dir=str(HERE)) as td:
            temp = Path(td)
            fmt = int(manifest.get("format", 1) or 1)
            staged = install_files(manifest, temp, latest) if (fmt >= 2 or manifest.get("files")) else install_zip(manifest, temp, latest)
            preflight(staged, latest, temp)

            backup_current(current)
            final_stage = ROOT / "app.__new__"
            shutil.rmtree(final_stage, ignore_errors=True)
            shutil.copytree(staged, final_stage)
            print("Installation...")
            install_staged(final_stage)
    except Exception as e:
        print(f"[ERREUR] Mise a jour impossible : {e}")
        return 1

    installed = read_current_version()
    if installed != latest:
        print(f"[ERREUR] Verification finale impossible : version installee {installed}, attendue {latest}.")
        return 1

    keep_three_backups()
    print(f"L'Atelier {latest} est installe et verifie.")
    print("Les dossiers data/ et user/ n'ont pas ete modifies.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
