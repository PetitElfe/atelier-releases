import base64
import sqlite3
import sys
import unittest
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'app'))
import studio

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

if __name__=='__main__':unittest.main()
