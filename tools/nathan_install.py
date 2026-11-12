"""Transactional bootstrap upgrade of Nathan's 8877 profile, never an E: install."""
import hashlib,json,os,shutil,sqlite3,uuid
from pathlib import Path
from contextlib import closing
from datetime import datetime

def digest(path):return hashlib.sha256(Path(path).read_bytes()).hexdigest()
def verify(code):
 m=json.loads((code/'manifest.json').read_text(encoding='utf-8'))
 if m.get('edition')!='NATHAN':raise RuntimeError('Ce paquet n’est pas l’édition Nathan.')
 for row in m['files']:
  rel=Path(row['path'])
  if rel.is_absolute() or '..' in rel.parts or '\\' in row['path']:raise RuntimeError('Chemin de paquet invalide.')
  if row['path'].startswith('public/jdr') or row['path'] in ('public/personal_design.js','public/creator_access.js'):raise RuntimeError('Fonction privée interdite dans Nathan.')
  p=code/'app'/rel
  if not p.is_file() or p.is_symlink() or digest(p)!=row['sha256']:raise RuntimeError('Fichier Nathan non vérifié : '+str(rel))
 return m

def no_links(path):
 if not path.exists():return
 for p in [path,*path.rglob('*')]:
  if p.is_symlink() or getattr(p,'is_junction',lambda:False)():raise RuntimeError('Installation redirigée : opération refusée.')

def install(source,base,downloaded,fail_after_swap=None):
 source,base,downloaded=map(Path,(source,base,downloaded));new=verify(source)
 if base.name!='LAtelierDuGoblinNathan' or str(base).upper().startswith('E:\\'):raise RuntimeError('Dossier Nathan non autorisé.')
 no_links(base)
 code=base/'code';data=base/'data';exe=base/'desktop'/'LAtelierDuGoblin_Nathan.exe'
 if code.exists():
  if not (code/'app/app.py').is_file() or not (code/'app/updater.py').is_file():raise RuntimeError('Ancienne installation non reconnue, aucun remplacement.')
  old=json.loads((code/'manifest.json').read_text(encoding='utf-8'))
  updater=(code/'app/updater.py').read_text(encoding='utf-8')
  if old.get('edition')!='NATHAN' and not ('LAtelierDuGoblinNathan' in updater and 'PORT = 8877' in updater):raise RuntimeError('Ancien profil Nathan non reconnu, aucun remplacement.')
  if old.get('build_sequence',0)>new.get('build_sequence',0):raise RuntimeError('Une version plus récente est déjà installée.')
  if data.exists() and (data/'atelier.db').exists():
   with closing(sqlite3.connect(data/'atelier.db')) as c:
    if c.execute('PRAGMA integrity_check').fetchone()[0]!='ok':raise RuntimeError('Base existante à vérifier avant mise à jour.')
 base.mkdir(parents=True,exist_ok=True);data.mkdir(exist_ok=True);exe.parent.mkdir(exist_ok=True)
 backup=base/'backups'/('MAJ_Nathan_'+datetime.now().strftime('%Y%m%d_%H%M%S')+'_'+uuid.uuid4().hex[:6]);backup.mkdir(parents=True)
 old_revision=(data/'installed-revision.txt').read_bytes() if (data/'installed-revision.txt').exists() else None
 ignore={'atelier.db','atelier.db-wal','atelier.db-shm','installation.lock','desktop-window.lock','desktop-postits.lock'}
 shutil.copytree(data,backup/'data',ignore=lambda root,names:set(names)&ignore if Path(root)==data else set())
 if (data/'atelier.db').exists():
  with closing(sqlite3.connect(data/'atelier.db',timeout=15)) as src,closing(sqlite3.connect(backup/'data/atelier.db',timeout=15)) as dst:src.backup(dst)
 if exe.exists():shutil.copy2(exe,backup/'application_avant.exe')
 stage=base/('code.installing-'+uuid.uuid4().hex);shutil.copytree(source,stage);verify(stage)
 swapped=False
 try:
  if code.exists():code.rename(backup/'code_avant')
  stage.rename(code);swapped=True
  if fail_after_swap:fail_after_swap()
  temporary=exe.with_suffix('.new');shutil.copy2(downloaded,temporary)
  if digest(temporary)!=digest(downloaded):raise RuntimeError('Exécutable mal copié.')
  os.replace(temporary,exe)
  revision=(code/'nathan-build-revision.txt').read_text(encoding='ascii').strip()
  (data/'installed-revision.txt').write_text(revision,encoding='ascii')
  (backup/'RESULTAT.txt').write_text('Mise à jour Nathan réussie. Données conservées, sauvegarde avant mise à jour.\n',encoding='utf-8')
 except BaseException:
  if swapped:shutil.rmtree(code)
  if (backup/'code_avant').exists():(backup/'code_avant').rename(code)
  if (backup/'application_avant.exe').exists() and (not exe.exists() or digest(exe)!=digest(backup/'application_avant.exe')):shutil.copy2(backup/'application_avant.exe',exe)
  if old_revision is not None:(data/'installed-revision.txt').write_bytes(old_revision)
  else:(data/'installed-revision.txt').unlink(missing_ok=True)
  raise
 finally:
  if stage.exists():shutil.rmtree(stage)
  exe.with_suffix('.new').unlink(missing_ok=True)
 return backup
