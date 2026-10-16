"""Regression tests for the additive progression engine.

Run: python -m unittest discover -s tests -p 'test_progression.py'
"""
from datetime import date, timedelta
import importlib.util
from pathlib import Path
import sqlite3
import unittest

MODULE = Path(__file__).resolve().parents[1] / "app" / "progression.py"
spec = importlib.util.spec_from_file_location("progression", MODULE)
progression = importlib.util.module_from_spec(spec)
spec.loader.exec_module(progression)


class ProgressionTests(unittest.TestCase):
    def setUp(self):
        self.db = sqlite3.connect(":memory:")
        self.db.execute("CREATE TABLE legacy_data(id INTEGER PRIMARY KEY, value TEXT)")
        self.db.execute("INSERT INTO legacy_data(value) VALUES ('preserve')")
        progression.initialise(self.db)

    def tearDown(self):
        self.db.close()

    def test_additive_and_idempotent_schema(self):
        progression.initialise(self.db)
        self.assertEqual(self.db.execute("SELECT value FROM legacy_data").fetchone()[0], "preserve")

    def test_duplicate_completion_is_not_rewarded_twice(self):
        first = progression.award(self.db, source_kind="task", source_id=15)
        second = progression.award(self.db, source_kind="task", source_id=15)
        self.assertTrue(first["awarded"])
        self.assertFalse(second["awarded"])
        self.assertEqual(second["xp"], 0)
        self.assertEqual(progression.summary(self.db)["events"], 1)

    def test_distinct_actions_have_diminishing_returns(self):
        values = [
            progression.award(self.db, source_kind="task", source_id=i)["xp"]
            for i in range(8)
        ]
        self.assertEqual(values[:4], [8, 6, 3, 2])
        self.assertTrue(all(value == 2 for value in values[4:]))

    def test_retroactive_limit(self):
        today = date(2026, 10, 16)
        valid = today - timedelta(days=7)
        self.assertTrue(progression.award(
            self.db, source_kind="study", source_id=1,
            earned_on=valid.isoformat(), today=today)["awarded"])
        for invalid in (today - timedelta(days=8), today + timedelta(days=1)):
            with self.assertRaises(ValueError):
                progression.award(self.db, source_kind="study",
                                  source_id=invalid.isoformat(),
                                  earned_on=invalid.isoformat(), today=today)

    def test_unknown_activity_and_empty_id(self):
        with self.assertRaises(ValueError):
            progression.award(self.db, source_kind="unknown", source_id=1)
        with self.assertRaises(ValueError):
            progression.award(self.db, source_kind="task", source_id=" ")

    def test_level_boundaries_and_milestones(self):
        self.assertEqual(progression.level_from_xp(0)["level"], 1)
        self.assertEqual(progression.level_from_xp(99)["level"], 1)
        self.assertEqual(progression.level_from_xp(100)["level"], 2)
        cumulative = sum(progression.level_requirement(i) for i in range(1, 10))
        result = progression.level_from_xp(cumulative)
        self.assertEqual(result["level"], 10)
        self.assertTrue(result["milestone"])

    def test_summary_and_history(self):
        progression.award(self.db, source_kind="objective_step", source_id="42")
        self.assertEqual(progression.summary(self.db)["total_xp"], 18)
        self.assertEqual(progression.history(self.db)[0]["source_id"], "42")
        with self.assertRaises(ValueError):
            progression.history(self.db, 0)


if __name__ == "__main__":
    unittest.main()
