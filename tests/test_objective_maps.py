"""Objective map storage and graph invariants (independent in-memory database)."""
import importlib.util
from pathlib import Path
import sqlite3
import unittest

path = Path(__file__).resolve().parents[1] / "app" / "objective_maps.py"
spec = importlib.util.spec_from_file_location("objective_maps", path)
maps = importlib.util.module_from_spec(spec)
spec.loader.exec_module(maps)


class MapTests(unittest.TestCase):
    def setUp(self):
        self.db=sqlite3.connect(":memory:")
        self.db.row_factory=sqlite3.Row
        self.db.execute("PRAGMA foreign_keys=ON")
        self.db.executescript("""
          CREATE TABLE objective_nodes (
             id INTEGER PRIMARY KEY, parent_id INTEGER REFERENCES objective_nodes(id),
             node_type TEXT, title TEXT, description TEXT DEFAULT '',
             status TEXT DEFAULT 'active', progress INTEGER DEFAULT 0,
             order_index INTEGER DEFAULT 0
          );
          INSERT INTO objective_nodes(id,node_type,title) VALUES (1,'domain','Anglais'),(10,'domain','Dessins');
          INSERT INTO objective_nodes(id,parent_id,node_type,title) VALUES
             (2,1,'objective','Début'),(3,2,'step','Vocabulaire'),
             (4,2,'step','Grammaire'),(11,10,'step','Croquis');
        """)
        maps.initialise(self.db)

    def tearDown(self):
        self.db.close()

    def test_additive_and_idempotent(self):
        maps.initialise(self.db)
        self.assertEqual(self.db.execute("SELECT COUNT(*) FROM objective_nodes").fetchone()[0],5)

    def test_map_is_scoped_to_domain(self):
        g=maps.get_map(self.db,1)
        self.assertEqual({n["id"] for n in g["nodes"]},{2,3,4})
        self.assertEqual(g["edges"],[])

    def test_layout_and_validation(self):
        maps.set_position(self.db,3,23.5,-50.0)
        maps.set_validation(self.db,3,"resources")
        maps.set_ordering(self.db,1,"sequential")
        g=maps.get_map(self.db,1)
        node=next(n for n in g["nodes"] if n["id"]==3)
        self.assertEqual((node["x"],node["y"],node["validation_mode"]),(23.5,-50.0,"resources"))
        self.assertEqual(g["ordering"],"sequential")

    def test_bad_coordinates_and_modes(self):
        for bad in (float("nan"),float("inf"),100001):
            with self.assertRaises(ValueError): maps.set_position(self.db,3,bad,0)
        with self.assertRaises(ValueError): maps.set_validation(self.db,1,"tasks")
        with self.assertRaises(ValueError): maps.set_validation(self.db,3,"random")

    def test_edges_and_cycle_prevention(self):
        maps.add_edge(self.db,2,3)
        maps.add_edge(self.db,3,4)
        with self.assertRaises(ValueError): maps.add_edge(self.db,4,2)
        with self.assertRaises(ValueError): maps.add_edge(self.db,3,11)
        with self.assertRaises(ValueError): maps.add_edge(self.db,3,3)
        maps.add_edge(self.db,2,3)
        self.assertEqual(len(maps.get_map(self.db,1)["edges"]),2)
        maps.remove_edge(self.db,3,4)
        self.assertEqual(len(maps.get_map(self.db,1)["edges"]),1)


if __name__ == "__main__": unittest.main()
