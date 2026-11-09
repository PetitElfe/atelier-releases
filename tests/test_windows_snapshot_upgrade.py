"""Reproduce WinError 32, then install and restore on a disposable Windows drive."""
import hashlib
import io
import json
import os
from pathlib import Path
import socket
import subprocess
import sys
import tempfile
import time
import unittest
from urllib.error import HTTPError
from urllib.request import Request, urlopen
from zipfile import ZipFile

ROOT = Path(__file__).resolve().parents[1]
BASE = 'http://127.0.0.1:8876'


def api(path, method='GET', body=None):
    request = Request(BASE + path, data=None if body is None else json.dumps(body).encode(), method=method,
                      headers={'Content-Type': 'application/json', 'Origin': BASE, 'X-Atelier-Safety': '1'})
    with urlopen(request, timeout=15) as response:
        return json.load(response)


def wait_until(predicate):
    for _ in range(150):
        try:
            if predicate(): return
        except (OSError, ValueError): pass
        time.sleep(.2)
    raise AssertionError('The isolated TEST server did not reach the expected state')


@unittest.skipUnless(os.name == 'nt' and os.environ.get('GOBLIN_RUN_ISOLATED_DELIVERY_TEST') == '1',
                     'Requires disposable Windows runner and explicit delivery-test flag')
class WindowsSnapshotUpgrade(unittest.TestCase):
    def test_legacy_error_then_real_cmd_upgrade_export_and_recovery(self):
        self.assertFalse(Path('E:/').exists(), 'Never map over an existing E: drive')
        with tempfile.TemporaryDirectory(prefix='Atelier Windows snapshot ') as temporary:
            subprocess.run(['subst.exe', 'E:', temporary], check=True)
            old_process = None
            try:
                testroot = Path('E:/LATELIER_TEST_0180')
                code, data = testroot / 'code_0180', testroot / 'data'
                code.mkdir(parents=True);data.mkdir()
                baseline = json.loads((ROOT / 'tools/windows_delivery/revision.json').read_text())['baseline_revision']
                archive = subprocess.check_output(['git', 'archive', '--format=zip', baseline, 'app', 'manifest.json'], cwd=ROOT)
                with ZipFile(io.BytesIO(archive)) as zipped: zipped.extractall(code)
                witness = Path('E:/00_LATELIER/leave-me.txt')
                witness.parent.mkdir();witness.write_text('Stable remains untouched')
                profile = testroot / 'desktop-profile/keep.txt'
                profile.parent.mkdir();profile.write_text('Existing browser profile')
                note = data / 'personal-fixture.txt';note.write_text('Private synthetic note')
                env = dict(os.environ, ATELIER_DATA_DIR=str(data), ATELIER_PORT='8876', ATELIER_NO_BROWSER='1', PYTHONUTF8='1')
                old_process = subprocess.Popen([sys.executable, str(code / 'app/app.py')], env=env,
                                               stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
                wait_until(lambda: api('/api/runtime-version')['version'] == '0.18.0')
                task = api('/api/tasks', 'POST', {'title': 'Before the repaired update'})
                # The user's exact failure must exist in the old installation.
                with self.assertRaises(HTTPError) as rejected:
                    api('/api/safety/snapshot', 'POST', {})
                detail = json.load(rejected.exception)
                self.assertEqual(rejected.exception.code, 500)
                self.assertIn('WinError 32', detail['error'])
                self.assertIn('copy.db', detail['error'])
                print('REPRODUCED: old Windows snapshot fails with WinError 32 on copy.db', flush=True)

                # Use the actual delivered ZIP, including the CMD and spaces in the path.
                kitroot = Path(temporary) / 'Kit extrait avec espaces'
                with ZipFile(ROOT / 'dist/Goblin_MAJ_Windows_TEST_20261109.zip') as zipped:
                    self.assertIsNone(zipped.testzip());zipped.extractall(kitroot)
                kit = kitroot / 'Goblin_MAJ_Windows_TEST_20261109'
                delivery = json.loads((kit / 'delivery.json').read_text())
                result = subprocess.run(['cmd.exe', '/d', '/c', 'Installer_la_MAJ_TEST.cmd'], cwd=kit,
                                        input='\n', capture_output=True, text=True, encoding='utf-8', errors='replace',
                                        env=dict(os.environ, PYTHONUTF8='1'), timeout=240)
                self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
                self.assertIn('MISE À JOUR RÉUSSIE', result.stdout)
                wait_until(lambda: api('/api/runtime-version')['version'] == '0.18.0')
                manifest = (code / 'manifest.json').read_bytes().replace(b'\r\n', b'\n')
                self.assertEqual(hashlib.sha256(manifest).hexdigest(), delivery['manifest_sha256'])
                self.assertEqual(json.loads(manifest)['build_sequence'], 2026110902)

                # Actual API paths used by Settings and the update preflight.
                for _ in range(2):
                    self.assertTrue(api('/api/safety/snapshot', 'POST', {})['ok'])
                browser = {'local_storage': {'snapshot-regression': 'Existing interface setting'}}
                payload = api('/api/safety/export', 'POST', {'browser': browser})
                self.assertEqual(payload['format'], 'atelier-complete-backup-v1')
                self.assertTrue(any('Before the repaired update' in row for row in payload['tables']['tasks']['rows']))
                checked = api('/api/safety/check', 'POST', {'backup': payload})
                self.assertTrue(checked['same_installation'])
                api('/api/tasks/' + str(task['id']), 'PUT', {'title': 'Changed after the exported snapshot'})
                note.write_text('Changed after the snapshot')
                api('/api/safety/restore', 'POST', {'token': checked['token'], 'confirmation': payload['installation_id']})
                wait_until(lambda: any(t['id'] == task['id'] and t['title'] == 'Before the repaired update'
                                       for t in api('/api/tasks')) and bool(api('/api/safety/status')['recovery'].get('restored_at')))
                self.assertEqual(note.read_text(), 'Private synthetic note')
                self.assertEqual(json.loads((data / 'browser-recovery.json').read_text())['browser'], browser)
                self.assertTrue(api('/api/safety/snapshot', 'POST', {})['ok'])
                self.assertEqual(witness.read_text(), 'Stable remains untouched')
                self.assertEqual(profile.read_text(), 'Existing browser profile')
                backups = list(testroot.glob('SAUVEGARDE_AUTO_TEST_*'))
                self.assertEqual(len(backups), 1)
                self.assertTrue((backups[0] / 'data/atelier.db').is_file())
                self.assertTrue((backups[0] / 'code_avant/manifest.json').is_file())
                print('PASS: real extracted CMD upgrade, repeated export/check, restoration and restart; data/profile preserved', flush=True)
            finally:
                try: api('/api/shutdown', 'POST', {})
                except (OSError, ValueError): pass
                if old_process and old_process.poll() is None: old_process.wait(timeout=30)
                for _ in range(100):
                    with socket.socket() as connection:
                        if connection.connect_ex(('127.0.0.1', 8876)) != 0: break
                    time.sleep(.2)
                subprocess.run(['subst.exe', 'E:', '/D'], check=True)


if __name__ == '__main__': unittest.main()
