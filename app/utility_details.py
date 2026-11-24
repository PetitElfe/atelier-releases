"""Task support and notebook annotations, included in the complete SQLite backup."""
import json,sqlite3
from datetime import datetime
from urllib.parse import urlparse,quote
import admin_docs

def initialise(c):
 c.executescript('''CREATE TABLE IF NOT EXISTS task_extras(task_id INTEGER PRIMARY KEY REFERENCES tasks(id) ON DELETE CASCADE,revision INTEGER NOT NULL,data_json TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS task_attachments(id INTEGER PRIMARY KEY AUTOINCREMENT,task_id INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,filename TEXT NOT NULL,mime_type TEXT NOT NULL,byte_size INTEGER NOT NULL,content BLOB NOT NULL,created_at TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS budget_category_limits(month TEXT NOT NULL,category TEXT NOT NULL,amount_cents INTEGER NOT NULL,revision INTEGER NOT NULL DEFAULT 1,PRIMARY KEY(month,category));
 CREATE TABLE IF NOT EXISTS budget_attachments(id INTEGER PRIMARY KEY AUTOINCREMENT,entry_id INTEGER NOT NULL REFERENCES budget_entries(id) ON DELETE CASCADE,filename TEXT NOT NULL,mime_type TEXT NOT NULL,byte_size INTEGER NOT NULL,content BLOB NOT NULL,created_at TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS library_annotations(id INTEGER PRIMARY KEY AUTOINCREMENT,entry_id INTEGER NOT NULL REFERENCES objective_library_entries(id) ON DELETE CASCADE,quote TEXT NOT NULL,comment TEXT NOT NULL,correction TEXT NOT NULL DEFAULT '',resolved INTEGER NOT NULL DEFAULT 0,revision INTEGER NOT NULL DEFAULT 1,created_at TEXT NOT NULL,updated_at TEXT NOT NULL);''')

def extras(c,task):
 row=c.execute('SELECT * FROM task_extras WHERE task_id=?',(task,)).fetchone()
 return {'revision':row['revision'],'data':json.loads(row['data_json'])} if row else {'revision':0,'data':{'links':[],'checklist':[]}}

def save_task(c,task,raw):
 if raw is None:return
 body=json.loads(raw) if isinstance(raw,str) else raw
 current=extras(c,task)
 if type(body.get('revision')) is not int or body['revision']!=current['revision']:raise LookupError('Les détails de cette tâche ont changé. Ton formulaire reste ouvert ; copie tes modifications puis actualise.')
 value=body.get('data',{});links=value.get('links',[]);checklist=value.get('checklist',[])
 if not isinstance(links,list) or len(links)>20 or not isinstance(checklist,list) or len(checklist)>100:raise ValueError('Limite : 20 liens et 100 sous-tâches.')
 for link in links:
  if not isinstance(link,str) or len(link)>2000 or urlparse(link).scheme not in ('http','https') or not urlparse(link).netloc or urlparse(link).username:raise ValueError('Utilise des liens http ou https valides.')
 for item in checklist:
  if not isinstance(item,dict) or not isinstance(item.get('text'),str) or not 1<=len(item['text'])<=500 or type(item.get('done')) is not bool:raise ValueError('Sous-tâche invalide.')
 clean={'links':links,'checklist':[{'text':i['text'],'done':i['done']} for i in checklist]}
 c.execute('INSERT INTO task_extras VALUES(?,?,?) ON CONFLICT(task_id) DO UPDATE SET revision=excluded.revision,data_json=excluded.data_json',(task,current['revision']+1,json.dumps(clean,ensure_ascii=False)))

