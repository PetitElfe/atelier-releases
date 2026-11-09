"""Harness tests only: no test here constitutes physical-device acceptance."""
import hashlib
from http.client import HTTPConnection
import importlib.util
import json
import os
from pathlib import Path
import re
import subprocess
import tempfile
from types import SimpleNamespace
import threading
import unittest
from unittest.mock import patch
import zipfile

ROOT = Path(__file__).resolve().parents[1]
SPEC = importlib.util.spec_from_file_location('hardware', ROOT / 'tools/hardware_checks/verification.py')
hardware = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(hardware)
PACKAGE = hardware.PACKAGE


def options(**overrides):
    return SimpleNamespace(**dict({'tailnet': None, 'adb': 'fake-adb', 'serial': None, 'port': 0}, **overrides))


class HardwareParsers(unittest.TestCase):
    def test_tailnet_url_requires_private_https_host_without_credentials_or_path(self):
        self.assertEqual(hardware.tailnet_url('https://pc.tail-example.ts.net/'), 'https://pc.tail-example.ts.net')
        for url in ('http://pc.test.ts.net', 'https://pc.ts.net.evil.invalid', 'https://user@pc.ts.net',
                    'https://pc.ts.net:8876', 'https://pc.ts.net/mobile.html', 'https://pc.ts.net?token=secret',
                    'https://pc.ts.net#secret', 'https://localhost', 'https://ts.net', 'https://pc.ts.net:bad'):
            with self.subTest(url=url), self.assertRaises(ValueError):
                hardware.tailnet_url(url)

    def test_read_pc_hashes_identity_and_does_not_claim_exact_build(self):
        class Response:
            def __init__(self, value): self.value = json.dumps(value).encode()
            def __enter__(self): return self
            def __exit__(self, *_): pass
            def read(self, _size): return self.value
        with patch.object(hardware, 'build_opener') as opener:
            opener.return_value.open.side_effect = [Response({'version': '0.18.0'}),
                                                    Response({'installation_id': 'private-profile'})]
            result = hardware.read_pc('https://pc.example.ts.net')
        self.assertEqual(result['identity_hash'], hashlib.sha256(b'private-profile').hexdigest())
        self.assertFalse(result['exact_build_verified'])
        self.assertNotIn('private-profile', json.dumps(result))

    def test_redirects_cannot_send_probe_to_another_host(self):
        with self.assertRaises(ValueError):
            hardware.NoRedirect().redirect_request(None, None, None, None, None)

    def test_provider_registration_does_not_count_as_bound_widget(self):
        provider = f'ComponentInfo{{{PACKAGE}/.AgendaWidgetProvider}}'
        raw = f'  Providers:\n    {provider}\n  Widgets:\n  Hosts:\n    com.android.launcher\n'
        self.assertTrue(hardware.widget_provider(raw))
        self.assertFalse(hardware.bound_widget(raw))
        for component in (provider, f'ComponentInfo{{{PACKAGE}/{PACKAGE}.AgendaWidgetProvider}}'):
            bound = f'  Widgets:\n    [0] id=9\n      provider={component}\n  Hosts:\n    launcher\n'
            self.assertTrue(hardware.bound_widget(bound))
        self.assertFalse(hardware.widget_provider(provider.replace(PACKAGE + '/', PACKAGE + '.other/')))

    def test_active_notifications_only_and_exact_application(self):
        raw = f'''Notification Manager state:
  Notification List:
    NotificationRecord(a pkg=other.application user=0)
      private-message Verification_Atelier_B
    NotificationRecord(b pkg={PACKAGE} user=0)
      text=Verification_Atelier_A private-reminder-body
    NotificationRecord(c pkg={PACKAGE}.other user=0)
      text=Rappel de test Android
  Notification archive:
    NotificationRecord(d pkg={PACKAGE} user=0)
      text=Verification_Atelier_B Rappel de test Android
  Ranking Config:
    pkg={PACKAGE} private-package-preferences
'''
        observed = hardware.own_notification_observations(raw)
        self.assertEqual(observed, {'atelier_active_records': 1, 'test_reminder_observed': False,
                                    'timer_a_observed': True, 'timer_b_observed': False})
        self.assertNotIn('private-', json.dumps(observed))
        self.assertEqual(hardware.own_notification_observations('unknown format'),
                         {'atelier_active_records': 0, 'test_reminder_observed': False,
                          'timer_a_observed': False, 'timer_b_observed': False})

    def observe_device(self, serial='real-phone', state='device', qemu='0', version=115):
        def run(args):
            if args == ['fake-adb', 'devices']:
                return f'List of devices attached\n{serial}\t{state}\n'
            if args[-2:] == ['getprop', 'ro.kernel.qemu']: return qemu
            if args[-3:] == ['dumpsys', 'package', PACKAGE]:
                return f'versionCode={version}\n android.permission.POST_NOTIFICATIONS: granted=true'
            if args[-2:] == ['dumpsys', 'appwidget']:
                return f'  Providers:\n    {PACKAGE}/.AgendaWidgetProvider\n  Widgets:\n  Hosts:\n'
            if args[-3:] == ['dumpsys', 'notification', '--noredact']:
                return f'  Notification List:\n    NotificationRecord(x pkg={PACKAGE} user=0)\n      Rappel de test Android\n  Ranking Config:\n'
            raise AssertionError('Unexpected or mutating command: ' + repr(args))
        with patch.object(hardware, 'run', side_effect=run), patch.object(hardware, 'read_pc', side_effect=OSError):
            return hardware.observe(options())

    def test_emulator_and_unauthorized_phones_never_validate_real_phone(self):
        for args in ({'serial': 'emulator-5554'}, {'qemu': '1'}, {'state': 'unauthorized'}, {'state': 'offline'}):
            with self.subTest(args=args):
                report = self.observe_device(**args)
                self.assertIn('blocked', report['android'])
                self.assertFalse(report['master_update_allowed'])
                self.assertEqual(report['physical_acceptance'], 'NOT_VALIDATED')

    def test_authorized_phone_observations_are_not_full_acceptance(self):
        result = self.observe_device()
        self.assertTrue(result['android']['physical_device'])
        self.assertTrue(result['android']['expected_version'])
        self.assertTrue(result['android']['test_reminder_observed'])
        self.assertFalse(result['android']['widget_bound_to_host'])
        self.assertNotIn('real-phone', json.dumps(result))
        self.assertEqual(result['physical_acceptance'], 'NOT_VALIDATED')
        self.assertFalse(result['master_update_allowed'])
        self.assertFalse(self.observe_device(version=114)['android']['expected_version'])

    def test_missing_adb_is_blocked_without_installing_anything(self):
        with patch.object(hardware, 'read_pc', side_effect=OSError), patch.object(hardware.shutil, 'which', return_value=None), \
                patch.object(hardware.Path, 'is_file', return_value=False), patch.object(hardware, 'run') as run:
            result = hardware.observe(options(adb=None))
        self.assertIn('blocked', result['android'])
        run.assert_not_called()

    def test_device_timeout_does_not_disclose_serial_or_command(self):
        error = subprocess.TimeoutExpired(['fake-adb', '-s', 'private-device-serial', 'shell'], 15)
        with patch.object(hardware, 'read_pc', side_effect=OSError), patch.object(hardware, 'run', side_effect=error):
            result = hardware.observe(options())
        self.assertIn('blocked', result['android'])
        self.assertNotIn('private-device-serial', json.dumps(result))
        self.assertNotIn('fake-adb', json.dumps(result))

    def test_pc_tailnet_probe_does_not_claim_phone_connectivity(self):
        with patch.object(hardware, 'read_pc', return_value={'identity_hash': 'same'}), \
                patch.object(hardware, 'run', side_effect=OSError('No phone')):
            report = hardware.observe(options(tailnet='https://pc.example.ts.net'))
        self.assertEqual(report['tailscale'], {'https_reachable_from_this_pc': True, 'same_installation': True})
        self.assertNotIn('pc.example.ts.net', json.dumps(report))
        self.assertFalse(report['master_update_allowed'])

    def test_participant_cannot_set_promotion_or_include_unrelated_data(self):
        clean = hardware.clean_observation({'checks': {c: 'pass' for c in hardware.CHECKS},
                                            'master_update_allowed': True, 'private_note': 'PRIVATE'})
        self.assertEqual(set(clean), {'checks'})
        self.assertNotIn('PRIVATE', json.dumps(clean))
        for value in ({'pen_min': -1}, {'pen_max': 1.1}, {'pen_samples': True}, {'pen_samples': .5},
                      {'strokes': float('nan')}, {'checks': {'android_widget': 'maybe'}},
                      {'checks': {'arbitrary': 'pass'}}, {'checks': []}, None):
            with self.subTest(value=value), self.assertRaises(ValueError):
                hardware.clean_observation(value)

    def test_copied_ink_engine_matches_production(self):
        production = (ROOT / 'app/public/studio_album.js').read_text(encoding='utf-8')
        copied = (hardware.HERE / 'ink.js').read_text(encoding='utf-8')
        ink_line = next(line for line in production.splitlines() if line.lstrip().startswith('S.ink=function('))
        self.assertIn(ink_line.strip(), copied)


