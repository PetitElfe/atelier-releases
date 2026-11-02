"""0.18 restore rehearsal on an isolated database copy.

Uses SQLite's online backup API, never a user's live data. This tests that
new map and progression tables survive a round-trip together with legacy
library content and that SQLite foreign keys stay valid.
"""
import importlib.util
from pathlib import Path
import sqlite3
import tempfile
import unittest

BASE = Path(__file__).resolve().parents[1] / "app"
def load(name):
    spec = importlib.util.spec_from_file_location(name, BASE / (name + ".py"))
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module

maps = load("objective_maps")
progression = load("progression")


class RestoreRehearsal(unittest.TestCase):
    def test_backup_round_trip_keeps_legacy_and_new_content(self):
        with tempfile.TemporaryDirectory(prefix="atelier-test-restore-") as temp:
            paths = [Path(temp) / x for x in ("original.db", "backup.db", "restored.db")]
            with sqlite3.connect(paths[0]) as source:
                source.row_factory = sqlite3.Row
                source.execute("PRAGMA foreign_keys=ON")
                source.executescript("""
                    CREATE TABLE objective_nodes (
                      id INTEGER PRIMARY KEY,parent_id INTEGER REFERENCES objective_nodes(id) ON DELETE CASCADE,
                      node_type TEXT,title TEXT,description TEXT DEFAULT '',status TEXT DEFAULT 'active',
                      progress INTEGER DEFAULT 0,order_index INTEGER DEFAULT 0,updated_at TEXT DEFAULT '');
                    CREATE TABLE objective_library_sections (
                      id INTEGER PRIMARY KEY,node_id INTEGER REFERENCES objective_nodes(id));
                    CREATE TABLE objective_library_entries (
                      id INTEGER PRIMARY KEY,section_id INTEGER REFERENCES objective_library_sections(id),
                      title TEXT,notes TEXT,done INTEGER DEFAULT 0);
                    INSERT INTO objective_nodes(id,node_type,title) VALUES(1,'domain','Anglais');
                    INSERT INTO objective_nodes(id,parent_id,node_type,title) VALUES(2,1,'step','Premier niveau');
                    INSERT INTO objective_library_sections(id,node_id) VALUES(3,2);
                    INSERT INTO objective_library_entries(id,section_id,title,notes)
                    VALUES(4,3,'Page existante','Ne pas effacer ces notes');
                """)
                maps.initialise(source)
                progression.initialise(source)
                maps.set_position(source,2,160.5,-14)
                progression.award(source,source_kind="objective_step",source_id=2)
                source.commit()
                with sqlite3.connect(paths[1]) as backup:
                    source.backup(backup)
            # Simulate restoration to a separate path rather than overwriting
            # the source: user data is not changed by this rehearsal.
            with sqlite3.connect(paths[1]) as backup, sqlite3.connect(paths[2]) as restored:
                backup.backup(restored)
                restored.row_factory = sqlite3.Row
                restored.execute("PRAGMA foreign_keys=ON")
                self.assertEqual(restored.execute("PRAGMA integrity_check").fetchone()[0],"ok")
                self.assertEqual(restored.execute("PRAGMA foreign_key_check").fetchall(),[])
                note=restored.execute("SELECT notes FROM objective_library_entries WHERE id=4").fetchone()[0]
                self.assertEqual(note,"Ne pas effacer ces notes")
                self.assertEqual(maps.get_map(restored,1)["nodes"][0]["x"],160.5)
                self.assertEqual(progression.summary(restored)["events"],1)
                maps.initialise(restored)
                progression.initialise(restored)
                self.assertEqual(progression.summary(restored)["events"],1)


if __name__ == "__main__": unittest.main()
