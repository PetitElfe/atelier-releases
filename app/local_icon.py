"""Private, on-device icon choice. No image API, network client or source-path storage."""
import ctypes,json,os,re,subprocess,threading,time,uuid
from pathlib import Path
_lock=threading.Lock();_phase='idle';_message='';_started=False

def folder(data):
    root=Path(data)/'local-icon'
    if root.is_symlink() or getattr(root,'is_junction',lambda:False)():raise RuntimeError('Dossier d’icône redirigé.')
    root.mkdir(parents=True,exist_ok=True)
    return root

def selected(data):
    root=folder(data);config=root/'selection.json'
    if config.is_symlink():raise RuntimeError('Réglage d’icône redirigé.')
    try:name=json.loads(config.read_text(encoding='utf-8'))['file']
    except (OSError,ValueError,KeyError,TypeError):
        import official_icon
        return official_icon.current(data)
    if not isinstance(name,str) or not re.fullmatch(r'icon-[0-9a-f]{32}\.ico',name):return None
    file=root/name
    if file.is_symlink() or not file.is_file():return None
    return file

def status(data):
    import updater
    try:updater.guard();available=True
    except RuntimeError:available=False
    choice=selected(data);private=bool(choice and choice.parent==folder(data))
    message=_message or ('L’icône officielle commune est active.' if choice and not private else '')
    return {'available':available,'custom':private,'phase':_phase,'message':message}

def _powershell(data,exe,mode,output=None):
    args=['powershell.exe','-NoProfile','-NonInteractive','-STA','-ExecutionPolicy','Bypass','-File',str(Path(__file__).with_name('local_icon.ps1')),'-Mode',mode,'-TargetExe',str(exe)]
    if output:args+=['-OutputIcon',str(output)]
    done=subprocess.run(args,stdin=subprocess.DEVNULL,capture_output=True,timeout=600 if mode=='Choose' else 25,creationflags=getattr(subprocess,'CREATE_NO_WINDOW',0))
    if done.returncode==2:return False
    if done.returncode:raise RuntimeError('Impossible de préparer l’icône locale. Choisis un PNG valide, de 16 Mo maximum et de dimensions raisonnables.' if mode in ('Choose','ImportTest') else 'Windows n’a pas confirmé le changement d’icône. La copie enregistrée est conservée ; tu peux réessayer.')
    try:return json.loads(done.stdout.decode('utf-8-sig').strip())
    except (ValueError,UnicodeError,AttributeError):return True

def reapply(data,edition='MISU'):
    import updater
    updater.guard()
    choice=selected(data)
    if not choice:raise ValueError('Aucune icône enregistrée sur ce PC. La publication précédente n’a pas laissé de copie utilisable.')
    result=_powershell(data,executable(data,edition),'Apply',choice)
    if not isinstance(result,dict):raise RuntimeError('Windows n’a pas confirmé l’application de l’icône.')
    if not result.get('shortcuts') and not result.get('windows'):raise RuntimeError('Icône enregistrée, mais aucune fenêtre ni aucun raccourci de cette installation n’a été trouvé. Ouvre L’Atelier depuis son raccourci Windows.')
    return {'ok':True,**result,'message':'Icône réappliquée : '+str(result.get('shortcuts',0))+' raccourci(s), '+str(result.get('windows',0))+' fenêtre(s). Windows peut conserver temporairement l’ancienne icône épinglée.'}

def change(data,exe,action):
    global _phase,_message
    import updater
    updater.guard()
    if action not in ('choose','reset'):raise ValueError('Action inconnue.')
    if not _lock.acquire(blocking=False):raise RuntimeError('Une sélection d’icône est déjà ouverte.')
    _phase='choosing' if action=='choose' else 'working'
    def work():
        global _phase,_message
        path=None
        try:
            _phase='choosing' if action=='choose' else 'working';_message='Choisis ton PNG dans la fenêtre Windows.' if action=='choose' else 'Restauration de l’icône…'
            root=folder(data)
            if action=='choose':
                path=root/('icon-'+uuid.uuid4().hex+'.ico')
                if not _powershell(data,exe,'Choose',path):_phase='idle';_message='Sélection annulée.';return
                if not path.is_file():raise RuntimeError('Icône locale non créée.')
                temporary=root/'selection.tmp';temporary.write_text(json.dumps({'file':path.name}),encoding='utf-8');os.replace(temporary,root/'selection.json')
            else:
                _powershell(data,exe,'Reset');(root/'selection.json').unlink(missing_ok=True)
            _phase='success';_message='Icône locale appliquée au raccourci et à la fenêtre.' if action=='choose' else 'Icône d’origine restaurée.'
            keep=selected(data)
            for old in root.glob('icon-*.ico'):
                if old!=keep:
                    try:old.unlink()
                    except OSError:pass
        except Exception:
            try:
                previous=selected(data)
                _powershell(data,exe,'Apply' if previous else 'Reset',previous)
            except Exception:pass
            if path:
                try:
                    if path!=selected(data):path.unlink(missing_ok=True)
                except OSError:pass
            _phase='error';_message='Le changement d’icône n’a pas abouti. Ton PNG d’origine reste intact.'
        finally:_lock.release()
    threading.Thread(target=work,daemon=True,name='local-icon-choice').start()
    return {'ok':True}