class LocalProtocol(unittest.TestCase):
    def setUp(self):
        self.options = options()
        self.mock_observe = patch.object(hardware, 'observe', return_value={
            'physical_acceptance': 'NOT_VALIDATED', 'master_update_allowed': False})
        self.mock_observe.start()
        self.addCleanup(self.mock_observe.stop)
        self.report = hardware.new_report(self.options)
        self.saves = 0
        def save(): self.saves += 1
        self.server = hardware.make_server(self.options, self.report, save)
        thread = threading.Thread(target=self.server.serve_forever, daemon=True)
        thread.start()
        self.addCleanup(self.server.server_close)
        self.addCleanup(self.server.shutdown)
        self.port = self.server.server_port
        self.origin = f'http://127.0.0.1:{self.port}'
        code, html = self.request('GET', '/')
        self.assertEqual(code, 200)
        self.token = re.search(r'name="test-token" content="([^"]+)"', html).group(1)

    def request(self, method, path, value=None, **headers):
        connection = HTTPConnection('127.0.0.1', self.port, timeout=3)
        body = json.dumps(value) if value is not None else None
        connection.request(method, path, body, headers)
        response = connection.getresponse()
        code, text = response.status, response.read().decode()
        connection.close()
        return code, text

    def post(self, path, value, **headers):
        return self.request('POST', path, value, **{'Origin': self.origin, 'X-Test-Token': self.token, **headers})

    def test_local_host_token_and_origin_are_required(self):
        self.assertEqual(self.request('GET', '/', Host='attacker.invalid')[0], 403)
        self.assertEqual(self.request('GET', '/observations')[0], 403)
        self.assertEqual(self.post('/observations', {}, Origin='https://attacker.invalid')[0], 403)
        self.assertEqual(self.post('/observations', {}, **{'X-Test-Token': 'wrong'})[0], 403)
        self.assertEqual(self.request('GET', '/../verification.py')[0], 404)
        self.assertEqual(self.saves, 0)

    def test_all_manual_passes_still_require_review_and_preserve_denial(self):
        self.assertEqual(self.post('/observations', {'checks': {c: 'pass' for c in hardware.CHECKS},
                                                    'master_update_allowed': True})[0], 200)
        self.assertTrue(self.report['review_required'])
        self.assertFalse(self.report['observations']['master_update_allowed'])
        self.assertEqual(self.report['observations']['physical_acceptance'], 'NOT_VALIDATED')
        self.assertEqual(self.saves, 1)

    def test_invalid_measurement_or_oversized_post_does_not_replace_report(self):
        for value in ({'checks': {'android_widget': 'invalid'}}, {'pen_max': 5}, {'secret': 'x' * 4100}):
            self.assertEqual(self.post('/observations', value)[0], 400)
        self.assertEqual(self.report['participant'], {})
        self.assertEqual(self.saves, 0)

    def test_tailnet_configuration_is_validated_and_never_saved(self):
        self.assertEqual(self.post('/tailnet', {'url': 'http://arbitrary.invalid'})[0], 400)
        self.assertIsNone(self.options.tailnet)
        self.assertEqual(self.post('/tailnet', {'url': 'https://pc.example.ts.net'})[0], 200)
        self.assertEqual(self.options.tailnet, 'https://pc.example.ts.net')
        self.assertNotIn('pc.example.ts.net', json.dumps(self.report))

    def test_history_is_bounded_and_preserves_prior_observations(self):
        for _ in range(27):
            self.assertEqual(self.request('GET', '/observations', **{'X-Test-Token': self.token})[0], 200)
        self.assertEqual(len(self.report['history']), 24)
        self.assertTrue(all(not r['master_update_allowed'] for r in self.report['history']))


