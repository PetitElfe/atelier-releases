"""Non-destructive tests for the isolated LAN sync prototype."""
import json
import sqlite3
import tempfile
import threading
import unittest
from http.client import HTTPConnection
from http.server import ThreadingHTTPServer
from pathlib import Path
from unittest.mock import patch

import lan_sync_server as sync

class SyncTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.temp = tempfile.TemporaryDirectory()
        cls.database = Path(cls.temp.name) / "isolated.sqlite3"
        with sqlite3.connect(cls.database) as db:
            db.execute("""CREATE TABLE changes (
                seq INTEGER PRIMARY KEY AUTOINCREMENT,
                device TEXT NOT NULL,
                change_id TEXT NOT NULL,
                kind TEXT NOT NULL,
                item_id TEXT NOT NULL,
                value TEXT NOT NULL,
                received_at TEXT NOT NULL,
                UNIQUE(device, change_id)
            )""")
        cls.patch = patch.object(sync, "DB_FILE", cls.database)
        cls.patch.start()
        cls.server = ThreadingHTTPServer(("127.0.0.1", 0), sync.Handler)
        cls.thread = threading.Thread(target=cls.server.serve_forever, daemon=True)
        cls.thread.start()

    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown()
        cls.server.server_close()
        cls.thread.join(timeout=5)
        cls.patch.stop()
        cls.temp.cleanup()

    def request(self, method, path, data=None, authorized=False):
        connection = HTTPConnection("127.0.0.1", self.server.server_port, timeout=3)
        headers = {}
        if authorized:
            headers["Authorization"] = "Bearer " + sync.SECRET
        if data is not None:
            headers["Content-Type"] = "application/json"
            data = json.dumps(data)
        connection.request(method, path, body=data, headers=headers)
        response = connection.getresponse()
        result = response.status, json.loads(response.read())
        connection.close()
        return result

    def test_health_has_no_private_data(self):
        status, result = self.request("GET", "/health")
        self.assertEqual(status, 200)
        self.assertFalse(result["sync_enabled"])
        self.assertNotIn("token", result)

    def test_unauthorized_rejected(self):
        self.assertEqual(self.request("GET", "/changes?since=0")[0], 401)
        self.assertEqual(self.request("POST", "/changes", {"changes": []})[0], 401)

    def test_write_read_and_duplicate_idempotence(self):
        item = {"device": "test-phone", "change_id": "unique-change-1", "kind": "tasks",
                "item_id": "task-1", "value": {"text": "Fictive task", "done": False}}
        self.assertEqual(self.request("POST", "/changes", {"changes": [item]}, True)[0], 200)
        self.assertEqual(self.request("POST", "/changes", {"changes": [item]}, True)[0], 200)
        status, result = self.request("GET", "/changes?since=0", authorized=True)
        self.assertEqual(status, 200)
        self.assertEqual(len(result["changes"]), 1)
        self.assertEqual(result["changes"][0]["value"]["text"], "Fictive task")

    def test_invalid_kind_rejected(self):
        bad = {"device": "phone", "change_id": "bad-1", "kind": "passwords",
               "item_id": "item", "value": {}}
        self.assertEqual(self.request("POST", "/changes", {"changes": [bad]}, True)[0], 400)

    def test_invalid_cursor_rejected(self):
        self.assertEqual(self.request("GET", "/changes?since=-1", authorized=True)[0], 400)

if __name__ == "__main__":
    unittest.main()
