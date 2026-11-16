from contextlib import closing
import hashlib
import json
from pathlib import Path
import sqlite3
import sys
import tempfile
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'app'))
import grocery_recovery


class GroceryRecoveryTests(unittest.TestCase):
    def test_backup_rows_and_browser_drafts_without_restoring_database(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder) / 'data'
            complete = root / 'backups' / 'complete'
            complete.mkdir(parents=True)
            identity = 'same-installation'
            backup = {'format':'atelier-complete-backup-v1', 'installation_id':identity,
                      'edition_port':8876, 'tables':{'shopping_items':{
                          'columns':['id','name','price','purchase_count'],
                          'rows':[[8,'Riz',2.5,2]]}}, 'browser':{'local_storage':{
                          'atelier-groceries-pc:http://127.0.0.1:8876':json.dumps({
                              'identity':identity,'cart':[{'name':'Pommes','price':None}]})}}}
            (complete / 'snapshot-1.json').write_text(json.dumps(backup))
            other = {**backup, 'installation_id':'other-profile', 'tables':{'shopping_items':{
                'columns':['name'], 'rows':[['Ne pas lire le profil voisin']]}}}
            (complete / 'snapshot-2.json').write_text(json.dumps(other))
            old = root.parent / 'SAUVEGARDE_AUTO_TEST_old' / 'data'
            old.mkdir(parents=True)
            (old / 'installation-id.json').write_text(json.dumps({'id':identity}))
            with closing(sqlite3.connect(old / 'atelier.db')) as c:
                c.executescript("CREATE TABLE shopping_items(id INTEGER,name TEXT);INSERT INTO shopping_items VALUES(1,'Lentilles');")
            current = root / 'atelier.db'
            current.write_bytes(b'The current database is not opened by the search')
            before = {str(p):hashlib.sha256(p.read_bytes()).hexdigest() for p in root.parent.rglob('*') if p.is_file()}
            found = grocery_recovery.search(root,8876,identity)
            names = {r['name'] for group in found['sources'] for r in group['cart']}
            self.assertEqual(names, {'Riz','Pommes','Lentilles'})
            after = {str(p):hashlib.sha256(p.read_bytes()).hexdigest() for p in root.parent.rglob('*') if p.is_file()}
            self.assertEqual(before,after, 'No DB replacement, cache write or journal sidecar')

    def test_redirected_backup_is_skipped(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder) / 'data'
            root.mkdir()
            outside = Path(folder) / 'elsewhere'
            outside.mkdir()
            target = root.parent / 'SAUVEGARDE_AUTO_TEST_link'
            try:
                target.symlink_to(outside, target_is_directory=True)
            except OSError:
                self.skipTest('Symlinks unavailable')
            found = grocery_recovery.search(root,8876,'identity')
            self.assertEqual(found['sources'], [])


if __name__ == '__main__':
    unittest.main()
