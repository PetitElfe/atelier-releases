import sqlite3,sys,unittest
from pathlib import Path
from datetime import date
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'app'))
import tracker_schedule as schedule
import studio

class ScheduleTests(unittest.TestCase):
 def setUp(self):
  self.c=sqlite3.connect(':memory:');self.c.row_factory=sqlite3.Row
  self.c.executescript('CREATE TABLE tracker_board_rows(id INTEGER PRIMARY KEY,weekday INTEGER);INSERT INTO tracker_board_rows VALUES(1,NULL);')
  schedule.initialise(self.c)
 def tearDown(self):self.c.close()
 def row(self):return self.c.execute('SELECT * FROM tracker_board_rows WHERE id=1').fetchone()
 def test_two_days_and_anchored_alternate_weeks_cross_year(self):
  schedule.save(self.c,1,{'weekdays':[1,5],'interval_weeks':2,'anchor_monday':'2026-12-30'})
  self.assertEqual(schedule.read(self.c,self.row())['anchor_monday'],'2026-12-28')
  for day,expected in [('2026-12-29',True),('2027-01-02',True),('2027-01-05',False),('2027-01-09',False),('2027-01-12',True),('2027-01-13',False)]:self.assertEqual(schedule.applies(self.c,self.row(),date.fromisoformat(day)),expected,day)
 def test_validation_and_copy_preserve_schedule(self):
  for value in [[],[1,1],[True],[8],['1']]:
   with self.assertRaises(ValueError):schedule.validate({'weekdays':value})
  schedule.save(self.c,1,{'weekdays':[1,5],'interval_weeks':2,'anchor_monday':'2026-11-09'})
  self.c.execute('INSERT INTO tracker_board_rows VALUES(2,NULL)');schedule.copy(self.c,1,2)
  self.assertEqual(schedule.read(self.c,self.row()),schedule.read(self.c,self.c.execute('SELECT * FROM tracker_board_rows WHERE id=2').fetchone()))
 def test_legacy_weekday_and_legacy_substep_edit_preserve_multiple_days(self):
  self.c.execute('UPDATE tracker_board_rows SET weekday=1')
  self.assertEqual(schedule.read(self.c,self.row())['weekdays'],[1])
  schedule.save(self.c,1,{'weekdays':[1,5],'interval_weeks':2,'anchor_monday':'2026-11-09'})
  before=self.row();schedule.save(self.c,1,{'weekday':None},before)
  self.assertEqual(schedule.read(self.c,self.row())['weekdays'],[1,5])
