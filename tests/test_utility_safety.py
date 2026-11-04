import base64
import hashlib
import json
import os
from pathlib import Path
import sqlite3
import sys
import tempfile
import unittest
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'app'))
import utility_safety as safety


class CompleteSafetyTests(unittest.TestCase):
    def setUp(self):
        self.folder=tempfile.TemporaryDirectory();self.root=Path(self.folder.name)
        with sqlite3.connect(self.root/'atelier.db') as c:
            c.executescript('CREATE TABLE tasks(id INTEGER PRIMARY KEY,title TEXT);CREATE TABLE events(id);CREATE TABLE recipes(id);CREATE TABLE objective_nodes(id);PRAGMA user_version=17;')
            c.execute('INSERT INTO tasks VALUES(1,?)',('Ancien texte à conserver',))
        (self.root/'mental-health-private-v1.json').write_text('{"rev":1,"data":{"journal":["Écriture privée"]}}',encoding='utf-8')
        (self.root/'personal-design-v1.json').write_text('{"theme":{"image":"dessin"}}')
        self.browser={'local_storage':{'my-private-draft':'Brouillon non publié'},'moodboard_drafts':[[1,{'items':[]}]]}
    def tearDown(self):self.folder.cleanup()

    def test_complete_round_trip_and_immutable_first_snapshot(self):
        first_path,first=safety.save_snapshot(self.root,'0.18.0',8876,self.browser)
        original=(first_path.parent/'original-before-first-complete-backup.json').read_bytes()
        with sqlite3.connect(self.root/'atelier.db') as c:c.execute('UPDATE tasks SET title=?',('Après la copie',))
        (self.root/'mental-health-private-v1.json').write_text('Nouveau contenu')
        (self.root/'another-note.txt').write_text('Note plus récente')
        prepared=safety.prepare_restore(self.root,first,17,8876)
        safety.atomic(self.root/'recovery'/'pending.json',{'token':prepared['token'],'phase':'prepared'})
        safety.apply_pending(self.root,'0.18.0',17,8876)
        with sqlite3.connect(self.root/'atelier.db') as c:self.assertEqual(c.execute('SELECT title FROM tasks').fetchone()[0],'Ancien texte à conserver')
        self.assertIn('Écriture privée',(self.root/'mental-health-private-v1.json').read_text())
        self.assertFalse((self.root/'another-note.txt').exists())
        self.assertEqual(json.loads((self.root/'browser-recovery.json').read_text())['browser'],self.browser)
        self.assertEqual((first_path.parent/'original-before-first-complete-backup.json').read_bytes(),original)
        rollbacks=list(first_path.parent.glob('snapshot-before-restore-*.json'));self.assertEqual(len(rollbacks),1)
        previous=json.loads(rollbacks[0].read_text());self.assertIn('another-note.txt',previous['files'])

    def test_tamper_paths_wrong_edition_and_other_user_refused(self):
        item=safety.snapshot(self.root,'0.18.0',8876,self.browser)
        for change in ('tamper','path','edition','identity','future'):
            payload=json.loads(json.dumps(item))
            if change=='tamper':payload['database']['base64']=base64.b64encode(b'not sqlite').decode()
            elif change=='path':payload['files']['../outside.json']=safety.encode(b'escape')
            elif change=='edition':payload['edition_port']=8877
            elif change=='identity':payload['installation_id']='Other profile'
            else:payload['schema']=999
            with self.subTest(change=change),self.assertRaises((ValueError,sqlite3.Error)):safety.prepare_restore(self.root,payload,17,8876)
        with sqlite3.connect(self.root/'atelier.db') as c:self.assertEqual(c.execute('SELECT title FROM tasks').fetchone()[0],'Ancien texte à conserver')

    def test_interrupted_restore_rolls_back_before_opening_app(self):
        path,old=safety.save_snapshot(self.root,'0.18.0',8876,reason='before-restore')
        with sqlite3.connect(self.root/'atelier.db') as c:c.execute('UPDATE tasks SET title="Partial restoration"')
        safety.atomic(self.root/'recovery'/'pending.json',{'token':'a'*64,'phase':'applying','rollback':str(path)})
        safety.apply_pending(self.root,'0.18.0',17,8876)
        with sqlite3.connect(self.root/'atelier.db') as c:self.assertEqual(c.execute('SELECT title FROM tasks').fetchone()[0],'Ancien texte à conserver')
        self.assertIn('interrompue',json.loads((self.root/'safety-status.json').read_text())['error'])

    def test_tampered_prepared_backup_does_not_block_startup_or_change_data(self):
        item=safety.snapshot(self.root,'0.18.0',8876)
        prepared=safety.prepare_restore(self.root,item,17,8876)
        safety.atomic(self.root/'recovery'/'pending.json',{'token':prepared['token'],'phase':'prepared'})
        (self.root/'recovery'/(prepared['token']+'.json')).write_text('broken')
        safety.apply_pending(self.root,'0.18.0',17,8876)
        self.assertFalse((self.root/'recovery'/'pending.json').exists())
        with sqlite3.connect(self.root/'atelier.db') as c:self.assertEqual(c.execute('SELECT title FROM tasks').fetchone()[0],'Ancien texte à conserver')
        self.assertIn('annulée',json.loads((self.root/'safety-status.json').read_text())['error'])

    def test_operational_files_and_backups_are_not_recursively_exported(self):
        (self.root/'server.pid').write_text('12345');(self.root/'updater-worker.log').write_text('private paths');(self.root/'windows-test-channel.json').write_text('keep live channel')
        _,item=safety.save_snapshot(self.root,'0.18.0',8876,self.browser)
        self.assertNotIn('server.pid',item['files']);self.assertNotIn('windows-test-channel.json',item['files']);self.assertTrue(all(not x.startswith('backups/') for x in item['files']))
        self.assertIn('mental-health-private-v1.json',item['files']);self.assertIn('tasks',item['tables'])

if __name__=='__main__':unittest.main()
