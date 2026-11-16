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

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'app'))
import desktop_restart


class DesktopUpdateReopen(unittest.TestCase):
    def test_scoped_graceful_script(self):
        script = desktop_restart.restart_script(Path('fixture'), Path('data'))
        self.assertIn('ExecutablePath -ieq $exe', script)
        self.assertIn('CloseMainWindow()', script)
        self.assertIn('WaitForExit(20000)', script)
        self.assertNotIn('Stop-Process', script)
        self.assertNotIn('Kill(', script)

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
                self.assertEqual(result.get('phase'), 'reopened', result)
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
