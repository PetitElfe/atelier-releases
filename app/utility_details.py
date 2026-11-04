"""Task support and notebook annotations, included in the complete SQLite backup."""
import json,sqlite3
from datetime import datetime
from urllib.parse import urlparse,quote
import admin_docs

def initialise(c):
 c.executescript('''CREATE TABLE IF NOT EXISTS task_extras(task_id INTEGER PRIMARY KEY REFERENCES tasks(id) ON DELETE CASCADE,revision INTEGER NOT NULL,data_json TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS task_attachments(id INTEGER PRIMARY KEY AUTOINCREMENT,task_id INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,filename TEXT NOT NULL,mime_type TEXT NOT NULL,byte_size INTEGER NOT NULL,content BLOB NOT NULL,created_at TEXT NOT NULL);
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
 task_route=len(parts)>=4 and parts[:2]==['api','tasks'] and parts[2].isdigit() and parts[3] in ('extras','attachments')
 annotations=path=='/api/library-annotations' or (len(parts)==3 and parts[:2]==['api','library-annotations'] and parts[2].isdigit())
 if not task_route and not annotations:return False
 try:
  if method!='GET':
   origin=handler.headers.get('Origin','')
   if origin and origin!=f'http://127.0.0.1:{handler.server.server_port}':handler._json({'error':'Origine refusée.'},403);return True
   size=int(handler.headers.get('Content-Length','0'))
   if size>admin_docs.MAX_ATTACHMENT_REQUEST:raise ValueError('Fichier limité à 4 Mo.')
  with sqlite3.connect(database,timeout=15) as c:
   c.row_factory=sqlite3.Row;c.execute('PRAGMA foreign_keys=ON')
   if task_route:
    task=int(parts[2])
    if not c.execute('SELECT id FROM tasks WHERE id=?',(task,)).fetchone():handler._json({'error':'Tâche introuvable.'},404);return True
    if parts[3]=='extras' and method=='GET':handler._json(extras(c,task));return True
    if parts[3]=='attachments':
     if len(parts)==4 and method=='GET':handler._json([dict(r) for r in c.execute('SELECT id,filename,mime_type,byte_size,created_at FROM task_attachments WHERE task_id=? ORDER BY id',(task,))]);return True
     if len(parts)==4 and method=='POST':
      body=handler._body();name,mime,content=admin_docs.filename_and_bytes(body.get('filename'),body.get('mime_type'),body.get('base64'))
      if c.execute('SELECT count(*) FROM task_attachments WHERE task_id=?',(task,)).fetchone()[0]>=20:raise ValueError('Maximum 20 documents par tâche.')
      cur=c.execute('INSERT INTO task_attachments(task_id,filename,mime_type,byte_size,content,created_at) VALUES(?,?,?,?,?,?)',(task,name,mime,len(content),content,datetime.now().isoformat()));c.commit();handler._json({'id':cur.lastrowid},201);return True
     if len(parts)==5 and parts[4].isdigit():
      file_id=int(parts[4]);row=c.execute('SELECT * FROM task_attachments WHERE task_id=? AND id=?',(task,file_id)).fetchone()
      if not row:handler._json({'error':'Document introuvable.'},404);return True
      if method=='DELETE':c.execute('DELETE FROM task_attachments WHERE id=?',(file_id,));c.commit();handler._json({'ok':True});return True
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
