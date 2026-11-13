"""Private complete snapshots, validated recovery and content-free diagnostics."""
import base64
from contextlib import closing
from datetime import datetime, timezone
import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import shutil
import socket
import sqlite3
import subprocess
import sys
import tempfile
import threading
import time
import uuid

MAX_BYTES = 256_000_000
LOCK = threading.RLock()
EXCLUDED = {'backups','recovery','WebView','webview','browser-profile','profile','desktop'}
OPERATIONAL = ('server.', 'updater', 'desktop-', 'safety-', 'installation-id', 'windows-test-channel', 'browser-recovery')


def stamp():
    return datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%S%fZ')


def atomic(path, item):
    path=Path(path);path.parent.mkdir(parents=True,exist_ok=True)
    temporary=path.with_suffix(path.suffix+'.tmp')
    with temporary.open('w',encoding='utf-8') as output:
        json.dump(item,output,ensure_ascii=False);output.flush();os.fsync(output.fileno())
    os.replace(temporary,path)


def identity(data):
    path=Path(data)/'installation-id.json'
    if not path.exists():atomic(path,{'id':str(uuid.uuid4())})
    value=json.loads(path.read_text())['id']
    uuid.UUID(value)
    return value


def user_file(rel):
    p=PurePosixPath(rel)
    return bool(rel and not p.is_absolute() and '\\' not in rel and ':' not in rel and '..' not in p.parts
                and not any(part in EXCLUDED or part.startswith('.') for part in p.parts)
                and not p.name.startswith(OPERATIONAL) and p.name not in ('atelier.db','atelier.db-wal','atelier.db-shm')
                and p.suffix.lower() not in ('.lock','.log','.pid','.tmp','.exe','.cmd','.bat','.py','.dll'))


def user_files(data):
    root=Path(data)
    for path in root.rglob('*'):
        rel=path.relative_to(root).as_posix()
        if path.is_symlink():
            if user_file(rel):raise ValueError('Un fichier de données est redirigé. Copie refusée : '+rel)
            continue
        if path.is_file() and user_file(rel):yield rel,path


def encode(raw):
    return {'sha256':hashlib.sha256(raw).hexdigest(),'base64':base64.b64encode(raw).decode('ascii')}


def decode(value):
    if not isinstance(value,dict) or not isinstance(value.get('base64'),str) or len(value['base64'])>MAX_BYTES:
        raise ValueError('Fichier de sauvegarde invalide.')
    raw=base64.b64decode(value['base64'],validate=True)
    if hashlib.sha256(raw).hexdigest()!=value.get('sha256'):raise ValueError('Empreinte incorrecte : la sauvegarde est incomplète ou altérée.')
    return raw


def snapshot(data, version, port, browser=None):
    root=Path(data)
    with LOCK,tempfile.TemporaryDirectory(prefix='goblin-snapshot-') as folder:
        destination=Path(folder)/'copy.db'
        # Connection.__exit__ ends a transaction, but never closes the file.
        # Close both handles before TemporaryDirectory removes copy.db on Windows.
        with closing(sqlite3.connect(root/'atelier.db',timeout=20)) as source,closing(sqlite3.connect(destination)) as backup:
            source.backup(backup)
            if backup.execute('PRAGMA integrity_check').fetchone()[0]!='ok':raise ValueError('La base ne passe pas le contrôle d’intégrité.')
            schema=backup.execute('PRAGMA user_version').fetchone()[0]
            tables={}
            for (name,) in backup.execute("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name"):
                escaped='"'+name.replace('"','""')+'"'
                cursor=backup.execute('SELECT * FROM '+escaped)
                # A readable JSON representation accompanies the exact SQLite image.
                tables[name]={'columns':[x[0] for x in cursor.description],
                              'rows':[[{'$bytes':base64.b64encode(v).decode()} if isinstance(v,bytes) else v for v in row] for row in cursor]}
        files={rel:encode(path.read_bytes()) for rel,path in user_files(root)}
        result={'format':'atelier-complete-backup-v1','created_at':datetime.now(timezone.utc).isoformat(),
                'app_version':version,'schema':schema,'installation_id':identity(root),'edition_port':port,
                'database':encode(destination.read_bytes()),'tables':tables,'files':files,'browser':browser if browser is not None else (json.loads((root/'browser-settings.json').read_text(encoding='utf-8')) if (root/'browser-settings.json').exists() else {})}
        if len(json.dumps(result).encode())>MAX_BYTES:raise ValueError('La copie dépasse 256 Mo. Garde une copie complète du dossier de données et contacte le support avant de continuer.')
        return result


