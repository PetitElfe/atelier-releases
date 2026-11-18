"""Retrieve a creator-published release icon; never accepts art through the web API."""
import hashlib,json,os,re,threading,time
from pathlib import Path
from urllib.request import urlopen,Request
from urllib.error import HTTPError
BASE='https://github.com/PetitElfe/atelier-releases/releases/download/atelier-official-icon/'

def download(name,limit):
 with urlopen(Request(BASE+name,headers={'User-Agent':'Atelier-Official-Icon/1'}),timeout=20) as r:
  data=r.read(limit+1)
 if len(data)>limit:raise ValueError('Icon asset too large')
 return data

def metadata():
 m=json.loads(download('icon.json',4096))
 for field in ('ico_sha256','png_sha256'):
  if not isinstance(m.get(field),str) or not re.fullmatch('[0-9a-f]{64}',m[field]):raise ValueError('Invalid icon digest')
 return m

def asset(m,kind):
 digest=m[kind+'_sha256'];data=download('icon-'+digest+'.'+kind,4*1024*1024)
 if hashlib.sha256(data).hexdigest()!=digest:raise ValueError('Icon digest mismatch')
 if kind=='ico' and not data.startswith(b'\x00\x00\x01\x00'):raise ValueError('Invalid ICO')
 if kind=='png' and not data.startswith(b'\x89PNG\r\n\x1a\n'):raise ValueError('Invalid PNG')
 return data

def current(data):
 root=Path(data)/'official-icon';config=root/'current.json'
 if root.is_symlink() or config.is_symlink():return None
 try:
  digest=json.loads(config.read_text())['ico_sha256']
  if not re.fullmatch('[0-9a-f]{64}',digest):return None
  path=root/('icon-'+digest+'.ico')
  if path.is_file() and not path.is_symlink() and hashlib.sha256(path.read_bytes()).hexdigest()==digest:return path
 except (OSError,ValueError,KeyError,TypeError):pass
 return None

def sync(data):
 m=metadata();root=Path(data)/'official-icon'
 if root.is_symlink() or getattr(root,'is_junction',lambda:False)():raise ValueError('Redirected icon folder')
 root.mkdir(exist_ok=True,parents=True);path=root/('icon-'+m['ico_sha256']+'.ico')
 if path.is_symlink():raise ValueError('Redirected icon file')
 if not path.exists():
  payload=asset(m,'ico');tmp=root/'icon.download';tmp.write_bytes(payload);os.replace(tmp,path)
 tmp=root/'current.tmp';tmp.write_text(json.dumps(m));os.replace(tmp,root/'current.json')
 return path

def start(data):
 def worker():
  while True:
   try:sync(data)
   except Exception:pass # No icon published yet or offline: retain the last verified icon.
   time.sleep(3600)
 threading.Thread(target=worker,daemon=True,name='official-icon-update').start()
