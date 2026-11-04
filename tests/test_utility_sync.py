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

class FormMergeTests(unittest.TestCase):
    def test_unchanged_form_fields_preserve_other_device_changes(self):
        c=sqlite3.connect(':memory:');c.row_factory=sqlite3.Row;c.execute('CREATE TABLE tasks(id INTEGER PRIMARY KEY,title TEXT,notes TEXT,due_date TEXT,objective_node_id INTEGER)');c.execute("INSERT INTO tasks VALUES(1,'Titre récent','Note initiale',NULL,NULL)");c.commit()
        body={'title':'Ancien titre','notes':'Note modifiée','due_date':'','objective_node_id':'','_utility_base':{'fields':{'title':'Ancien titre','notes':'Note initiale','due_date':None,'objective_node_id':None}}}
        sync.merge_form(c,'/api/tasks/1',body);self.assertNotIn('title',body);self.assertNotIn('due_date',body);self.assertEqual(body['notes'],'Note modifiée');c.rollback()
        with self.assertRaises(sync.Conflict):sync.merge_form(c,'/api/tasks/1',{'title':'Autre titre','_utility_base':{'fields':{'title':'Ancien titre'}}})
        c.close()

class PreparationFormMergeTests(unittest.TestCase):
    def test_unchanged_preparations_preserve_new_items_from_another_window(self):
        c=sqlite3.connect(':memory:');c.row_factory=sqlite3.Row
        c.executescript("CREATE TABLE events(id INTEGER PRIMARY KEY,title TEXT);CREATE TABLE event_preparations(id INTEGER PRIMARY KEY,event_id INTEGER,title TEXT,position INTEGER);INSERT INTO events VALUES(1,'RDV');INSERT INTO event_preparations VALUES(1,1,'Original',0);INSERT INTO event_preparations VALUES(2,1,'Ajout récent',1);")
        original=[{'id':1,'title':'Original'}];body={'title':'RDV','preparations':original.copy(),'_utility_base':{'fields':{'title':'RDV'},'preparations':original}}
        sync.merge_form(c,'/api/events/1',body);self.assertNotIn('preparations',body);c.rollback()
        with self.assertRaises(sync.Conflict):sync.merge_form(c,'/api/events/1',{'preparations':[{'id':1,'title':'Correction'}],'_utility_base':{'fields':{},'preparations':original}})
        c.close()

if __name__=='__main__':unittest.main()
