"""Opt-in native TEST reminders, kept alive by the existing private tray companion."""
from datetime import datetime,timedelta
import hashlib
import json
import os
from pathlib import Path
import secrets
import sqlite3
import subprocess
import sys
import threading
from urllib.parse import urlparse,parse_qs
import xml.etree.ElementTree as ET
import updater
import utility_safety
import reminder_occurrences

DATA=updater.DATA
SCRIPT=Path(__file__).with_name('native_toasts.ps1')
BUSY=threading.Lock()


def initialise(c):
    c.execute('''CREATE TABLE IF NOT EXISTS native_reminder_delivery(
      reminder_id INTEGER NOT NULL,due_key TEXT NOT NULL,token TEXT NOT NULL UNIQUE,
      sent_at TEXT,used INTEGER NOT NULL DEFAULT 0,last_attempt TEXT,
      PRIMARY KEY(reminder_id,due_key))''')


def _connect(data):
    c=sqlite3.connect(Path(data)/'atelier.db',timeout=10);c.row_factory=sqlite3.Row;return c


def config(data=DATA):
    try:return json.loads((Path(data)/'native-reminders.json').read_text())
    except (OSError,ValueError):return {'enabled':False}


def status(data=DATA):
    cfg=config(data)
    return {'available':os.name=='nt' and int(os.environ.get('ATELIER_PORT','0'))==8876,
            'enabled':bool(cfg.get('enabled')),'last_sent':cfg.get('last_sent'),'error':cfg.get('error','')}


def xml(title,token,*,test=False):
    base='goblin-test-reminder://activate/'+token
    toast=ET.Element('toast',{'activationType':'protocol','launch':base+'?a=open','duration':'long'})
    visual=ET.SubElement(toast,'visual');binding=ET.SubElement(visual,'binding',{'template':'ToastGeneric'})
    ET.SubElement(binding,'text').text='L’Atelier du Goblin TEST'
    ET.SubElement(binding,'text').text=title[:240]
    if not test:
        actions=ET.SubElement(toast,'actions')
        for action,label in [('finish','Terminer'),('10','10 min'),('30','30 min'),('60','1 heure'),('cancel','Annuler le rappel')]:
            ET.SubElement(actions,'action',{'content':label,'activationType':'protocol','arguments':base+'?a='+action})
    return ET.tostring(toast,encoding='unicode')


def _powershell(args):
    result=subprocess.run(['powershell.exe','-NoProfile','-NonInteractive','-STA','-ExecutionPolicy','Bypass','-File',str(SCRIPT),*args],
                          capture_output=True,timeout=25,creationflags=getattr(subprocess,'CREATE_NO_WINDOW',0))
    if result.returncode:raise RuntimeError('Windows a refusé le composant de notification. Vérifie les autorisations et le diagnostic de cette installation.')


def enable(enabled):
    updater.guard(external_runner=True)
    if enabled:
        import winreg
        pythonw=Path(sys.executable).with_name('pythonw.exe')
        if not pythonw.exists():pythonw=Path(sys.executable)
        entry=Path(__file__).resolve()
        command='"'+str(pythonw)+'" "'+str(entry)+'" --activate "%1"'
        with winreg.CreateKey(winreg.HKEY_CURRENT_USER,r'Software\Classes\goblin-test-reminder') as key:
            winreg.SetValueEx(key,'',0,winreg.REG_SZ,'L’Atelier TEST — rappels');winreg.SetValueEx(key,'URL Protocol',0,winreg.REG_SZ,'')
        with winreg.CreateKey(winreg.HKEY_CURRENT_USER,r'Software\Classes\goblin-test-reminder\shell\open\command') as key:winreg.SetValueEx(key,'',0,winreg.REG_SZ,command)
        folder=Path(os.environ['APPDATA'])/'Microsoft/Windows/Start Menu/Programs';folder.mkdir(parents=True,exist_ok=True)
        _powershell(['-Mode','register','-Target',str(pythonw),'-Arguments','"'+str(updater.CODE/'app/desktop_shell.py')+'"','-Link',str(folder/'LAtelier TEST Rappels.lnk')])
        import desktop_postits
        desktop_postits.launch()
    cfg=config();cfg.update(enabled=bool(enabled),error='');utility_safety.atomic(DATA/'native-reminders.json',cfg)
    return status()


def send(title,token,*,test=False):
    folder=DATA/'native-notifications';folder.mkdir(exist_ok=True)
    path=folder/(hashlib.sha256(token.encode()).hexdigest()[:24]+'.xml')
    try:
        path.write_text(xml(title,token,test=test),encoding='utf-8')
        _powershell(['-Mode','show','-XmlFile',str(path),'-Tag',hashlib.sha256(token.encode()).hexdigest()[:16]])
    finally:path.unlink(missing_ok=True)


def due_rows(c,now):
    rows=reminder_occurrences.all_reminders(c,datetime.fromisoformat(now))
    return [r for r in rows if (r.get('snoozed_until') or r['remind_at'])<=now and not c.execute('SELECT 1 FROM native_reminder_delivery WHERE reminder_id=? AND due_key=? AND sent_at IS NOT NULL',(r['id'],r.get('snoozed_until') or r['remind_at'])).fetchone()]


