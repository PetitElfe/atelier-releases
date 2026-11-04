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
if __name__=='__main__':unittest.main()
