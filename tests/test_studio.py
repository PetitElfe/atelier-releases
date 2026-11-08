import base64
import sqlite3
import sys
import unittest
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'app'))
import studio
import tracker_rituals
from datetime import date

class StudioTests(unittest.TestCase):
 def setUp(self):
  self.c=sqlite3.connect(':memory:');self.c.row_factory=sqlite3.Row;studio.initialise(self.c)
 def tearDown(self):self.c.close()
 def put(self,id,kind,data,rev=0):return studio.save(self.c,{'id':id,'kind':kind,'revision':rev,'data':data},'2026-11-08')
 def test_revision_history_and_conflicting_page_preserve_original(self):
  album=self.put('album','album',{'title':'Test','color':'#abcabc'})
  self.put('page','album-page',{'album_id':'album','title':'Page 1','items':[],'strokes':[]})
  saved=self.put('page','album-page',{'album_id':'album','title':'Page écrite','items':[],'strokes':[]},1)
  with self.assertRaises(LookupError):self.put('page','album-page',{'album_id':'album','title':'Version périmée','items':[],'strokes':[]},1)
  self.assertEqual(studio.objects(self.c,'album-page')[0]['data']['title'],'Page écrite')
  self.assertEqual(self.c.execute('SELECT count(*) FROM studio_history').fetchone()[0],1)
 def test_retry_does_not_create_second_album_and_payload_mismatch_is_refused(self):
  body={'operation_id':'same-operation','action':'save','payload':{'id':'album','kind':'album','revision':0,'data':{'title':'Original'}}}
  first=studio.command(self.c,body,{})
  self.assertEqual(studio.command(self.c,body,{}),first)
  self.assertEqual(len(studio.objects(self.c)),1)
  body['payload']['data']['title']='Another'
  with self.assertRaises(ValueError):studio.command(self.c,body,{})
 def test_asset_dedup_and_page_ownership_survive_sqlite_backup(self):
  content=base64.b64encode(b'\x89PNG\r\n\x1a\n'+b'x'*32).decode()
  a=studio.asset(self.c,{'base64':content},'now');b=studio.asset(self.c,{'base64':content},'now')
  self.assertEqual(a,b);self.put('album','album',{'title':'Photos'})
  self.put('page','album-page',{'album_id':'album','items':[{'type':'photo','asset_id':a['id'],'x':10,'y':20,'width':200,'height':250}],'strokes':[{'size':4,'color':'#123456','points':[[1,2,.1],[10,20,.8]]}]})
  self.c.commit();other=sqlite3.connect(':memory:');self.c.backup(other)
  self.assertEqual(other.execute('SELECT content FROM studio_assets').fetchone()[0],base64.b64decode(content));other.close()
  with self.assertRaises(ValueError):self.put('bad','album-page',{'album_id':'missing','items':[],'strokes':[]})
 def test_pressure_and_unbounded_coordinates_are_refused(self):
  for points in ([[1,2,2]],[[float('nan'),1,.5]],[[-10,1,.5]]):
   with self.assertRaises(ValueError):studio.validate('album-page',{'album_id':'album','strokes':[{'size':3,'points':points}]})
 def test_project_reserves_are_separate_and_cannot_go_negative(self):
  self.put('jar','jar',{'title':'Projet','target_cents':10000})
  self.put('deposit','jar-operation',{'jar_id':'jar','amount_cents':2500})
  with self.assertRaises(ValueError):self.put('too-much','jar-operation',{'jar_id':'jar','amount_cents':-3000})
  self.put('withdrawal','jar-operation',{'jar_id':'jar','amount_cents':-500})
  self.assertEqual(sum(o['data']['amount_cents'] for o in studio.objects(self.c,'jar-operation')),2000)
  self.assertIsNone(self.c.execute("SELECT name FROM sqlite_master WHERE name='budget_entries'").fetchone())
 def test_numeric_counter_retry_is_exactly_once(self):
  self.c.executescript("CREATE TABLE tracker_boards(id INTEGER PRIMARY KEY,archived INTEGER); INSERT INTO tracker_boards VALUES(1,0);CREATE TABLE tracker_board_rows(id INTEGER PRIMARY KEY,board_id INTEGER,archived INTEGER,mode TEXT,weekday INTEGER,target_count INTEGER);INSERT INTO tracker_board_rows VALUES(1,1,0,'number',NULL,10);CREATE TABLE tracker_board_marks(row_id INTEGER,day TEXT,value TEXT,updated_at TEXT,PRIMARY KEY(row_id,day));")
  body={'operation_id':'increment','action':'tracker-mark','payload':{'row_id':1,'day':'2026-11-08','mode':'increment','delta':1}}
  self.assertEqual(studio.command(self.c,body,{})['value'],'1');self.assertEqual(studio.command(self.c,body,{})['value'],'1')
  body['operation_id']='second';self.assertEqual(studio.command(self.c,body,{})['value'],'2')
 def test_increment_preserves_existing_fractional_number_without_goal(self):
  self.c.executescript("CREATE TABLE tracker_boards(id INTEGER PRIMARY KEY,archived INTEGER);INSERT INTO tracker_boards VALUES(1,0);CREATE TABLE tracker_board_rows(id INTEGER PRIMARY KEY,board_id INTEGER,archived INTEGER,mode TEXT,weekday INTEGER,target_count INTEGER);INSERT INTO tracker_board_rows VALUES(1,1,0,'number',NULL,NULL);CREATE TABLE tracker_board_marks(row_id INTEGER,day TEXT,value TEXT,updated_at TEXT,PRIMARY KEY(row_id,day));INSERT INTO tracker_board_marks VALUES(1,'2026-11-08','7.5','old');")
  result=studio.command(self.c,{'operation_id':'fractional-counter','action':'tracker-mark','payload':{'row_id':1,'day':'2026-11-08','mode':'increment'}},{})
  self.assertEqual(result['value'],'8.5')
 def sport_schema(self):
  self.c.executescript("CREATE TABLE tracker_board_rows(id INTEGER PRIMARY KEY,archived INTEGER,mode TEXT,weekday INTEGER,target_count INTEGER);INSERT INTO tracker_board_rows VALUES(1,0,'number',NULL,10);CREATE TABLE tracker_board_marks(row_id INTEGER,day TEXT,value TEXT,updated_at TEXT,PRIMARY KEY(row_id,day));CREATE TABLE tracker_row_steps(id INTEGER PRIMARY KEY,row_id INTEGER,active INTEGER);")
  self.put('exercise','exercise',{'title':'Marche','tracker_row_id':1})
 def test_sports_contributions_retain_manual_baseline_and_undo_independently(self):
  self.sport_schema();self.c.execute("INSERT INTO tracker_board_marks VALUES(1,'2026-11-08','2.5','manual')")
  session={'exercise_id':'exercise','date':'2026-11-08','done':True}
  self.put('session-a','session',session);self.put('session-b','session',session)
  self.assertEqual(self.c.execute('SELECT value FROM tracker_board_marks').fetchone()[0],'4.5')
  self.put('session-a','session',{**session,'done':False},1)
  self.assertEqual(self.c.execute('SELECT value FROM tracker_board_marks').fetchone()[0],'3.5')
  self.put('session-b','session',{**session,'done':False},1)
  self.assertEqual(self.c.execute('SELECT value FROM tracker_board_marks').fetchone()[0],'2.5')
 def test_sports_undo_refuses_to_erase_a_new_manual_change(self):
  self.sport_schema();session={'exercise_id':'exercise','date':'2026-11-08','done':True}
  self.put('session','session',session);self.c.commit()
  self.c.execute("UPDATE tracker_board_marks SET value='8',updated_at='new-manual'");self.c.commit()
  with self.assertRaises(LookupError):
   with self.c:self.put('session','session',{**session,'done':False},1)
  self.assertEqual(self.c.execute('SELECT value FROM tracker_board_marks').fetchone()[0],'8')
  self.assertEqual(studio.objects(self.c,'session')[0]['revision'],1)
 def test_step_progress_uses_only_the_chosen_weekday(self):
  self.c.executescript("CREATE TABLE tracker_boards(id INTEGER PRIMARY KEY,archived INTEGER);INSERT INTO tracker_boards VALUES(1,0);CREATE TABLE tracker_board_rows(id INTEGER PRIMARY KEY,board_id INTEGER,archived INTEGER,mode TEXT,weekday INTEGER);INSERT INTO tracker_board_rows VALUES(1,1,0,'check',NULL);CREATE TABLE tracker_board_marks(row_id INTEGER,day TEXT,value TEXT,updated_at TEXT,PRIMARY KEY(row_id,day));CREATE TABLE tracker_row_steps(id INTEGER PRIMARY KEY,row_id INTEGER,active INTEGER,weekday INTEGER);INSERT INTO tracker_row_steps VALUES(1,1,1,NULL),(2,1,1,0),(3,1,1,1);CREATE TABLE tracker_row_step_checks(step_id INTEGER,day TEXT,PRIMARY KEY(step_id,day));")
  monday='2026-11-09'
  self.assertEqual(tracker_rituals.toggle_step(self.c,1,monday,True,'now')['total'],2)
  self.assertEqual(tracker_rituals.toggle_step(self.c,2,monday,True,'now')['done'],True)
  with self.assertRaises(ValueError):tracker_rituals.toggle_step(self.c,3,monday,True,'now')
  self.assertFalse(tracker_rituals.toggle_step(self.c,1,monday,False,'later')['done'])
 def test_shopping_category_and_price_are_atomic_and_replayed_once(self):
  self.c.executescript("CREATE TABLE shopping_items(id INTEGER PRIMARY KEY,name TEXT,quantity TEXT,purchase_count INTEGER,price REAL,checked INTEGER,archived INTEGER,created_at TEXT,updated_at TEXT);")
  body={'operation_id':'shopping-create','action':'shopping-save','payload':{'name':'Savon','quantity':'boîte','purchase_count':2,'price':1.25,'category':'Hygiène'}}
  first=studio.command(self.c,body,{})
  self.assertEqual(studio.command(self.c,body,{}),first)
  self.assertEqual(self.c.execute('SELECT count(*) FROM shopping_items').fetchone()[0],1)
  self.assertEqual(studio.objects(self.c,'purchase')[0]['data']['category'],'Hygiène')
  self.assertEqual(first['item']['price']*first['item']['purchase_count'],2.5)
 def test_stock_deduction_requires_current_quantity_and_explicit_units(self):
  self.c.executescript("CREATE TABLE food_items(id INTEGER PRIMARY KEY,status TEXT,units_count INTEGER,updated_at TEXT);INSERT INTO food_items VALUES(1,'active',3,'old');")
  body={'operation_id':'meal-deduction','action':'consume-stock','payload':{'food_id':1,'base_units':3,'units':2}}
  studio.command(self.c,body,{});studio.command(self.c,body,{})
  self.assertEqual(self.c.execute('SELECT units_count FROM food_items').fetchone()[0],1)
  body['operation_id']='stale-quantity'
  with self.assertRaises(LookupError):studio.command(self.c,body,{})
 def test_widget_has_only_dated_tasks_and_open_event_occurrences(self):
  day=date.today().isoformat()
  self.c.executescript("CREATE TABLE tasks(title TEXT,due_date TEXT,completed INTEGER,archived INTEGER);CREATE TABLE events(status TEXT);CREATE TABLE event_completions(event_id INTEGER,instance_date TEXT);CREATE TABLE event_instance_actions(event_id INTEGER,instance_date TEXT,action TEXT);CREATE TABLE menstrual_periods(start_date TEXT);")
  self.c.executemany('INSERT INTO tasks VALUES(?,?,0,0)',[('Échéance',day),('Sans date',None)])
  self.c.execute('INSERT INTO event_completions VALUES(2,?)',(day,));self.c.execute("INSERT INTO event_instance_actions VALUES(3,?,'hidden')",(day,))
  events=[{'id':i,'title':'RDV '+str(i),'instance_date':day} for i in (1,2,3)]
  rows,cycle=studio.widget_data(self.c,{'expand_events':lambda *_:events})
  self.assertEqual({r['title'] for r in rows},{'Échéance','RDV 1'})
  self.assertIsNone(cycle)

if __name__=='__main__':unittest.main()
