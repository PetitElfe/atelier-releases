"""Owner-only local PNG staging and bounded publication; never exposes image bytes."""
import hashlib,json,os,re,shutil,struct,subprocess,tempfile,threading,time,uuid
from pathlib import Path
MAX_BYTES=16*1024*1024
_LOCK=threading.RLock();_session=None
class Cancelled(Exception):pass

def validate(raw):
 if not isinstance(raw,bytes) or not 33<=len(raw)<=MAX_BYTES or raw[:8]!=b'\x89PNG\r\n\x1a\n' or raw[12:16]!=b'IHDR':raise ValueError('Dépose un fichier PNG de 16 Mo maximum.')
 w,h=struct.unpack('>II',raw[16:24])
 if not 1<=w<=8192 or not 1<=h<=8192 or w*h>16777216:raise ValueError('PNG trop grand. Exporte une icône de 1024 × 1024 px.')
 return w,h

def status():
 with _LOCK:
  if not _session:return {'phase':'idle','message':'','draft_id':None,'elapsed':0,'step':0}
  return {k:_session[k] for k in ('phase','message','draft_id','step')}|{'elapsed':int(time.monotonic()-_session['started'])}

def _state(s,phase,message,step=0):
 with _LOCK:s.update(phase=phase,message=message,step=step)

def _run(s,args,payload=None,timeout=45):
 if s['cancel'].is_set():raise Cancelled()
 flags=getattr(subprocess,'CREATE_NO_WINDOW',0)
 with subprocess.Popen(args,stdin=subprocess.PIPE if payload is not None else subprocess.DEVNULL,stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True,encoding='utf-8',errors='replace',creationflags=flags) as process:
  deadline=min(time.monotonic()+timeout,s.get('deadline',float('inf')));first=True
  while True:
   if s['cancel'].is_set() or time.monotonic()>=deadline:
    process.kill();process.communicate()
    if s['cancel'].is_set():raise Cancelled()
    raise TimeoutError('Cette étape ne répond pas. Elle a été arrêtée ; tu peux réessayer.')
   try:
    out,err=process.communicate(input=payload if first else None,timeout=.2)
    if len(out)>12000000:raise RuntimeError('Réponse GitHub trop volumineuse.')
    return process.returncode,out
   except subprocess.TimeoutExpired:first=False

def _gh(s,args,payload=None,allow_failure=False):
 code,out=_run(s,[s['gh'],*args],payload)
 if code and not allow_failure:raise RuntimeError('GitHub a refusé cette étape. Vérifie ta connexion et les droits de ton compte sur PetitElfe/atelier-releases, puis réessaie.')
 return code,out

def prepare(data,raw):
 validate(raw)
 global _session
 with _LOCK:
  if _session and _session['phase'] in ('preparing','publishing'):raise RuntimeError('Une opération est en cours. Annule-la avant de choisir une autre image.')
  if _session:shutil.rmtree(_session['folder'],ignore_errors=True)
  folder=Path(tempfile.mkdtemp(prefix='atelier-official-icon-'));identifier=uuid.uuid4().hex
  s={'phase':'preparing','message':'Préparation du PNG sur ton PC…','draft_id':identifier,'step':1,'started':time.monotonic(),'cancel':threading.Event(),'folder':folder,'data':Path(data)};_session=s
  (folder/'source.png').write_bytes(raw)
 def work():
  try:
   code,_=_run(s,['powershell.exe','-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',str(Path(__file__).with_name('official_icon_prepare.ps1')),'-InputPng',str(folder/'source.png'),'-OutputDir',str(folder)],timeout=45)
   if code:raise ValueError('Ce PNG n’a pas pu être préparé. Réexporte-le depuis Clip Studio au format PNG.')
   png=folder/'prepared.png';ico=folder/'prepared.ico'
   meta={'png_sha256':hashlib.sha256(png.read_bytes()).hexdigest(),'ico_sha256':hashlib.sha256(ico.read_bytes()).hexdigest()}
   for kind in ('png','ico'):(folder/('prepared.'+kind)).rename(folder/('icon-'+meta[kind+'_sha256']+'.'+kind))
   (folder/'icon.json').write_text(json.dumps(meta),encoding='utf-8');s['metadata']=meta
   _state(s,'ready','Prêt. Rien n’a été publié. Vérifie l’aperçu puis clique sur Publier.',2)
  except Cancelled:_state(s,'cancelled','Opération annulée. Le fichier original est intact.')
  except Exception as exc:_state(s,'invalid',str(exc))
  finally:
   (folder/'source.png').unlink(missing_ok=True)
   if s['phase'] in ('cancelled','error','invalid'):shutil.rmtree(folder,ignore_errors=True)
 threading.Thread(target=work,daemon=True,name='official-icon-prepare').start()
 return {'ok':True,'draft_id':identifier}

