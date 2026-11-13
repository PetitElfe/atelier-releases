"""Persistent classers and bounded weekday plans; no document-content processing."""
import json,re
from datetime import date,datetime,timedelta

def initialise(c):
 c.executescript('''CREATE TABLE IF NOT EXISTS admin_classers(name TEXT PRIMARY KEY COLLATE NOCASE,created_at TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS admin_action_schedules(task_id INTEGER PRIMARY KEY REFERENCES tasks(id) ON DELETE CASCADE,data_json TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS admin_dossier_plans(admin_id INTEGER PRIMARY KEY REFERENCES admin_documents(id) ON DELETE CASCADE,task_id INTEGER REFERENCES tasks(id) ON DELETE SET NULL);''')
 c.execute("INSERT OR IGNORE INTO admin_classers SELECT DISTINCT category,? FROM admin_documents WHERE TRIM(category)!=''",(datetime.now().isoformat(),))
 if not c.execute('SELECT 1 FROM admin_classers').fetchone():c.execute('INSERT INTO admin_classers VALUES(?,?)',('Général',datetime.now().isoformat()))

def classer_name(value):
 if not isinstance(value,str):raise ValueError('Nom de classeur invalide.')
 name=' '.join(value.split())
 if not 1<=len(name)<=80 or any(ord(x)<32 for x in value):raise ValueError('Le nom du classeur doit contenir entre 1 et 80 caractères.')
 return name

def ensure_classer(c,value):
 name=classer_name(value);c.execute('INSERT OR IGNORE INTO admin_classers VALUES(?,?)',(name,datetime.now().isoformat()))
 return c.execute('SELECT name FROM admin_classers WHERE name=?',(name,)).fetchone()[0]

def schedule(c,identity):
 row=c.execute('SELECT data_json FROM admin_action_schedules WHERE task_id=?',(identity,)).fetchone()
 return json.loads(row[0]) if row else None

