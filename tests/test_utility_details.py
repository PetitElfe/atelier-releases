from pathlib import Path
import sqlite3,sys,unittest
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'app'))
import utility_details as details
class TaskDetailsTests(unittest.TestCase):
 def setUp(self):
  self.c=sqlite3.connect(':memory:');self.c.row_factory=sqlite3.Row;self.c.execute('CREATE TABLE tasks(id INTEGER PRIMARY KEY)');self.c.execute('INSERT INTO tasks VALUES(1)');details.initialise(self.c)
 def tearDown(self):self.c.close()
 def test_links_checklist_and_conflict_keep_previous_values(self):
  value={'revision':0,'data':{'links':['https://example.com/document'],'checklist':[{'text':'Préparer les papiers','done':True}]}}
  details.save_task(self.c,1,value);saved=details.extras(self.c,1);self.assertEqual(saved['revision'],1);self.assertTrue(saved['data']['checklist'][0]['done'])
  with self.assertRaises(LookupError):details.save_task(self.c,1,value)
  self.assertEqual(details.extras(self.c,1),saved)
  with self.assertRaises(ValueError):details.save_task(self.c,1,{'revision':1,'data':{'links':['javascript:alert(1)'],'checklist':[]}})
 def test_category_limits_and_expense_correction_do_not_duplicate_entries(self):
  self.c.execute('CREATE TABLE budget_entries(id INTEGER PRIMARY KEY,title TEXT,category TEXT,kind TEXT,amount_cents INTEGER,status TEXT,scheduled_date TEXT,actual_date TEXT,notes TEXT,archived INTEGER NOT NULL DEFAULT 0,revision INTEGER NOT NULL DEFAULT 1)')
  self.c.execute("INSERT INTO budget_entries VALUES(1,'Courses','Alimentation','expense',1234,'confirmed','2026-11-04','2026-11-04','',0,1)")
  self.c.execute("INSERT INTO budget_entries VALUES(2,'À venir','Alimentation','expense',6000,'pending','2026-11-12',NULL,'',0,1)");self.c.commit()
  details.budget_support(self.c,'PUT',['api','budget','category-limits'],{}, {'month':'2026-11','category':'Alimentation','amount':'100','revision':0});self.c.commit()
  limits=details.budget_support(self.c,'GET',['api','budget','category-limits'],{'month':['2026-11']},{})
  self.assertEqual(limits[0]['spent_cents'],1234);self.assertEqual(limits[0]['planned_cents'],7234)
  details.budget_support(self.c,'PUT',['api','budget-entries','1'],{}, {'amount':'25.50','title':'Courses corrigées','base':{'amount_cents':1234,'title':'Courses'}});self.c.commit()
  self.assertEqual(self.c.execute('SELECT count(*) FROM budget_entries').fetchone()[0],2);self.assertEqual(self.c.execute('SELECT amount_cents FROM budget_entries WHERE id=1').fetchone()[0],2550)
  with self.assertRaises(LookupError):details.budget_support(self.c,'PUT',['api','budget-entries','1'],{}, {'amount':'30','base':{'amount_cents':1234}})
if __name__=='__main__':unittest.main()