def validate(payload, data, schema, port, *, same_installation=True):
    if not isinstance(payload,dict) or payload.get('format')!='atelier-complete-backup-v1':raise ValueError('Ce fichier n’est pas une sauvegarde complète de L’Atelier.')
    if payload.get('edition_port')!=port:raise ValueError('Cette sauvegarde appartient à une autre édition. Aucune donnée n’a été remplacée.')
    if same_installation and payload.get('installation_id')!=identity(data):raise ValueError('Sauvegarde d’une autre installation. Elle peut être vérifiée mais pas restaurée dans ce profil.')
    if type(payload.get('schema')) is not int or payload['schema']>schema:raise ValueError('La sauvegarde provient d’une version plus récente. Mets L’Atelier à jour avant de la restaurer.')
    files=payload.get('files')
    if not isinstance(files,dict) or len(files)>10000:raise ValueError('Liste des fichiers incorrecte.')
    total=0
    for rel,entry in files.items():
        if not user_file(rel):raise ValueError('Chemin de sauvegarde interdit : '+rel)
        total+=len(decode(entry))
    database=decode(payload['database']);total+=len(database)
    if total>MAX_BYTES:raise ValueError('Sauvegarde trop volumineuse.')
    with tempfile.TemporaryDirectory(prefix='goblin-verify-') as folder:
        db=Path(folder)/'verify.db';db.write_bytes(database)
        with closing(sqlite3.connect(db)) as c:
            c.execute('PRAGMA trusted_schema=OFF')
            if c.execute('PRAGMA integrity_check').fetchone()[0]!='ok' or c.execute('PRAGMA foreign_key_check').fetchall():raise ValueError('La sauvegarde ne passe pas le contrôle de la base.')
            if c.execute('PRAGMA user_version').fetchone()[0]!=payload['schema']:raise ValueError('Version de base incohérente.')
            names={r[0] for r in c.execute("SELECT name FROM sqlite_master WHERE type='table'")}
            if not {'tasks','events','recipes','objective_nodes'}<=names:raise ValueError('Des tables indispensables manquent.')
            if c.execute("SELECT count(*) FROM sqlite_master WHERE type IN ('trigger','view')").fetchone()[0]:raise ValueError('La sauvegarde contient des vues ou déclencheurs non pris en charge.')
            counts={name:c.execute('SELECT count(*) FROM "'+name.replace('"','""')+'"').fetchone()[0] for name in names if not name.startswith('sqlite_')}
    browser=payload.get('browser',{})
    if not isinstance(browser,dict) or len(json.dumps(browser).encode())>50_000_000:raise ValueError('Préférences de l’interface invalides.')
    return {'created_at':payload['created_at'],'tables':counts,'file_count':len(files),
            'same_installation':payload.get('installation_id')==identity(data),'bytes':total}


