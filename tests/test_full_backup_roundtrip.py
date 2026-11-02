"""Restauration bout en bout d'une copie TEST, jamais de données de l'utilisateur.

Créer des objets via les vraies API, sauvegarder SQLite pendant le service,
restaurer dans un NOUVEAU dossier, relancer l'Atelier puis relire chaque octet.
"""
import base64
import http.client
import json
import os
from pathlib import Path
import shutil
import socket
import sqlite3
import subprocess
import sys
import tempfile
import time
import unittest

ROOT=Path(__file__).resolve().parents[1]
APP=ROOT/'app'/'app.py'


class FullBackupRoundtripTests(unittest.TestCase):
    def _request(self, port, method, path, body=None, binary=False):
        conn=http.client.HTTPConnection('127.0.0.1',port,timeout=5)
        payload=json.dumps(body).encode('utf-8') if body is not None else None
        headers={'Content-Type':'application/json'} if payload is not None else {}
        try:
            conn.request(method,path,body=payload,headers=headers)
            response=conn.getresponse()
            status=response.status
            raw=response.read()
        finally:
            conn.close()
        if binary:
            return status,raw
        try:
            parsed=json.loads(raw.decode('utf-8')) if raw else {}
        except (ValueError,UnicodeDecodeError):
            self.fail(f'{method} {path}: invalid JSON response ({status})')
        return status,parsed

    def _must(self, port, method, path, body=None, expected=200, binary=False):
        status,value=self._request(port,method,path,body,binary=binary)
        self.assertEqual(status,expected,f'{method} {path}: {value!r}')
        return value

    def _start(self, port, data_dir):
        env=os.environ.copy()
        env.update(ATELIER_NO_BROWSER='1',ATELIER_DATA_DIR=str(data_dir),
                   ATELIER_PORT=str(port))
        proc=subprocess.Popen(
            [sys.executable,str(APP)],cwd=str(ROOT),env=env,
            stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
        deadline=time.monotonic()+18
        while time.monotonic()<deadline:
            if proc.poll() is not None:
                self.fail(f'Atelier server exited prematurely ({proc.returncode})')
            try:
                if self._request(port,'GET','/api/version')[0]==200:
                    return proc
            except (OSError,http.client.HTTPException):
                pass
            time.sleep(.15)
        proc.terminate()
        proc.wait(timeout=5)
        self.fail('Timed out starting isolated Atelier test server')

    def _stop(self, proc):
        proc.terminate()
        try:proc.wait(timeout=6)
        except subprocess.TimeoutExpired:
            proc.kill()
            proc.wait(timeout=5)

    def test_sqlite_backup_restore_every_user_object_and_attachment(self):
        with tempfile.TemporaryDirectory(prefix='atelier-restore-test-') as folder:
            root=Path(folder)
            original=root/'original'
            restored=root/'restored'
            original.mkdir()
            restored.mkdir()
            with socket.socket(socket.AF_INET,socket.SOCK_STREAM) as probe:
                probe.bind(('127.0.0.1',0))
                port=probe.getsockname()[1]
            pdf=b'%PDF-1.7'+bytes([10])+b'Document administratif TEST'
            document=('Convocation '+chr(10)+'Rendez-vous du jour').encode('utf-8')
            note_body='Ligne 1'+chr(10)+'Ligne 2'+chr(10)+'Ligne 3'
            proc=self._start(port,original)
            try:
                appointment=self._must(port,'POST','/api/events',{
                    'title':'Rendez-vous de sauvegarde','event_date':'2026-11-30',
                    'start_time':'14:00','notes':'Conserver le rendez-vous'
                },expected=201)['id']
                dossier=self._must(port,'POST','/api/admin',{
                    'title':'Dossier sauvegarde','category':'Santé',
                    'notes':'Documents privés à conserver','due_date':'2026-11-30'
                },expected=201)['id']
                self._must(port,'PUT',f'/api/admin/{dossier}',{'event_id':appointment})
                pdf_id=self._must(port,'POST',f'/api/admin/{dossier}/attachments',{
                    'filename':'preuve.pdf','mime_type':'application/pdf',
                    'base64':base64.b64encode(pdf).decode('ascii')
                },expected=201)['id']
                doc_id=self._must(port,'POST',f'/api/events/{appointment}/attachments',{
                    'filename':'convocation.txt','mime_type':'text/plain',
                    'base64':base64.b64encode(document).decode('ascii')
                },expected=201)['id']
                task=self._must(port,'POST','/api/tasks',{
                    'title':'Tâche préservée','due_date':'2026-11-30',
                    'notes':'La tâche doit revenir après restauration'
                },expected=201)['id']
                sticky=self._must(port,'POST','/api/postits',{
                    'title':'Post-it sauvegardé','body':note_body,
                    'color':'mauve','shape':'rounded'
                },expected=201)['id']
                self._must(port,'PUT',f'/api/postits/{sticky}',{'archived':True})
                board=self._must(port,'POST','/api/tracker-boards',{
                    'title':'Trackers à restaurer','color':'sage','period_unit':'months',
                    'period_count':1
                },expected=201)['id']
                row=self._must(port,'POST',f'/api/tracker-boards/{board}/rows',{
                    'title':'Coche historique','mode':'check'
                },expected=201)['id']
                self._must(port,'PUT',f'/api/tracker-board-rows/{row}/mark',{
                    'day':'2026-10-21','value':True
                })
                self._must(port,'PUT',f'/api/tracker-boards/{board}',{'archived':True})
                self._must(port,'PUT',f'/api/admin/{dossier}',{'archived':True})

                # Snapshot SQLite cohérent même si le serveur écrit en WAL.
                source=sqlite3.connect(original/'atelier.db',timeout=8)
                backup_path=root/'snapshot.db'
                target=sqlite3.connect(backup_path)
                try:
                    source.backup(target)
                    self.assertEqual(target.execute('PRAGMA integrity_check').fetchone()[0],'ok')
                finally:
                    target.close()
                    source.close()
            finally:
                self._stop(proc)

            # On restaure dans un deuxième dossier : jamais sur l'original.
            shutil.copy2(backup_path,restored/'atelier.db')
            restored_connection=sqlite3.connect(restored/'atelier.db')
            try:
                self.assertEqual(
                    restored_connection.execute('PRAGMA integrity_check').fetchone()[0],'ok')
            finally:
                restored_connection.close()
            proc=self._start(port,restored)
            try:
                event_rows=self._must(port,'GET','/api/events?start=2026-11-30&end=2026-11-30')
                event=next(e for e in event_rows if e['id']==appointment)
                self.assertEqual(event['notes'],'Conserver le rendez-vous')
                self.assertEqual(len(event['attachments']),1)
                admin_rows=self._must(port,'GET','/api/admin?archived=1')
                admin=next(x for x in admin_rows if x['id']==dossier)
                self.assertEqual(admin['event_id'],appointment)
                self.assertEqual(admin['notes'],'Documents privés à conserver')
                self.assertEqual(len(admin['attachments']),1)
                self.assertEqual(
                    self._must(port,'GET',f'/api/admin/{dossier}/attachments/{pdf_id}',
                               binary=True),pdf)
                self.assertEqual(
                    self._must(port,'GET',f'/api/events/{appointment}/attachments/{doc_id}',
                               binary=True),document)
                self.assertTrue(any(t['id']==task for t in self._must(port,'GET','/api/tasks')))
                postits=self._must(port,'GET','/api/postits?archived=1')
                found=next(n for n in postits if n['id']==sticky)
                self.assertEqual((found['body'],found['color']), (note_body,'mauve'))
                boards=self._must(port,'GET','/api/tracker-boards?archived=1&month=2026-10')
                saved=next(b for b in boards if b['id']==board)
                self.assertEqual(saved['rows'][0]['marks']['2026-10-21'],'1')
                self.assertEqual(saved['rows'][0]['title'],'Coche historique')
            finally:
                self._stop(proc)


if __name__=='__main__':
    unittest.main()