def executable(data,edition):
    return Path(data).parent/'desktop'/('LAtelierDuGoblin_Nathan.exe' if edition=='NATHAN' else 'LAtelierDuGoblin_TEST.exe')

def start(data,edition):
    global _started
    if os.name!='nt' or _started:return
    import updater
    try:updater.guard()
    except RuntimeError:return
    import official_icon
    official_icon.start(data)
    _started=True;exe=executable(data,edition)
    def watch():
        from ctypes import wintypes as W
        user=ctypes.WinDLL('user32',use_last_error=True);kernel=ctypes.WinDLL('kernel32',use_last_error=True)
        callback=ctypes.WINFUNCTYPE(W.BOOL,W.HWND,W.LPARAM)
        user.EnumWindows.argtypes=[callback,W.LPARAM];user.GetWindowThreadProcessId.argtypes=[W.HWND,ctypes.POINTER(W.DWORD)]
        user.GetWindowTextW.argtypes=[W.HWND,W.LPWSTR,ctypes.c_int]
        kernel.OpenProcess.argtypes=[W.DWORD,W.BOOL,W.DWORD];kernel.OpenProcess.restype=W.HANDLE
        kernel.QueryFullProcessImageNameW.argtypes=[W.HANDLE,W.DWORD,W.LPWSTR,ctypes.POINTER(W.DWORD)]
        kernel.CloseHandle.argtypes=[W.HANDLE]
        user.LoadImageW.argtypes=[W.HINSTANCE,W.LPCWSTR,W.UINT,ctypes.c_int,ctypes.c_int,W.UINT];user.LoadImageW.restype=W.HANDLE
        user.SendMessageW.argtypes=[W.HWND,W.UINT,W.WPARAM,W.LPARAM];user.SendMessageW.restype=W.LPARAM
        user.CopyIcon.argtypes=[W.HANDLE];user.CopyIcon.restype=W.HANDLE
        shell=ctypes.WinDLL('shell32');shell.ExtractIconExW.argtypes=[W.LPCWSTR,ctypes.c_int,ctypes.POINTER(W.HANDLE),ctypes.POINTER(W.HANDLE),W.UINT]
        big=W.HANDLE();small=W.HANDLE();shell.ExtractIconExW(str(exe),0,ctypes.byref(big),ctypes.byref(small),1)
        defaults=(small.value,big.value)
        originals={};applied={};icons={};last_shortcut=None
        def visit(hwnd,_):
            title=ctypes.create_unicode_buffer(512);user.GetWindowTextW(hwnd,title,512)
            if not title.value.startswith(("L'Atelier du Goblin",'L’Atelier du Goblin')):return True
            pid=W.DWORD();user.GetWindowThreadProcessId(hwnd,ctypes.byref(pid));handle=kernel.OpenProcess(0x1000,False,pid.value)
            if not handle:return True
            try:
                buf=ctypes.create_unicode_buffer(32768);n=W.DWORD(len(buf))
                if not kernel.QueryFullProcessImageNameW(handle,0,buf,ctypes.byref(n)) or os.path.normcase(os.path.realpath(buf.value))!=os.path.normcase(os.path.realpath(str(exe))):return True
            finally:kernel.CloseHandle(handle)
            choice=selected(data);key=str(choice) if choice else ''
            if applied.get(hwnd)==key:return True
            if hwnd not in originals:originals[hwnd]=tuple(user.CopyIcon(user.SendMessageW(hwnd,0x7F,i,0)) for i in (0,1))
            if choice:
                if key not in icons:icons[key]=tuple(user.LoadImageW(None,str(choice),1,size,size,0x10) for size in (16,48))
                handles=icons[key]
            else:handles=defaults if any(defaults) else originals[hwnd]
            for i,icon in enumerate(handles):user.SendMessageW(hwnd,0x80,i,int(icon or 0))
            applied[hwnd]=key;return True
        cb=callback(visit)
        while True:
            try:
                choice=selected(data);key=str(choice) if choice else ''
                # The frozen Nathan launcher rewrites its shortcut at startup;
                # reapply the private override after that launcher has run.
                if choice and key!=last_shortcut:
                    try:_powershell(data,exe,'Apply',choice);last_shortcut=key
                    except Exception:pass
                if not choice:last_shortcut=None
                user.EnumWindows(cb,0)
            except Exception:pass
            time.sleep(1)
    threading.Thread(target=watch,daemon=True,name='local-window-icon').start()


def publish(data):
    raise ValueError('Recharge l’interface puis dépose ton PNG dans la zone Icône officielle. L’ancien assistant de publication a été remplacé.')
