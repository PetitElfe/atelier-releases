import json,sqlite3,tempfile,unittest,sys,uuid,io
from pathlib import Path
from unittest.mock import patch
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'app'))
import admin_workspace as A
class AdministrativeWorkspaceTests(unittest.TestCase):
 def setUp(self):
  self.tmp=tempfile.TemporaryDirectory();self.root=Path(self.tmp.name);self.c=sqlite3.connect(':memory:');self.c.row_factory=sqlite3.Row
  self.c.executescript('''PRAGMA foreign_keys=ON;CREATE TABLE admin_documents(id INTEGER PRIMARY KEY,title TEXT,category TEXT,archived INTEGER DEFAULT 0);INSERT INTO admin_documents VALUES(1,'Dossier santé','Santé',0);
  CREATE TABLE tasks(id INTEGER PRIMARY KEY,title TEXT,due_date TEXT,due_time TEXT,notes TEXT DEFAULT '',completed INTEGER DEFAULT 0,archived INTEGER DEFAULT 0,important INTEGER DEFAULT 0,order_index INTEGER DEFAULT 0,created_at TEXT,updated_at TEXT);
  CREATE TABLE reminders(id INTEGER PRIMARY KEY,entity_type TEXT,entity_id INTEGER,title TEXT,remind_at TEXT,status TEXT,created_at TEXT);''');A.initialise(self.c)
 def tearDown(self):self.c.close();self.tmp.cleanup()
 def task(self,**kw):
  value={'title':'Mail Mission locale','admin_id':1,'due_date':'2026-11-17','start_date':'2026-11-15','rhythm':'weekly','links':['https://example.org/contact','contact@example.org'],'important':True};value.update(kw);return A.save_action(self.c,value)['task_id']
 def test_weekly_completion_from_regular_tasks_creates_one_next_occurrence(self):
  identity=self.task(remind_at='2026-11-15T10:00');self.c.execute('UPDATE tasks SET completed=1 WHERE id=?',(identity,));A.task_saved(self.c,identity);A.task_saved(self.c,identity)
  self.assertEqual(self.c.execute('SELECT COUNT(*) FROM tasks').fetchone()[0],2)
  next_task=self.c.execute('SELECT t.*,a.start_date,a.links_json FROM tasks t JOIN admin_action_details a ON a.task_id=t.id WHERE t.id!=?',(identity,)).fetchone();self.assertEqual(next_task['due_date'],'2026-11-24');self.assertEqual(next_task['start_date'],'2026-11-22');self.assertEqual(next_task['important'],1);self.assertIn('mailto:contact@example.org',next_task['links_json'])
  self.assertEqual(self.c.execute('SELECT remind_at FROM reminders WHERE entity_id=?',(next_task['id'],)).fetchone()[0],'2026-11-22T10:00:00')
 def test_states_revisions_and_month_end_anchor(self):
  identity=self.task(due_date='2027-01-31',start_date='2027-01-25',rhythm='monthly');item=A.snapshot(self.c)['actions'][0]
  A.save_action(self.c,{**item,'task_id':identity,'state':'doing','important':bool(item['important'])});self.assertEqual(A.snapshot(self.c)['actions'][0]['state'],'doing')
  with self.assertRaises(LookupError):A.save_action(self.c,{**item,'task_id':identity,'state':'done','important':True})
  self.assertEqual(A.next_date('2027-01-31','monthly',31),'2027-02-28');self.assertEqual(A.next_date('2027-02-28','monthly',31),'2027-03-31');self.assertEqual(A.next_date('2026-11-17','fortnightly',17),'2026-12-01')
 def test_invalid_dates_and_links_fail_without_modifying_tasks(self):
  for values in ({'due_date':'2026-02-30'},{'start_date':'2027-01-01'},{'links':['javascript:alert(1)']},{'links':['mailto:a@example.org?body=hidden']},{'links':['https://user:secret@example.org']}):
   with self.assertRaises(ValueError):self.task(**values)
  self.assertEqual(self.c.execute('SELECT count(*) FROM tasks').fetchone()[0],0)
 def test_template_copy_keeps_original_and_never_overwrites_or_duplicates_retry(self):
  source=self.root/'vierge.pdf';source.write_bytes(b'%PDF-fixture-original');(self.root/'admin-workspace.json').write_text(json.dumps({'root':str(self.root)}))
  A.native(self.c,self.root,{'action':'register','path':'vierge.pdf','kind':'template'});identity=self.c.execute('SELECT id FROM admin_local_files').fetchone()[0];operation=str(uuid.uuid4());body={'action':'copy','file_id':identity,'admin_id':1,'date':'2026-11-13','type':'FORMULAIRE','subject':'Suivi','professional':'Dr Nom','operation_id':operation}
  first=A.native(self.c,self.root,body);self.assertEqual(A.native(self.c,self.root,body),first);second=A.native(self.c,self.root,{**body,'operation_id':str(uuid.uuid4())});self.assertNotEqual(first['path'],second['path']);self.assertEqual(source.read_bytes(),b'%PDF-fixture-original');self.assertTrue(first['path'].endswith('2026-11-13_FORMULAIRE_Suivi_Dr_Nom.pdf'));self.assertEqual((self.root/first['path']).read_bytes(),source.read_bytes());self.assertIn('file_id',first)
  with patch.object(A.os,'startfile',create=True) as opened:A.native(self.c,self.root,{'action':'open','file_id':first['file_id']});opened.assert_called_once_with(self.root/first['path'])
 def test_safe_folder_references_and_metadata_only_listing(self):
  (self.root/'original.docx').write_bytes(b'PK-fixture');self.assertEqual(A.list_files(self.root),[{'path':'original.docx','name':'original.docx'}]);self.assertEqual(A.within(self.root,'original.docx'),self.root/'original.docx')
  for value in ('../outside.docx',str(self.root/'original.docx')):
   with self.assertRaises(ValueError):A.within(self.root,value)
  self.assertEqual(A.component('CON'),'_CON');self.assertNotIn('/',A.component('a/b'))
 def test_native_route_rejects_remote_before_reading_root(self):
  class Handler:
   headers={'Host':'remote.ts.net','Origin':'https://remote.ts.net','Content-Length':'20','X-Atelier-Documents':'1'}
   def _body(self):return {'action':'open-root'}
   def _json(self,value,status=200):self.result=(value,status)
  # A real SQLite fixture for the HTTP route: no access to a user's G: drive.
  db=self.root/'fixture.db';disk=sqlite3.connect(db);disk.close();h=Handler()
  with patch.object(A,'root',side_effect=AssertionError('Must not inspect private root')):A.serve(h,'POST','/api/admin-workspace/native',self.root,db,8876)
  self.assertEqual(h.result[1],403)

 def test_one_physical_document_can_be_linked_to_two_dossiers(self):
  (self.root/'report.pdf').write_bytes(b'%PDF-fixture');(self.root/'admin-workspace.json').write_text(json.dumps({'root':str(self.root)}));self.c.execute("INSERT INTO admin_documents VALUES(2,'Dossier emploi','Emploi',0)")
  for owner in (1,2):A.native(self.c,self.root,{'action':'register','path':'report.pdf','kind':'document','admin_id':owner})
  files=A.snapshot(self.c)['files'];self.assertEqual(len(files),1);self.assertEqual(files[0]['admin_ids'],[1,2]);self.assertEqual(len(list(self.root.glob('*.pdf'))),1)