def next_weekday(current,rhythm,plan):
 anchor=date.fromisoformat(plan['starts_on']);stop=date.fromisoformat(plan['ends_on']) if plan.get('ends_on') else None
 monday=anchor-timedelta(days=anchor.weekday());interval=2 if rhythm=='fortnightly' else 1
 for i in range(1,22):
  day=current+timedelta(days=i)
  if stop and day>stop:return None
  if day>=anchor and day.weekday() in plan['weekdays'] and ((day-monday).days//7)%interval==0:return day.isoformat()
 return None

def normalize(c,identity,body,rhythm,due,start,iso):
 previous=schedule(c,identity) if identity else None;raw=body.get('schedule',previous)
 if raw is None:plan=None
 else:
  if not isinstance(raw,dict):raise ValueError('Période invalide.')
  begins=iso(raw.get('starts_on') or due or date.today().isoformat());ends=iso(raw.get('ends_on'));days=raw.get('weekdays',[])
  if ends and ends<begins:raise ValueError('La fin de période doit être après son début.')
  if not isinstance(days,list) or any(type(x) is not int or x<0 or x>6 for x in days):raise ValueError('Jours de semaine invalides.')
  days=sorted(set(days))
  if rhythm in ('weekly','fortnightly') and not days:raise ValueError('Coche au moins un jour de la semaine.')
  plan={'starts_on':begins,'ends_on':ends,'weekdays':days}
  if raw.get('mode') in ('none','date','range','weekly','fortnightly','monthly'):plan['mode']=raw['mode']
  if rhythm in ('weekly','fortnightly'):
   if not due:
    previous_due=c.execute('SELECT due_date FROM tasks WHERE id=?',(identity,)).fetchone() if identity else None
    floor=max(begins,previous_due['due_date']) if previous_due and previous_due['due_date'] else begins
    due=next_weekday(date.fromisoformat(floor)-timedelta(days=1),rhythm,plan)
   if not due:raise ValueError('Aucun jour choisi dans cette période.')
   d=date.fromisoformat(due);anchor=date.fromisoformat(begins);monday=anchor-timedelta(days=anchor.weekday());interval=2 if rhythm=='fortnightly' else 1
   if d<anchor or d.weekday() not in days or ((d-monday).days//7)%interval:raise ValueError('La date ne correspond pas aux jours et aux semaines choisis.')
  if due and (due<begins or ends and due>ends):raise ValueError('La date doit appartenir à la période choisie.')
 if 'lead_days' in body:
  lead=body['lead_days']
  if type(lead) is not int or not 0<=lead<=365:raise ValueError('Choisis entre 0 et 365 jours de préparation.')
  start=(date.fromisoformat(due)-timedelta(days=lead)).isoformat() if due and lead else None
 return due,start,plan

def save_schedule(c,identity,plan):
 if plan is None:c.execute('DELETE FROM admin_action_schedules WHERE task_id=?',(identity,))
 else:c.execute('INSERT INTO admin_action_schedules VALUES(?,?) ON CONFLICT(task_id) DO UPDATE SET data_json=excluded.data_json',(identity,json.dumps(plan)))

def next_occurrence(c,identity,row,fallback):
 plan=schedule(c,identity)
 if plan and row['rhythm'] in ('weekly','fortnightly'):return next_weekday(date.fromisoformat(row['due_date'] or row['occurrence_date']),row['rhythm'],plan)
 next_day=fallback(row['due_date'] or row['occurrence_date'],row['rhythm'],row['anchor_day'])
 return None if plan and plan.get('ends_on') and next_day and next_day>plan['ends_on'] else next_day

def sync_case(c,identity):
 linked=c.execute('SELECT admin_id FROM admin_dossier_plans WHERE task_id=?',(identity,)).fetchone()
 if not linked:return
 task=c.execute('SELECT t.completed,t.due_date,a.state,a.next_task_id FROM tasks t JOIN admin_action_details a ON a.task_id=t.id WHERE t.id=?',(identity,)).fetchone()
 if not task:return
 stamp=datetime.now().isoformat()
 if task['completed'] and task['next_task_id']:
  following=c.execute('SELECT due_date FROM tasks WHERE id=?',(task['next_task_id'],)).fetchone()
  c.execute('UPDATE admin_dossier_plans SET task_id=? WHERE admin_id=?',(task['next_task_id'],linked['admin_id']))
  c.execute("UPDATE admin_documents SET status='todo',due_date=?,updated_at=? WHERE id=?",(following['due_date'],stamp,linked['admin_id']))
 else:c.execute('UPDATE admin_documents SET status=?,due_date=?,updated_at=? WHERE id=?',('done' if task['completed'] else 'waiting' if task['state']=='doing' else 'todo',task['due_date'],stamp,linked['admin_id']))

def command(c,path,body,workspace):
 stamp=datetime.now().isoformat()
 if path.endswith('/classer'):
  action=body.get('action','create');name=classer_name(body.get('name'))
  if action=='create':
   if c.execute('SELECT 1 FROM admin_classers WHERE name=?',(name,)).fetchone():raise ValueError('Ce classeur existe déjà.')
   ensure_classer(c,name)
  elif action=='rename':
   new=classer_name(body.get('new_name'))
   if new.casefold()!=name.casefold() and c.execute('SELECT 1 FROM admin_classers WHERE name=?',(new,)).fetchone():raise ValueError('Ce nom de classeur existe déjà.')
   if not c.execute('UPDATE admin_classers SET name=? WHERE name=?',(new,name)).rowcount:raise ValueError('Classeur introuvable.')
   c.execute('UPDATE admin_documents SET category=?,updated_at=? WHERE category=? COLLATE NOCASE',(new,stamp,name));name=new
  elif action=='delete':
   if c.execute('SELECT 1 FROM admin_documents WHERE category=? COLLATE NOCASE',(name,)).fetchone():raise ValueError('Déplace d’abord les démarches de ce classeur, y compris celles des archives.')
   c.execute('DELETE FROM admin_classers WHERE name=?',(name,))
  else:raise ValueError('Action de classeur inconnue.')
  return {'ok':True,'name':name}
 if path.endswith('/case-state'):
  identity=int(body['admin_id']);state=body.get('state')
  if state not in workspace.STATES:raise ValueError('État invalide.')
  plan=c.execute('SELECT task_id FROM admin_dossier_plans WHERE admin_id=?',(identity,)).fetchone()
  if plan and plan['task_id']:
   task=next((x for x in workspace.snapshot(c)['actions'] if x['id']==plan['task_id']),None)
   if task:
    return workspace.save_action(c,{**task,'task_id':task['id'],'important':bool(task['important']),'state':state})
  if not c.execute('UPDATE admin_documents SET status=?,updated_at=? WHERE id=?',('waiting' if state=='doing' else state,stamp,identity)).rowcount:raise ValueError('Démarche introuvable.')
  return {'ok':True}
 if path.endswith('/dossier'):
  title=str(body.get('title','')).strip()
  if not 1<=len(title)<=180:raise ValueError('Écris le nom de la démarche.')
  category=ensure_classer(c,body.get('category'));notes=str(body.get('notes',''))
  if len(notes)>8000:raise ValueError('Notes limitées à 8 000 caractères.')
  identity=body.get('admin_id');plan_task=None
  if identity:
   old=c.execute('SELECT * FROM admin_documents WHERE id=?',(int(identity),)).fetchone()
   if not old:raise ValueError('Démarche introuvable.')
   if body.get('base_updated_at')!=old['updated_at']:raise LookupError('Cette démarche a changé ailleurs. Actualise avant de réessayer.')
   p=c.execute('SELECT task_id FROM admin_dossier_plans WHERE admin_id=?',(identity,)).fetchone();plan_task=p['task_id'] if p else None
   c.execute('UPDATE admin_documents SET title=?,category=?,notes=?,updated_at=? WHERE id=?',(title,category,notes,stamp,identity))
  else:identity=c.execute('INSERT INTO admin_documents(title,category,notes,created_at,updated_at) VALUES(?,?,?,?,?)',(title,category,notes,stamp,stamp)).lastrowid
  action={**body,'title':title,'admin_id':identity,'task_id':plan_task}
  if plan_task:
   item=next(x for x in workspace.snapshot(c)['actions'] if x['id']==plan_task)
   if body.get('action_revision')!=item['revision']:raise LookupError('Le planning a changé ailleurs. Actualise avant de réessayer.')
   action['revision']=item['revision']
  result=workspace.save_action(c,action);task=result['task_id']
  c.execute('INSERT INTO admin_dossier_plans VALUES(?,?) ON CONFLICT(admin_id) DO UPDATE SET task_id=excluded.task_id',(identity,task));sync_case(c,task)
  return {'admin_id':identity,'task_id':task}
 raise ValueError('Commande inconnue.')
