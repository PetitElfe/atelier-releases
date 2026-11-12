"""Disposable Windows fixture only: generated PNG, own shortcut and own window."""
import ctypes,struct,subprocess,tempfile,os,sys,time,json,uuid
from pathlib import Path
from unittest.mock import patch
ROOT=Path(__file__).resolve().parents[1];sys.path.insert(0,str(ROOT/'app'));import local_icon
PS=ROOT/'app/local_icon.ps1'

def run(script):
 result=subprocess.run(['powershell.exe','-NoProfile','-NonInteractive','-STA','-Command',script],capture_output=True,text=True,timeout=30)
 assert result.returncode==0,result.stderr
 return result.stdout.strip()
def quoted(path):return "'"+str(path).replace("'","''")+"'"

with tempfile.TemporaryDirectory() as name:
 root=Path(name);png=root/'synthetic-private-source.png';ico=root/'generated.ico';exe=root/'fixture.exe';exe.write_bytes(b'MZ')
 run("Add-Type -AssemblyName System.Drawing;$b=New-Object Drawing.Bitmap(180,120);$g=[Drawing.Graphics]::FromImage($b);$g.Clear([Drawing.Color]::Transparent);$g.FillEllipse([Drawing.Brushes]::Purple,20,10,120,100);$b.Save("+quoted(png)+",[Drawing.Imaging.ImageFormat]::Png);$g.Dispose();$b.Dispose()")
 original=png.read_bytes()
 subprocess.run(['powershell.exe','-NoProfile','-NonInteractive','-STA','-ExecutionPolicy','Bypass','-File',str(PS),'-Mode','ImportTest','-InputPng',str(png),'-OutputIcon',str(ico)],check=True,timeout=30)
 raw=ico.read_bytes();assert struct.unpack_from('<HHH',raw)==(0,1,7)
 for i,size in enumerate([16,24,32,48,64,128,256]):
  width,height,_,_,planes,bits,length,offset=struct.unpack_from('<BBBBHHII',raw,6+i*16);assert (width or 256)==size and (height or 256)==size and bits==32;assert raw[offset:offset+8]==b'\x89PNG\r\n\x1a\n'
 assert png.read_bytes()==original
 desktop=Path(run("$s=New-Object -ComObject WScript.Shell;$s.SpecialFolders.Item('Desktop')"));link=desktop/('Atelier-Icon-Test-'+uuid.uuid4().hex+'.lnk')
 try:
  run("$s=New-Object -ComObject WScript.Shell;$l=$s.CreateShortcut("+quoted(link)+");$l.TargetPath="+quoted(exe)+";$l.Save()")
  local_icon._powershell(root,exe,'Apply',ico)
  assert str(ico).lower() in run("$s=New-Object -ComObject WScript.Shell;$s.CreateShortcut("+quoted(link)+").IconLocation").lower()
  local_icon._powershell(root,exe,'Reset')
  assert str(exe).lower() in run("$s=New-Object -ComObject WScript.Shell;$s.CreateShortcut("+quoted(link)+").IconLocation").lower()
 finally:link.unlink(missing_ok=True)
 # Verify the running-window icon on a form that belongs only to this fixture.
 title="L'Atelier du Goblin - icon fixture "+uuid.uuid4().hex
 script="Add-Type -AssemblyName System.Windows.Forms;$f=New-Object Windows.Forms.Form;$f.Text="+quoted(title)+";$f.ShowDialog()|Out-Null"
 process=subprocess.Popen(['powershell.exe','-NoProfile','-NonInteractive','-STA','-Command',script],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
 from ctypes import wintypes as W
 u=ctypes.WinDLL('user32');u.FindWindowW.argtypes=[W.LPCWSTR,W.LPCWSTR];u.FindWindowW.restype=W.HWND;u.SendMessageW.argtypes=[W.HWND,W.UINT,W.WPARAM,W.LPARAM];u.SendMessageW.restype=W.LPARAM;u.PostMessageW.argtypes=[W.HWND,W.UINT,W.WPARAM,W.LPARAM]
 hwnd=None
 try:
  for _ in range(200):
   hwnd=u.FindWindowW(None,title)
   if hwnd:break
   time.sleep(.1)
  assert hwnd,'Fixture form not visible'
  image_path=Path(os.environ['SystemRoot'])/'System32/WindowsPowerShell/v1.0/powershell.exe'
  owned=local_icon.folder(root)/('icon-'+'a'*32+'.ico');owned.write_bytes(raw);(owned.parent/'selection.json').write_text(json.dumps({'file':owned.name}))
  before=u.SendMessageW(hwnd,0x7F,0,0)
  with patch('updater.guard'),patch.object(local_icon,'executable',return_value=image_path),patch.object(local_icon,'_powershell',return_value=True):
   local_icon.start(root,'MISU')
   for _ in range(100):
    h=u.SendMessageW(hwnd,0x7F,0,0)
    if h and h!=before:break
    time.sleep(.1)
   assert h and h!=before,'Custom window icon was not set'
   (owned.parent/'selection.json').unlink()
   for _ in range(100):
    if u.SendMessageW(hwnd,0x7F,0,0)!=h:break
    time.sleep(.1)
   assert u.SendMessageW(hwnd,0x7F,0,0)!=h,'Original window icon was not restored'
 finally:
  if hwnd:u.PostMessageW(hwnd,0x10,0,0)
  process.wait(timeout=20)
 print('PASS: local PNG -> 7-size transparent ICO, original PNG intact, own shortcut apply/reset and own window icon apply/reset; no external image transfer')
