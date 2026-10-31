"""Vérifie les bilans archivés sans modifier les coches ni des données réelles."""
import sqlite3
import sys
import unittest
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1] / 'app'))
import tracker_rituals


class ArchiveSummaryTests(unittest.TestCase):
    def setUp(self):
        self.c=sqlite3.connect(':memory:')
        self.c.row_factory=sqlite3.Row
        self.c.executescript("""
        CREATE TABLE tracker_board_rows (
          id INTEGER PRIMARY KEY, board_id INTEGER, title TEXT, mode TEXT,
          target_count INTEGER, weekday INTEGER, archived INTEGER DEFAULT 0,
          order_index INTEGER, created_at TEXT
        );
        CREATE TABLE tracker_board_marks(row_id INTEGER,day TEXT,value TEXT);
        """)
        self.board={'id':11,'created_at':'2026-08-02T12:00:00',
                    'updated_at':'2026-10-28T18:00:00'}
        rows=[
            (1,11,'Marche','check',None,None,0,1,'2026-08-02'),
            (2,11,'Poubelles mardi','check',None,1,0,2,'2026-08-02'),
            (3,11,'Sommeil libre','number',None,None,0,3,'2026-08-02'),
            (4,11,'Verres objectif 10','number',10,None,0,4,'2026-09-29'),
            (5,11,'Nouvelle habitude','check',None,None,0,5,'2026-10-01')
        ]
        self.c.executemany(
            "INSERT INTO tracker_board_rows VALUES(?,?,?,?,?,?,?,?,?)",rows)
        self.c.executemany("INSERT INTO tracker_board_marks VALUES(?,?,?)",
            [(1,f'2026-09-{day:02d}','1') for day in range(1,29)]+
            [(2,'2026-09-01','1'),(2,'2026-09-29','1'),
             (3,'2026-09-01','100'),(4,'2026-09-29','10'),
             (4,'2026-09-30','9'),(5,'2026-10-01','1')])
        self.c.commit()

    def tearDown(self):self.c.close()

    def test_previous_full_month_and_day_eligibility(self):
        before=self.c.execute('SELECT count(*) FROM tracker_board_marks').fetchone()[0]
        summary=tracker_rituals.archive_month_summary(self.c,self.board)
        self.assertEqual((summary['start'],summary['end']),
            ('2026-09-01','2026-09-30'))
        self.assertEqual((summary['done'],summary['eligible']),(31,37))
        per_row={r['title']:(r['done'],r['eligible']) for r in summary['rows']}
        self.assertEqual(per_row,{'Marche':(28,30),'Poubelles mardi':(2,5),
                                  'Verres objectif 10':(1,2)})
        self.assertEqual(
            self.c.execute('SELECT count(*) FROM tracker_board_marks').fetchone()[0],
            before,'A summary must not rewrite any historical mark')

    def test_no_prior_month_activity(self):
        board={**self.board,'created_at':'2026-10-01'}
        summary=tracker_rituals.archive_month_summary(self.c,board)
        self.assertEqual((summary['done'],summary['eligible']),(0,0))
        self.assertEqual(summary['rows'],[])


if __name__=='__main__':
    unittest.main()
