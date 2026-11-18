from pathlib import Path
import sys
import tempfile
import unittest
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'app'))
import utility_notes as notes

class NoteRevisionTests(unittest.TestCase):
    def test_tags_are_shared_without_copy_and_stale_save_refused(self):
        with tempfile.TemporaryDirectory() as folder:
            initial=notes.get(folder);n={'id':'one','title':'#anglais Test','content':'Écrire #journal','category':'Général','updated':'2026-11-04'}
            saved=notes.save(folder,initial['revision'],[n]);self.assertEqual(saved['notes'][0]['tags'],['anglais','journal'])
            n['content']='Nouveau texte';newer=notes.save(folder,saved['revision'],[n])
            with self.assertRaises(notes.Conflict):notes.save(folder,saved['revision'],[])
            self.assertEqual(notes.get(folder),newer);self.assertTrue((Path(folder)/'notes-history/original-before-first-revision.json').is_file())
    def test_same_payload_replay_and_reversible_archive(self):
        with tempfile.TemporaryDirectory() as folder:
            initial=notes.get(folder);n={'id':'one','content':'Conservé'}
            saved=notes.save(folder,initial['revision'],[n]);self.assertEqual(notes.save(folder,initial['revision'],[n]),saved)
            saved['notes'][0]['deleted_at']='2026-11-04';archived=notes.save(folder,saved['revision'],saved['notes']);self.assertEqual(archived['notes'][0]['content'],'Conservé')
            archived['notes'][0]['deleted_at']='';self.assertFalse(notes.save(folder,archived['revision'],archived['notes'])['notes'][0]['deleted_at'])
    def test_legacy_client_cannot_silently_erase_or_modify_new_notes(self):
        with tempfile.TemporaryDirectory() as folder:
            notes.legacy_save(folder,[{'id':'a','content':'a'}])
            with self.assertRaises(notes.Conflict):notes.legacy_save(folder,[])
            with self.assertRaises(notes.Conflict):notes.legacy_save(folder,[{'id':'a','content':'old stale'}])
            self.assertEqual(notes.get(folder)['notes'][0]['content'],'a')
    def test_corrupt_file_and_overlong_text_preserved(self):
        with tempfile.TemporaryDirectory() as folder:
            p=Path(folder)/'mobile-notes.json';p.write_text('broken')
            with self.assertRaises(ValueError):notes.save(folder,'anything',[])
            self.assertEqual(p.read_text(),'broken')
            with self.assertRaises(ValueError):notes.clean([{'id':'a','content':'x'*100001}])

if __name__=='__main__':unittest.main()
