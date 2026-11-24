import ast
from datetime import date
from pathlib import Path
import sqlite3
import sys
import unittest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT / 'app'))
import cycle_tracking

tree = ast.parse((ROOT / 'app/app_part1.py').read_text(encoding='utf-8'))
SCHEMA = next(ast.literal_eval(n.value) for n in tree.body if isinstance(n,ast.Assign)
              and any(isinstance(t,ast.Name) and t.id == 'SCHEMA' for t in n.targets))


class ManualCycleTests(unittest.TestCase):
    def setUp(self):
        self.c = sqlite3.connect(':memory:')
        self.c.row_factory = sqlite3.Row
        self.c.executescript(SCHEMA)
        self.today = date(2026,11,24)

    def tearDown(self):
        self.c.close()

    def test_legacy_missing_end_is_not_reinterpreted_as_ongoing(self):
        self.c.execute("INSERT INTO menstrual_periods(start_date,end_date,notes,created_at) VALUES('2026-09-01',NULL,'Existing note','old')")
        cycle_tracking.initialise(self.c)
        cycle_tracking.initialise(self.c)
        row = self.c.execute('SELECT * FROM menstrual_periods').fetchone()
        self.assertEqual((row['start_date'],row['end_date'],row['ongoing'],row['notes']),
                         ('2026-09-01',None,0,'Existing note'))

    def test_manual_start_continues_past_estimated_duration_and_finish_is_explicit(self):
        cycle_tracking.initialise(self.c)
        result = cycle_tracking.start(self.c,{'start_date':'2026-10-01'},self.today)
        self.assertEqual(cycle_tracking.start(self.c,{'start_date':'2026-10-01'},self.today),result)
        self.assertEqual(self.c.execute('SELECT COUNT(*) FROM menstrual_periods').fetchone()[0],1)
        with self.assertRaises(LookupError):
            cycle_tracking.start(self.c,{'start_date':'2026-11-20'},self.today)
        cycle_tracking.finish(self.c,{'id':result['id']},self.today)
        cycle_tracking.finish(self.c,{'id':result['id']},self.today)
        row = self.c.execute('SELECT * FROM menstrual_periods').fetchone()
        self.assertEqual((row['start_date'],row['end_date'],row['ongoing']),('2026-10-01','2026-11-24',0))

    def test_invalid_finish_does_not_close_tracking(self):
        cycle_tracking.initialise(self.c)
        item = cycle_tracking.start(self.c,{'start_date':'2026-11-20'},self.today)
        for value in ('2026-11-19','2026-11-25'):
            with self.assertRaises(ValueError):
                cycle_tracking.finish(self.c,{'id':item['id'],'end_date':value},self.today)
        self.assertEqual(self.c.execute('SELECT ongoing FROM menstrual_periods').fetchone()[0],1)

    def test_day_corrections_do_not_split_period_or_invent_a_start(self):
        cycle_tracking.initialise(self.c)
        item = cycle_tracking.start(self.c,{'start_date':'2026-11-20'},self.today)
        result = cycle_tracking.set_day(self.c,{'day':'2026-11-22','recorded':False,'revision':0},self.today)
        self.assertEqual(result['revision'],1)
        with self.assertRaises(LookupError):
            cycle_tracking.set_day(self.c,{'day':'2026-11-22','recorded':True,'revision':0},self.today)
        replay = cycle_tracking.set_day(self.c,{'day':'2026-11-22','recorded':False,'revision':0},self.today)
        self.assertEqual(replay,result)
        cycle_tracking.set_day(self.c,{'day':'2026-11-22','recorded':True,'revision':1},self.today)
        row = self.c.execute('SELECT * FROM menstrual_periods').fetchone()
        self.assertEqual((row['id'],row['start_date'],row['ongoing']),(item['id'],'2026-11-20',1))
        self.assertEqual(self.c.execute('SELECT COUNT(*) FROM menstrual_periods').fetchone()[0],1)
        with self.assertRaises(ValueError):
            cycle_tracking.set_day(self.c,{'day':'2026-11-25','recorded':True,'revision':0},self.today)


if __name__ == '__main__':
    unittest.main()
