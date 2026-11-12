"""Exercise real signed upgrade and locked-screen native alarms on a disposable emulator."""
import os
from pathlib import Path
import re
import subprocess
import sys
import time
import xml.etree.ElementTree as ET

PKG='fr.atelierdugoblin.mobile'
APP_PIDS=set()
OLD=Path(os.environ['GOBLIN_OLD_APK']);NEW=Path('mobile/android/app/build/outputs/apk/release/app-release.apk')

def adb(*args):
    r=subprocess.run(['adb',*args],capture_output=True,text=True,encoding='utf-8',timeout=40)
    if r.returncode:raise RuntimeError('adb '+str(args)+': '+r.stderr[-400:])
    return r.stdout

def nodes():
    # Accessibility can be unavailable briefly while the initial WebView starts.
    # Retry only obtaining the tree; application assertions still fail normally.
    last_error=None
    for attempt in range(4):
        try:
            adb('shell','rm','-f','/sdcard/goblin-utility.xml')
            adb('shell','uiautomator','dump','/sdcard/goblin-utility.xml')
            raw=adb('shell','cat','/sdcard/goblin-utility.xml')
            return ET.fromstring(raw[raw.index('<?xml'):])
        except (RuntimeError,ValueError,ET.ParseError) as exc:
            last_error=exc
            if attempt<3:time.sleep(2)
    raise RuntimeError('Android accessibility tree unavailable after four attempts') from last_error

def bounds(node):
    values=list(map(int,re.findall(r'\d+',node.attrib.get('bounds',''))))
    return values if len(values)==4 else [0,0,0,0]

def find(label,scroll=True):
    for attempt in range(9 if scroll else 10):
        tree=nodes()
        screen_bottom=max(bounds(n)[3] for n in tree.iter('node'))
        drawer_open=any(n.attrib.get('text')=='NAVIGATION' for n in tree.iter('node'))
        def visible(node):
            x1,y1,x2,y2=bounds(node)
            center=(y1+y2)//2
            # WebView accessibility includes nodes underneath the fixed bottom tabs.
            return x2>x1 and y2>y1 and (70 if drawer_open else 270 if scroll else 20)<center<screen_bottom-(70 if drawer_open else 280 if scroll else 70)
        candidates=[n for n in tree.iter('node') if label in [n.attrib.get('text'),n.attrib.get('content-desc'),n.attrib.get('hint')] and visible(n)]
        if candidates:return candidates[0]
        # 0.1.17 uses a contextual app-bar title, so its hidden h1 is absent
        # from accessibility. The visible save command identifies the notes form.
        if label=='Ma note avec hashtags' and any(n.attrib.get('text')=='Enregistrer la note' for n in tree.iter('node')):
            fields=sorted([n for n in tree.iter('node') if n.attrib.get('class')=='android.widget.EditText' and visible(n)],key=lambda n:bounds(n)[1])
            if fields:return fields[0]
        # The old release WebView exposes empty EditText accessibility labels.
        # Locate the fields in their observed named section and DOM order.
        contexts={'Ma note avec hashtags':('Mes notes',0),'Titre de ma note':('Nouvelle note',0),'Contenu de ma note':('Nouvelle note',2),'Nom du minuteur':('⏲ Mes minuteurs de cuisine',0),'Minutes':('⏲ Mes minuteurs de cuisine',1),'Secondes':('⏲ Mes minuteurs de cuisine',2)}
        if label in contexts:
            heading,index=contexts[label]
            for parent in tree.iter('node'):
                if any(child.attrib.get('text')==heading for child in parent):
                    fields=[n for n in parent.iter('node') if n.attrib.get('class')=='android.widget.EditText']
                    if len(fields)>index:
                        candidate=fields[index];b=bounds(candidate)
                        if b[1]>=270 and b[3]>b[1] and b[3]<2080:return candidate
        if scroll:adb('shell','input','swipe','520','1650','520','450','350')
        else:time.sleep(1)
    Path('artifacts').mkdir(exist_ok=True)
    shot=subprocess.run(['adb','exec-out','screencap','-p'],capture_output=True,timeout=15)
    Path('artifacts/android-utility-ui.png').write_bytes(shot.stdout)
    Path('artifacts/android-utility-ui.xml').write_text(ET.tostring(tree,encoding='unicode'))
    raise AssertionError('Control not found: '+label+'; visible labels: '+str([n.attrib.get('text') or n.attrib.get('content-desc') for n in tree.iter('node') if n.attrib.get('text') or n.attrib.get('content-desc')])[-1500:])

