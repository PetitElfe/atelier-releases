"""Real Windows delivery upgrade, enabled only on a disposable mapped E: drive."""
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
from urllib.request import Request, urlopen
from zipfile import ZipFile

ROOT = Path(__file__).resolve().parents[1]
BASE = 'http://127.0.0.1:8876'


def api(path, method='GET', body=None):
    request = Request(BASE + path, data=None if body is None else json.dumps(body).encode(), method=method,
                      headers={'Content-Type': 'application/json'})
    with urlopen(request, timeout=8) as response:
        return json.load(response)


def ready():
    for _ in range(100):
        try:
            if api('/api/runtime-version')['version'] == '0.18.0':
                return
        except Exception:
            time.sleep(.2)
    raise AssertionError('TEST server did not start')


@unittest.skipUnless(os.name == 'nt' and os.environ.get('GOBLIN_RUN_ISOLATED_DELIVERY_TEST') == '1',
                     'Requires disposable Windows runner and explicit delivery-test flag')
class WindowsDeliveryInstallTests(unittest.TestCase):
    def test_real_upgrade_preserves_data_profile_and_other_channels(self):
        self.assertFalse(Path('E:/').exists(), 'Never map over an existing E: drive')
        with tempfile.TemporaryDirectory() as scratch:
            subprocess.run(['subst.exe', 'E:', scratch], check=True)
            process = None
            try:
                config = json.loads((ROOT / 'tools/windows_delivery/revision.json').read_text())
                testroot = Path('E:/LATELIER_TEST_0180')
                code = testroot / 'code_0180'
                data = testroot / 'data'
                code.mkdir(parents=True)
                data.mkdir()
                original = subprocess.check_output(['git', 'archive', '--format=zip', config['baseline_revision'], 'app', 'manifest.json'], cwd=ROOT)
                with ZipFile(io.BytesIO(original)) as zipped:
                    zipped.extractall(code)
                stable = Path('E:/00_LATELIER/leave-me.txt')
                stable.parent.mkdir()
                stable.write_text('Stable remains untouched')
                profile = testroot / 'desktop-profile/keep-profile.txt'
                profile.parent.mkdir()
                profile.write_text('Existing WebView profile preserved')
                note = data / 'personal-fixture.txt'
                note.write_text('Notes and JSON files preserved')
                env = dict(os.environ, ATELIER_DATA_DIR=str(data), ATELIER_PORT='8876', ATELIER_NO_BROWSER='1')
                process = subprocess.Popen([sys.executable, str(code / 'app/app.py')], env=env, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
                ready()
                task = api('/api/tasks', 'POST', {'title': 'Written before the candidate upgrade'})
                api('/api/shutdown', 'POST', {})
                process.wait(timeout=25)
                kit = ROOT / 'dist/Goblin_MAJ_Windows_TEST_20261103'
                # An altered launcher is rejected before the local server starts.
                updater_file = kit / 'updater.py'
                clean = updater_file.read_bytes()
                try:
                    updater_file.write_bytes(clean + b'\n# tampered\n')
                    rejected = subprocess.run([sys.executable, str(kit / 'installer.py')], capture_output=True, text=True, encoding='utf-8', env=dict(os.environ, PYTHONUTF8='1'), timeout=20)
                    self.assertEqual(rejected.returncode, 1)
                    self.assertIn('incomplet ou modifié', rejected.stdout)
                    with socket.socket() as sock:
                        self.assertNotEqual(sock.connect_ex(('127.0.0.1', 8876)), 0)
                finally:
                    updater_file.write_bytes(clean)
                result = subprocess.run([sys.executable, str(kit / 'installer.py')], capture_output=True, text=True, encoding='utf-8', env=dict(os.environ, PYTHONUTF8='1'), timeout=240)
                print(result.stdout, flush=True)
                self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
                ready()
                self.assertTrue(any(t['id'] == task['id'] and t['title'] == 'Written before the candidate upgrade' for t in api('/api/tasks')))
                self.assertEqual(profile.read_text(), 'Existing WebView profile preserved')
                self.assertEqual(note.read_text(), 'Notes and JSON files preserved')
                self.assertEqual(stable.read_text(), 'Stable remains untouched')
                manifest = json.loads((code / 'manifest.json').read_text())
                for item in manifest['files']:
                    self.assertEqual(hashlib.sha256((code / 'app' / item['path']).read_bytes()).hexdigest(), item['sha256'])
                self.assertTrue((code / 'app/public/library_refresh.js').is_file())
                self.assertTrue((code / 'app/public/calendar_decor.js').is_file())
                self.assertEqual(json.loads((data / 'windows-test-channel.json').read_text())['branch'], 'test/windows-library-calendar-20261103')
                backups = list(testroot.glob('SAUVEGARDE_AUTO_TEST_*'))
                self.assertEqual(len(backups), 1)
                self.assertTrue((backups[0] / 'data/atelier.db').is_file())
                self.assertTrue((backups[0] / 'code_avant/manifest.json').is_file())
                # Check through the running application: no downgrade to the shared channel.
                check = api('/api/update/check')
                self.assertFalse(check['available'])
                self.assertEqual(check['source_branch'], 'test/windows-library-calendar-20261103')
                print('PASS: actual Windows pinned upgrade, checksum, backup, task/profile preservation and private TEST channel')
            finally:
                try:
                    api('/api/shutdown', 'POST', {})
                except Exception:
                    pass
                if process and process.poll() is None:
                    process.wait(timeout=25)
                for _ in range(100):
                    with socket.socket() as sock:
                        if sock.connect_ex(('127.0.0.1', 8876)) != 0:
                            break
                    time.sleep(.2)
                subprocess.run(['subst.exe', 'E:', '/D'], check=True)


if __name__ == '__main__':
    unittest.main()
