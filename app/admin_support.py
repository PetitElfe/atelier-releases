"""Reusable contacts and calendar/task links; no private document content is indexed."""
import json,re
from datetime import date,datetime
FIELDS=('name','phone','email','address','website','doctolib','notes')
def initialise(c):
 c.executescript('''CREATE TABLE IF NOT EXISTS admin_contacts(id INTEGER PRIMARY KEY,name TEXT NOT NULL,phone TEXT DEFAULT '',email TEXT DEFAULT '',address TEXT DEFAULT '',website TEXT DEFAULT '',doctolib TEXT DEFAULT '',notes TEXT DEFAULT '',revision INTEGER NOT NULL DEFAULT 1);
 CREATE TABLE IF NOT EXISTS admin_contact_migrations(admin_id INTEGER PRIMARY KEY);
 CREATE TABLE IF NOT EXISTS admin_contact_links(admin_id INTEGER REFERENCES admin_documents(id) ON DELETE CASCADE,contact_id INTEGER REFERENCES admin_contacts(id) ON DELETE CASCADE,PRIMARY KEY(admin_id,contact_id));
 CREATE TABLE IF NOT EXISTS admin_event_links(admin_id INTEGER REFERENCES admin_documents(id) ON DELETE CASCADE,event_id INTEGER REFERENCES events(id) ON DELETE CASCADE,PRIMARY KEY(admin_id,event_id));''')
 # Migrate once, preserving every original single contact.
 for old in c.execute('SELECT * FROM admin_case_contacts').fetchall():
  if c.execute('SELECT 1 FROM admin_contact_migrations WHERE admin_id=?',(old['admin_id'],)).fetchone() or not(old['name'] or old['phone']):continue
  row=c.execute('SELECT id FROM admin_contacts WHERE name=? AND phone=?',(old['name'] or old['phone'],old['phone'])).fetchone()
  identity=row[0] if row else c.execute('INSERT INTO admin_contacts(name,phone) VALUES(?,?)',(old['name'] or old['phone'],old['phone'])).lastrowid
  c.execute('INSERT OR IGNORE INTO admin_contact_links VALUES(?,?)',(old['admin_id'],identity));c.execute('INSERT OR IGNORE INTO admin_contact_migrations VALUES(?)',(old['admin_id'],))
 # Legacy primary appointment is still understood by all older views.
 if 'event_id' in {r[1] for r in c.execute('PRAGMA table_info(admin_documents)')}:c.execute('INSERT OR IGNORE INTO admin_event_links SELECT id,event_id FROM admin_documents WHERE event_id IS NOT NULL')
def snapshot(c):
 contacts=[dict(r) for r in c.execute('SELECT * FROM admin_contacts ORDER BY name COLLATE NOCASE,id')]
 links={}
 for r in c.execute('SELECT * FROM admin_contact_links'):links.setdefault(str(r['admin_id']),[]).append(r['contact_id'])
 events=[dict(r) for r in c.execute('SELECT e.*,l.admin_id FROM admin_event_links l JOIN events e ON e.id=l.event_id ORDER BY e.event_date,e.start_time')] if c.execute("SELECT 1 FROM sqlite_master WHERE name='events'").fetchone() else []
 return {'contact_book':contacts,'contact_links':links,'linked_events':events}
def owner(c,body):
 identity=int(body.get('admin_id') or 0)
 if not c.execute('SELECT 1 FROM admin_documents WHERE id=?',(identity,)).fetchone():raise ValueError('Démarche introuvable.')
 return identity