@unittest.skipUnless(os.name == 'nt', 'Windows launcher test requires Windows; not a physical-device test')
class WindowsLauncher(unittest.TestCase):
    def test_extracted_zip_launcher_handles_spaces_and_creates_only_observations(self):
        with tempfile.TemporaryDirectory(prefix='Atelier essais avec espaces ') as temporary:
            root = Path(temporary)
            archive = root / 'essais.zip'
            names = ('verification.py', 'verification.html', 'checks.js', 'ink.js', 'Lancer_les_essais.cmd')
            with zipfile.ZipFile(archive, 'w') as z:
                for name in names:
                    content = (hardware.HERE / name).read_bytes().replace(b'\r\n', b'\n')
                    z.writestr('dossier extrait/' + name, content)
            with zipfile.ZipFile(archive) as z: z.extractall(root)
            folder = root / 'dossier extrait'
            result = subprocess.run(['cmd.exe', '/d', '/c', 'Lancer_les_essais.cmd --collect-only --output resultats'],
                                    cwd=folder, input='\n', text=True, capture_output=True, encoding='utf-8',
                                    errors='replace', timeout=40)
            self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
            reports = list((folder / 'resultats').glob('observations_*.json'))
            self.assertEqual(len(reports), 1)
            report = json.loads(reports[0].read_text(encoding='utf-8'))
            self.assertFalse(report['observations']['master_update_allowed'])
            self.assertTrue(report['review_required'])

    def test_partial_extraction_is_explained_and_exits_nonzero(self):
        with tempfile.TemporaryDirectory(prefix='Atelier incomplet ') as temporary:
            folder = Path(temporary)
            (folder / 'Lancer_les_essais.cmd').write_bytes((hardware.HERE / 'Lancer_les_essais.cmd').read_bytes())
            result = subprocess.run(['cmd.exe', '/d', '/c', 'Lancer_les_essais.cmd --collect-only'], cwd=folder,
                                    input='\n', text=True, capture_output=True, encoding='utf-8', errors='replace', timeout=10)
            self.assertEqual(result.returncode, 2)
            self.assertIn('Extrais tout le ZIP', result.stdout)
            self.assertFalse((folder / 'resultats').exists())


if __name__ == '__main__':
    unittest.main()
