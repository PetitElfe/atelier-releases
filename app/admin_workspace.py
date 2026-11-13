"""Administrative actions and references to the user's own Windows document folder."""
import base64,calendar,hashlib,json,os,re,sqlite3,threading,uuid
from datetime import date,datetime,timedelta
from pathlib import Path
from urllib.parse import urlparse
DEFAULT_ROOT=r'G:\Mon Drive\00_QG — LÉO'
MAX_FILE=16*1024*1024
_FILE_LOCK=threading.RLock()
STATES=('todo','doing','done')

def initialise(c):
 c.executescript('''CREATE TABLE IF NOT EXISTS admin_action_details(
 task_id INTEGER PRIMARY KEY REFERENCES tasks(id) ON DELETE CASCADE,
 admin_id INTEGER REFERENCES admin_documents(id) ON DELETE SET NULL,
 start_date TEXT, rhythm TEXT NOT NULL DEFAULT 'none', state TEXT NOT NULL DEFAULT 'todo',
 links_json TEXT NOT NULL DEFAULT '[]', series_key TEXT NOT NULL, occurrence_date TEXT NOT NULL,
 anchor_day INTEGER NOT NULL, next_task_id INTEGER, revision INTEGER NOT NULL DEFAULT 1,
 UNIQUE(series_key,occurrence_date));
 CREATE TABLE IF NOT EXISTS admin_local_files(
 id INTEGER PRIMARY KEY AUTOINCREMENT, admin_id INTEGER REFERENCES admin_documents(id) ON DELETE SET NULL,
 relative_path TEXT NOT NULL UNIQUE, kind TEXT NOT NULL, state TEXT NOT NULL DEFAULT 'todo', created_at TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS admin_local_file_links(file_id INTEGER NOT NULL REFERENCES admin_local_files(id) ON DELETE CASCADE,admin_id INTEGER NOT NULL REFERENCES admin_documents(id) ON DELETE CASCADE,PRIMARY KEY(file_id,admin_id));
 CREATE TABLE IF NOT EXISTS admin_workspace_operations(id TEXT PRIMARY KEY,result_json TEXT NOT NULL);''')

def iso(value):
 if not value:return None
 try:return date.fromisoformat(str(value)).isoformat()
 except (ValueError,TypeError):raise ValueError('Date invalide.')

def links(values):
 if not isinstance(values,list) or len(values)>20:raise ValueError('Maximum 20 liens.')
 cleaned=[]
 for value in values:
  if not isinstance(value,str) or len(value)>2000 or any(ord(x)<32 for x in value):raise ValueError('Lien invalide.')
  value=value.strip()
  if '@' in value and ':' not in value:value='mailto:'+value
  p=urlparse(value)
  if p.scheme in ('http','https'):
   if not p.hostname or p.username or p.password:raise ValueError('Lien web invalide.')
  elif p.scheme=='mailto':
   if not re.fullmatch(r'[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+',p.path) or p.query or p.fragment:raise ValueError('Adresse e-mail invalide.')
  else:raise ValueError('Utilise un lien https/http ou une adresse e-mail.')
  if value not in cleaned:cleaned.append(value)
 return cleaned

def next_date(day,rhythm,anchor):
 current=date.fromisoformat(day)
 if rhythm in ('weekly','fortnightly'):return (current+timedelta(days=7 if rhythm=='weekly' else 14)).isoformat()
 if rhythm=='monthly':
  y,m=current.year+(current.month==12),current.month%12+1
  return date(y,m,min(anchor,calendar.monthrange(y,m)[1])).isoformat()
 return None