def command(c,path,body,workspace):
 stamp=datetime.now().isoformat()
 if path.endswith('/contact'):
  values={k:str(body.get(k,'')).strip() for k in FIELDS}
  if not 1<=len(values['name'])<=120:raise ValueError('Écris le nom du contact.')
  if any(len(v)>2000 or any(ord(x)<32 for x in v if x not in '\n\t') for v in values.values()):raise ValueError('Coordonnées trop longues ou invalides.')
  workspace.admin_planning.contact({'name':values['name'],'phone':values['phone']})
  if values['email']:workspace.links(['mailto:'+values['email']])
  for key in ('website','doctolib'):
   if values[key]:
    if not values[key].startswith(('https://','http://')):raise ValueError('Utilise un lien https:// ou http://.')
    workspace.links([values[key]])
  identity=body.get('contact_id')
  if identity:
   if not c.execute('UPDATE admin_contacts SET '+','.join(k+'=?' for k in FIELDS)+',revision=revision+1 WHERE id=? AND revision=?',(*values.values(),int(identity),body.get('revision'))).rowcount:raise LookupError('Ce contact a changé ailleurs. Actualise avant de réessayer.')
  else:identity=c.execute('INSERT INTO admin_contacts('+','.join(FIELDS)+') VALUES('+','.join('?' for _ in FIELDS)+')',tuple(values.values())).lastrowid
  if body.get('admin_id'):c.execute('INSERT OR IGNORE INTO admin_contact_links VALUES(?,?)',(owner(c,body),identity))
  return {'contact_id':identity}
 if path.endswith('/contact-link'):
  identity=owner(c,body);contact=int(body['contact_id'])
  if not c.execute('SELECT 1 FROM admin_contacts WHERE id=?',(contact,)).fetchone():raise ValueError('Contact introuvable.')
  if body.get('unlink'):c.execute('DELETE FROM admin_contact_links WHERE admin_id=? AND contact_id=?',(identity,contact))
  else:c.execute('INSERT OR IGNORE INTO admin_contact_links VALUES(?,?)',(identity,contact))
  return {'ok':True}
 if path.endswith('/task-link'):
  identity=owner(c,body);task=c.execute('SELECT * FROM tasks WHERE id=? AND archived=0',(int(body['task_id']),)).fetchone()
  if not task:raise ValueError('Tâche introuvable.')
  previous=c.execute('SELECT admin_id,revision FROM admin_action_details WHERE task_id=?',(task['id'],)).fetchone()
  if previous and previous['admin_id'] not in (None,identity):raise ValueError('Cette tâche est déjà reliée à une autre démarche.')
  return workspace.save_action(c,{**dict(task),'task_id':task['id'],'important':bool(task['important']),'admin_id':identity,'state':'done' if task['completed'] else 'todo',**({'revision':previous['revision']} if previous else {})})
 if path.endswith('/event'):
  identity=owner(c,body);event=body.get('event_id')
  if body.get('unlink'):
   c.execute('DELETE FROM admin_event_links WHERE admin_id=? AND event_id=?',(identity,int(event)));c.execute('UPDATE admin_documents SET event_id=NULL WHERE id=? AND event_id=?',(identity,int(event)));return {'ok':True}
  if event:
   if not c.execute('SELECT 1 FROM events WHERE id=?',(int(event),)).fetchone():raise ValueError('Rendez-vous introuvable.')
  else:
   title=str(body.get('title','')).strip();day=workspace.iso(body.get('event_date'));start=str(body.get('start_time') or '');end=str(body.get('end_time') or '')
   if not title or len(title)>180 or not day:raise ValueError('Nom et date du rendez-vous requis.')
   for t in (start,end):
    if t and not re.fullmatch(r'(?:[01]\d|2[0-3]):[0-5]\d',t):raise ValueError('Heure invalide.')
   if end and start and end<=start:raise ValueError('La fin doit suivre le début.')
   event=c.execute("INSERT INTO events(title,event_date,start_time,end_time,all_day,category,location,notes,created_at,updated_at) VALUES(?,?,?,?,?,'administratif',?,?,?,?)",(title,day,start or None,end or None,int(not start),str(body.get('location',''))[:1000],str(body.get('notes',''))[:8000],stamp,stamp)).lastrowid
  c.execute('INSERT OR IGNORE INTO admin_event_links VALUES(?,?)',(identity,event))
  c.execute('UPDATE admin_documents SET event_id=COALESCE(event_id,?),updated_at=? WHERE id=?',(event,stamp,identity));return {'event_id':event}
 raise ValueError('Commande administrative inconnue.')

def set_basic_contact(c,identity,details):
 row=c.execute('SELECT contact_id FROM admin_contact_links WHERE admin_id=? ORDER BY contact_id LIMIT 1',(identity,)).fetchone()
 if row:
  c.execute('UPDATE admin_contacts SET name=?,phone=?,revision=revision+1 WHERE id=?',(details['name'] or details['phone'],details['phone'],row[0]))
 elif details['name'] or details['phone']:
  contact=c.execute('INSERT INTO admin_contacts(name,phone) VALUES(?,?)',(details['name'] or details['phone'],details['phone'])).lastrowid;c.execute('INSERT INTO admin_contact_links VALUES(?,?)',(identity,contact))
 c.execute('INSERT OR IGNORE INTO admin_contact_migrations VALUES(?)',(identity,))
