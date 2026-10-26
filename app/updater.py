"""L'Atelier: automatic updates for the isolated Windows TEST copy only."""
import hashlib, io, json, os, re, shutil, socket, sqlite3, subprocess, sys, time
from pathlib import Path, PurePosixPath
from datetime import datetime
from urllib.parse import quote
from urllib.request import Request, urlopen
from zipfile import ZipFile

BASE = Path(r'E:\LATELIER_TEST_0180')
CODE = BASE / 'code_0180'
DATA = BASE / 'data'
PORT = 8876
REPO = 'PetitElfe/atelier-releases'
BRANCH = 'feature/0180-progression-foundations'
STATUS = DATA / 'updater-state.json'
LOCK = DATA / 'updater.lock'
LOG = DATA / 'updater-worker.log'

def _sha(data):
    return hashlib.sha256(data).hexdigest()

def guard():
    if os.name != 'nt':
        raise RuntimeError('Mise à jour en un clic disponible uniquement dans Windows TEST.')
    if (Path(__file__).resolve().parent != (CODE / 'app').resolve()
            or Path(os.environ.get('ATELIER_DATA_DIR', '')).resolve() != DATA.resolve()
            or os.environ.get('ATELIER_PORT') != str(PORT)):
        raise RuntimeError('Opération interdite hors de L’Atelier TEST (port 8876).')
    if not (DATA / 'atelier.db').is_file() or not (CODE / 'manifest.json').is_file():
        raise RuntimeError('Dossier de test ou base de données introuvable.')
    for base in (CODE, DATA):
        if base.is_symlink() or getattr(base, 'is_junction', lambda: False)():
            raise RuntimeError('Dossier de test redirigé : mise à jour refusée.')

def status():
    try: return json.loads(STATUS.read_text(encoding='utf-8'))
    except (OSError, ValueError): return {'phase': 'idle', 'detail': ''}

def _status(phase, detail='', revision=''):
    DATA.mkdir(parents=True, exist_ok=True)
    temp = DATA / ('updater-state-' + str(os.getpid()) + '.tmp')
    temp.write_text(json.dumps({'phase': phase, 'detail': str(detail)[:450],
                     'revision': revision}, ensure_ascii=False), encoding='utf-8')
    os.replace(temp, STATUS)

def _get(url, maximum=80000000):
    req = Request(url, headers={'User-Agent':'LAtelier-TEST-Updater/0.18',
                                'Cache-Control':'no-cache'})
    with urlopen(req, timeout=60) as response: data=response.read(maximum+1)
    if len(data)>maximum: raise RuntimeError('Téléchargement trop volumineux.')
    return data

def _manifest(data):
    manifest=json.loads(data.decode('utf-8-sig'))
    if manifest.get('version')!='0.18.0' or manifest.get('format')!=2:
        raise RuntimeError('Version de mise à jour TEST inattendue.')
    entries=manifest.get('files')
    if not isinstance(entries,list) or len(entries)<16: raise RuntimeError('Manifeste incomplet.')
    seen=set()
    for item in entries:
        rel=item.get('path','') if isinstance(item,dict) else ''
        p=PurePosixPath(rel)
        if (not rel or '\\' in rel or ':' in rel or p.is_absolute() or
            '..' in p.parts or rel in seen or
            not re.fullmatch(r'[0-9a-f]{64}',str(item.get('sha256','')))):
            raise RuntimeError('Manifeste non sécurisé : '+str(rel))
        seen.add(rel)
    if not {'app.py','app_part1.py','app_part2.py','app_part3.py',
            'updater.py','public/index.html','public/styles.css','VERSION'}.issubset(seen):
        raise RuntimeError('Fichier critique manquant.')
    return manifest

def check():
    guard()
    ref='https://api.github.com/repos/'+REPO+'/commits/'+quote(BRANCH,safe='')
    revision=json.loads(_get(ref,200000)).get('sha','')
    if not re.fullmatch('[a-f0-9]{40}',revision): raise RuntimeError('Révision GitHub invalide.')
    remote=_manifest(_get('https://raw.githubusercontent.com/'+REPO+'/'+revision+'/manifest.json',200000))
    installed=_manifest((CODE/'manifest.json').read_bytes())
    old={x['path']:x['sha256'] for x in installed['files']}
    new={x['path']:x['sha256'] for x in remote['files']}
    return {'version':'0.18.0','channel':'TEST','revision':revision,
            'available':old!=new,'installed_version':installed['version']}

