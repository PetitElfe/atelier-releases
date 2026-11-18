"""Opaque encrypted health document storage. No key/password/plaintext is accepted."""
import base64
import json
import threading
from pathlib import Path
import utility_safety

MAX_BYTES=24*1024*1024
LOCK=threading.RLock()
class Conflict(ValueError):pass

def load(data):
    p=Path(data)/'health-vault-v1.json'
    if not p.exists():return {'revision':0,'envelope':None}
    value=json.loads(p.read_text(encoding='utf-8'))
    validate(value['envelope'])
    if not isinstance(value.get('revision'),int) or value['revision']<1:raise ValueError('Coffre illisible, fichier conservé.')
    return value

def validate(value):
    if not isinstance(value,dict) or set(value)!={'version','kdf','salt','wrapped','recovery','payload'}:raise ValueError('Format chiffré attendu.')
    if value['version']!=1 or value['kdf']!={'name':'PBKDF2-SHA256','iterations':600000}:raise ValueError('Paramètres de chiffrement invalides.')
    def binary(text,size=None):
        if not isinstance(text,str):raise ValueError('Données chiffrées invalides.')
        try:decoded=base64.b64decode(text,validate=True)
        except Exception as e:raise ValueError('Données chiffrées invalides.') from e
        if size is not None and len(decoded)!=size:raise ValueError('Taille chiffrée invalide.')
        return len(decoded)
    binary(value['salt'],16)
    for field in ('wrapped','recovery','payload'):
        part=value[field]
        if not isinstance(part,dict) or set(part)!={'iv','data'}:raise ValueError('Bloc chiffré invalide.')
        binary(part['iv'],12);n=binary(part['data'])
        if n<16 or (field!='payload' and n!=48):raise ValueError('Bloc chiffré invalide.')
    if len(json.dumps(value))>MAX_BYTES:raise ValueError('Coffre limité à 24 Mo chiffrés.')

def save(data,revision,envelope):
    validate(envelope)
    if not isinstance(revision,int) or isinstance(revision,bool):raise ValueError('Révision invalide.')
    with LOCK:
        old=load(data)
        if revision!=old['revision']:raise Conflict('Coffre modifié dans une autre fenêtre. Exporte ta copie chiffrée avant de recharger.')
        if old['envelope'] is not None:utility_safety.atomic(Path(data)/'health-vault-previous.json',old)
        value={'revision':revision+1,'envelope':envelope}
        utility_safety.atomic(Path(data)/'health-vault-v1.json',value)
        return value

def serve(handler,method,path,data):
    if path!='/api/health-vault':return False
    # Desktop only. A cross-origin page cannot supply this header without CORS;
    # keys remain solely in the embedded browser's memory.
    expected={'127.0.0.1:'+str(handler.server.server_port),'localhost:'+str(handler.server.server_port)}
    origin=handler.headers.get('Origin','')
    if handler.client_address[0] not in ('127.0.0.1','::1') or handler.headers.get('Host') not in expected or handler.headers.get('X-Atelier-Vault')!='1' or (origin and origin not in {'http://'+host for host in expected}):
        handler._json({'error':'Ouvre le coffre depuis cette installation Windows.'},403);return True
    try:
        with LOCK:
            if method=='GET':handler._json(load(data))
            elif method=='PUT':
                length=int(handler.headers.get('Content-Length','0'))
                if not 2<=length<=MAX_BYTES+1000:handler._json({'error':'Coffre limité à 24 Mo chiffrés.'},413);return True
                body=handler._body()
                if not isinstance(body,dict):raise ValueError('Requête invalide.')
                handler._json(save(data,body.get('revision'),body.get('envelope')))
            else:handler._json({'error':'Méthode refusée.'},405)
    except Conflict as e:handler._json({'error':str(e)},409)
    except (ValueError,KeyError,TypeError) as e:handler._json({'error':str(e)},400)
    except OSError:handler._json({'error':'Écriture impossible : exporte ta copie chiffrée avant de fermer.'},500)
    return True