def save_snapshot(data,version,port,browser=None,reason='manual'):
    with LOCK:
        item=snapshot(data,version,port,browser)
        folder=Path(data)/'backups'/'complete';folder.mkdir(parents=True,exist_ok=True)
        name='snapshot-'+reason+'-'+stamp()+'.json';target=folder/name
        atomic(target,item)
        original=folder/'original-before-first-complete-backup.json'
        if not original.exists():atomic(original,item)
        backups=sorted(folder.glob('snapshot-startup-*.json'),reverse=True)
        # Retain the newest copy for each of the last 30 days and 12 recent starts.
        days=set();keep=set(backups[:12])
        for old in backups:
            day=old.name.split('-')[-1][:8]
            if day not in days and len(days)<30:keep.add(old);days.add(day)
        for old in backups:
            if old not in keep:old.unlink()
        return target,item


def is_fresh(data):
    root=Path(data)
    with closing(sqlite3.connect(root/'atelier.db')) as c:
        names={r[0] for r in c.execute("SELECT name FROM sqlite_master WHERE type='table'")}
        for name in ('tasks','events','recipes','objective_nodes','objective_library_entries','admin_items','home_postits','journal_entries','emotion_entries','fitness_sessions'):
            if name in names and c.execute('SELECT count(*) FROM '+name).fetchone()[0]:return False
    return not any(rel!='browser-settings.json' for rel,_ in user_files(root))


def prepare_restore(data,payload,schema,port,allow_new=False):
    if allow_new and not is_fresh(data):raise ValueError('Une restauration provenant d’une autre installation exige une copie vide. Exporte et conserve d’abord les données de cette installation.')
    report=validate(payload,data,schema,port,same_installation=not allow_new)
    token=hashlib.sha256(json.dumps(payload,sort_keys=True).encode()).hexdigest()
    atomic(Path(data)/'recovery'/(token+'.json'),payload)
    atomic(Path(data)/'recovery'/(token+'.approval.json'),{'installation_id':identity(data),'allow_new':bool(allow_new)})
    return dict(report,token=token)


def _apply(data,payload):
    root=Path(data)
    # Use SQLite's backup protocol rather than replacing an open SQLite file.
    with tempfile.TemporaryDirectory(prefix='goblin-apply-') as folder:
        source=Path(folder)/'copy.db';source.write_bytes(decode(payload['database']))
        with closing(sqlite3.connect(source)) as src,closing(sqlite3.connect(root/'atelier.db',timeout=30)) as dst:src.backup(dst)
    current=dict(user_files(root))
    for rel,value in payload['files'].items():
        dest=root/rel;dest.parent.mkdir(parents=True,exist_ok=True)
        if any(p.is_symlink() for p in [dest,*dest.parents] if p==root or root in p.parents):raise ValueError('Destination redirigée.')
        temp=dest.with_suffix(dest.suffix+'.tmp');temp.write_bytes(decode(value));os.replace(temp,dest)
    for rel,path in current.items():
        if rel not in payload['files']:path.unlink()


def apply_pending(data,version,schema,port):
    root=Path(data);pending=root/'recovery'/'pending.json'
    if not pending.exists():return
    request=json.loads(pending.read_text());token=request['token']
    if not isinstance(token,str) or not __import__('re').fullmatch('[a-f0-9]{64}',token):raise ValueError('Jeton de restauration incorrect.')
    with LOCK:
        if request.get('phase')=='applying':
            rollback=Path(request['rollback'])
            if rollback.parent.resolve()!=(root/'backups'/'complete').resolve():raise ValueError('Copie de secours hors installation.')
            _apply(root,json.loads(rollback.read_text(encoding='utf-8')))
            pending.unlink();atomic(root/'safety-status.json',{'error':'Une restauration interrompue a été annulée. Les données précédentes ont été récupérées.'});return
        try:
            payload=json.loads((root/'recovery'/(token+'.json')).read_text(encoding='utf-8'))
            approval=json.loads((root/'recovery'/(token+'.approval.json')).read_text()) if (root/'recovery'/(token+'.approval.json')).exists() else {}
            allow_new=bool(approval.get('allow_new') and approval.get('installation_id')==identity(root))
            if allow_new and not is_fresh(root):raise ValueError('Cette installation n’est plus vide. La restauration a été arrêtée.')
            validate(payload,root,schema,port,same_installation=not allow_new)
        except (OSError,ValueError,KeyError,TypeError,sqlite3.Error):
            pending.unlink(missing_ok=True)
            atomic(root/'safety-status.json',{'error':'La copie préparée est devenue invalide. Restauration annulée ; les données présentes sont conservées. Vérifie à nouveau le fichier de sauvegarde.'})
            return
        backup,_=save_snapshot(root,version,port,reason='before-restore')
        atomic(pending,{'token':token,'phase':'applying','rollback':str(backup)})
        try:
            _apply(root,payload)
            atomic(root/'browser-recovery.json',{'token':token,'browser':payload.get('browser',{})})
            atomic(root/'safety-status.json',{'restored_at':stamp(),'rollback':backup.name})
            pending.unlink()
        except Exception:
            _apply(root,json.loads(backup.read_text(encoding='utf-8')));pending.unlink();raise