def tap(label,scroll=True):
    x1,y1,x2,y2=bounds(find(label,scroll));print('Tap:',label,(x1,y1,x2,y2),flush=True);adb('shell','input','tap',str((x1+x2)//2),str((y1+y2)//2))

def hide_keyboard():
    info=adb('shell','dumpsys','input_method')
    # Only the first/current state counts; dumpsys also includes old shown=true history.
    shown=re.search(r'\b(?:mInputShown|mIsInputViewShown|isInputViewShown)=(true|false)',info)
    print('Current keyboard:',shown.group(0) if shown else 'not reported',flush=True)
    if shown and shown.group(1)=='true':
        adb('shell','input','keyevent','4');time.sleep(.7)

def text(label,value):
    hide_keyboard()
    # Return to the document start even when a new timer extends the page.
    # Two swipes were insufficient after the first timer and skipped its name field.
    for _ in range(6):adb('shell','input','swipe','520','420','520','1900','200')
    node=find(label);x1,y1,x2,y2=bounds(node);adb('shell','input','tap',str((x1+x2)//2),str((y1+y2)//2));time.sleep(.7);adb('shell','input','keyevent','123')
    for _ in range(min(30,len(node.attrib.get('text',''))+3)):adb('shell','input','keyevent','67')
    adb('shell','input','text',value.replace(' ','%s'));time.sleep(.4);hide_keyboard()

def menu(label):
    tap('Ouvrir le menu',False);tap(label,True);time.sleep(1)

def launch():
    adb('shell','am','start','-n',PKG+'/.MainActivity');time.sleep(6)
    APP_PIDS.update(adb('shell','pidof',PKG).split())
    # Wait for first WebView startup. Dismiss only OS help and launcher ANR,
    # never an application ANR (which must remain a failing product test).
    for _ in range(15):
        tree=nodes();labels=[n.attrib.get('text','') for n in tree.iter('node')]
        if any('Ouvrir le menu' in (n.attrib.get('content-desc'),n.attrib.get('text')) for n in tree.iter('node')):return
        dismiss=['Got it','Compris','OK']
        if any('Quickstep' in label and 'responding' in label for label in labels):dismiss.append('Close app')
        for n in tree.iter('node'):
            if n.attrib.get('text') in dismiss:
                x1,y1,x2,y2=bounds(n);adb('shell','input','tap',str((x1+x2)//2),str((y1+y2)//2))
                if n.attrib.get('text')=='Close app':adb('shell','am','start','-n',PKG+'/.MainActivity')
                break
        time.sleep(2)

Path('artifacts').mkdir(exist_ok=True)
adb('install','-r',str(OLD));launch();menu('Notes')
legacy_tree=ET.tostring(nodes(),encoding='unicode')
if any(label in legacy_tree for label in ['Ma note avec hashtags','Conserver sur mon téléphone','Enregistrer la note']):
    text('Ma note avec hashtags','Legacy_before_utility_update Private_text_must_survive');tap('Enregistrer la note' if 'Enregistrer la note' in legacy_tree else 'Conserver sur mon téléphone')
else:
    text('Titre de ma note','Legacy_before_utility_update');text('Contenu de ma note','Private_text_must_survive');tap('Enregistrer sur mon téléphone')
time.sleep(1)
assert 'Legacy_before_utility_update' in ET.tostring(nodes(),encoding='unicode')
assert 'Private_text_must_survive' in ET.tostring(nodes(),encoding='unicode'),'The pre-upgrade fixture must contain the whole body'
Path('artifacts/android-before-upgrade.xml').write_text(ET.tostring(nodes(),encoding='unicode'))
adb('shell','am','force-stop',PKG);adb('install','-r',str(NEW));launch()
assert 'Legacy_before_utility_update' in ET.tostring(nodes(),encoding='unicode'),'Existing WebView note lost after signed replacement'
assert 'Private_text_must_survive' in ET.tostring(nodes(),encoding='unicode'),'Existing note body hidden after signed replacement'
assert 'AgendaWidgetProvider' in adb('shell','dumpsys','appwidget'),'Agenda widget provider must be registered after update'
adb('shell','pm','grant',PKG,'android.permission.POST_NOTIFICATIONS');adb('shell','appops','set',PKG,'SCHEDULE_EXACT_ALARM','allow')
# Native general reminder test, separate from cooking alarms.
menu('Paramètres')
# Open the native-reminder settings group when the new compact hierarchy is present.
reminder_tree=ET.tostring(nodes(),encoding='unicode')
if 'Activer les rappels du PC' not in reminder_tree:
    tap('Rappels du PC sur mon téléphone')
tap('Activer les rappels du PC');tap('Tester un rappel Android (30 s)');tap('OK',False)
adb('shell','input','keyevent','3');adb('shell','input','keyevent','223')
for _ in range(8):time.sleep(5)
notice=adb('shell','dumpsys','notification','--noredact')
assert 'Rappel de test Android' in notice,'General native reminder must fire with screen off'
adb('shell','input','keyevent','224');adb('shell','wm','dismiss-keyguard');launch()
# Same native delivery path as expiry reminders, with a short explicit diagnostic.
menu('Courses');tap('Inventaire');tap('Vérifier les rappels');tap('Tester un rappel de péremption (30 s)')
food_alarms=adb('shell','dumpsys','alarm');Path('artifacts/android-food-alarms.txt').write_text(food_alarms,encoding='utf-8');assert 'FoodReminderReceiver' in food_alarms,'Expiry test must register a real native alarm'
adb('shell','input','keyevent','3');adb('shell','input','keyevent','223')
for _ in range(8):time.sleep(5)
food_notice=adb('shell','dumpsys','notification','--noredact')
Path('artifacts/android-food-notifications.txt').write_text(food_notice,encoding='utf-8')
assert 'Essai péremption' in food_notice,'Native expiry notification must fire with the app backgrounded and screen off'
adb('shell','input','keyevent','224');adb('shell','wm','dismiss-keyguard');launch()
menu('Grimoire de recettes')
for label,seconds in [('Utility_timer_A','180'),('Utility_timer_B','200')]:
    text('Nom du minuteur',label);text('Minutes','0');text('Secondes',seconds);tap('＋ Démarrer ce minuteur');time.sleep(1)
adb('shell','input','keyevent','3');adb('shell','input','keyevent','223')
# The WebView is backgrounded and the screen is asleep during both triggers.
for _ in range(42):time.sleep(5)
notifications=adb('shell','dumpsys','notification','--noredact')
Path('artifacts/android-native-notifications.txt').write_text(notifications,encoding='utf-8')
assert 'Utility_timer_A' in notifications and 'Utility_timer_B' in notifications,'Both named native timer notifications must appear while the WebView is backgrounded'
adb('shell','input','keyevent','224');adb('shell','wm','dismiss-keyguard');launch()
crashes=adb('logcat','-d','-s','AndroidRuntime:E');Path('artifacts/android-runtime.txt').write_text(crashes)
# UiAutomator runs in its own process; an accessibility dump can fail
# without the application crashing. Keep all logs, but test Goblin's PIDs.
app_fatals=[line for line in crashes.splitlines() if 'FATAL EXCEPTION' in line and any(re.search(r'\s'+re.escape(pid)+r'\s+\d+\s+E AndroidRuntime:',line) for pid in APP_PIDS)]
assert not app_fatals,'Unexpected Goblin runtime crash: '+str(app_fatals)
print('PASS: actual signed replacement preserves legacy note; two independent native alarm notifications fire with app backgrounded and screen off')
