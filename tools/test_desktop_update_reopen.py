"""Use a disposable native window on CI, never the user's installed window."""
import base64
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import time
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'app'))
import desktop_restart


class DesktopUpdateReopen(unittest.TestCase):
    def test_independent_runtime_environment(self):
        original = {'PATH': 'keep', 'ATELIER_DATA_DIR': 'keep-data',
                    '_PYI_APPLICATION_HOME_DIR': 'deleted-runtime',
                    '_PYI_ARCHIVE_FILE': 'old-exe', '_PYI_PARENT_PROCESS_LEVEL': '1',
                    '_MEIPASS2': 'old-runtime', 'PYINSTALLER_RESET_ENVIRONMENT': '0'}
        clean = desktop_restart.independent_environment(original)
        self.assertEqual(clean, {'PATH': 'keep', 'ATELIER_DATA_DIR': 'keep-data',
                                'PYINSTALLER_RESET_ENVIRONMENT': '1'})
        self.assertEqual(original['_PYI_APPLICATION_HOME_DIR'], 'deleted-runtime')

    def test_scoped_graceful_script(self):
        script = desktop_restart.restart_script(Path('fixture'), Path('data'))
        self.assertIn('Path -ieq $exe', script)
        self.assertIn('CloseMainWindow()', script)
        self.assertIn('WaitForExit(20000)', script)
        self.assertNotIn('Stop-Process', script)
        self.assertNotIn('Kill(', script)
        self.assertIn("$env:PYINSTALLER_RESET_ENVIRONMENT='1'", script)

    @unittest.skipUnless(os.name == 'nt' and os.environ.get('GITHUB_ACTIONS') == 'true',
                         'frozen native host test is CI-only')
    def test_frozen_host_reextracts_python_after_old_runtime_is_deleted(self):
        with tempfile.TemporaryDirectory(prefix='atelier-frozen-reopen-') as temporary:
            base = Path(temporary)
            data = base / 'data'
            desktop = base / 'desktop'
            data.mkdir()
            desktop.mkdir()
            launches = base / 'launches.jsonl'
            source = base / 'frozen_fixture.py'
            source.write_text('import os,sys,json,tkinter as tk\n'
                'from pathlib import Path\n'
                'root=tk.Tk()\nroot.title("Disposable frozen Atelier TEST")\n'
                'with Path(' + repr(str(launches)) + ').open("a",encoding="utf-8") as f:\n'
                ' f.write(json.dumps({"pid":os.getpid(),"runtime":sys._MEIPASS,"env":dict(os.environ)})+"\\n")\n'
                'root.mainloop()\n', encoding='utf-8')
            subprocess.run([sys.executable, '-m', 'PyInstaller', '--noconfirm', '--clean',
                '--onefile', '--windowed', '--name', 'LAtelierDuGoblin_TEST',
                '--distpath', str(desktop), '--workpath', str(base / 'build'),
                '--specpath', str(base), str(source)], check=True, capture_output=True, timeout=180)
            exe = desktop / 'LAtelierDuGoblin_TEST.exe'
            old = subprocess.Popen([str(exe)], env=desktop_restart.independent_environment())
            records = []
            try:
                for _ in range(200):
                    if launches.exists():
                        records = [json.loads(x) for x in launches.read_text(encoding='utf-8').splitlines()]
                    if records:
                        break
                    time.sleep(.1)
                self.assertTrue(records, 'Frozen host must open its first Tk window')
                first = records[0]
                self.assertIn('_PYI_APPLICATION_HOME_DIR', first['env'])
                revision = 'b' * 40
                (data / 'updater-state.json').write_text(json.dumps({'phase': 'success', 'revision': revision}))
                # Reproduce the actual server inheriting its original frozen window's bootloader state.
                inherited = {k:v for k,v in first['env'].items() if k.startswith('_PYI_') or k == '_MEIPASS2'}
                with patch.dict(os.environ, inherited):
                    self.assertTrue(desktop_restart.schedule(base, data, revision)['scheduled'])
                for _ in range(450):
                    records = [json.loads(x) for x in launches.read_text(encoding='utf-8').splitlines()]
                    if len(records) == 2 and old.poll() is not None:
                        break
                    time.sleep(.1)
                self.assertEqual(len(records), 2, (data / 'desktop-restart.log').read_text(errors='replace'))
                self.assertIsNotNone(old.poll(), 'Old one-file parent must exit')
                self.assertFalse(Path(first['runtime']).exists(), 'Old _MEI directory was really deleted')
                self.assertNotEqual(records[1]['runtime'], first['runtime'])
                self.assertTrue(Path(records[1]['runtime'], 'python313.dll').is_file())
                self.assertTrue(desktop_restart.schedule(base, data, revision)['already_requested'])
            finally:
                if launches.exists():
                    for line in launches.read_text(encoding='utf-8').splitlines():
                        subprocess.run(['taskkill', '/PID', str(json.loads(line)['pid']), '/T', '/F'], capture_output=True)
                if old.poll() is None:
                    old.terminate()
                old.wait(timeout=10)
                time.sleep(2)

    @unittest.skipUnless(os.name == 'nt' and os.environ.get('GITHUB_ACTIONS') == 'true',
                         'native synthetic host test is CI-only')
    def test_existing_exe_closes_and_reopens_once(self):
        with tempfile.TemporaryDirectory(prefix='atelier-native-reopen-') as temporary:
            base = Path(temporary)
            data = base / 'data'
            desktop = base / 'desktop'
            data.mkdir()
            desktop.mkdir()
            exe = desktop / 'LAtelierDuGoblin_TEST.exe'
            launches = base / 'launches.txt'
            source = base / 'SyntheticWindow.cs'
            source.write_text('using System;using System.IO;using System.Diagnostics;'
                'using System.Windows.Forms;class SyntheticWindow{[STAThread]static void Main(){'
                'File.AppendAllText(@"' + str(launches).replace('"', '""') + '",'
                'Process.GetCurrentProcess().Id.ToString()+Environment.NewLine);'
                'Application.Run(new Form(){Text="Disposable Atelier TEST fixture"});}}')
            csc = Path(os.environ['WINDIR']) / 'Microsoft.NET/Framework64/v4.0.30319/csc.exe'
            subprocess.run([str(csc), '/nologo', '/target:winexe', '/reference:System.Windows.Forms.dll',
                            '/out:' + str(exe), str(source)], check=True, capture_output=True)
            old = subprocess.Popen([str(exe)])
            try:
                for _ in range(100):
                    if launches.exists():
                        break
                    time.sleep(.1)
                time.sleep(1)
                revision = 'a' * 40
                (data / 'updater-state.json').write_text(json.dumps({'phase': 'success', 'revision': revision}))
                self.assertTrue(desktop_restart.schedule(base, data, revision)['scheduled'])
                self.assertTrue(desktop_restart.schedule(base, data, revision)['already_requested'])
                result = {}
                for _ in range(200):
                    try:
                        result = json.loads((data / 'desktop-restart-state.json').read_text(encoding='utf-8-sig'))
                    except (OSError, ValueError):
                        pass
                    if result.get('phase') in ('error', 'reopened'):
                        break
                    time.sleep(.2)
                self.assertEqual(result.get('phase'), 'reopened', {'state':result,'log':(data/'desktop-restart.log').read_text(encoding='utf-8',errors='replace') if (data/'desktop-restart.log').exists() else 'missing'})
                for _ in range(50):
                    if len(launches.read_text().splitlines()) == 2:
                        break
                    time.sleep(.1)
                self.assertEqual(len(launches.read_text().splitlines()), 2)
                self.assertIsNotNone(old.poll(), 'The old native host fully exited')
            finally:
                # Exact disposable fixture PIDs only; no process-name termination.
                if launches.exists():
                    for pid in launches.read_text().splitlines():
                        subprocess.run(['taskkill', '/PID', pid, '/F'], capture_output=True)
                time.sleep(.5)


if __name__ == '__main__':
    unittest.main()