def task_saved(c,task_id):
 """Called by BOTH the ordinary task endpoint and administrative action changes."""
 row=c.execute('SELECT t.*,a.start_date,a.rhythm,a.series_key,a.occurrence_date,a.anchor_day,a.next_task_id,a.links_json,a.admin_id FROM tasks t JOIN admin_action_details a ON a.task_id=t.id WHERE t.id=?',(task_id,)).fetchone()
 if not row:return
 state='done' if row['completed'] else None
 if state:c.execute("UPDATE admin_action_details SET state='done',revision=revision+1 WHERE task_id=?",(task_id,))
 else:c.execute("UPDATE admin_action_details SET state=CASE WHEN state='done' THEN 'todo' ELSE state END,revision=revision+1 WHERE task_id=?",(task_id,))
 if not state or row['archived'] or row['rhythm']=='none' or row['next_task_id']:return
 following=next_date(row['due_date'] or row['occurrence_date'],row['rhythm'],row['anchor_day'])
 existing=c.execute('SELECT task_id FROM admin_action_details WHERE series_key=? AND occurrence_date=?',(row['series_key'],following)).fetchone()
 if existing:new=existing['task_id']
 else:
  stamp=datetime.now().isoformat();delta=date.fromisoformat(following)-date.fromisoformat(row['due_date'] or row['occurrence_date'])
  start=(date.fromisoformat(row['start_date'])+delta).isoformat() if row['start_date'] else None
  new=c.execute('INSERT INTO tasks(title,due_date,due_time,notes,important,order_index,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)',(row['title'],following,row['due_time'],row['notes'],row['important'],row['order_index'],stamp,stamp)).lastrowid
  c.execute('INSERT INTO admin_action_details(task_id,admin_id,start_date,rhythm,links_json,series_key,occurrence_date,anchor_day) VALUES(?,?,?,?,?,?,?,?)',(new,row['admin_id'],start,row['rhythm'],row['links_json'],row['series_key'],following,row['anchor_day']))
  for reminder in c.execute("SELECT title,remind_at FROM reminders WHERE entity_type='task' AND entity_id=?",(task_id,)).fetchall():
   when=(datetime.fromisoformat(reminder['remind_at'])+delta).isoformat()
   c.execute("INSERT INTO reminders(entity_type,entity_id,title,remind_at,status,created_at) VALUES('task',?,?,?,'pending',?)",(new,reminder['title'],when,stamp))
 c.execute('UPDATE admin_action_details SET next_task_id=? WHERE task_id=?',(new,task_id))

def save_action(c,body):
 identity=body.get('task_id');old=None
 if identity:
  old=c.execute('SELECT t.*,a.revision AS action_revision,a.start_date,a.rhythm,a.state,a.links_json,a.admin_id,a.series_key FROM tasks t LEFT JOIN admin_action_details a ON a.task_id=t.id WHERE t.id=?',(int(identity),)).fetchone()
  if not old:raise ValueError('Tâche introuvable.')
  if old['action_revision'] and body.get('revision')!=old['action_revision']:raise LookupError('Cette action a changé ailleurs. Actualise avant de réessayer.')
 title=str(body.get('title',old['title'] if old else '')).strip()
 if not 1<=len(title)<=180:raise ValueError('Écris le nom de l’action (180 caractères maximum).')
 due=iso(body.get('due_date'));start=iso(body.get('start_date'))
 if start and due and start>due:raise ValueError('La date de préparation doit précéder ou égaler l’échéance.')
 rhythm=body.get('rhythm','none');state=body.get('state','todo');urls=links(body.get('links',[]));owner=body.get('admin_id') or None
 if rhythm not in ('none','weekly','fortnightly','monthly') or state not in STATES:raise ValueError('Rythme ou état invalide.')
 if rhythm!='none' and not due:raise ValueError('Une action répétée doit avoir une première échéance.')
 if owner and not c.execute('SELECT 1 FROM admin_documents WHERE id=? AND archived=0',(int(owner),)).fetchone():raise ValueError('Démarche introuvable ou archivée.')
 important=body.get('important',False)
 if type(important) is not bool:raise ValueError('Importance invalide.')
 stamp=datetime.now().isoformat()
 if old:
  c.execute('UPDATE tasks SET title=?,due_date=?,important=?,completed=?,updated_at=? WHERE id=?',(title,due,int(important),int(state=='done'),stamp,identity))
 else:identity=c.execute('INSERT INTO tasks(title,due_date,important,completed,created_at,updated_at) VALUES(?,?,?,?,?,?)',(title,due,int(important),int(state=='done'),stamp,stamp)).lastrowid
 current=c.execute('SELECT * FROM admin_action_details WHERE task_id=?',(identity,)).fetchone()
 if current:
  c.execute('UPDATE admin_action_details SET admin_id=?,start_date=?,rhythm=?,state=?,links_json=?,anchor_day=?,revision=revision+1 WHERE task_id=?',(owner,start,rhythm,state,json.dumps(urls),int((due or date.today().isoformat())[-2:]),identity))
 else:
  c.execute('INSERT INTO admin_action_details(task_id,admin_id,start_date,rhythm,state,links_json,series_key,occurrence_date,anchor_day) VALUES(?,?,?,?,?,?,?,?,?)',(identity,owner,start,rhythm,state,json.dumps(urls),uuid.uuid4().hex,due or date.today().isoformat(),int((due or date.today().isoformat())[-2:])))
 if body.get('remind_at'):
  when=datetime.fromisoformat(str(body['remind_at'])).replace(microsecond=0).isoformat()
  c.execute("DELETE FROM reminders WHERE entity_type='task' AND entity_id=? AND status='pending'",(identity,))
  c.execute("INSERT INTO reminders(entity_type,entity_id,title,remind_at,status,created_at) VALUES('task',?,?,?,'pending',?)",(identity,title,when,stamp))
 task_saved(c,identity)
 return {'task_id':identity}

