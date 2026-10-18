"""Auto-validation regression tests for the 0.18 objective map."""
import importlib.util
from pathlib import Path
import sqlite3
import unittest

BASE = Path(__file__).resolve().parents[1] / "app"
def load(name):
    spec = importlib.util.spec_from_file_location(name, BASE / (name + ".py"))
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module
maps = load("objective_maps")
progression = load("progression")

class AutomaticTests(unittest.TestCase):
    def setUp(self):
        self.db=sqlite3.connect(":memory:")
        self.db.row_factory=sqlite3.Row
        self.db.execute("PRAGMA foreign_keys=ON")
        self.db.executescript("""
        CREATE TABLE objective_nodes (
          id INTEGER PRIMARY KEY, parent_id INTEGER REFERENCES objective_nodes(id),
          node_type TEXT, title TEXT,description TEXT DEFAULT '',
          status TEXT DEFAULT 'active',progress INTEGER DEFAULT 0,
          order_index INTEGER DEFAULT 0, updated_at TEXT DEFAULT ''
        );
        CREATE TABLE tasks (id INTEGER PRIMARY KEY, objective_node_id INTEGER,
          completed INTEGER NOT NULL DEFAULT 0,archived INTEGER NOT NULL DEFAULT 0);
        CREATE TABLE objective_library_sections (id INTEGER PRIMARY KEY,node_id INTEGER);
        CREATE TABLE objective_library_entries (id INTEGER PRIMARY KEY,section_id INTEGER,done INTEGER DEFAULT 0);
        INSERT INTO objective_nodes(id,node_type,title) VALUES (1,'domain','Anglais');
        INSERT INTO objective_nodes(id,parent_id,node_type,title) VALUES
          (2,1,'objective','Début'),(3,2,'step','Vocabulaire'),(4,2,'step','Grammaire');
        """)
        maps.initialise(self.db)
        progression.initialise(self.db)

    def tearDown(self):
        self.db.close()

    def test_empty_task_validation_is_not_completed(self):
        maps.set_validation(self.db,3,"tasks")
        self.assertEqual(maps.reconcile_automatic(self.db,progression,"2026-10-18"),[])
        self.assertEqual(progression.summary(self.db)["total_xp"],0)

    def test_task_validation_is_idempotent(self):
        maps.set_validation(self.db,3,"tasks")
        self.db.executemany("INSERT INTO tasks(id,objective_node_id,completed) VALUES(?,?,?)",
                            [(1,3,1),(2,3,0)])
        self.assertEqual(maps.reconcile_automatic(self.db,progression,"2026-10-18"),[])
        self.db.execute("UPDATE tasks SET completed=1 WHERE id=2")
        self.assertEqual(maps.reconcile_automatic(self.db,progression,"2026-10-18"),[3])
        self.assertEqual(maps.reconcile_automatic(self.db,progression,"2026-10-18"),[])
        self.assertEqual(progression.summary(self.db)["total_xp"],18)

    def test_resource_validation(self):
        maps.set_validation(self.db,4,"resources")
        self.db.execute("INSERT INTO objective_library_sections(id,node_id) VALUES(21,4)")
        self.db.executemany("INSERT INTO objective_library_entries(id,section_id,done) VALUES(?,?,?)",
                            [(1,21,1),(2,21,0)])
        self.assertEqual(maps.reconcile_automatic(self.db,progression,"2026-10-18"),[])
        self.db.execute("UPDATE objective_library_entries SET done=1 WHERE id=2")
        self.assertEqual(maps.reconcile_automatic(self.db,progression,"2026-10-18"),[4])

    def test_unplaced_node_stays_unplaced_when_mode_changes(self):
        maps.set_validation(self.db,3,"tasks")
        node=next(n for n in maps.get_map(self.db,1)["nodes"] if n["id"]==3)
        self.assertIsNone(node["x"])
        self.assertIsNone(node["y"])

if __name__ == "__main__":
    unittest.main()
