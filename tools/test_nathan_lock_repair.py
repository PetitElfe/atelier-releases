"""Run the actual PowerShell repair only against a disposable local profile."""
import hashlib,os,sqlite3,subprocess,tempfile
from pathlib import Path
root=Path(__file__).resolve().parents[1]
with tempfile.TemporaryDirectory() as folder:
    base=Path(folder)/'LAtelierDuGoblinNathan'
    target=base/'code/app/updater.py';target.parent.mkdir(parents=True)
    fixed=(root/'app/updater.py').read_text(encoding='utf-8').replace('\r\n','\n')
    old=fixed.replace("'desktop-window.lock','desktop-postits.lock'","'desktop-postits.lock'")
    assert hashlib.sha256(old.encode()).hexdigest()=='5629470982060603971dc49e386028478488b5d047696b6fc5c68d4bcc6205ce'
    target.write_bytes(old.encode())
    data=base/'data';data.mkdir()
    with sqlite3.connect(data/'atelier.db') as c:c.execute('create table keep(value)')
    before=(data/'atelier.db').read_bytes()
    env=dict(os.environ,LOCALAPPDATA=folder)
    cmd=['powershell.exe','-NoProfile','-ExecutionPolicy','Bypass','-File',str(root/'tools/Reparer_Nathan_Verrou.ps1')]
    (data/'updater.lock').write_text('active')
    assert subprocess.run(cmd,env=env).returncode!=0
    assert target.read_bytes()==old.encode()
    (data/'updater.lock').unlink()
    subprocess.run(cmd,env=env,check=True)
    assert target.read_bytes()==fixed.encode()
    assert target.with_name('updater.py.avant-lock-fix').read_bytes()==old.encode()
    subprocess.run(cmd,env=env,check=True)
    assert (data/'atelier.db').read_bytes()==before
    target.write_bytes(b'unrecognized version')
    assert subprocess.run(cmd,env=env).returncode!=0
    assert target.read_bytes()==b'unrecognized version'
print('PASS: actual Windows PowerShell repair, active-worker guard, backup, idempotence, unknown-version refusal and unchanged SQLite')
