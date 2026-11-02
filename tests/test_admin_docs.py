"""Régression des fichiers locaux administratifs sans toucher aux vraies données."""
import base64
import sqlite3
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'app'))
import admin_docs


class AdminDocumentsTests(unittest.TestCase):
    def test_supported_types_and_content(self):
        for name, mime, payload in [
            ('dossier.pdf','application/pdf',b'%PDF-1.7\nsynthetic data'),
            ('capture.png','image/png',b'\x89PNG\r\n\x1a\n0123'),
            ('image.jpeg','image/jpeg',b'\xff\xd8\xff\xe0fake'),
            ('notes.txt','text/plain','bonjour goblin'.encode('utf-8')),
        ]:
            with self.subTest(name=name):
                filename, accepted, decoded=admin_docs.filename_and_bytes(
                    name, mime, base64.b64encode(payload).decode('ascii'))
                self.assertEqual((filename,accepted,decoded),(name,mime,payload))

    def test_refuses_traversal_mime_spoofing_and_large_files(self):
        cases=[
            ('../cache.txt','text/plain',b'bonjour'),
            ('C:\\tmp\\cache.txt','text/plain',b'bonjour'),
            ('fichier.exe','application/octet-stream',b'evil'),
            ('fichier.pdf','application/pdf',b'not a PDF'),
            ('image.png','image/png',b'not PNG'),
            ('image.jpg','image/jpeg',b'not JPEG'),
            ('notes.txt','image/png',b'bonjour'),
        ]
        for name,mime,raw in cases:
            with self.subTest(filename=name):
                with self.assertRaises(ValueError):
                    admin_docs.filename_and_bytes(name,mime,base64.b64encode(raw).decode())
        with self.assertRaises(ValueError):
            admin_docs.filename_and_bytes('memo.txt','text/plain','this is not base64??')
        with self.assertRaises(ValueError):
            admin_docs.filename_and_bytes('large.txt','text/plain',
                base64.b64encode(b'x'*(admin_docs.MAX_ATTACHMENT_BYTES+1)).decode())

    def test_sqlite_backup_and_deleting_dossier_cascades_attachments(self):
        c=sqlite3.connect(':memory:')
        c.row_factory=sqlite3.Row
        c.execute('PRAGMA foreign_keys=ON')
        c.execute('CREATE TABLE admin_documents (id INTEGER PRIMARY KEY, title TEXT)')
        c.execute("INSERT INTO admin_documents VALUES (1,'Dossier CAF')")
        admin_docs.initialise(c)
        c.execute("INSERT INTO admin_attachments(admin_id,filename,mime_type,byte_size,content,created_at) "
                  "VALUES(?,?,?,?,?,?)",(1,'document.pdf','application/pdf',8,b'%PDF-test','2026-10-28'))
        self.assertEqual(admin_docs.summaries(c,1)[0]['filename'],'document.pdf')
        c.commit()  # La sauvegarde SQLite attendrait un COMMIT pour une écriture en cours.
        snapshot=sqlite3.connect(':memory:')
        snapshot.row_factory=sqlite3.Row
        c.backup(snapshot)
        self.assertEqual(admin_docs.detail(snapshot,1,1)['content'],b'%PDF-test')
        c.execute('DELETE FROM admin_documents WHERE id=1')
        self.assertEqual(admin_docs.summaries(c,1),[])
        self.assertEqual(admin_docs.detail(snapshot,1,1)['filename'],'document.pdf')
        snapshot.close()
        c.close()


    def test_event_file_backup_and_delete_cascade(self):
        c=sqlite3.connect(':memory:')
        c.row_factory=sqlite3.Row
        c.execute('PRAGMA foreign_keys=ON')
        c.execute('CREATE TABLE events(id INTEGER PRIMARY KEY,title TEXT)')
        c.execute('CREATE TABLE admin_documents(id INTEGER PRIMARY KEY,title TEXT)')
        c.execute("INSERT INTO events VALUES (1,'Rendez-vous médical')")
        c.execute("INSERT INTO events VALUES (2,'Autre rendez-vous')")
        admin_docs.initialise(c)
        c.execute("INSERT INTO event_attachments(event_id,filename,mime_type,byte_size,content,created_at) "
                  "VALUES(?,?,?,?,?,?)",(1,'compte-rendu.txt','text/plain',7,b'bonjour','2026-10-28'))
        self.assertEqual(admin_docs.event_summaries(c,1)[0]['filename'],'compte-rendu.txt')
        self.assertEqual(admin_docs.event_summaries(c,2),[])
        self.assertIsNone(admin_docs.event_detail(c,2,1))
        self.assertEqual(admin_docs.event_detail(c,1,1)['content'],b'bonjour')
        c.commit()
        backup=sqlite3.connect(':memory:')
        backup.row_factory=sqlite3.Row
        c.backup(backup)
        c.execute('DELETE FROM events WHERE id=1')
        self.assertEqual(admin_docs.event_summaries(c,1),[])
        self.assertEqual(admin_docs.event_detail(backup,1,1)['content'],b'bonjour')
        backup.close()
        c.close()


if __name__=='__main__':
    unittest.main()
