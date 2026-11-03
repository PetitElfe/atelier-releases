from pathlib import Path
import sqlite3
import sys
import unittest
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'app'))
import utility_sync as sync

class SyncTests(unittest.TestCase):
    def setUp(self):
        self.c=sqlite3.connect(':memory:');self.c.row_factory=sqlite3.Row
        self.c.executescript('CREATE TABLE tasks(id INTEGER PRIMARY KEY,title TEXT,completed INTEGER,notes TEXT);INSERT INTO tasks VALUES(1,"Original",0,"Note");');sync.initialise(self.c);self.c.commit()
    def tearDown(self):self.c.close()
    def test_replay_does_not_write_twice(self):
        body={'title':'Created','_sync':{'id':'operation-00000001'}}
        lease,replay=sync.begin(self.c,'POST','/api/tasks',body);self.assertIsNone(replay)
        self.c.execute('INSERT INTO tasks(title) VALUES(?)',(body['title'],));sync.record(self.c,lease);self.c.commit()
        _,replay=sync.begin(self.c,'POST','/api/tasks',{'title':'Created','_sync':{'id':'operation-00000001'}})
        self.assertEqual(replay,{'id':2});self.assertEqual(self.c.execute('SELECT count(*) FROM tasks').fetchone()[0],2)
    def test_concurrent_fields_and_real_conflict(self):
        self.c.execute('UPDATE tasks SET notes="Other device"');self.c.commit()
        lease,_=sync.begin(self.c,'PUT','/api/tasks/1',{'completed':True,'_sync':{'id':'operation-00000002','base':{'completed':0}}});self.c.execute('UPDATE tasks SET completed=1');sync.record(self.c,lease);self.c.commit()
        self.assertEqual(self.c.execute('SELECT notes FROM tasks').fetchone()[0],'Other device')
        with self.assertRaises(sync.Conflict):sync.begin(self.c,'PUT','/api/tasks/1',{'notes':'Mine','_sync':{'id':'operation-00000003','base':{'notes':'Note'}}})
        self.c.rollback();self.assertEqual(self.c.execute('SELECT notes FROM tasks').fetchone()[0],'Other device')
    def test_reused_id_different_payload_is_refused(self):
        lease,_=sync.begin(self.c,'PUT','/api/tasks/1',{'completed':True,'_sync':{'id':'operation-00000004','base':{'completed':0}}});sync.record(self.c,lease);self.c.commit()
        with self.assertRaises(sync.Conflict):sync.begin(self.c,'PUT','/api/tasks/1',{'completed':False,'_sync':{'id':'operation-00000004','base':{'completed':1}}})

if __name__=='__main__':unittest.main()
