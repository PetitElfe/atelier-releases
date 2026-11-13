"""Snapshot regression, including a real Windows byte-range lock."""
import importlib.util
import sqlite3
from contextlib import closing
import tempfile
from pathlib import Path
from unittest.mock import patch
spec=importlib.util.spec_from_file_location('lock_updater',Path(__file__).resolve().parents[1]/'app/updater.py')
u=importlib.util.module_from_spec(spec);spec.loader.exec_module(u)
with tempfile.TemporaryDirectory() as folder:
    root=Path(folder);u.DATA=root/'data';u.DATA.mkdir();backup=root/'backup';backup.mkdir()
    with closing(sqlite3.connect(u.DATA/'atelier.db')) as c:
        c.execute('create table keep(value)');c.execute('insert into keep values (42)');c.commit()
    lock=u.DATA/'desktop-window.lock';lock.write_bytes(b'x')
    (u.DATA/'drawing.png').write_bytes(b'personal drawing')
    original=u.shutil.copytree
    original_read=Path.read_bytes
    def guarded_read(path):
        if path==lock:raise PermissionError('locked file must never be read')
        return original_read(path)
    def guarded_tree(src,dst,**kw):
        ignored=kw['ignore'](str(src),[p.name for p in Path(src).iterdir()])
        assert 'desktop-window.lock' in ignored
        return original(src,dst,**kw)
    with lock.open('r+b') as held:
        import os
        if os.name=='nt':
            import msvcrt
            msvcrt.locking(held.fileno(),msvcrt.LK_NBLCK,1)
        try:
            with patch.object(u.shutil,'copytree',guarded_tree),patch.object(Path,'read_bytes',guarded_read):
                u._backup(backup)
        finally:
            if os.name=='nt':
                held.seek(0);msvcrt.locking(held.fileno(),msvcrt.LK_UNLCK,1)
    assert not (backup/'data/desktop-window.lock').exists()
    assert (backup/'data/drawing.png').read_bytes()==b'personal drawing'
    with closing(sqlite3.connect(backup/'data/atelier.db')) as c:
        assert c.execute('select value from keep').fetchone()==(42,)
print('PASS: locked desktop window file omitted; personal file and SQLite preserved')
