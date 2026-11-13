"""Tests the pre-install backup on throwaway files, never live user data."""
import sys as _sys
from pathlib import Path as _Path
_sys.path.insert(0,str(_Path(__file__).resolve().parents[1]/'app'))
from sqlite_context import connect as managed_sqlite_connect
import importlib.util
from pathlib import Path
import json
import sqlite3
import tempfile
import unittest

module_path = Path(__file__).resolve().parents[1] / "tools" / "preinstall_backup.py"
spec = importlib.util.spec_from_file_location("preinstall_backup", module_path)
tool = importlib.util.module_from_spec(spec)
spec.loader.exec_module(tool)


class BackupTests(unittest.TestCase):
    def test_copies_and_verifies_without_touching_source(self):
        with tempfile.TemporaryDirectory() as tmp:
            base = Path(tmp)
            root, destination = base / "installed", base / "protected_copy"
            (root / "data").mkdir(parents=True)
            (root / "user").mkdir()
            (root / "user" / "notes.txt").write_text("Mes carnets", encoding="utf-8")
            dbpath = root / "data" / "atelier.db"
            with managed_sqlite_connect(dbpath) as db:
                db.execute("CREATE TABLE memories (value TEXT)")
                db.execute("INSERT INTO memories VALUES ('important')")
            report = tool.backup(root, destination, check_port=False)
            self.assertTrue(report["verified"])
            self.assertFalse(report["browser_local_storage_backed_up"])
            self.assertEqual(report["file_count"], 2)
            self.assertEqual((destination / "user" / "notes.txt").read_text(encoding="utf-8"), "Mes carnets")
            with managed_sqlite_connect(destination / "data" / "atelier.db") as copied:
                self.assertEqual(copied.execute("SELECT value FROM memories").fetchone()[0], "important")
            saved = json.loads((destination / "verification.json").read_text(encoding="utf-8"))
            self.assertEqual(saved["files_sha256"]["user/notes.txt"], tool.digest(root / "user" / "notes.txt"))
            with self.assertRaises(FileExistsError):
                tool.backup(root, destination, check_port=False)

    def test_refuses_backup_nested_inside_source(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            (root / "data").mkdir()
            (root / "user").mkdir()
            with self.assertRaises(ValueError):
                tool.backup(root, root / "nested", check_port=False)
            self.assertFalse((root / "nested").exists())


if __name__ == "__main__":
    unittest.main()
