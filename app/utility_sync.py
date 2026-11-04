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
