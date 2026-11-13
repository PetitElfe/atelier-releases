"""Disposable native fixture only: no user PNG, GitHub login or publication."""
import sys,tempfile,time,subprocess,struct
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'app'))
import official_icon_publish as publisher
with tempfile.TemporaryDirectory() as folder:
 root=Path(folder)/'profil avec espace é';root.mkdir();source=root/'synthetic.png'
 script="param([string]$OutFile);$ErrorActionPreference='Stop';Add-Type -AssemblyName System.Drawing;$b=New-Object Drawing.Bitmap(32,32);$b.SetPixel(0,0,[Drawing.Color]::Green);$b.Save($OutFile,[Drawing.Imaging.ImageFormat]::Png);$b.Dispose()"
 generator=root/'generate.ps1';generator.write_text(script)
 subprocess.run(['powershell.exe','-NoProfile','-ExecutionPolicy','Bypass','-File',str(generator),'-OutFile',str(source)],check=True,timeout=30)
 publisher.prepare(root,source.read_bytes())
 for _ in range(200):
  s=publisher.status()
  if s['phase'] not in ('preparing','publishing'):break
  time.sleep(.2)
 assert s['phase']=='ready',s
 draft=publisher._session;assert not (draft['folder']/'source.png').exists()
 meta=draft['metadata'];png=(draft['folder']/('icon-'+meta['png_sha256']+'.png')).read_bytes();ico=(draft['folder']/('icon-'+meta['ico_sha256']+'.ico')).read_bytes()
 assert struct.unpack('>II',png[16:24])==(1024,1024)
 assert ico[:4]==b'\0\0\1\0' and struct.unpack('<H',ico[4:6])[0]==7
 publisher.cancel(s['draft_id']);assert not draft['folder'].exists();assert source.exists()
 print('PASS: real Windows PNG conversion, spaces/Unicode path, 1024 PNG, seven ICO sizes, original source intact and cancelled draft erased; no network')