def cancel(identifier):
 with _LOCK:
  s=_session
  if not s or s['draft_id']!=identifier:raise ValueError('Brouillon introuvable.')
  s['cancel'].set()
  if s['phase'] not in ('preparing','publishing'):
   shutil.rmtree(s['folder'],ignore_errors=True);_state(s,'cancelled','Brouillon effacé. Le fichier original est intact.')
 return {'ok':True}

def publish(identifier):
 with _LOCK:
  s=_session
  if not s or identifier!=s['draft_id'] or not (s['folder']/'icon.json').is_file():raise ValueError('Dépose d’abord ton PNG.')
  if s['phase'] in ('preparing','publishing'):raise RuntimeError('Une opération est déjà en cours.')
  if s['cancel'].is_set():raise ValueError('Ce brouillon a été annulé. Dépose à nouveau ton PNG.')
  gh=shutil.which('gh')
  if not gh:raise ValueError('GitHub CLI est nécessaire une seule fois pour publier : installe-le puis connecte ton compte avec « gh auth login ». L’image reste sur ton PC.')
  s['gh']=gh;s['deadline']=time.monotonic()+180;s['started']=time.monotonic();_state(s,'publishing','1/5 · Vérification de la connexion GitHub…',1)
 def work():
  repo='PetitElfe/atelier-releases';folder=s['folder'];meta=s['metadata'];metadata_published=False
  try:
   code,_=_gh(s,['auth','status'],allow_failure=True)
   if code:raise RuntimeError('GitHub n’est pas connecté. Lance « gh auth login » sur ce PC, puis réessaie. Rien n’a été publié.')
   _state(s,'publishing','2/5 · Préparation de la publication…',2)
   code,_=_gh(s,['release','view','atelier-official-icon','--repo',repo],allow_failure=True)
   if code:_gh(s,['release','create','atelier-official-icon','--repo',repo,'--prerelease','--title','Icône officielle de L’Atelier','--notes','Icône publiée directement par sa créatrice depuis son PC.'])
   _state(s,'publishing','3/5 · Envoi de la copie de l’icône vers GitHub…',3)
   assets=[str(folder/('icon-'+meta[k+'_sha256']+'.'+k)) for k in ('png','ico')]
   _gh(s,['release','upload','atelier-official-icon',*assets,'--repo',repo,'--clobber'])
   _gh(s,['release','upload','atelier-official-icon',str(folder/'icon.json'),'--repo',repo,'--clobber']);metadata_published=True
   _state(s,'publishing','4/5 · Préparation de la mise à jour Android…',4)
   if not s.get('android_commit'):
    _,out=_gh(s,['api','repos/'+repo+'/releases?per_page=100']);releases=json.loads(out)
    versions=[r for r in releases if re.fullmatch(r'android-test-v\d+\.\d+\.\d+',r['tag_name']) and not r.get('draft')]
    latest=max(versions,key=lambda r:tuple(map(int,r['tag_name'][14:].split('.'))))
    _,out=_gh(s,['api','repos/'+repo+'/commits/'+latest['tag_name']]);base=json.loads(out)
    marker=meta['png_sha256']+' '+meta['ico_sha256']
    tree={'base_tree':base['commit']['tree']['sha'],'tree':[{'path':'.branding/request.txt','mode':'100644','type':'blob','content':marker}]}
    _,out=_gh(s,['api','repos/'+repo+'/git/trees','--method','POST','--input','-'],json.dumps(tree));tree_sha=json.loads(out)['sha']
    _,out=_gh(s,['api','repos/'+repo+'/git/commits','--method','POST','--input','-'],json.dumps({'message':'Build creator-published official icon from tested Android source','tree':tree_sha,'parents':[base['sha']]}));commit=json.loads(out)['sha']
    s['android_commit']=commit;s['android_base']=base['sha']
   commit=s['android_commit']
   branch='test/official-icon-android'
   code,_=_gh(s,['api','repos/'+repo+'/git/ref/heads/'+branch],allow_failure=True)
   if code:_gh(s,['api','repos/'+repo+'/git/refs','--method','POST','--input','-'],json.dumps({'ref':'refs/heads/'+branch,'sha':s['android_base']}))
   _gh(s,['api','repos/'+repo+'/git/refs/heads/'+branch,'--method','PATCH','--input','-'],json.dumps({'sha':commit,'force':True}))
   _state(s,'publishing','5/5 · Application sur ce PC…',5)
   cache=s['data']/'official-icon';cache.mkdir(parents=True,exist_ok=True);ico_name='icon-'+meta['ico_sha256']+'.ico';shutil.copyfile(folder/ico_name,cache/ico_name)
   tmp=cache/'current.tmp';tmp.write_text(json.dumps(meta));os.replace(tmp,cache/'current.json')
   choice=s['data']/'local-icon'/'selection.json'
   if choice.is_file() and not choice.is_symlink():shutil.copyfile(choice,choice.with_name('selection-before-official.json'));choice.unlink()
   _state(s,'success','Icône publiée et appliquée sur ce PC. Les autres PC la récupéreront automatiquement. Android prépare sa mise à jour signée.',5)
   shutil.rmtree(folder,ignore_errors=True)
  except Cancelled:
   _state(s,'cancelled','Opération arrêtée. '+('L’icône PC a déjà été publiée ; la préparation Android est à relancer.' if metadata_published else 'Aucune nouvelle publication n’a été confirmée.'));shutil.rmtree(folder,ignore_errors=True)
  except Exception as exc:_state(s,'error',str(exc)+(' L’icône PC a déjà été publiée ; réessaie pour relancer Android.' if metadata_published else ' La publication n’est pas confirmée ; tu peux réessayer.'))
 threading.Thread(target=work,daemon=True,name='official-icon-publish').start()
 return {'ok':True}

