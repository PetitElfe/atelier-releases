import json
import os
import sys
import tempfile
import unittest
from pathlib import Path, PosixPath
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'app'))
import updater


class WindowsTestChannelTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.data = self.root / 'data'
        self.code = self.root / 'code'
        (self.code / 'app').mkdir(parents=True)
        self.data.mkdir()
        (self.data / 'atelier.db').touch()
        (self.code / 'manifest.json').write_text('{}')
        for key, value in [('BASE', self.root), ('DATA', self.data), ('CODE', self.code)]:
            p = patch.object(updater, key, value)
            p.start()
            self.addCleanup(p.stop)

    def test_stale_channel_cannot_offer_a_downgrade(self):
        updater._prevent_downgrade({}, {'build_sequence':2026110401})
        updater._prevent_downgrade({'build_sequence':2026110401}, {'build_sequence':2026110402})
        for stale in ({}, {'build_sequence':2026110301}):
            with self.assertRaises(RuntimeError):updater._prevent_downgrade({'build_sequence':2026110401}, stale)
        with self.assertRaises(RuntimeError):updater._prevent_downgrade({}, {'build_sequence':'bad'})

    def test_only_explicit_local_candidate_opt_in_changes_the_default(self):
        self.assertEqual(updater._selected_branch(), updater.BRANCH)
        config = self.data / 'windows-test-channel.json'
        config.write_text(json.dumps({'branch': updater.CANDIDATE_BRANCH}))
        self.assertEqual(updater._selected_branch(), updater.CANDIDATE_BRANCH)
        config.unlink()
        self.assertEqual(updater._selected_branch(), updater.BRANCH)

    def test_untrusted_channel_does_not_fall_back_or_fetch_an_arbitrary_branch(self):
        config = self.data / 'windows-test-channel.json'
        for raw in ['bad json', '[]', '{"branch":"main"}', '{"branch":"https://other.example"}']:
            config.write_text(raw)
            with self.assertRaises(RuntimeError):
                updater._selected_branch()

    def test_redirected_channel_is_rejected(self):
        other = self.root / 'other.json'
        other.write_text(json.dumps({'branch': updater.CANDIDATE_BRANCH}))
        config = self.data / 'windows-test-channel.json'
        try:
            config.symlink_to(other)
        except OSError:
            self.skipTest('Symlinks unavailable on this runner')
        with self.assertRaises(RuntimeError):
            updater._selected_branch()

    @unittest.skipIf(os.name == 'nt', 'PosixPath fixtures for isolated Linux guard test')
    def test_external_runner_keeps_target_environment_guards(self):
        env = {'ATELIER_DATA_DIR': str(self.data), 'ATELIER_PORT': '8876'}
        with patch.object(updater.os, 'name', 'nt'), patch.object(updater, 'Path', PosixPath), patch.dict(os.environ, env):
            with self.assertRaises(RuntimeError):
                updater.guard()  # An external file cannot use the normal server route.
            updater.guard(external_runner=True)
            os.environ['ATELIER_PORT'] = '8877'
            with self.assertRaises(RuntimeError):
                updater.guard(external_runner=True)
            os.environ['ATELIER_PORT'] = '8876'
            os.environ['ATELIER_DATA_DIR'] = str(self.root / 'foreign')
            with self.assertRaises(RuntimeError):
                updater.guard(external_runner=True)


if __name__ == '__main__':
    unittest.main()
