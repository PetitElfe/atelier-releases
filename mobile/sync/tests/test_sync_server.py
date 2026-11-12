"""Isolated sync-server regression tests. Never touch Windows Atelier data."""
import http.client
import importlib.util
import json
import os
from pathlib import Path
import tempfile
import threading
import unittest
from unittest.mock import patch

SOURCE = Path(__file__).resolve().parents[1] / "lan_sync_server.py"


class SyncServerTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        import shutil
        shutil.copy2(SOURCE, Path(self.temp.name) / "lan_sync_server.py")
        spec = importlib.util.spec_from_file_location("isolated_sync", Path(self.temp.name) / "lan_sync_server.py")
        self.mod = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(self.mod)
        from http.server import ThreadingHTTPServer
        self.server = ThreadingHTTPServer(("127.0.0.1", 0), self.mod.Handler)
        self.addCleanup(self.server.server_close)
        self.thread = threading.Thread(target=self.server.serve_forever, daemon=True)
        self.thread.start()
        self.addCleanup(self.server.shutdown)

    def request(self, method, path, body=None, auth=None):
        conn = http.client.HTTPConnection("127.0.0.1", self.server.server_port, timeout=3)
        headers = {}
        if auth is not None:
            headers["Authorization"] = "Bearer " + auth
        if body is not None:
            headers["Content-Type"] = "application/json"
            body = json.dumps(body).encode()
        conn.request(method, path, body=body, headers=headers)
        response = conn.getresponse()
        result = response.status, json.loads(response.read())
        conn.close()
        return result

    def test_health_does_not_claim_sync_is_enabled(self):
        code, result = self.request("GET", "/health")
        self.assertEqual(code, 200)
        self.assertIs(result["sync_enabled"], False)

    def test_rejects_unauthenticated_access(self):
        self.assertEqual(self.request("GET", "/changes?since=0")[0], 401)
        self.assertEqual(self.request("POST", "/changes", {"changes": []})[0], 401)

    def test_idempotent_change_log(self):
        change = {"device": "phone-test", "change_id": "one", "kind": "shopping",
                  "item_id": "milk", "value": {"text": "lait", "done": False}}
        body = {"changes": [change]}
        self.assertEqual(self.request("POST", "/changes", body, self.mod.SECRET)[1]["accepted"], 1)
        second = self.request("POST", "/changes", body, self.mod.SECRET)[1]
        self.assertEqual(second["accepted"], 0)
        self.assertEqual(second["duplicates"], 1)
        code, result = self.request("GET", "/changes?since=0", auth=self.mod.SECRET)
        self.assertEqual(code, 200)
        self.assertEqual(len(result["changes"]), 1)
        self.assertEqual(result["changes"][0]["value"]["text"], "lait")

    def test_rejects_invalid_change_and_cursor(self):
        self.assertEqual(self.request("GET", "/changes?since=-1", auth=self.mod.SECRET)[0], 400)
        self.assertEqual(self.request("POST", "/changes", {"changes": [{"kind": "invalid"}]}, self.mod.SECRET)[0], 400)


if __name__ == "__main__":
    unittest.main()