def snapshot(c):
 tasks=[dict(row) for row in c.execute('SELECT t.*,a.admin_id,a.start_date,a.rhythm,a.state,a.links_json,a.revision,a.next_task_id FROM tasks t JOIN admin_action_details a ON a.task_id=t.id WHERE t.archived=0 ORDER BY t.completed,t.important DESC,COALESCE(a.start_date,t.due_date,\'9999\'),t.id')]
 for t in tasks:t['state']='done' if t['completed'] else ('todo' if t['state']=='done' else t['state']);t['links']=json.loads(t.pop('links_json'))
 files=[dict(r) for r in c.execute('SELECT * FROM admin_local_files ORDER BY id DESC')]
 associations={}
 for r in c.execute('SELECT file_id,admin_id FROM admin_local_file_links'):associations.setdefault(r['file_id'],[]).append(r['admin_id'])
 for f in files:f['admin_ids']=sorted(set(associations.get(f['id'],[])+([f['admin_id']] if f['admin_id'] else [])))
 return {'actions':tasks,'files':files}

def configured(data):
 path=Path(data)/'admin-workspace.json'
 try:value=json.loads(path.read_text(encoding='utf-8'))['root']
 except (OSError,ValueError,KeyError,TypeError):value=DEFAULT_ROOT
 return value

def root(data):
 p=Path(configured(data))
 if not p.is_absolute() or not p.is_dir() or p.is_symlink() or getattr(p,'is_junction',lambda:False)():raise ValueError('Dossier de documents introuvable. Vérifie que le lecteur G: est disponible et le chemin dans les réglages du classeur.')
 return p.resolve()

def within(base,relative):
 raw=Path(relative)
 if raw.is_absolute() or '..' in raw.parts or not relative or '\x00' in relative:raise ValueError('Chemin de document invalide.')
 path=base
 for part in raw.parts:
  path=path/part
  if path.is_symlink() or getattr(path,'is_junction',lambda:False)():raise ValueError('Les raccourcis de dossiers ne sont pas suivis.')
 try:path.resolve().relative_to(base.resolve())
 except ValueError:raise ValueError('Document hors du dossier autorisé.')
 return path

def component(text,default='Document'):
 value=re.sub(r'[<>:"/\\|?*\x00-\x1f]+',' ',str(text));value=re.sub(r'[\s_]+','_',value).strip(' ._')[:90] or default
 if value.split('.')[0].upper() in {'CON','PRN','AUX','NUL',*(f'COM{i}' for i in range(1,10)),*(f'LPT{i}' for i in range(1,10))}:value='_'+value
 return value

