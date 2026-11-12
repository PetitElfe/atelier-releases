"""Run only on disposable Windows runner: no real profile is opened."""
import json,os,subprocess,tempfile,time,urllib.request,urllib.error,sqlite3,sys,hashlib,shutil
from pathlib import Path
from contextlib import closing
ROOT=Path(__file__).resolve().parents[1];EXE=ROOT/'dist/LAtelierDuGoblin_Nathan.exe'
def api(path,body=None,method=None):
 req=urllib.request.Request('http://127.0.0.1:8877'+path,data=json.dumps(body).encode() if body is not None else None,headers={'Content-Type':'application/json','Origin':'http://127.0.0.1:8877','X-Atelier-Desktop':'1','X-Atelier-Update':'1'},method=method)
 with urllib.request.urlopen(req,timeout=30) as r:return json.load(r)
def shutdown(data):
 import ctypes
 from ctypes import wintypes
 kernel=ctypes.WinDLL('kernel32',use_last_error=True)
 kernel.OpenProcess.argtypes=[wintypes.DWORD,wintypes.BOOL,wintypes.DWORD];kernel.OpenProcess.restype=wintypes.HANDLE
 kernel.WaitForSingleObject.argtypes=[wintypes.HANDLE,wintypes.DWORD];kernel.WaitForSingleObject.restype=wintypes.DWORD
 kernel.CloseHandle.argtypes=[wintypes.HANDLE]
 pid=int((data/'server.pid').read_text().strip())
 handle=kernel.OpenProcess(0x100000,False,pid)
 try:
  api('/api/shutdown',{})
  if handle:assert kernel.WaitForSingleObject(handle,30000)==0,'Own fixture server did not exit'
 finally:
  if handle:kernel.CloseHandle(handle)

def ready():
 for _ in range(100):
  try:
   if api('/api/runtime-version')['version']=='0.18.0':return
  except Exception:pass
  time.sleep(.25)
 raise RuntimeError('Frozen Nathan server did not become ready')
folder=tempfile.mkdtemp()
try:
 env=dict(os.environ,LOCALAPPDATA=folder);base=Path(folder)/'LAtelierDuGoblinNathan';data=base/'data';installed=base/'desktop'/EXE.name
 subprocess.run([str(EXE),'--nathan-install-only'],env=env,timeout=90,check=True)
 assert installed.exists() and not (data/'atelier.db').exists()
 server=subprocess.Popen([str(installed),'--nathan-server'],env=env);postit_pid=None
 try:
  ready();task=api('/api/tasks',{'title':'Nathan task preserved'});(data/'own-document.bin').write_bytes(b'Nathan own document');profile=base/'profile';profile.mkdir();(profile/'layout').write_bytes(b'private layout')
  for path in ['/jdr.html','/api/jdr/state','/api/personal-design','/api/creator-access']:
   try:api(path);raise AssertionError('Owner feature exposed '+path)
   except urllib.error.HTTPError as e:assert e.code==404
  # The real frozen exe must propagate --note to the Tk companion.
  import uuid
  note=api('/api/desktop-postits/new',{'operation_id':str(uuid.uuid4())});assert note['display_confirmed']
  runtime=json.loads((data/'desktop-postits-runtime.json').read_text());postit_pid=runtime['pid'];assert runtime['visible_ids']
  shutdown(data);server.wait(timeout=30)
 finally:
  if postit_pid:subprocess.run(['taskkill','/PID',str(postit_pid),'/T','/F'],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
  if server.poll() is None:server.terminate();server.wait(timeout=10)
 # Simulate a recognized old Nathan manifest while keeping real personal data.
 manifest=base/'code/manifest.json';old=json.loads(manifest.read_text());old['build_sequence']=1;manifest.write_text(json.dumps(old))
 before=(data/'own-document.bin').read_bytes()
 subprocess.run([str(EXE),'--nathan-install-only'],env=env,timeout=90,check=True)
 assert (data/'own-document.bin').read_bytes()==before and (profile/'layout').read_bytes()==b'private layout'
 with closing(sqlite3.connect(data/'atelier.db')) as c:assert c.execute('SELECT title FROM tasks WHERE id=?',(task['id'],)).fetchone()[0]=='Nathan task preserved'
 assert list((base/'backups').glob('*/data/atelier.db'))
 fixture_updater=base/'code/app/updater.py'
 fixture_updater.write_text(fixture_updater.read_text(encoding='utf-8').replace("return 'test/windows-nathan-current'","return 'test/scale-nathan-20261112'"),encoding='utf-8')
 server=subprocess.Popen([str(installed),'--nathan-server'],env=env)
 try:
  ready();assert any(t['title']=='Nathan task preserved' for t in api('/api/tasks'))
  # A source-pinned in-app worker exercises network download, online SQLite
  # backup, in-place replacement, restart and user-data preservation.
  check=api('/api/update/check');assert check['available'] and check['revision']==os.environ['GITHUB_SHA'],check
  assert api('/api/update/start',{'revision':check['revision']})['ok']
  for attempt in range(240):
   time.sleep(1)
   try:
    status=api('/api/update/status')
    if status['phase'] in ('success','error'):break
   except Exception:pass
  assert status['phase']=='success',status
  assert (base/'code/app/public/display_preferences.js').is_file()
  assert "return 'test/windows-nathan-current'" in fixture_updater.read_text(encoding='utf-8')
  assert (data/'own-document.bin').read_bytes()==before
  shutdown(data)
 finally:
  if server.poll() is None:server.terminate()
 print('PASS: frozen fresh install, native note ACK, safe existing-profile upgrade, preserved SQLite/files/layout, source-pinned in-app update/restart; owner APIs inaccessible')

finally:
 # The actual server has exited (asserted above); its onefile loader can still
 # hold the inherited log handle briefly while it removes its own runtime.
 for attempt in range(40):
  try:shutil.rmtree(folder);break
  except PermissionError:
   if attempt==39:raise
   time.sleep(.25)
