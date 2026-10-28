"""Real Windows integration: native TEST WebView server lifecycle on a fake E:."""
import json
import os
import subprocess
import sys
import time
from pathlib import Path
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "app"))
import desktop_shell as shell

BASE = Path(r"E:\LATELIER_TEST_0180")
CODE = BASE / "code_0180"
DATA = BASE / "data"
URL = "http://127.0.0.1:8876/"
children = []


def wait_ready(timeout=25):
    end = time.monotonic() + timeout
    while time.monotonic() < end:
        if shell._probe():
            return
        time.sleep(.2)
    raise AssertionError("TEST server did not start on port 8876")


def wait_gone(timeout=10):
    end = time.monotonic() + timeout
    while time.monotonic() < end:
        if not shell._port_open():
            return
        time.sleep(.2)
    raise AssertionError("TEST port 8876 remained occupied after closing the window")


def start():
    env = os.environ.copy()
    env.update(ATELIER_DATA_DIR=str(DATA), ATELIER_PORT="8876",
               ATELIER_NO_BROWSER="1")
    log = (DATA / "desktop-lifecycle-test.log").open("ab", buffering=0)
    try:
        child = subprocess.Popen(
            [sys.executable, "-u", str(CODE / "app" / "app.py")],
            cwd=str(CODE), env=env, stdin=subprocess.DEVNULL,
            stdout=log, stderr=subprocess.STDOUT,
            creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0),
        )
    finally:
        log.close()
    children.append(child)
    wait_ready()
    return child


def stop_via_api():
    with urlopen(Request(URL + "api/shutdown", data=b"{}", method="POST",
                         headers={"Content-Type": "application/json"}), timeout=3):
        pass
    wait_gone()


try:
    assert shell.PORT == 8876
    assert shell.TEST_ROOT == BASE
    assert (DATA / "atelier.db").exists() or DATA.is_dir()

    # Normal GUI close should stop the server it launched.
    original = start()
    shell._stop_own_server(original)
    wait_gone()
    original.wait(timeout=10)
    print("PASS: normal TEST window close releases port 8876", flush=True)

    # Update worker replaces the original process while WebView stays open.
    old = start()
    stop_via_api()
    old.wait(timeout=10)
    replacement = start()
    assert old.poll() is not None and replacement.poll() is None
    shell._stop_own_server(old)
    wait_gone()
    replacement.wait(timeout=10)
    print("PASS: closing WebView after updater restart releases replacement server", flush=True)

    # Closing the GUI must not interrupt an ongoing update.
    busy = start()
    (DATA / "updater-state.json").write_text(
        json.dumps({"phase": "installing", "detail": "fixture"}), encoding="utf-8")
    shell._stop_own_server(busy)
    assert shell._port_open() and busy.poll() is None
    (DATA / "updater-state.json").write_text(
        json.dumps({"phase": "idle", "detail": ""}), encoding="utf-8")
    shell._stop_own_server(busy)
    wait_gone()
    busy.wait(timeout=10)
    print("PASS: busy update protected; idle server closes safely", flush=True)
finally:
    try:
        if shell._probe():
            stop_via_api()
    except Exception:
        pass
    for child in children:
        if child.poll() is None:
            child.terminate()
            try:
                child.wait(timeout=4)
            except subprocess.TimeoutExpired:
                child.kill()
