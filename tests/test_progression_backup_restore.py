"""Offline recovery rehearsal on disposable SQLite data. Never touches user files."""
from __future__ import annotations
import importlib.util
import sqlite3
import tempfile
import unittest
from pathlib import Path

APP = Path(__file__).resolve().parents[1] / "app"


def load(name):
    spec = importlib.util.spec_from_file_location(name, APP / (name + ".py"))
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


maps = load("objective_maps")
progression = load("progression")


class BackupRestoreTests(unittest.TestCase):
    def test_backup_can_restore_original_and_new_tables(self):
        with tempfile.TemporaryDirectory(prefix="atelier-backup-check-") as tmp:
            live = Path(tmp) / "working.db"
            backup = Path(tmp) / "backup.db"
            restored = Path(tmp) / "restored.db"
            with sqlite3.connect(live) as db:
                db.row_factory = sqlite3.Row
                db.execute("PRAGMA foreign_keys=ON")
                db.executescript("""
                    CREATE TABLE objective_nodes (
                        id INTEGER PRIMARY KEY, parent_id INTEGER REFERENCES objective_nodes(id),
                        node_type TEXT, title TEXT, description TEXT DEFAULT '',
                        status TEXT DEFAULT 'active', progress INTEGER DEFAULT 0,
                        order_index INTEGER DEFAULT 0, updated_at TEXT DEFAULT ''
                    );
                    CREATE TABLE tasks(id INTEGER PRIMARY KEY, objective_node_id INTEGER,
                                       completed INTEGER NOT NULL DEFAULT 0,
                                       archived INTEGER NOT NULL DEFAULT 0);
                    CREATE TABLE objective_library_sections (id INTEGER PRIMARY KEY,node_id INTEGER);
                    CREATE TABLE objective_library_entries (id INTEGER PRIMARY KEY,section_id INTEGER,done INTEGER DEFAULT 0);
                    INSERT INTO objective_nodes(id,node_type,title) VALUES (1,'domain','Préservé');
                    INSERT INTO objective_nodes(id,parent_id,node_type,title) VALUES (2,1,'step','Étape personnelle');
                    INSERT INTO objective_library_sections(id,node_id) VALUES (10,1);
                    INSERT INTO objective_library_entries(id,section_id,done) VALUES(12,10,0);
                """)
                maps.initialise(db)
                progression.initialise(db)
                maps.set_position(db, 2, 218.5, 62.0)
                progression.award(db,source_kind="task",source_id=42)
                db.commit()
                with sqlite3.connect(backup) as destination:
                    db.backup(destination)

            with sqlite3.connect(backup) as source, sqlite3.connect(restored) as destination:
                source.backup(destination)

            with sqlite3.connect(restored) as db:
                db.row_factory = sqlite3.Row
                db.execute("PRAGMA foreign_keys=ON")
                self.assertEqual(db.execute("PRAGMA integrity_check").fetchone()[0], "ok")
                self.assertEqual(db.execute("PRAGMA foreign_key_check").fetchall(), [])
                self.assertEqual(db.execute("SELECT title FROM objective_nodes WHERE id=2").fetchone()[0], "Étape personnelle")
                self.assertEqual(db.execute("SELECT COUNT(*) FROM objective_library_entries").fetchone()[0], 1)
                point = maps.get_map(db,1)["nodes"][0]
                self.assertEqual((point["x"],point["y"]),(218.5,62))
                self.assertEqual(progression.summary(db)["total_xp"],8)


if __name__ == "__main__":
    unittest.main()