def unique_write(target,content):
 """Exclusive creation: existing files, including filled originals, are never replaced."""
 target.parent.mkdir(parents=True,exist_ok=True)
 for i in range(10000):
  path=target if i==0 else target.with_name(target.stem+'__'+str(i+1)+target.suffix)
  try:stream=path.open('xb')
  except FileExistsError:continue
  try:
   with stream:stream.write(content)
   return path
  except Exception:path.unlink(missing_ok=True);raise
 raise ValueError('Trop de copies portant ce nom.')

def list_files(base):
 found=[]
 def visit(folder,depth=0):
  if depth>10 or len(found)>=1500:return
  for p in sorted(folder.iterdir(),key=lambda x:x.name.lower()):
   if p.is_symlink() or getattr(p,'is_junction',lambda:False)():continue
   if p.is_dir():visit(p,depth+1)
   elif p.suffix.lower() in ('.pdf','.docx','.doc'):
    found.append({'path':str(p.relative_to(base)),'name':p.name})
   if len(found)>=1500:break
 visit(base)
 return found

def native(c,data,body):
 action=body.get('action');base=root(data)
 if action=='browse':return {'root':str(base),'files':list_files(base)}
 if action=='open-root':os.startfile(base);return {'ok':True}
 if action=='register':
  rel=str(body['path']);file=within(base,rel)
  if not file.is_file() or file.suffix.lower() not in ('.pdf','.docx','.doc'):raise ValueError('Choisis un document PDF ou Word.')
  kind=body.get('kind','document')
  if kind not in ('template','document'):raise ValueError('Classement invalide.')
  owner=body.get('admin_id') or None
  if owner and not c.execute('SELECT 1 FROM admin_documents WHERE id=?',(owner,)).fetchone():raise ValueError('Démarche introuvable.')
  existing=c.execute('SELECT id,kind FROM admin_local_files WHERE relative_path=?',(rel,)).fetchone()
  if existing and existing['kind']!=kind:raise ValueError('Ce fichier est déjà référencé autrement. Choisis un modèle vierge distinct du document rempli.')
  c.execute('INSERT INTO admin_local_files(admin_id,relative_path,kind,created_at) VALUES(?,?,?,?) ON CONFLICT(relative_path) DO NOTHING',(owner,rel,kind,datetime.now().isoformat()))
  file_id=c.execute('SELECT id FROM admin_local_files WHERE relative_path=?',(rel,)).fetchone()[0]
  if owner:c.execute('INSERT OR IGNORE INTO admin_local_file_links VALUES(?,?)',(file_id,owner))
  return {'ok':True,'file_id':file_id}
 row=c.execute('SELECT * FROM admin_local_files WHERE id=?',(int(body.get('file_id',0)),)).fetchone()
 if not row:raise ValueError('Document introuvable.')
 source=within(base,row['relative_path'])
 if not source.is_file():raise ValueError('Le document a été déplacé ou supprimé dans l’Explorateur.')
 if action=='open':os.startfile(source);return {'ok':True}
 if action=='copy':
  operation=str(body.get('operation_id',''))
  if not re.fullmatch('[a-f0-9-]{36}',operation):raise ValueError('Identifiant de copie invalide.')
  previous=c.execute('SELECT result_json FROM admin_workspace_operations WHERE id=?',(operation,)).fetchone()
  if previous:return json.loads(previous[0])
  if row['kind']!='template':raise ValueError('Choisis un modèle vierge.')
  owner=int(body['admin_id']);dossier=c.execute('SELECT * FROM admin_documents WHERE id=? AND archived=0',(owner,)).fetchone()
  if not dossier:raise ValueError('Démarche introuvable.')
  day=iso(body.get('date')) or date.today().isoformat()
  pieces=[day,component(body.get('type') or source.stem),component(body.get('subject') or dossier['title'])]
  if str(body.get('professional','')).strip():pieces.append(component(body['professional']))
  destination=within(base,str(Path('Documents_Atelier')/component(dossier['category'])/('_'.join(pieces)[:220]+source.suffix.lower())))
  if source.stat().st_size>MAX_FILE:raise ValueError('Document limité à 16 Mo.')
  new=unique_write(destination,source.read_bytes());relative=str(new.relative_to(base))
  try:file_id=c.execute('INSERT INTO admin_local_files(admin_id,relative_path,kind,state,created_at) VALUES(?,?,\'document\',\'doing\',?)',(owner,relative,datetime.now().isoformat())).lastrowid
  except Exception:new.unlink(missing_ok=True);raise
  result={'ok':True,'file_id':file_id,'path':relative,'message':'Copie créée. Ouvre-la pour la remplir dans ton logiciel PDF ou Word, puis enregistre avec Ctrl+S.'}
  c.execute('INSERT INTO admin_workspace_operations VALUES(?,?)',(operation,json.dumps(result)))
  return result
 raise ValueError('Action inconnue.')