def maintenance(data):
    if (Path(data)/'safety-maintenance.json').exists():return True
    try:return json.loads((Path(data)/'updater-state.json').read_text()).get('phase') in ('starting','download','stopping','backup','installing')
    except (OSError,ValueError):return False


def tick():
    if maintenance(DATA) or not config().get('enabled') or not BUSY.acquire(blocking=False):return
    def run():
        try:
            updater.guard(external_runner=True)
            now=datetime.now().isoformat(timespec='seconds')
            with _connect(DATA) as c:
                initialise(c)
                rows=due_rows(c,now)
                sent=0
                for row in rows:
                    if maintenance(DATA) or sent>=6:return
                    if row['entity_type'] in ('task','event'):
                        table='tasks' if row['entity_type']=='task' else 'events'
                        linked=c.execute('SELECT * FROM '+table+' WHERE id=?',(row['entity_id'],)).fetchone()
                        if not linked or (table=='tasks' and linked['completed']) or (table=='events' and linked['status'] in ('done','cancelled')):
                            c.execute("UPDATE reminders SET status='done' WHERE id=?",(row['id'],));c.commit();continue
                    due=row['snoozed_until'] or row['remind_at'];delivery=c.execute('SELECT * FROM native_reminder_delivery WHERE reminder_id=? AND due_key=?',(row['id'],due)).fetchone()
                    if delivery and (delivery['sent_at'] or (delivery['last_attempt'] and delivery['last_attempt']>(datetime.now()-timedelta(seconds=60)).isoformat(timespec='seconds'))):continue
                    token=delivery['token'] if delivery else secrets.token_urlsafe(32)
                    c.execute('INSERT INTO native_reminder_delivery(reminder_id,due_key,token,last_attempt) VALUES(?,?,?,?) ON CONFLICT(reminder_id,due_key) DO UPDATE SET last_attempt=excluded.last_attempt',(row['id'],due,token,now));c.commit()
                    title=row['title']
                    if not title and row['entity_type'] in ('task','event'):
                        table='tasks' if row['entity_type']=='task' else 'events';linked=c.execute('SELECT title FROM '+table+' WHERE id=?',(row['entity_id'],)).fetchone();title=linked['title'] if linked else 'Rappel'
                    send(title or 'Rappel',token);sent+=1
                    c.execute('UPDATE native_reminder_delivery SET sent_at=? WHERE reminder_id=? AND due_key=?',(now,row['id'],due));c.commit()
                    cfg=config();cfg.update(last_sent=now,error='');utility_safety.atomic(DATA/'native-reminders.json',cfg)
        except Exception:
            cfg=config();cfg['error']='Un rappel reste en attente : Windows n’a pas confirmé l’envoi. Ouvre L’Atelier et teste les notifications.';utility_safety.atomic(DATA/'native-reminders.json',cfg)
        finally:BUSY.release()
    threading.Thread(target=run,daemon=True).start()


def activate(data,uri):
    if maintenance(data):raise RuntimeError('Restauration en cours. Réessaie depuis L’Atelier après son redémarrage.')
    parsed=urlparse(uri)
    if parsed.scheme!='goblin-test-reminder' or parsed.netloc!='activate' or len(uri)>400:raise ValueError('Activation de rappel invalide.')
    token=parsed.path.lstrip('/');action=parse_qs(parsed.query).get('a',['open'])[0]
    if action not in ('open','finish','cancel','10','30','60'):raise ValueError('Action de rappel invalide.')
    if action=='open':return True
    with _connect(data) as c:
        c.execute('BEGIN IMMEDIATE');delivery=c.execute('SELECT * FROM native_reminder_delivery WHERE token=?',(token,)).fetchone()
        if not delivery or delivery['used']:return False
        r=reminder_occurrences.get(c,delivery['reminder_id'])
        if not r or r['status']!='pending' or (r['snoozed_until'] or r['remind_at'])!=delivery['due_key']:return False
        c.execute('UPDATE native_reminder_delivery SET used=1 WHERE token=?',(token,))
        now=datetime.now().isoformat(timespec='seconds')
        if action in ('10','30','60'):
            reminder_occurrences.update(c,r['id'],'snooze',when=(datetime.now()+timedelta(minutes=int(action))).isoformat(timespec='seconds'))
        else:reminder_occurrences.update(c,r['id'],'finish' if action=='finish' else 'done')
    return True


def open_window():
    import ctypes
    import desktop_shell
    handle=ctypes.windll.user32.FindWindowW(None,desktop_shell.WINDOW_TITLE)
    if handle:ctypes.windll.user32.ShowWindow(handle,9);ctypes.windll.user32.SetForegroundWindow(handle)
    else:
        exe=updater.BASE/'desktop/LAtelierDuGoblin_TEST.exe'
        if exe.exists():os.startfile(exe)
        else:subprocess.Popen([sys.executable,str(updater.CODE/'app/desktop_shell.py')],creationflags=getattr(subprocess,'CREATE_NO_WINDOW',0))


if __name__=='__main__' and len(sys.argv)==3 and sys.argv[1]=='--activate':
    os.environ.update(ATELIER_DATA_DIR=str(DATA),ATELIER_PORT='8876')
    updater.guard(external_runner=True)
    if activate(DATA,sys.argv[2]):open_window()