def serve(handler,method,path,q,database):
 parts=path.strip('/').split('/')
 if len(parts)>=4 and parts[:3]==['api','budget','entries']:parts=['api','budget-entries',*parts[3:]]
 budget_route=path=='/api/budget/category-limits' or (len(parts)==3 and parts[:2]==['api','budget-entries'] and parts[2].isdigit())
 budget_files=len(parts)>=4 and parts[:2]==['api','budget-entries'] and parts[2].isdigit() and parts[3]=='attachments'
 owner_table='budget_entries' if budget_files else 'tasks';attachment_table='budget_attachments' if budget_files else 'task_attachments';owner_column='entry_id' if budget_files else 'task_id'
 task_route=len(parts)>=4 and parts[:2]==['api','tasks'] and parts[2].isdigit() and parts[3] in ('extras','attachments')
 annotations=path=='/api/library-annotations' or (len(parts)==3 and parts[:2]==['api','library-annotations'] and parts[2].isdigit())
 admin_route=method=='PUT' and len(parts)==5 and parts[:2]==['api','admin'] and parts[2].isdigit() and parts[3]=='attachments' and parts[4].isdigit()
 if not task_route and not annotations and not admin_route and not budget_route and not budget_files:return False
 try:
  if method!='GET':
   origin=handler.headers.get('Origin','')
   if origin and origin!=f'http://127.0.0.1:{handler.server.server_port}':handler._json({'error':'Origine refusée.'},403);return True
   size=int(handler.headers.get('Content-Length','0'))
   if size>admin_docs.MAX_ATTACHMENT_REQUEST:raise ValueError('Fichier limité à 4 Mo.')
  with sqlite3.connect(database,timeout=15) as c:
   c.row_factory=sqlite3.Row;c.execute('PRAGMA foreign_keys=ON')
   if budget_route:
    result=budget_support(c,method,parts,q,handler._body() if method!='GET' else {});c.commit();handler._json(result);return True
   if admin_route:
    result=admin_docs.update_document(c,int(parts[2]),int(parts[4]),handler._body());c.commit();handler._json(result);return True
   if task_route or budget_files:
    task=int(parts[2])
    if not c.execute('SELECT id FROM '+owner_table+' WHERE id=?',(task,)).fetchone():handler._json({'error':'Tâche introuvable.'},404);return True
    if parts[3]=='extras' and method=='GET':handler._json(extras(c,task));return True
    if parts[3]=='attachments':
     if len(parts)==4 and method=='GET':handler._json([dict(r) for r in c.execute('SELECT id,filename,mime_type,byte_size,created_at FROM '+attachment_table+' WHERE '+owner_column+'=? ORDER BY id',(task,))]);return True
     if len(parts)==4 and method=='POST':
      body=handler._body();name,mime,content=admin_docs.filename_and_bytes(body.get('filename'),body.get('mime_type'),body.get('base64'))
      if c.execute('SELECT count(*) FROM '+attachment_table+' WHERE '+owner_column+'=?',(task,)).fetchone()[0]>=20:raise ValueError('Maximum 20 documents par tâche.')
      cur=c.execute('INSERT INTO '+attachment_table+'('+owner_column+',filename,mime_type,byte_size,content,created_at) VALUES(?,?,?,?,?,?)',(task,name,mime,len(content),content,datetime.now().isoformat()));c.commit();handler._json({'id':cur.lastrowid},201);return True
     if len(parts)==5 and parts[4].isdigit():
      file_id=int(parts[4]);row=c.execute('SELECT * FROM '+attachment_table+' WHERE '+owner_column+'=? AND id=?',(task,file_id)).fetchone()
      if not row:handler._json({'error':'Document introuvable.'},404);return True
      if method=='DELETE':c.execute('DELETE FROM '+attachment_table+' WHERE id=?',(file_id,));c.commit();handler._json({'ok':True});return True
      if method=='GET':
       handler.send_response(200);handler.send_header('Content-Type',row['mime_type']);handler.send_header('Content-Length',str(row['byte_size']));handler.send_header('Content-Disposition',"attachment; filename*=UTF-8''"+quote(row['filename']));handler.send_header('X-Content-Type-Options','nosniff');handler.send_header('Cache-Control','no-store');handler.end_headers();handler.wfile.write(row['content']);return True
   if annotations:
    if method=='GET':
     entry=int(q.get('entry_id',['0'])[0]);handler._json([dict(r) for r in c.execute('SELECT * FROM library_annotations WHERE entry_id=? ORDER BY created_at,id',(entry,))]);return True
    body=handler._body();now=datetime.now().isoformat();comment=body.get('comment','');correction=body.get('correction','');text=body.get('quote','')
    if any(not isinstance(v,str) for v in (comment,correction,text)) or len(comment)>10000 or len(correction)>10000 or len(text)>5000:raise ValueError('Annotation trop longue.')
    if method=='POST' and len(parts)==2:
     entry=int(body['entry_id'])
     if not c.execute('SELECT id FROM objective_library_entries WHERE id=?',(entry,)).fetchone():raise ValueError('Page introuvable.')
     if not comment.strip() and not correction.strip():raise ValueError('Écris un commentaire ou une correction proposée.')
     cur=c.execute('INSERT INTO library_annotations(entry_id,quote,comment,correction,created_at,updated_at) VALUES(?,?,?,?,?,?)',(entry,text,comment,correction,now,now));c.commit();handler._json({'id':cur.lastrowid},201);return True
    if method=='PUT' and len(parts)==3:
     c.execute('BEGIN IMMEDIATE');old=c.execute('SELECT * FROM library_annotations WHERE id=?',(int(parts[2]),)).fetchone()
     if not old:raise ValueError('Annotation introuvable.')
     if body.get('revision')!=old['revision']:raise LookupError('Annotation modifiée ailleurs. Actualise avant de réessayer.')
     resolved=body.get('resolved')
     if type(resolved) is not bool:raise ValueError('État invalide.')
     c.execute('UPDATE library_annotations SET resolved=?,revision=revision+1,updated_at=? WHERE id=?',(int(resolved),now,old['id']));c.commit();handler._json({'ok':True});return True
  handler._json({'error':'Action introuvable.'},404)
 except LookupError as e:handler._json({'error':str(e)},409)
 except (ValueError,TypeError,KeyError,sqlite3.Error) as e:handler._json({'error':str(e)},400)
 return True