def request_restart(data,token,app_file,port):
    root=Path(data)
    if token is not None:
        if not __import__('re').fullmatch('[a-f0-9]{64}',token or '') or not (root/'recovery'/(token+'.json')).is_file():raise ValueError('Vérifie d’abord la sauvegarde à restaurer.')
        atomic(root/'recovery'/'pending.json',{'token':token,'phase':'prepared'})
    atomic(root/'safety-maintenance.json',{'phase':'restoring'})
    env=dict(os.environ,ATELIER_NO_BROWSER='1')
    subprocess.Popen([sys.executable,str(Path(__file__).resolve()),'--restart',str(app_file),str(port),str(root),str(os.getpid())],env=env,
                     stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL,creationflags=getattr(subprocess,'CREATE_NO_WINDOW',0))


def diagnostics(data,version,schema,port):
    root=Path(data);folder=root/'backups'/'complete'
    snapshots=sorted(folder.glob('snapshot-*.json'),reverse=True) if folder.exists() else []
    status={}
    try:status=json.loads((root/'safety-status.json').read_text())
    except (OSError,ValueError):pass
    with closing(sqlite3.connect(root/'atelier.db',timeout=8)) as c:
        integrity=c.execute('PRAGMA quick_check').fetchone()[0]
        tables=c.execute("SELECT count(*) FROM sqlite_master WHERE type='table'").fetchone()[0]
    return {'version':version,'schema':schema,'port':port,'installation_id':identity(root),'integrity':integrity,
            'table_count':tables,'complete_backups':len(snapshots),'latest_backup':snapshots[0].name if snapshots else None,
            'original_backup':(folder/'original-before-first-complete-backup.json').exists(),'recovery':status,
            'backups':[{'name':p.name,'bytes':p.stat().st_size} for p in snapshots[:40]]}


if __name__=='__main__' and len(sys.argv)==6 and sys.argv[1]=='--restart':
    _,_,app_file,port_arg,folder,parent_pid=sys.argv
    for _ in range(300):
        try:
            current_pid=(Path(folder)/'server.pid').read_text().strip()
            if current_pid and current_pid!=parent_pid:raise SystemExit(0)
        except OSError:pass
        with socket.socket() as sock:
            if sock.connect_ex(('127.0.0.1',int(port_arg)))!=0:break
        time.sleep(.2)
    else:
        atomic(Path(folder)/'safety-status.json',{'error':'Le serveur ne s’est pas fermé. La restauration n’a pas démarré.'});raise SystemExit(1)
    # The app applies the reviewed pending recovery before opening its database.
    with (Path(folder)/'safety-startup.log').open('ab',buffering=0) as output:
        subprocess.Popen([sys.executable,app_file],env=dict(os.environ,ATELIER_NO_BROWSER='1'),stdout=output,stderr=output,
                         creationflags=getattr(subprocess,'CREATE_NO_WINDOW',0))
