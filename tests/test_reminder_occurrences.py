from datetime import datetime
import sqlite3,sys,unittest
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'app'))
import reminder_occurrences as engine

class OccurrenceTests(unittest.TestCase):
 def setUp(self):
  self.c=sqlite3.connect(':memory:');self.c.row_factory=sqlite3.Row
  self.c.executescript('''CREATE TABLE reminders(id INTEGER PRIMARY KEY,entity_type TEXT,entity_id INTEGER,title TEXT,remind_at TEXT,status TEXT,snoozed_until TEXT,created_at TEXT);
   CREATE TABLE events(id INTEGER PRIMARY KEY,title TEXT,event_date TEXT,start_time TEXT,recurrence TEXT,status TEXT,updated_at TEXT);
   CREATE TABLE event_completions(event_id INTEGER,instance_date TEXT,completed_at TEXT,PRIMARY KEY(event_id,instance_date));
   CREATE TABLE event_instance_actions(event_id INTEGER,instance_date TEXT,action TEXT);''')
  self.c.execute("INSERT INTO events VALUES(1,'Rendez-vous','2026-01-31','10:00','monthly','planned','')")
  self.c.execute("INSERT INTO reminders VALUES(1,'event',1,'Préparer','2026-01-30T09:00','pending',NULL,'')")
 def tearDown(self):self.c.close()
 def test_monthly_anchor_and_relative_reminder_survive_short_months(self):
  rows=engine.all_reminders(self.c,datetime(2026,1,31,8))
  feb=next(r for r in rows if r['instance_date']=='2026-02-28');mar=next(r for r in rows if r['instance_date']=='2026-03-31')
  self.assertEqual(feb['remind_at'],'2026-02-27T09:00:00');self.assertEqual(mar['remind_at'],'2026-03-30T09:00:00')
  engine.all_reminders(self.c,datetime(2026,1,31,8));self.assertEqual(self.c.execute('SELECT count(*) FROM reminder_occurrences').fetchone()[0],len(rows))
 def test_finish_only_selected_occurrence_snooze_and_cancel_other_occurrence(self):
  rows=engine.all_reminders(self.c,datetime(2026,1,31,8));jan=next(r for r in rows if r['instance_date']=='2026-01-31');feb=next(r for r in rows if r['instance_date']=='2026-02-28')
  engine.update(self.c,jan['id'],'finish');self.assertEqual(self.c.execute('SELECT status FROM events').fetchone()[0],'planned')
  self.assertEqual(self.c.execute('SELECT instance_date FROM event_completions').fetchone()[0],'2026-01-31')
  engine.update(self.c,feb['id'],'snooze',when='2026-03-01T12:00');again=engine.all_reminders(self.c,datetime(2026,1,31,8));self.assertNotIn(jan['id'],[r['id'] for r in again]);self.assertEqual(next(r for r in again if r['id']==feb['id'])['snoozed_until'],'2026-03-01T12:00')
  engine.update(self.c,feb['id'],'done');self.assertTrue(engine.all_reminders(self.c,datetime(2026,1,31,8)))
 def test_cancelled_or_moved_event_occurrence_does_not_notify(self):
  self.c.execute("INSERT INTO event_instance_actions VALUES(1,'2026-02-28','postponed')")
  rows=engine.all_reminders(self.c,datetime(2026,1,31,8));self.assertNotIn('2026-02-28',[r['instance_date'] for r in rows])
 def test_mobile_action_replay_and_stale_action_refusal(self):
  row=engine.all_reminders(self.c,datetime(2026,1,31,8))[0];body={'operation_id':'mobile-finish-0000001','reminder_id':row['id'],'action':'finish','due_key':row['remind_at']}
  first=engine.mobile_action(self.c,body);self.assertEqual(first,engine.mobile_action(self.c,body));self.assertEqual(self.c.execute('SELECT count(*) FROM event_completions').fetchone()[0],1)
  with self.assertRaises(LookupError):engine.mobile_action(self.c,{**body,'operation_id':'other-device-0000001'})
  with self.assertRaises(ValueError):engine.mobile_action(self.c,{**body,'action':'done'})
 def test_offline_snooze_then_finish_keeps_action_order(self):
  row=engine.all_reminders(self.c,datetime(2026,1,31,8))[0];epoch=int(datetime.fromisoformat(row['remind_at']).timestamp()*1000);later=epoch+600000
  common={'reminder_id':row['id'],'due_key':row['remind_at']}
  engine.mobile_action(self.c,{**common,'operation_id':'offline-snooze-000001','action':'10','expected_epoch_ms':epoch,'snooze_epoch_ms':later})
  engine.mobile_action(self.c,{**common,'operation_id':'offline-finish-000002','action':'finish','expected_epoch_ms':later})
  self.assertEqual(engine.get(self.c,row['id'])['status'],'done')

if __name__=='__main__':unittest.main()
