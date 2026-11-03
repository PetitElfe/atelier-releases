"""Exercise real signed upgrade and locked-screen native alarms on a disposable emulator."""
import os
from pathlib import Path
import re
import subprocess
import sys
import time
import xml.etree.ElementTree as ET

PKG='fr.atelierdugoblin.mobile'
OLD=Path(os.environ['GOBLIN_OLD_APK']);NEW=Path('mobile/android/app/build/outputs/apk/release/app-release.apk')

def adb(*args):
    r=subprocess.run(['adb',*args],capture_output=True,text=True,encoding='utf-8',timeout=40)
    if r.returncode:raise RuntimeError('adb '+str(args)+': '+r.stderr[-400:])
    return r.stdout

def nodes():
    adb('shell','uiautomator','dump','/sdcard/goblin-utility.xml')
    raw=adb('shell','cat','/sdcard/goblin-utility.xml')
    return ET.fromstring(raw[raw.index('<?xml'):])

def bounds(node):
    values=list(map(int,re.findall(r'\d+',node.attrib.get('bounds',''))))
    return values if len(values)==4 else [0,0,0,0]

def find(label,scroll=True):
    for attempt in range(9 if scroll else 1):
        tree=nodes()
        candidates=[n for n in tree.iter('node') if label in [n.attrib.get('text'),n.attrib.get('content-desc'),n.attrib.get('hint')] and bounds(n)[3]>bounds(n)[1]]
        if candidates:return candidates[0]
        if scroll:adb('shell','input','swipe','520','1650','520','450','350')
    Path('artifacts').mkdir(exist_ok=True);Path('artifacts/android-utility-ui.xml').write_text(ET.tostring(tree,encoding='unicode'))
    raise AssertionError('Control not found: '+label+'; visible labels: '+str([n.attrib.get('text') or n.attrib.get('content-desc') for n in tree.iter('node') if n.attrib.get('text') or n.attrib.get('content-desc')])[-1500:])

def tap(label,scroll=True):
    x1,y1,x2,y2=bounds(find(label,scroll));adb('shell','input','tap',str((x1+x2)//2),str((y1+y2)//2))

def text(label,value):
    node=find(label);x1,y1,x2,y2=bounds(node);adb('shell','input','tap',str((x1+x2)//2),str((y1+y2)//2));adb('shell','input','keyevent','123')
    for _ in range(min(30,len(node.attrib.get('text',''))+3)):adb('shell','input','keyevent','67')
    adb('shell','input','text',value);adb('shell','input','keyevent','4')

def menu(label):
    tap('Ouvrir le menu',False);tap(label,False);time.sleep(1)

def launch():
    adb('shell','am','start','-n',PKG+'/.MainActivity');time.sleep(6)

Path('artifacts').mkdir(exist_ok=True)
adb('install','-r',str(OLD));launch();menu('Notes')
text('Titre de ma note','Legacy_before_utility_update');text('Contenu de ma note','Private_text_must_survive');tap('Enregistrer sur mon téléphone');time.sleep(1)
assert 'Legacy_before_utility_update' in ET.tostring(nodes(),encoding='unicode')
adb('shell','am','force-stop',PKG);adb('install','-r',str(NEW));launch()
assert 'Legacy_before_utility_update' in ET.tostring(nodes(),encoding='unicode'),'Existing WebView note lost after signed replacement'
adb('shell','pm','grant',PKG,'android.permission.POST_NOTIFICATIONS');adb('shell','appops','set',PKG,'SCHEDULE_EXACT_ALARM','allow')
menu('Grimoire de recettes')
for label,seconds in [('Utility_timer_A','40'),('Utility_timer_B','55')]:
    text('Nom du minuteur',label);text('Minutes','0');text('Secondes',seconds);tap('＋ Démarrer ce minuteur');time.sleep(1)
adb('shell','input','keyevent','3');adb('shell','input','keyevent','223')
# The WebView is backgrounded and the screen is asleep during both triggers.
for _ in range(12):time.sleep(5)
notifications=adb('shell','dumpsys','notification','--noredact')
Path('artifacts/android-native-notifications.txt').write_text(notifications,encoding='utf-8')
assert 'Utility_timer_A' in notifications and 'Utility_timer_B' in notifications,'Both named native timer notifications must appear while the WebView is backgrounded'
adb('shell','input','keyevent','224');adb('shell','wm','dismiss-keyguard');launch()
crashes=adb('logcat','-d','-s','AndroidRuntime:E');Path('artifacts/android-runtime.txt').write_text(crashes)
assert 'FATAL EXCEPTION' not in crashes,'Unexpected Android runtime crash'
print('PASS: actual signed replacement preserves legacy note; two independent native alarm notifications fire with app backgrounded and screen off')