def serve(handler,method,p,data,port,host):
 if not p.startswith('/api/official-icon/'):return False
 # A remote tailnet session, another origin or another edition cannot upload/publish art.
 if port!=8876 or handler.headers.get('Host')!=f'{host}:{port}' or (handler.headers.get('Origin')!=f'http://{host}:{port}' if method!='GET' else handler.headers.get('Origin','') not in ('',f'http://{host}:{port}')) or handler.headers.get('X-Atelier-Official-Icon')!='1':handler._json({'error':'Ouvre cette option dans L’Atelier sur ton PC.'},403);return True
 import updater,creator_access
 if not creator_access.allowed(data,handler.headers.get('X-Atelier-Creator','')):handler._json({'error':'Déverrouille ton mode création avant de continuer.'},403);return True
 try:
  updater.guard()
  if method=='GET' and p.endswith('/status'):handler._json(status());return True
  if method!='POST':handler._json({'error':'Méthode invalide.'},405);return True
  size=int(handler.headers.get('Content-Length','0'))
  if p.endswith('/prepare'):
   if not 33<=size<=MAX_BYTES:raise ValueError('PNG limité à 16 Mo.')
   result=prepare(data,handler.rfile.read(size))
  else:
   if not 2<=size<=256:raise ValueError('Requête invalide.')
   body=json.loads(handler.rfile.read(size));identifier=body.get('draft_id','')
   if not isinstance(identifier,str) or not re.fullmatch('[0-9a-f]{32}',identifier):raise ValueError('Brouillon invalide.')
   if p.endswith('/publish'):result=publish(identifier)
   elif p.endswith('/cancel'):result=cancel(identifier)
   else:raise ValueError('Action inconnue.')
  handler._json(result)
 except (ValueError,RuntimeError,OSError,TypeError) as exc:handler._json({'error':str(exc)},409)
 return True