def _stage(revision):
    raw=_get('https://codeload.github.com/'+REPO+'/zip/'+revision)
    with ZipFile(io.BytesIO(raw)) as z:
        paths=[x for x in z.namelist() if x.count('/')==1 and x.endswith('/manifest.json')]
        if len(paths)!=1: raise RuntimeError('Manifeste absent de l’archive.')
        prefix=paths[0][:-len('manifest.json')]
        data=z.read(prefix+'manifest.json')
        target=_manifest(data)
        remote=_manifest(_get('https://raw.githubusercontent.com/'+REPO+'/'+revision+'/manifest.json',200000))
        if target!=remote: raise RuntimeError('Manifeste distant différent.')
        files={};total=0
        for entry in target['files']:
            rel=entry['path'];info=z.getinfo(prefix+'app/'+rel)
            if info.file_size>12_000_000 or info.is_dir() or ((info.external_attr>>16)&0o170000)==0o120000:
                raise RuntimeError('Fichier distant non autorisé : '+rel)
            total+=info.file_size
            if total>70_000_000: raise RuntimeError('Archive extraite trop volumineuse.')
            content=z.read(info)
            if _sha(content)!=entry['sha256']: raise RuntimeError('SHA-256 invalide : '+rel)
            files[rel]=content
    stage=BASE/('_atelier_prepare_'+revision[:12])
    if stage.exists(): raise RuntimeError('Ancienne préparation déjà présente.')
    for folder in (CODE,DATA):
        for item in folder.rglob('*'):
            if item.is_symlink() or getattr(item,'is_junction',lambda:False)():
                raise RuntimeError('Lien ou jonction non autorisé : '+str(item))
    shutil.copytree(CODE,stage)
    for rel,content in files.items():
        dest=stage/'app'/Path(*PurePosixPath(rel).parts)
        dest.parent.mkdir(parents=True,exist_ok=True)
        dest.write_bytes(content)
    (stage/'manifest.json').write_text(json.dumps(target,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    return stage

def _port():
    with socket.socket() as s:
        s.settimeout(.3)
        return s.connect_ex(('127.0.0.1',PORT))==0

def _stop():
    if not _port(): raise RuntimeError('Le serveur TEST ne répond plus.')
    req=Request('http://127.0.0.1:'+str(PORT)+'/api/shutdown',
                data=b'{}',method='POST',headers={'Content-Type':'application/json'})
    with urlopen(req,timeout=4) as r:
        if not r.headers.get('Server','').startswith('AtelierLocal/'):
            raise RuntimeError('Le port 8876 appartient à une autre application.')
        r.read(1024)
    for _ in range(100):
        if not _port() and not (DATA/'server.pid').exists(): return
        time.sleep(.2)
    raise RuntimeError('Le serveur ne s’est pas arrêté proprement.')

def _backup(backup):
    omit={'updater-state.json','updater.lock','updater-worker.log'}
    shutil.copytree(DATA,backup/'data',ignore=lambda _,names:omit & set(names))
    for item in DATA.rglob('*'):
        if not item.is_file() or item.name in omit or item.name.startswith('updater-state-'):continue
        saved=backup/'data'/item.relative_to(DATA)
        if not saved.is_file() or _sha(item.read_bytes())!=_sha(saved.read_bytes()):
            raise RuntimeError('Sauvegarde non conforme : '+str(item))
    for item in (backup/'data').rglob('*.db'):
        with sqlite3.connect(item) as c:
            if c.execute('PRAGMA integrity_check').fetchone()[0]!='ok':
                raise RuntimeError('Base sauvegardée invalide.')

def _start():
    env=dict(os.environ)
    env.update(ATELIER_DATA_DIR=str(DATA),ATELIER_PORT=str(PORT),ATELIER_NO_BROWSER='1')
    flags=(getattr(subprocess,'DETACHED_PROCESS',0) |
           getattr(subprocess,'CREATE_NEW_PROCESS_GROUP',0) |
           getattr(subprocess,'CREATE_NO_WINDOW',0))
    with open(LOG,'ab',buffering=0) as out:
        child=subprocess.Popen([sys.executable,'-u',str(CODE/'app'/'app.py')],
           cwd=str(CODE),env=env,stdin=subprocess.DEVNULL,stdout=out,stderr=subprocess.STDOUT,
           close_fds=True,creationflags=flags)
    for _ in range(100):
        if child.poll() is not None:raise RuntimeError('Le serveur redémarré s’est arrêté.')
        try:
            with urlopen('http://127.0.0.1:'+str(PORT)+'/api/runtime-version',timeout=.5) as r:
                if r.headers.get('Server','').startswith('AtelierLocal/') and json.load(r).get('version')=='0.18.0':return
        except (OSError,ValueError):pass
        time.sleep(.2)
    raise RuntimeError('Serveur TEST inaccessible après installation.')

def worker(revision):
    lock=None;stage=None;backup=None;stopped=False;old_moved=False
    try:
        guard()
        if not re.fullmatch(r'[a-f0-9]{40}',revision):raise RuntimeError('Révision incorrecte.')
        lock=os.open(LOCK,os.O_CREAT|os.O_EXCL|os.O_WRONLY,0o600)
        os.write(lock,str(os.getpid()).encode('ascii'))
        _status('download','Téléchargement et contrôle des fichiers…',revision)
        stage=_stage(revision)
        _status('stopping','Préparation vérifiée. Redémarrage en cours…',revision)
        _stop();stopped=True
        backup=BASE/('SAUVEGARDE_AUTO_TEST_'+datetime.now().strftime('%Y%m%d_%H%M%S')+'_'+revision[:8])
        backup.mkdir()
        _status('backup','Sauvegarde de secours en cours…',revision)
        _backup(backup)
        _status('installing','Installation de la révision testée…',revision)
        CODE.rename(backup/'code_avant');old_moved=True
        stage.rename(CODE);stage=None
        _start()
        _status('success','L’Atelier TEST a redémarré avec succès.',revision)
    except Exception as exc:
        message=str(exc)
        if stopped:
            try:
                if old_moved and backup and (backup/'code_avant').is_dir():
                    if _port():_stop()
                    if CODE.exists():CODE.rename(backup/'code_en_echec')
                    (backup/'code_avant').rename(CODE)
                if backup and (backup/'data'/'atelier.db').is_file():
                    for saved in (backup/'data').rglob('*'):
                        if saved.is_file():
                            dest=DATA/saved.relative_to(backup/'data')
                            dest.parent.mkdir(parents=True,exist_ok=True)
                            shutil.copy2(saved,dest)
                if (CODE/'app'/'app.py').is_file():_start()
                message+=' Ancienne version TEST restaurée.'
            except Exception as rollback:
                message+=' ATTENTION : restauration à contrôler : '+str(rollback)
        _status('error',message,revision)
    finally:
        if lock is not None:
            os.close(lock)
            try:LOCK.unlink(missing_ok=True)
            except OSError:pass

def begin(revision):
    guard()
    if not re.fullmatch(r'[a-f0-9]{40}',revision):raise RuntimeError('Révision demandée invalide.')
    if LOCK.exists() or status().get('phase') in ('starting','download','stopping','backup','installing'):
        raise RuntimeError('Une mise à jour est déjà en cours.')
    current=check()
    if current['revision']!=revision or not current['available']:
        raise RuntimeError('Révision modifiée : effectue une nouvelle vérification.')
    _status('starting','Préparation de la mise à jour…',revision)
    flags=(getattr(subprocess,'DETACHED_PROCESS',0) |
           getattr(subprocess,'CREATE_NEW_PROCESS_GROUP',0) |
           getattr(subprocess,'CREATE_NO_WINDOW',0))
    try:
        with open(LOG,'ab',buffering=0) as output:
            subprocess.Popen([sys.executable,str(Path(__file__).resolve()),'--worker',revision],
              cwd=str(BASE),env=os.environ.copy(),stdin=subprocess.DEVNULL,
              stdout=output,stderr=subprocess.STDOUT,close_fds=True,creationflags=flags)
    except Exception:
        _status('error','Impossible de démarrer l’assistant de mise à jour.',revision)
        raise
    return {'ok':True,'revision':revision}

if __name__=='__main__':
    if len(sys.argv)==3 and sys.argv[1]=='--worker':worker(sys.argv[2])
    else:raise SystemExit('Lancement direct de cet assistant désactivé.')
