"""Calendar preparations: series templates, per-date state, migration-safe isolation."""
import sqlite3
import sys
import unittest
from datetime import date
from pathlib import Path

sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'app'))
import event_preparations as prep


class PreparationTests(unittest.TestCase):
    def setUp(self):
        self.c=sqlite3.connect(':memory:')
        self.c.row_factory=sqlite3.Row
        self.c.execute('PRAGMA foreign_keys=ON')
        self.c.executescript("""
        CREATE TABLE events(
          id INTEGER PRIMARY KEY, title TEXT, event_date TEXT,
          recurrence TEXT, start_time TEXT, status TEXT
        );
        CREATE TABLE event_instance_actions(
          event_id INTEGER, instance_date TEXT, action TEXT
        );
        CREATE TABLE event_completions(
          event_id INTEGER, instance_date TEXT
        );
        """)
        prep.initialise(self.c)
        self.c.execute("INSERT INTO events VALUES(1,'Médecin','2026-10-27','weekly','14:00','planned')")
        self.c.execute("INSERT INTO events VALUES(2,'Autre','2026-10-27','none','15:00','planned')")
        self.ts='2026-10-27T09:00:00'

    def tearDown(self):
        self.c.close()

    def test_occurrences_are_independent_and_idempotent(self):
        ids=prep.replace_templates(self.c,1,[{'title':'Dossier'},{'title':'Téléphoner'}],self.ts)
        prep.set_checked(self.c,1,ids[0],'2026-10-27',True,self.ts)
        prep.set_checked(self.c,1,ids[0],'2026-10-27',True,self.ts)
        events=[{'id':1,'event_date':'2026-10-27','instance_date':d}
                for d in ('2026-10-27','2026-11-03')]
        prep.attach(self.c,events)
        self.assertEqual(events[0]['preparations_remaining'],1)
        self.assertEqual(events[1]['preparations_remaining'],2)
        self.assertEqual(self.c.execute('SELECT COUNT(*) FROM event_preparation_checks').fetchone()[0],1)
        prep.set_checked(self.c,1,ids[0],'2026-10-27',False,self.ts)
        self.assertEqual(self.c.execute('SELECT COUNT(*) FROM event_preparation_checks').fetchone()[0],0)

    def test_reject_foreign_item_or_invalid_date(self):
        ids=prep.replace_templates(self.c,1,[{'title':'Carte'}],self.ts)
        with self.assertRaises(LookupError):
            prep.set_checked(self.c,2,ids[0],'2026-10-27',True,self.ts)
        with self.assertRaises(ValueError):
            prep.set_checked(self.c,1,ids[0],'2026-10-28',True,self.ts)
        with self.assertRaises(ValueError):
            prep.replace_templates(self.c,2,[{'id':ids[0],'title':'Usurpation'}],self.ts)

    def test_template_edit_preserves_checks(self):
        ids=prep.replace_templates(self.c,1,[{'title':'Dossier'}],self.ts)
        prep.set_checked(self.c,1,ids[0],'2026-10-27',True,self.ts)
        new=prep.replace_templates(self.c,1,[{'id':ids[0],'title':'Dossier médical'}],self.ts)
        self.assertEqual(new,ids)
        self.assertEqual(self.c.execute('SELECT COUNT(*) FROM event_preparation_checks').fetchone()[0],1)

    def test_clone_postponed_occurrence_keeps_its_checks(self):
        ids=prep.replace_templates(self.c,1,[{'title':'Document'}],self.ts)
        prep.set_checked(self.c,1,ids[0],'2026-10-27',True,self.ts)
        self.c.execute("INSERT INTO events VALUES(3,'Médecin','2026-10-30','none','14:00','planned')")
        prep.copy_to_event(self.c,1,3,'2026-10-27',self.ts)
        prep.copy_to_event(self.c,1,3,'2026-10-27',self.ts)
        target=[{'id':3,'event_date':'2026-10-30','instance_date':'2026-10-30'}]
        prep.attach(self.c,target)
        self.assertEqual(len(target[0]['preparations']),1)
        self.assertTrue(target[0]['preparations'][0]['done'])

    def test_upcoming_counts_only_open_today_and_tomorrow(self):
        ids=prep.replace_templates(self.c,1,[{'title':'Dossier'},{'title':'Carte'}],self.ts)
        prep.set_checked(self.c,1,ids[0],'2026-10-27',True,self.ts)
        self.c.execute("INSERT INTO events VALUES(3,'Demain','2026-10-28','none','09:00','planned')")
        prep.replace_templates(self.c,3,[{'title':'Formulaire'}],self.ts)
        self.c.execute("INSERT INTO event_instance_actions VALUES(3,'2026-10-28','cancelled')")
        def expand(rows,start,end):
            return [{**dict(row),'instance_date':row['event_date']} for row in rows if start<=row['event_date']<=end]
        result=prep.upcoming(self.c,expand,'2026-10-27')
        self.assertEqual(len(result),1)
        self.assertEqual(result[0]['preparations_remaining'],1)
        self.assertEqual(result[0]['id'],1)

    def test_monthly_end_of_month_and_safety_limits(self):
        self.c.execute("INSERT INTO events VALUES(4,'Bilan','2026-01-31','monthly','10:00','planned')")
        ids=prep.replace_templates(self.c,4,[{'title':'Préparer'}],self.ts)
        prep.set_checked(self.c,4,ids[0],'2026-02-28',True,self.ts)
        with self.assertRaises(ValueError):
            prep.set_checked(self.c,4,ids[0],'2026-02-27',True,self.ts)
        with self.assertRaises(ValueError):
            prep.replace_templates(self.c,4,[{'title':'x'}]*31,self.ts)

    def test_closed_occurrence_cannot_be_modified(self):
        ids=prep.replace_templates(self.c,1,[{'title':'Document'}],self.ts)
        self.c.execute("INSERT INTO event_instance_actions VALUES(1,'2026-10-27','postponed')")
        with self.assertRaises(ValueError):
            prep.set_checked(self.c,1,ids[0],'2026-10-27',True,self.ts)


if __name__=='__main__':
    unittest.main()
