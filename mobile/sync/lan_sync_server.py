"""Isolated LAN sync prototype. Does NOT access any Atelier database.

Start with: py lan_sync_server.py
First run creates a random token in sync-token.txt (keep private).
By default binds to 127.0.0.1 for safe local tests. Set
ATELIER_SYNC_BIND=0.0.0.0 only after reviewing Windows Firewall scope.
"""
import hmac
import json
import os
import secrets
import sqlite3
from datetime import datetime, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

ROOT = Path(__file__).resolve().parent
TOKEN_FILE = ROOT / "sync-token.txt"
DB_FILE = ROOT / "sync-test.sqlite3"
HOST = os.environ.get("ATELIER_SYNC_BIND", "127.0.0.1")
PORT = 8878
KINDS = {"habits", "tasks", "shopping", "notes"}
MAX_BODY = 256 * 1024

def token():
    if TOKEN_FILE.exists():
        return TOKEN_FILE.read_text(encoding="utf-8").strip()
    value = secrets.token_urlsafe(32)
    with TOKEN_FILE.open("x", encoding="utf-8") as file:
        file.write(value)
    return value

SECRET = token()
with sqlite3.connect(DB_FILE) as db:
    db.execute("""CREATE TABLE IF NOT EXISTS changes (
        seq INTEGER PRIMARY KEY AUTOINCREMENT,
        device TEXT NOT NULL,
        change_id TEXT NOT NULL,
        kind TEXT NOT NULL,
        item_id TEXT NOT NULL,
        value TEXT NOT NULL,
        received_at TEXT NOT NULL,
        UNIQUE(device, change_id)
    )""")

class Handler(BaseHTTPRequestHandler):
    def respond(self, code, obj):
        body = json.dumps(obj, ensure_ascii=False).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def authorized(self):
        supplied = self.headers.get("Authorization", "")
        return hmac.compare_digest(supplied, "Bearer " + SECRET)

    def do_GET(self):
        if self.path == "/health":
            return self.respond(200, {"status": "ok", "service": "atelier-sync-test", "sync_enabled": False})
        if not self.authorized():
            return self.respond(401, {"error": "unauthorized"})
        if self.path.startswith("/changes?since="):
            try:
                since = int(self.path.split("=", 1)[1])
                if since < 0:
                    raise ValueError
            except ValueError:
                return self.respond(400, {"error": "invalid_cursor"})
            with sqlite3.connect(DB_FILE) as db:
                rows = db.execute("SELECT seq,device,change_id,kind,item_id,value FROM changes WHERE seq>? ORDER BY seq LIMIT 500", (since,)).fetchall()
            return self.respond(200, {"changes": [{"seq": r[0], "device": r[1], "change_id": r[2], "kind": r[3], "item_id": r[4], "value": json.loads(r[5])} for r in rows]})
        return self.respond(404, {"error": "not_found"})

    def do_POST(self):
        if not self.authorized():
            return self.respond(401, {"error": "unauthorized"})
        if self.path != "/changes":
            return self.respond(404, {"error": "not_found"})
        try:
            size = int(self.headers.get("Content-Length", "-1"))
            if not 0 <= size <= MAX_BODY:
                return self.respond(413, {"error": "invalid_size"})
            body = json.loads(self.rfile.read(size))
            if not isinstance(body, dict) or not isinstance(body.get("changes"), list) or len(body["changes"]) > 100:
                raise ValueError
            normalized = []
            for item in body["changes"]:
                if not isinstance(item, dict) or item.get("kind") not in KINDS:
                    raise ValueError
                for key in ("device", "change_id", "item_id"):
                    if not isinstance(item.get(key), str) or not 1 <= len(item[key]) <= 100:
                        raise ValueError
                if not isinstance(item.get("value"), dict):
                    raise ValueError
                normalized.append((item["device"], item["change_id"], item["kind"], item["item_id"], json.dumps(item["value"], ensure_ascii=False), datetime.now(timezone.utc).isoformat()))
        except (ValueError, TypeError, KeyError, json.JSONDecodeError):
            return self.respond(400, {"error": "invalid_changes"})
        with sqlite3.connect(DB_FILE) as db:
            before = db.total_changes
            db.executemany("INSERT OR IGNORE INTO changes(device,change_id,kind,item_id,value,received_at) VALUES(?,?,?,?,?,?)", normalized)
            accepted = db.total_changes - before
        return self.respond(200, {"accepted": accepted, "duplicates": len(normalized) - accepted})

if __name__ == "__main__":
    print("Atelier sync TEST: separate database only. No Windows Atelier data accessed.")
    print(f"Listening on http://{HOST}:{PORT}")
    print("Keep sync-token.txt private. Ctrl+C to stop.")
    if HOST != "127.0.0.1":
        print("WARNING: HTTP is unencrypted; DO NOT send real personal data or your token over Wi-Fi.")
    ThreadingHTTPServer((HOST, PORT), Handler).serve_forever()
