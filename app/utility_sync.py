"""Optional idempotent, field-conflict-checked writes using the existing controllers."""
import hashlib
import json
import re

TABLES={'tasks','shopping','events','recipes','reminders'}
DB_TABLE={'shopping':'shopping_items'}


class Conflict(ValueError):
    pass


def initialise(c):
    c.execute('''CREATE TABLE IF NOT EXISTS sync_receipts (
      operation_id TEXT PRIMARY KEY,payload_hash TEXT NOT NULL,response_json TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)''')


def begin(c,method,path,body):
    if not isinstance(body,dict) or '_sync' not in body:return None,None
    metadata=body.pop('_sync')
    match=re.fullmatch(r'/api/(tasks|shopping|events|recipes|reminders)(?:/([0-9]+))?',path)
    if not match or method not in ('POST','PUT') or bool(match[2])!=(method=='PUT'):raise ValueError('Synchronisation non prise en charge pour cette action.')
    if not isinstance(metadata,dict) or not re.fullmatch(r'[A-Za-z0-9_-]{16,100}',str(metadata.get('id',''))):raise ValueError('Identifiant de modification invalide.')
    op=metadata['id'];fingerprint=hashlib.sha256(json.dumps([method,path,body,metadata.get('base')],sort_keys=True,ensure_ascii=False).encode()).hexdigest()
    c.execute('BEGIN IMMEDIATE')
    receipt=c.execute('SELECT * FROM sync_receipts WHERE operation_id=?',(op,)).fetchone()
    if receipt:
        if receipt['payload_hash']!=fingerprint:raise Conflict('Un identifiant de synchronisation a été réutilisé pour une autre modification.')
        return None,json.loads(receipt['response_json'])
    table=DB_TABLE.get(match[1],match[1])
    if method=='PUT':
        row=c.execute('SELECT * FROM '+table+' WHERE id=?',(int(match[2]),)).fetchone()
        if not row:raise Conflict('Cet élément a été supprimé. Ta modification reste conservée sur cet appareil.')
        base=metadata.get('base')
        if not isinstance(base,dict):raise ValueError('Version d’origine manquante.')
        fields=set(body)
        if not fields or len(fields)>25 or not fields<=set(row.keys()) or fields&{'id','created_at','updated_at'}:raise ValueError('Champs de modification invalides.')
        if not fields<=set(base):raise ValueError('Actualise cet élément avant de le modifier.')
        conflicts=[key for key in fields if row[key]!=base[key] and row[key]!=body[key]]
        if conflicts:raise Conflict('Modifié sur un autre appareil : '+', '.join(sorted(conflicts))+'. Ta version locale est conservée.')
    return {'id':op,'hash':fingerprint,'table':table,'method':method},None


def record(c,lease):
    if not lease:return
    response={'ok':True}
    if lease['method']=='POST':response={'id':c.execute('SELECT MAX(id) FROM '+lease['table']).fetchone()[0]}
    c.execute('INSERT INTO sync_receipts(operation_id,payload_hash,response_json) VALUES(?,?,?)',(lease['id'],lease['hash'],json.dumps(response)))

def merge_form(c,path,body):
    """Whole editors send only their actual changes, with optimistic conflict checks."""
    raw=body.pop('_utility_base',None)
    if raw is None:return
    match=re.fullmatch(r'/api/(tasks|events|recipes)/([0-9]+)',path)
    if not match:return
    metadata=json.loads(raw) if isinstance(raw,str) else raw
    if not isinstance(metadata,dict) or not isinstance(metadata.get('fields'),dict):raise ValueError('Version initiale du formulaire invalide.')
    if not c.in_transaction:c.execute('BEGIN IMMEDIATE')
    row=c.execute('SELECT * FROM '+match[1]+' WHERE id=?',(int(match[2]),)).fetchone()
    if not row:raise Conflict('Cet élément n’existe plus. Ton formulaire reste conservé.')
    base=metadata['fields']
    def normalize(key,value):
        if key in ('due_date','due_time','start_time','end_time') and value=='':return None
        if key=='objective_node_id':
            try:return int(value) if value else None
            except (TypeError,ValueError):return None
        return value
    for key in list(body):
        if key not in row.keys() or key not in base or key in ('id','created_at','updated_at'):continue
        incoming=normalize(key,body[key]);original=normalize(key,base[key]);latest=normalize(key,row[key])
        if incoming==original:body.pop(key)
        elif latest!=original and latest!=incoming:raise Conflict('Modifié sur un autre appareil : '+key+'. Ton formulaire reste ouvert.')
    if 'reminders' in body and 'reminders' in metadata and match[1] in ('tasks','events'):
        if not all(isinstance(items,list) and all(isinstance(r,dict) for r in items) for items in (body['reminders'],metadata['reminders'])):raise ValueError('Liste de rappels invalide.')
        def clean(items):return sorted((str(r.get('title') or ''),str(r.get('remind_at') or '')[:16]) for r in items)
        original=clean(metadata['reminders']);incoming=clean(body['reminders'])
        if original==incoming:body.pop('reminders')
        else:
            rows=c.execute("SELECT title,COALESCE(snoozed_until,remind_at) AS remind_at FROM reminders WHERE entity_type=? AND entity_id=? AND status!='done'",('task' if match[1]=='tasks' else 'event',int(match[2]))).fetchall()
            if clean([dict(r) for r in rows])!=original:raise Conflict('Les rappels ont changé ailleurs. Vérifie-les avant de les remplacer.')

    if match[1]=='events' and 'preparations' in body and 'preparations' in metadata:
        original=metadata['preparations'];incoming=body['preparations']
        if not all(isinstance(items,list) and all(isinstance(r,dict) for r in items) for items in (original,incoming)):raise ValueError('Préparatifs invalides.')
        if original==incoming:body.pop('preparations')
        else:
            latest=[dict(r) for r in c.execute('SELECT id,title FROM event_preparations WHERE event_id=? ORDER BY position,id',(int(match[2]),))]
            if original!=latest:raise Conflict('Les préparatifs ont changé ailleurs. Ton formulaire reste ouvert.')