def _amount(value):
 from decimal import Decimal,InvalidOperation,ROUND_HALF_UP
 try:
  number=Decimal(str(value).replace(',','.'))
  if not number.is_finite() or not 0<=number<=100000000:raise ValueError()
  return int((number*100).quantize(Decimal('1'),rounding=ROUND_HALF_UP))
 except (ValueError,InvalidOperation):raise ValueError('Montant invalide.')

def budget_support(c,method,parts,q,body):
 from datetime import date
 if parts[:2]==['api','budget-entries']:
  if method not in ('PUT','DELETE'):raise ValueError('Action invalide.')
  c.execute('BEGIN IMMEDIATE');row=c.execute('SELECT * FROM budget_entries WHERE id=?',(int(parts[2]),)).fetchone()
  if not row:raise ValueError('Opération introuvable.')
  if method=='DELETE' or 'archived' in body:
   if method=='PUT' and body.get('archived') is not False:raise ValueError('Restauration invalide.')
   if type(body.get('revision')) is not int or body['revision']!=row['revision']:raise LookupError('Cette ligne a changé. Actualise le budget avant de réessayer.')
   archived=int(method=='DELETE')
   c.execute('UPDATE budget_entries SET archived=?,revision=revision+1 WHERE id=?',(archived,row['id']))
   return {'ok':True,'id':row['id'],'archived':bool(archived)}
  if row['archived']:raise LookupError('Cette ligne a été supprimée. Actualise le budget avant de la modifier.')
  if not isinstance(body.get('base'),dict):raise ValueError('Version d’origine requise.')
  values={}
  for key in ('title','category','notes','scheduled_date','actual_date'):
   if key not in body:continue
   value=body[key]
   if not isinstance(value,str):raise ValueError('Texte invalide.')
   if key in ('scheduled_date','actual_date'):value=date.fromisoformat(value).isoformat()
   elif len(value)>(10000 if key=='notes' else 180):raise ValueError('Texte trop long.')
   if key in ('title','category') and not value.strip():raise ValueError('Nom et catégorie requis.')
   values[key]=value
  if 'amount' in body:values['amount_cents']=_amount(body['amount'])
  for key,value in values.items():
   if key not in body['base'] or (row[key]!=body['base'][key] and row[key]!=value):raise LookupError('Opération modifiée ailleurs. Tes corrections restent dans le formulaire.')
  if not values:raise ValueError('Aucune correction à enregistrer.')
  c.execute('UPDATE budget_entries SET '+','.join(k+'=?' for k in values)+',revision=revision+1 WHERE id=?',(*values.values(),row['id']))
  return {'ok':True,'id':row['id']}
 month=body.get('month') or q.get('month',[''])[0]
 if not isinstance(month,str) or len(month)!=7:raise ValueError('Mois invalide.')
 date.fromisoformat(month+'-01')
 if method=='GET':
  result=[]
  entries=c.execute("SELECT category,amount_cents,status FROM budget_entries WHERE archived=0 AND kind='expense' AND substr(COALESCE(actual_date,scheduled_date),1,7)=? AND status!='skipped'",(month,)).fetchall()
  for row in c.execute('SELECT * FROM budget_category_limits WHERE month=? ORDER BY category',(month,)):
   item=dict(row);matching=[e for e in entries if e['category'].strip().casefold()==item['category'].casefold()];item['spent_cents']=sum(e['amount_cents'] for e in matching if e['status']=='confirmed');item['planned_cents']=sum(e['amount_cents'] for e in matching);result.append(item)
  return result
 category=body.get('category')
 if not isinstance(category,str) or not 1<=len(category.strip())<=80:raise ValueError('Catégorie invalide.')
 category=category.strip();c.execute('BEGIN IMMEDIATE');old=c.execute('SELECT * FROM budget_category_limits WHERE month=? AND category=?',(month,category)).fetchone();revision=old['revision'] if old else 0
 if type(body.get('revision')) is not int or body['revision']!=revision:raise LookupError('Ce plafond a changé ailleurs. Actualise avant de réessayer.')
 if method=='DELETE':c.execute('DELETE FROM budget_category_limits WHERE month=? AND category=?',(month,category));return {'ok':True}
 if method!='PUT':raise ValueError('Action invalide.')
 c.execute('INSERT INTO budget_category_limits VALUES(?,?,?,?) ON CONFLICT(month,category) DO UPDATE SET amount_cents=excluded.amount_cents,revision=excluded.revision',(month,category,_amount(body.get('amount')),revision+1))
 return {'ok':True}
