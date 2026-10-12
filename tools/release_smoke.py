from __future__ import annotations

import hashlib
import http.client
import json
import os
import sqlite3
import subprocess
import sys
import tempfile
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
APP = ROOT / "app"
MANIFEST = ROOT / "manifest.json"
PORT = 18765


def fail(message: str) -> None:
    raise RuntimeError(message)


def sha256(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()


def request(method: str, path: str, payload=None):
    conn = http.client.HTTPConnection("127.0.0.1", PORT, timeout=2)
    body = None
    headers = {}
    if payload is not None:
        body = json.dumps(payload).encode("utf-8")
        headers["Content-Type"] = "application/json"
    conn.request(method, path, body=body, headers=headers)
    res = conn.getresponse()
    raw = res.read()
    conn.close()
    data = json.loads(raw.decode("utf-8")) if raw else {}
    return res.status, data


def wait_ready(proc: subprocess.Popen, timeout: float = 15.0) -> None:
    deadline = time.time() + timeout
    while time.time() < deadline:
        if proc.poll() is not None:
            fail(f"Le serveur s'est arrêté prématurément avec le code {proc.returncode}.")
        try:
            status, data = request("GET", "/api/runtime-version")
            if status == 200 and data.get("version"):
                return
        except Exception:
            pass
        time.sleep(0.15)
    fail("Le serveur de test n'a pas répondu à temps.")


def start_server(data_dir: Path):
    env = os.environ.copy()
    env["ATELIER_DATA_DIR"] = str(data_dir)
    env["ATELIER_NO_BROWSER"] = "1"
    env["ATELIER_PORT"] = str(PORT)
    proc = subprocess.Popen(
        [sys.executable, str(APP / "app.py")],
        cwd=str(ROOT),
        env=env,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
    )
    wait_ready(proc)
    return proc


def stop_server(proc: subprocess.Popen) -> None:
    try:
        request("POST", "/api/shutdown", {})
    except Exception:
        pass
    try:
        proc.wait(timeout=5)
    except subprocess.TimeoutExpired:
        proc.terminate()
        proc.wait(timeout=5)


def check_manifest() -> str:
    manifest = json.loads(MANIFEST.read_text(encoding="utf-8"))
    version = (APP / "VERSION").read_text(encoding="utf-8").strip()
    if manifest.get("version") != version:
        fail(f"VERSION={version} mais manifest={manifest.get('version')}.")
    files = manifest.get("files") or []
    listed = set()
    for item in files:
        rel = item["path"]
        listed.add(rel)
        path = APP / rel
        if not path.is_file():
            fail(f"Fichier du manifeste absent : {rel}")
        actual = sha256(path)
        if actual.lower() != str(item.get("sha256", "")).lower():
            fail(f"SHA-256 incorrect dans le manifeste : {rel}")
    required = {
        "app.py", "app_part1.py", "app_part2.py", "app_part3.py",
        "VERSION", "public/index.html", "public/app_part1.js",
        "public/app_part2.js", "public/app_part3.js", "public/styles.css",
    }
    missing = required - listed
    if missing:
        fail("Fichiers essentiels absents du manifeste : " + ", ".join(sorted(missing)))
    return version


def check_python_syntax() -> None:
    for path in sorted(APP.glob("*.py")):
        compile(path.read_text(encoding="utf-8"), str(path), "exec")



def check_frontend_contract() -> None:
    index = (APP / "public" / "index.html").read_text(encoding="utf-8")
    js = (APP / "public" / "app_part3.js").read_text(encoding="utf-8")
    css = (APP / "public" / "styles.css").read_text(encoding="utf-8")
    for required in ('id="sideNav"', 'id="sideNavToggle"', 'id="addStandaloneReminder"'):
        if required not in index:
            fail(f"Élément frontend obligatoire absent : {required}")
    binding = "document.querySelectorAll('.tabs button[data-view]').forEach"
    if binding not in js:
        fail("Branchement des onglets de navigation absent.")
    if "main{margin-left:" in css or ".topbar{margin-left:" in css:
        fail("Le tiroir de navigation ne doit pas déplacer l'accueil ou l'en-tête.")

def check_server(version: str) -> None:
    with tempfile.TemporaryDirectory(prefix="atelier-ci-") as td:
        data = Path(td) / "data"
        data.mkdir()

        proc = start_server(data)
        try:
            status, runtime = request("GET", "/api/runtime-version")
            if status != 200 or runtime.get("version") != version:
                fail("Version runtime incorrect.")

            status, _ = request("GET", "/api/shutdown")
            if status != 404:
                fail("GET /api/shutdown doit être refusé.")

            status, created = request("POST", "/api/events", {
                "title": "Test 31",
                "event_date": "2027-01-31",
                "start_time": "10:00",
                "end_time": "11:00",
                "category": "general",
                "recurrence": "monthly",
                "show_in_month": True,
            })
            if status != 201 or not created.get("id"):
                fail("Impossible de créer l'événement de test.")

            status, events = request("GET", "/api/events?start=2027-01-01&end=2027-03-31")
            dates = [e.get("instance_date") for e in events if e.get("title") == "Test 31"]
            expected = ["2027-01-31", "2027-02-28", "2027-03-31"]
            if dates != expected:
                fail(f"Récurrence mensuelle incorrecte : {dates!r}")

            status, reminder = request("POST", "/api/reminders", {
                "title": "Test rappel indépendant",
                "remind_at": "2027-03-15T09:30",
            })
            if status != 201 or not reminder.get("id"):
                fail("Impossible de créer un rappel indépendant.")
            status, reminders = request("GET", "/api/reminders")
            if status != 200 or not any(r.get("entity_type") == "standalone" and r.get("title") == "Test rappel indépendant" for r in reminders):
                fail("Le rappel indépendant n'est pas relu correctement.")
        finally:
            stop_server(proc)

        db = data / "atelier.db"
        with sqlite3.connect(db) as c:
            if c.execute("PRAGMA user_version").fetchone()[0] != 2:
                fail("PRAGMA user_version n'a pas été appliqué.")
            c.execute("PRAGMA user_version = 0")
            c.commit()

        proc = start_server(data)
        stop_server(proc)
        backups = list((data / "backups").glob("atelier-before-schema-*.db"))
        if not backups:
            fail("Aucune sauvegarde de base créée avant migration.")


if __name__ == "__main__":
    check_python_syntax()
    check_frontend_contract()
    version = check_manifest()
    check_server(version)
    print(f"OK — L'Atelier {version} passe les contrôles de release.")
