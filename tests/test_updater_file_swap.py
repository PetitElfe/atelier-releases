"""Regression tests for Windows-safe in-place updates and complete code rollback."""
import hashlib
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "app"))
import updater


def digest(content):
    return hashlib.sha256(content).hexdigest()


class InPlaceUpdaterTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        root = Path(self.temp.name)
        self.code = root / "code"
        self.stage = root / "stage"
        self.backup = root / "backup"
        for folder in (self.code / "app", self.stage / "app", self.backup):
            folder.mkdir(parents=True)
        (self.code / "app" / "a.py").write_bytes(b"old application")
        (self.code / "app" / "unrelated.txt").write_bytes(b"leave me alone")
        (self.code / "manifest.json").write_bytes(b"old manifest")
        (self.stage / "app" / "a.py").write_bytes(b"new application")
        (self.stage / "app" / "new.py").write_bytes(b"new module")
        (self.stage / "manifest.json").write_bytes(b"new manifest")
        self.entries = [
            {"path": "a.py", "sha256": digest(b"new application")},
            {"path": "new.py", "sha256": digest(b"new module")},
        ]
        code_patch = patch.object(updater, "CODE", self.code)
        code_patch.start()
        self.addCleanup(code_patch.stop)

    def install(self, applied):
        with patch.object(updater, "_manifest", return_value={"files": self.entries}):
            updater._install_staged(self.stage, self.backup, applied)

    def test_upgrade_preserves_directory_and_rollback_restores_original(self):
        applied = []
        self.install(applied)
        self.assertEqual(self.code.name, "code")
        self.assertTrue(self.code.is_dir())
        self.assertEqual((self.code / "app" / "a.py").read_bytes(), b"new application")
        self.assertEqual((self.code / "app" / "new.py").read_bytes(), b"new module")
        self.assertEqual((self.code / "manifest.json").read_bytes(), b"new manifest")
        self.assertEqual(applied[-1], Path("manifest.json"))
        self.assertEqual((self.backup / "code_avant" / "app" / "a.py").read_bytes(),
                         b"old application")
        updater._rollback_code(self.backup, applied)
        self.assertEqual((self.code / "app" / "a.py").read_bytes(), b"old application")
        self.assertFalse((self.code / "app" / "new.py").exists())
        self.assertEqual((self.code / "manifest.json").read_bytes(), b"old manifest")
        self.assertEqual((self.code / "app" / "unrelated.txt").read_bytes(),
                         b"leave me alone")

    def test_failure_after_first_file_restores_original_without_touching_data(self):
        applied = []
        original = updater._atomic_copy

        def fail_second_file(source, target):
            if target.name == "new.py":
                raise PermissionError("simulated Windows file lock")
            return original(source, target)

        with patch.object(updater, "_atomic_copy", side_effect=fail_second_file):
            with self.assertRaises(PermissionError):
                self.install(applied)
        self.assertEqual((self.code / "app" / "a.py").read_bytes(), b"new application")
        updater._rollback_code(self.backup, applied)
        self.assertEqual((self.code / "app" / "a.py").read_bytes(), b"old application")
        self.assertFalse((self.code / "app" / "new.py").exists())
        self.assertEqual((self.code / "manifest.json").read_bytes(), b"old manifest")

    def test_invalid_staged_checksum_never_modifies_live_code(self):
        self.entries[0]["sha256"] = "0" * 64
        applied = []
        with self.assertRaisesRegex(RuntimeError, "Fichier préparé invalide"):
            self.install(applied)
        self.assertEqual(applied, [])
        self.assertEqual((self.code / "app" / "a.py").read_bytes(), b"old application")
        self.assertEqual((self.code / "manifest.json").read_bytes(), b"old manifest")


if __name__ == "__main__":
    unittest.main()
