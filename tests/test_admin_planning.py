import json,sys,unittest
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'app'))
import test_admin_workspace as Fixtures
import admin_workspace as A,admin_planning as P
class PlanningTests(unittest.TestCase):
 setUp=Fixtures.AdministrativeWorkspaceTests.setUp
 tearDown=Fixtures.AdministrativeWorkspaceTests.tearDown
 def fixture(self):
  for name,definition in [('due_date','TEXT'),('status',"TEXT DEFAULT 'todo'"),('notes',"TEXT DEFAULT ''"),('created_at','TEXT'),('updated_at','TEXT')]:self.c.execute('ALTER TABLE admin_documents ADD COLUMN '+name+' '+definition)
  self.c.commit()
 def case(self,**values):
  body={'title':'Mail Mission locale','category':'Emploi','rhythm':'weekly','important':True,'links':['https://example.org/contact'],'lead_days':2,'schedule':{'starts_on':'2026-11-13','ends_on':'2026-11-21','weekdays':[1,5]}}
  body.update(values);return P.command(self.c,'/api/admin-workspace/dossier',body,A)
 def test_weekdays_first_date_next_selected_day_and_end_bound(self):
  self.fixture();case=self.case();expected=['2026-11-14','2026-11-17','2026-11-21']
  for day in expected:
   task=next(x for x in A.snapshot(self.c)['actions'] if not x['completed']);self.assertEqual(task['due_date'],day)
   P.command(self.c,'/api/admin-workspace/case-state',{'admin_id':case['admin_id'],'state':'done'},A)
  self.assertEqual(len(A.snapshot(self.c)['actions']),3);self.assertEqual(self.c.execute('SELECT status FROM admin_documents WHERE id=?',(case['admin_id'],)).fetchone()[0],'done')
 def test_fortnightly_multiple_days_preserves_on_week_parity(self):
  self.fixture();plan={'starts_on':'2026-11-09','ends_on':None,'weekdays':[1,5]}
  self.assertEqual(P.next_weekday(P.date(2026,11,10),'fortnightly',plan),'2026-11-14');self.assertEqual(P.next_weekday(P.date(2026,11,14),'fortnightly',plan),'2026-11-24')
 def test_classers_can_exist_empty_rename_move_and_refuse_nonempty_delete(self):
  self.fixture();P.command(self.c,'/api/admin-workspace/classer',{'name':'Mutuelle'},A);self.assertIn('Mutuelle',A.snapshot(self.c)['classers'])
  with self.assertRaises(ValueError):P.command(self.c,'/api/admin-workspace/classer',{'name':'mutuelle'},A)
  P.command(self.c,'/api/admin-workspace/classer',{'action':'rename','name':'Santé','new_name':'Soins'},A);self.assertEqual(self.c.execute('SELECT category FROM admin_documents WHERE id=1').fetchone()[0],'Soins')
  with self.assertRaises(ValueError):P.command(self.c,'/api/admin-workspace/classer',{'action':'delete','name':'Soins'},A)
  P.command(self.c,'/api/admin-workspace/classer',{'action':'delete','name':'Mutuelle'},A);self.assertNotIn('Mutuelle',A.snapshot(self.c)['classers'])
 def test_invalid_range_or_no_selected_day_rolls_back_case_creation(self):
  self.fixture();before=self.c.execute('SELECT COUNT(*) FROM admin_documents').fetchone()[0]
  for schedule in [{'starts_on':'2026-11-20','ends_on':'2026-11-10','weekdays':[1]},{'starts_on':'2026-11-13','ends_on':None,'weekdays':[]}]:
   with self.assertRaises(ValueError):
    with self.c:self.case(schedule=schedule)
  self.assertEqual(self.c.execute('SELECT COUNT(*) FROM admin_documents').fetchone()[0],before)
 def test_regular_task_completion_advances_primary_case_date(self):
  self.fixture();case=self.case();identity=case['task_id'];self.c.execute('UPDATE tasks SET completed=1 WHERE id=?',(identity,));A.task_saved(self.c,identity)
  dossier=self.c.execute('SELECT * FROM admin_documents WHERE id=?',(case['admin_id'],)).fetchone();self.assertEqual(dossier['due_date'],'2026-11-17');self.assertEqual(dossier['status'],'todo');self.assertNotEqual(A.snapshot(self.c)['plans'][str(case['admin_id'])],identity)
