"""Prepare the source bundle embedded in Nathan's independent Windows EXE."""
from pathlib import Path
import shutil
import sys
import tempfile

ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/"app"))
from nathan_bundle import copy_verified_source,verify_payload


def main():
    destination=ROOT/"build"/"nathan_payload"/"payload_code"
    if destination.exists():
        shutil.rmtree(destination)
    destination.parent.mkdir(parents=True,exist_ok=True)
    copy_verified_source(ROOT,destination)
    verify_payload(destination)
    import py_compile
    for name in ("app.py","app_part1.py","app_part2.py","app_part3.py",
                 "nathan_updater.py","nathan_bundle.py","nathan_postits.py"):
        py_compile.compile(str(destination/"app"/name),doraise=True)
    # Server startup requires an empty personal database, never source data.
    assert not any(destination.rglob("*.db"))
    assert not any(destination.rglob("desktop-profile"))
    print("PASS: verified Nathan payload, isolated imports, safe paths, Python code")


if __name__=="__main__":
    main()
