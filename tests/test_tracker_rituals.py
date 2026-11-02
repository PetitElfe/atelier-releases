"""Pure SQLite regression: 28/30 September archive and fixed weekday denominator."""
import sqlite3
import sys
import unittest
from datetime import date
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]/'app'))
import tracker_rituals


class RitualArchiveTests(unittest.TestCase):
    def setUp(self):
        self.c=sqlite3.connect(':memory:')
        self.c.row_factory=sqlite3.Row
        self.c.executescript('''
            CREATE TABLE tracker_boards(
              id INTEGER PRIMARY KEY,title TEXT,color TEXT,period_unit TEXT,
              period_count INTEGER,archived INTEGER,created_at TEXT
            );
            CREATE TABLE tracker_board_rows(
              id INTEGER PRIMARY KEY,board_id INTEGER,title TEXT,mode TEXT,
              target_count INTEGER,weekday INTEGER,order_index INTEGER,archived INTEGER
            );
            CREATE TABLE tracker_board_marks(row_id INTEGER,day TEXT,value TEXT);
            INSERT INTO tracker_boards VALUES(1,'Habitudes','sage','months',1,0,'2026-09-01T10:00:00');
            INSERT INTO tracker_board_rows VALUES(1,1,'Se lever', 'check',NULL,NULL,1,0);
            INSERT INTO tracker_board_rows VALUES(2,1,'Boire 10 verres','number',10,NULL,2,0);
            INSERT INTO tracker_board_rows VALUES(3,1,'Poubelles mardi','check',NULL,1,3,0);
        ''')
    def tearDown(self):
        self.c.close()

    def test_month_completed_as_28_of_30_for_one_ritual(self):
        for d in range(1,29):
            self.c.execute('INSERT INTO tracker_board_marks VALUES(?,?,?)',
                           (1,f'2026-09-{d:02d}','1'))
        archive=tracker_rituals.monthly_archive(self.c,date(2026,10,1))
        sept=next(x for x in archive if x['month']=='2026-09')
        rit=next(x for x in sept['rows'] if x['title']=='Se lever')
        self.assertEqual((rit['completed'],rit['total']),(28,30))
        self.assertEqual(len(archive),1)
        self.assertEqual(tracker_rituals.monthly_archive(self.c,date(2026,9,15)),[])

    def test_count_goal_only_completes_at_threshold(self):
        self.c.execute('INSERT INTO tracker_board_marks VALUES(2,?,?)',('2026-09-01','9'))
        self.c.execute('INSERT INTO tracker_board_marks VALUES(2,?,?)',('2026-09-02','10'))
        for _ in [1]:
            sept=tracker_rituals.monthly_archive(self.c,date(2026,10,1))[0]
            counter=next(x for x in sept['rows'] if x['title']=='Boire 10 verres')
            self.assertEqual((counter['completed'],counter['total']),(1,30))

    def test_weekday_only_counts_tuesday(self):
        for d in (1,8,15,22,29):
            self.c.execute('INSERT INTO tracker_board_marks VALUES(3,?,?)',
                           (f'2026-09-{d:02d}','1'))
        sept=tracker_rituals.monthly_archive(self.c,date(2026,10,1))[0]
        weekly=next(x for x in sept['rows'] if x['title']=='Poubelles mardi')
        self.assertEqual((weekly['completed'],weekly['total']),(5,5))

    def test_legacy_number_without_target_is_not_false_complete(self):
        self.c.execute('UPDATE tracker_board_rows SET target_count=NULL WHERE id=2')
        self.c.execute('INSERT INTO tracker_board_marks VALUES(2,?,?)',('2026-09-02','5'))
        sep=tracker_rituals.monthly_archive(self.c,date(2026,10,1))[0]
        self.assertFalse(any(x['title']=='Boire 10 verres' for x in sep['rows']))


if __name__=='__main__':
    unittest.main()
