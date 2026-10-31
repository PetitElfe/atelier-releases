"""Regression tests: closing the native window releases only its own server."""
import os
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import MagicMock, patch

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "app"))
sys.path.insert(0, str(ROOT / "tools"))
import desktop_shell
import nathan_launcher


class Response:
    headers = {"Server": "AtelierLocal/TEST"}

    def __init__(self, phase="idle"):
        self.phase = phase

    def read(self, size=-1):
        return ('{"phase":"' + self.phase + '"}').encode("utf-8")

    def __enter__(self):
        return self

    def __exit__(self, *args):
        return False


class DesktopLifecycleTests(unittest.TestCase):
    def test_test_server_closed_after_window_exits(self):
        child = MagicMock()
        child.poll.return_value = None
        with (patch.object(desktop_shell, "_probe", return_value=True),
              patch.object(desktop_shell, "_port_open", side_effect=[True, False]),
              patch.object(desktop_shell, "urlopen", side_effect=[Response(), Response()]) as http,
              patch.object(desktop_shell.time, "sleep")):
            desktop_shell._stop_own_server(child)
        self.assertEqual(http.call_count, 2)
        self.assertEqual(http.call_args.args[0].get_method(), "POST")
        child.terminate.assert_not_called()

    def test_test_server_closed_after_updater_replaced_original_child(self):
        child = MagicMock()
        child.poll.return_value = 0  # old process exited; new server still listens
        with (patch.object(desktop_shell, "_probe", return_value=True),
              patch.object(desktop_shell, "_port_open", return_value=False),
              patch.object(desktop_shell, "urlopen", side_effect=[Response("success"), Response()]) as http):
            desktop_shell._stop_own_server(child)
        self.assertEqual(http.call_count, 2)
        child.terminate.assert_not_called()

    def test_test_busy_updater_is_not_interrupted(self):
        child = MagicMock()
        for phase in ("starting", "download", "stopping", "backup", "installing"):
            with self.subTest(phase=phase):
                with (patch.object(desktop_shell, "_probe", return_value=True),
                      patch.object(desktop_shell, "urlopen", return_value=Response(phase)) as http,
                      patch.object(desktop_shell, "_port_open") as port):
                    desktop_shell._stop_own_server(child)
                self.assertEqual(http.call_count, 1)
                port.assert_not_called()
                child.terminate.assert_not_called()

    def test_test_never_stops_preexisting_or_foreign_server(self):
        with (patch.object(desktop_shell, "_probe") as probe,
              patch.object(desktop_shell, "urlopen") as http):
            desktop_shell._stop_own_server(None)
            probe.assert_not_called()
            http.assert_not_called()
        with (patch.object(desktop_shell, "_probe", return_value=False),
              patch.object(desktop_shell, "urlopen") as http):
            desktop_shell._stop_own_server(MagicMock())
            http.assert_not_called()

    def test_test_force_terminates_only_owned_child_if_shutdown_stalls(self):
        child = MagicMock()
        child.poll.return_value = None
        with (patch.object(desktop_shell, "_probe", return_value=True),
              patch.object(desktop_shell, "_port_open", side_effect=[True]*30+[False]),
              patch.object(desktop_shell, "urlopen", side_effect=[Response(), Response()]),
              patch.object(desktop_shell.time, "sleep")):
            desktop_shell._stop_own_server(child)
        child.terminate.assert_called_once()
        child.wait.assert_called_once_with(timeout=3)

    def test_nathan_closes_its_server_after_updater_replaced_child(self):
        child = MagicMock()
        child.poll.return_value = 0
        with (patch.object(nathan_launcher, "_probe", return_value=True),
              patch.object(nathan_launcher, "_busy", return_value=False),
              patch.object(nathan_launcher, "urlopen", side_effect=[Response("success"), Response()]) as http):
            nathan_launcher.stop_own_server(child)
        self.assertEqual(http.call_count, 2)
        self.assertIn("8877", http.call_args.args[0].full_url)
        child.terminate.assert_not_called()

    def test_nathan_never_stops_preexisting_or_busy_server(self):
        with patch.object(nathan_launcher, "urlopen") as http:
            nathan_launcher.stop_own_server(None)
            http.assert_not_called()
        with (patch.object(nathan_launcher, "_probe", return_value=True),
              patch.object(nathan_launcher, "urlopen", return_value=Response("installing")) as http):
            nathan_launcher.stop_own_server(MagicMock())
            self.assertEqual(http.call_count, 1)

    @unittest.skipUnless(os.name == "nt", "Windows-only byte-range lock")
    def test_windows_prevents_duplicate_test_windows_and_releases_lock(self):
        with tempfile.TemporaryDirectory() as temp:
            with patch.object(desktop_shell, "DATA", Path(temp)):
                with desktop_shell._one_desktop_window():
                    with self.assertRaisesRegex(RuntimeError, "déjà ouverte"):
                        with desktop_shell._one_desktop_window():
                            pass
                with desktop_shell._one_desktop_window():
                    pass

    @unittest.skipUnless(os.name == "nt", "Windows-only byte-range lock")
    def test_windows_prevents_duplicate_nathan_windows_and_releases_lock(self):
        with tempfile.TemporaryDirectory() as temp:
            with nathan_launcher.one_window(Path(temp)):
                with self.assertRaisesRegex(RuntimeError, "déjà ouverte"):
                    with nathan_launcher.one_window(Path(temp)):
                        pass
            with nathan_launcher.one_window(Path(temp)):
                pass


if __name__ == "__main__":
    unittest.main()
