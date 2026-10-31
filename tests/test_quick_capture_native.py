import json
import sqlite3
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'app'))
import quick_capture_native as capture

class NativeCaptureTests(unittest.TestCase):
    def test_shortcuts(self):
        self.assertEqual(capture.parse_hotkey('Ctrl+Shift+Space'),(6,32))
        self.assertEqual(capture.parse_hotkey('Ctrl+Alt+J'),(3,ord('J')))
        for value in ['Shift+J','Ctrl+Alt','Ctrl+Shift+Ctrl+J','Ctrl+&','Ctrl+Junk']:
            with self.subTest(value=value),self.assertRaises(ValueError):
                capture.parse_hotkey(value)
    def test_preference(self):
        with tempfile.TemporaryDirectory() as directory:
            p=Path(directory)/'quick-capture-hotkey.json'
            self.assertEqual(capture.read_preference(p),'Ctrl+Shift+Space')
            p.write_text(json.dumps({'shortcut':'Ctrl+Alt+J'}),encoding='utf-8')
            self.assertEqual(capture.read_preference(p),'Ctrl+Alt+J')
    def test_multiline_capture_keeps_data_local(self):
        with tempfile.TemporaryDirectory() as directory:
            db=Path(directory)/'atelier.db'
            with sqlite3.connect(db) as c:
                c.executescript('''
                CREATE TABLE quick_captures(id INTEGER PRIMARY KEY,destination TEXT,body TEXT,seen INTEGER DEFAULT 0,created_at TEXT);
                CREATE TABLE admin_documents(id INTEGER PRIMARY KEY,title TEXT,category TEXT,notes TEXT,created_at TEXT,updated_at TEXT);
                CREATE TABLE tasks(id INTEGER PRIMARY KEY,title TEXT,due_date TEXT,due_time TEXT,notes TEXT,completed INTEGER,archived INTEGER,important INTEGER,order_index INTEGER,created_at TEXT,updated_at TEXT);
                CREATE TABLE home_postits(id INTEGER PRIMARY KEY,title TEXT,body TEXT,color TEXT,shape TEXT,archived INTEGER,created_at TEXT,updated_at TEXT);
                ''')
            capture.save_capture(db,'carnet','Ligne 1\nLigne 2')
            capture.save_capture(db,'tâches','Faire un dossier')
            capture.save_capture(db,'administratif','Demander un justificatif')
            capture.save_capture(db,'post-it','Une note\nà la ligne')
            with sqlite3.connect(db) as c:
                self.assertEqual(c.execute('SELECT body FROM quick_captures').fetchone()[0],'Ligne 1\nLigne 2')
                self.assertEqual(c.execute('SELECT title FROM tasks').fetchone()[0],'Faire un dossier')
                self.assertEqual(c.execute('SELECT title FROM admin_documents').fetchone()[0],'Demander un justificatif')
                self.assertEqual(c.execute('SELECT body FROM home_postits').fetchone()[0],'Une note\nà la ligne')

if __name__=='__main__':unittest.main()