def serve(h,method,p,data,database,port):
 if not p.startswith('/api/admin-workspace'):return False
 try:
  if method!='GET':
   origin=h.headers.get('Origin')
   if origin and origin!=f'http://127.0.0.1:{port}':h._json({'error':'Origine refusée.'},403);return True
   size=int(h.headers.get('Content-Length','0'))
   if not 2<=size<=120000:raise ValueError('Requête invalide.')
  with sqlite3.connect(database,timeout=15) as c:
   c.row_factory=sqlite3.Row;c.execute('PRAGMA foreign_keys=ON')
   if method=='GET' and p=='/api/admin-workspace':h._json({**snapshot(c),'documents_root':configured(data)});return True
   body=h._body()
   if not isinstance(body,dict):raise ValueError('Requête invalide.')
   c.execute('BEGIN IMMEDIATE')
   if p=='/api/admin-workspace/native':
    # No arbitrary file operation can be initiated from a tailnet/remote page.
    if port!=8876 or h.headers.get('Host')!='127.0.0.1:8876' or h.headers.get('Origin')!='http://127.0.0.1:8876' or h.headers.get('X-Atelier-Documents')!='1':h._json({'error':'Ouvre les documents depuis L’Atelier sur ce PC.'},403);return True
    import updater
    updater.guard()
    if body.get('action')=='config':
     value=str(body.get('root','')).strip();candidate=Path(value)
     if not candidate.is_absolute() or not candidate.is_dir() or candidate.is_symlink() or getattr(candidate,'is_junction',lambda:False)():raise ValueError('Choisis un dossier local existant.')
     target=Path(data)/'admin-workspace.json';tmp=target.with_suffix('.tmp');tmp.write_text(json.dumps({'root':value}),encoding='utf-8');os.replace(tmp,target);result={'ok':True}
    else:
     with _FILE_LOCK:result=native(c,data,body)
   elif p=='/api/admin-workspace/action':
    operation=str(body.get('operation_id',''))
    if not re.fullmatch('[a-f0-9-]{36}',operation):raise ValueError('Identifiant d’action invalide.')
    previous=c.execute('SELECT result_json FROM admin_workspace_operations WHERE id=?',(operation,)).fetchone()
    if previous:result=json.loads(previous[0])
    else:
     result=save_action(c,body);c.execute('INSERT INTO admin_workspace_operations VALUES(?,?)',(operation,json.dumps(result)))
   elif p=='/api/admin-workspace/file-state':
    state=body.get('state')
    if state not in STATES:raise ValueError('État invalide.')
    if not c.execute('UPDATE admin_local_files SET state=? WHERE id=?',(state,int(body['file_id']))).rowcount:raise ValueError('Document introuvable.')
    result={'ok':True}
   else:raise ValueError('Adresse inconnue.')
   c.commit();h._json(result)
 except LookupError as e:h._json({'error':str(e)},409)
 except (ValueError,TypeError,KeyError,OSError,RuntimeError,sqlite3.Error) as e:h._json({'error':str(e)},400)
 return True
