"""Archives de Post-it : restoration exacte sur base temporaire seulement."""
import sqlite3
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'app'))
import desktop_postits


class DesktopPostitArchiveTests(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory()
        self.db=Path(self.temp.name)/'atelier.db'
        with sqlite3.connect(self.db) as c:
            c.executescript("""
                PRAGMA foreign_keys=ON;
                CREATE TABLE home_postits(
                  id INTEGER PRIMARY KEY,title TEXT NOT NULL,body TEXT NOT NULL,
                  color TEXT NOT NULL,shape TEXT NOT NULL,archived INTEGER NOT NULL,
                  created_at TEXT NOT NULL,updated_at TEXT NOT NULL);
                INSERT INTO home_postits VALUES
                  (1,'Notes multiline','Un\\ndeux\\ntrois','mauve','rounded',0,'2026-10-28','2026-10-28');
            """)
        with sqlite3.connect(self.db) as c:
            c.execute('UPDATE home_postits SET body=? WHERE id=1',
                      ('Un'+chr(10)+'deux'+chr(10)+'trois',))
        desktop_postits.create_layout_table(self.db)
        desktop_postits.save_layout(1,321,245,420,310,self.db)
        desktop_postits.set_layout_lock(1,True,self.db)

    def tearDown(self):
        self.temp.cleanup()

    def test_last_archived_note_restores_text_color_and_position(self):
        with sqlite3.connect(self.db) as c:
            c.execute('UPDATE home_postits SET archived=1 WHERE id=1')
        self.assertEqual(desktop_postits.note_rows(self.db),[],
                         'No active Post-it must be required to access archives')
        self.assertEqual(len(desktop_postits.archived_notes(self.db)),1)
        self.assertTrue(desktop_postits.restore_note(1,self.db))
        row=desktop_postits.note_rows(self.db)[0]
        self.assertEqual(row['body'],'Un'+chr(10)+'deux'+chr(10)+'trois')
        self.assertEqual((row['title'],row['color'],row['shape']),
                         ('Notes multiline','mauve','rounded'))
        self.assertEqual((row['x'],row['y'],row['width'],row['height'],row['locked']),
                         (321,245,420,310,1))
        self.assertFalse(desktop_postits.restore_note(1,self.db))
        self.assertEqual(desktop_postits.archived_notes(self.db),[])

    def test_restoration_respects_100_active_notes(self):
        with sqlite3.connect(self.db) as c:
            c.execute('UPDATE home_postits SET archived=1 WHERE id=1')
            c.executemany(
              'INSERT INTO home_postits VALUES(?,?,?,?,?,?,?,?)',
              [(i,'Note '+str(i),'','sage','square',0,'t','t')
               for i in range(2,102)])
        with self.assertRaisesRegex(ValueError,'Archive quelques Post-it'):
            desktop_postits.restore_note(1,self.db)
        self.assertEqual(len(desktop_postits.archived_notes(self.db)),1)


if __name__=='__main__':
    unittest.main()
