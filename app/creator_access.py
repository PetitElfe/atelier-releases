"""Optional personal creation password. Sessions never enter exported browser data."""
import hashlib,hmac,json,secrets,time,threading,uuid
from pathlib import Path
import utility_safety,personal_design
LOCK=threading.RLock();SESSIONS={};ATTEMPTS=[]
def _secret(data):
 p=Path(data)/'creator-access.json'
 return json.loads(p.read_text()) if p.exists() else None
def allowed(data,token):
 with LOCK:
  if _secret(data) is None:return True
  value=SESSIONS.get(token)
  return bool(value and value[0]==str(Path(data).resolve()) and value[1]>time.monotonic())
def status(data,token):return {'configured':_secret(data) is not None,'unlocked':allowed(data,token)}
def authenticate(data,action,password='',token=''):
 with LOCK:
  if not isinstance(password,str) or len(password)>128:raise ValueError('Mot de passe invalide.')
  current=_secret(data)
  if action=='logout':SESSIONS.pop(token,None);return status(data,'')
  if action=='setup':
   if current and not allowed(data,token):raise PermissionError('Déverrouille le mode avant de changer le mot de passe.')
   if not isinstance(password,str) or not 8<=len(password)<=128:raise ValueError('Choisis un mot de passe de 8 à 128 caractères.')
   salt=secrets.token_hex(24);digest=hashlib.pbkdf2_hmac('sha256',password.encode(),bytes.fromhex(salt),310000).hex()
   utility_safety.atomic(Path(data)/'creator-access.json',{'salt':salt,'digest':digest})
   for key,value in list(SESSIONS.items()):
    if value[0]==str(Path(data).resolve()):SESSIONS.pop(key,None)
  elif action=='login':
   if current is None:raise ValueError('Définis d’abord ton mot de passe.')
   now=time.monotonic();ATTEMPTS[:]=[t for t in ATTEMPTS if t>now-60]
   if len(ATTEMPTS)>=5:raise PermissionError('Trop de tentatives. Attends une minute avant de réessayer.')
   ATTEMPTS.append(now)
   digest=hashlib.pbkdf2_hmac('sha256',password.encode(),bytes.fromhex(current['salt']),310000).hex()
   if not hmac.compare_digest(digest,current['digest']):raise PermissionError('Mot de passe incorrect.')
  else:raise ValueError('Action inconnue.')
  session=secrets.token_urlsafe(40);SESSIONS[session]=(str(Path(data).resolve()),time.monotonic()+8*3600)
  return dict(status(data,session),token=session)
def presets(data,identifier=None):
 folder=Path(data)/'personal-design-presets'
 if identifier is not None:
  if not isinstance(identifier,str) or len(identifier)!=32 or any(c not in '0123456789abcdef' for c in identifier):raise ValueError('Thème invalide.')
  item=json.loads((folder/(identifier+'.json')).read_text());item['theme']=personal_design.validate(item['theme']);return item
 return [{'id':p.stem,'name':json.loads(p.read_text())['name']} for p in sorted(folder.glob('*.json'))] if folder.exists() else []
def save_preset(data,name,theme):
 if not isinstance(name,str) or not 1<=len(name.strip())<=80:raise ValueError('Nomme ce thème (80 caractères maximum).')
 theme=personal_design.validate(theme);folder=Path(data)/'personal-design-presets'
 with LOCK:
  if len(presets(data))>=6:raise ValueError('Six thèmes sont conservés. Exporte puis retire un ancien thème pour en ajouter un.')
  total=sum(p.stat().st_size for p in folder.glob('*.json')) if folder.exists() else 0
  raw=json.dumps(theme).encode()
  if total+len(raw)>72000000:raise ValueError('Les thèmes dépasseraient 72 Mo. Exporte puis retire un ancien thème.')
  identifier=uuid.uuid4().hex;utility_safety.atomic(folder/(identifier+'.json'),{'id':identifier,'name':name.strip(),'theme':theme})
  return presets(data)
def remove_preset(data,identifier):
 presets(data,identifier);folder=Path(data)/'personal-design-presets';archive=folder/'archive';archive.mkdir(exist_ok=True)
 (folder/(identifier+'.json')).replace(archive/(identifier+'.json'))
 for old in sorted(archive.glob('*.json'),key=lambda p:p.stat().st_mtime,reverse=True)[6:]:old.unlink()
 return presets(data)
