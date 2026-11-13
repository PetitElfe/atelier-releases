"""Shared studio documents: albums, handwriting, envelopes and personal cards.

Everything is stored in the profile's SQLite backup. Revisions prevent stale
overwrites; operation receipts make a mobile retry harmless.
"""
import base64
import hashlib
import json
import math
import re
import sqlite3
import tracker_schedule
from contextlib import closing
from datetime import date, datetime, timedelta

KINDS = {'album', 'album-page', 'tracker-tab', 'tracker-row', 'card', 'activity',
         'jar', 'jar-operation', 'purchase', 'exercise', 'session', 'meal', 'preferences'}
IDENTITY = re.compile(r'^[A-Za-z0-9_-]{1,100}$')


def initialise(c):
    tracker_schedule.initialise(c)
    boards = {r[1] for r in c.execute('PRAGMA table_info(tracker_boards)')}
    if boards and 'mark_unit' not in boards:
        c.execute("ALTER TABLE tracker_boards ADD COLUMN mark_unit TEXT NOT NULL DEFAULT 'auto'")
    columns = {r[1] for r in c.execute('PRAGMA table_info(tracker_row_steps)')}
    if columns and 'weekday' not in columns:
        c.execute('ALTER TABLE tracker_row_steps ADD COLUMN weekday INTEGER CHECK(weekday IS NULL OR weekday BETWEEN 0 AND 6)')
    c.executescript('''
    CREATE TABLE IF NOT EXISTS studio_objects(
      id TEXT PRIMARY KEY, kind TEXT NOT NULL, revision INTEGER NOT NULL,
      data_json TEXT NOT NULL, archived INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
    CREATE INDEX IF NOT EXISTS studio_kind ON studio_objects(kind,archived);
    CREATE TABLE IF NOT EXISTS studio_history(
      id INTEGER PRIMARY KEY AUTOINCREMENT, object_id TEXT NOT NULL,
      revision INTEGER NOT NULL, data_json TEXT NOT NULL, saved_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS studio_assets(
      id TEXT PRIMARY KEY, mime TEXT NOT NULL, content BLOB NOT NULL, created_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS studio_receipts(
      id TEXT PRIMARY KEY, digest TEXT NOT NULL, response TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS studio_tracker_base(row_id INTEGER NOT NULL,day TEXT NOT NULL,base_value TEXT,last_stamp TEXT NOT NULL,PRIMARY KEY(row_id,day));
    CREATE TABLE IF NOT EXISTS studio_contributions(
      source_id TEXT PRIMARY KEY, row_id INTEGER NOT NULL, day TEXT NOT NULL,
      previous_value TEXT, written_value TEXT);
    ''')


def encode(value):
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(',', ':'), allow_nan=False)


def identity(value):
    if not isinstance(value, str) or not IDENTITY.fullmatch(value):
        raise ValueError('Identifiant invalide.')
    return value


def object_value(row):
    return {'id': row['id'], 'kind': row['kind'], 'revision': row['revision'],
            'archived': bool(row['archived']), 'data': json.loads(row['data_json']),
            'updated_at': row['updated_at']}


def objects(c, kind=None):
    return [object_value(r) for r in c.execute(
        'SELECT * FROM studio_objects WHERE archived=0' + (' AND kind=?' if kind else '') +
        ' ORDER BY created_at,id', (kind,) if kind else ())]


def finite(value, low=0, high=10000000):
    if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value) or not low <= value <= high:
        raise ValueError('Nombre invalide.')
    return value


def period_mark_day(board, day):
    unit=board['mark_unit'] if 'mark_unit' in board.keys() else 'auto'
    size={'month':1,'quarter':3,'semester':6,'year':12}.get(unit)
    return day.replace(month=((day.month-1)//size)*size+1,day=1) if size else day


def validate(kind, data):
    if kind not in KINDS or not isinstance(data, dict):
        raise ValueError('Document invalide.')
    raw = encode(data)
    if len(raw.encode()) > 1800000:
        raise ValueError('Cette page est trop grande ; crée une autre page.')
    if not isinstance(data.get('title', ''), str) or len(data.get('title', '')) > 240:
        raise ValueError('Titre limité à 240 caractères.')
    for key in ('target_cents', 'amount_cents', 'unit_price_cents'):
        if key in data:
            finite(data[key], -10000000000 if key == 'amount_cents' else 0, 10000000000)
            if type(data[key]) is not int:
                raise ValueError('Montant en centimes entiers attendu.')
    if kind == 'album-page':
        identity(data.get('album_id'))
        items = data.get('items', [])
        strokes = data.get('strokes', [])
        if not isinstance(items, list) or len(items) > 150 or not isinstance(strokes, list) or len(strokes) > 1500:
            raise ValueError('Limite : 150 objets et 1500 traits par page.')
        for item in items:
            if not isinstance(item, dict) or item.get('type') not in ('photo', 'text', 'sticker'):
                raise ValueError('Objet inconnu.')
            for key in ('x', 'y', 'width', 'height'):
                finite(item.get(key, 0), 0, 2000)
            finite(item.get('rotation', 0), -360, 360)
            if len(str(item.get('text', ''))) > 20000 or len(str(item.get('caption', ''))) > 4000:
                raise ValueError('Texte trop long.')
            if item.get('asset_id'):
                identity(item['asset_id'])
        for stroke in strokes:
            if not isinstance(stroke, dict) or not isinstance(stroke.get('points'), list) or len(stroke['points']) > 12000:
                raise ValueError('Trait invalide.')
            finite(stroke.get('size', 3), 1, 80)
            for point in stroke['points']:
                if not isinstance(point, list) or len(point) != 3:
                    raise ValueError('Point invalide.')
                finite(point[0], 0, 2000); finite(point[1], 0, 2000); finite(point[2], 0, 1)
    return raw


def save(c, body, stamp):
    oid = identity(body.get('id'))
    kind = body.get('kind')
    row = c.execute('SELECT * FROM studio_objects WHERE id=?', (oid,)).fetchone()
    if type(body.get('revision')) is not int or body['revision'] != (row['revision'] if row else 0):
        raise LookupError('Ce document a changé ailleurs. Ton brouillon est conservé ; compare les deux versions avant de réessayer.')
    if row and row['kind'] != kind:
        raise ValueError('Type de document non modifiable.')
    raw = validate(kind, body.get('data'))
    if kind=='jar-operation':
        jar=body['data'].get('jar_id')
        if not c.execute("SELECT 1 FROM studio_objects WHERE id=? AND kind='jar' AND archived=0",(jar,)).fetchone():raise ValueError('Bocal introuvable.')
        others=[o for o in objects(c,'jar-operation') if o['id']!=oid and o['data'].get('jar_id')==jar]
        total=sum(o['data'].get('amount_cents',0) for o in others)+(0 if body.get('archived') else body['data'].get('amount_cents',0))
        if total<0:raise ValueError('Le retrait dépasse la somme affectée à ce bocal.')
    if kind == 'album-page':
        parent = c.execute("SELECT 1 FROM studio_objects WHERE id=? AND kind='album' AND archived=0", (body['data']['album_id'],)).fetchone()
        if not parent:
            raise ValueError('Album introuvable ou archivé.')
        for item in body['data'].get('items', []):
            if item.get('asset_id') and not c.execute('SELECT 1 FROM studio_assets WHERE id=?', (item['asset_id'],)).fetchone():
                raise ValueError('Importe la photo avant d’enregistrer sa page.')
    if row:
        c.execute('INSERT INTO studio_history(object_id,revision,data_json,saved_at) VALUES(?,?,?,?)',
                  (oid, row['revision'], row['data_json'], stamp))
    if not row and c.execute('SELECT count(*) FROM studio_objects').fetchone()[0] >= 20000:
        raise ValueError('Limite de documents atteinte.')
    revision = body['revision'] + 1
    archived = body.get('archived', False)
    if type(archived) is not bool:
        raise ValueError('État invalide.')
    c.execute('INSERT INTO studio_objects VALUES(?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET '
              'revision=excluded.revision,data_json=excluded.data_json,archived=excluded.archived,updated_at=excluded.updated_at',
              (oid, kind, revision, raw, int(archived), stamp, stamp))
    if kind=='session':sport_contribution(c,oid,body['data'],archived,stamp)
    return object_value(c.execute('SELECT * FROM studio_objects WHERE id=?', (oid,)).fetchone())


def sport_contribution(c,oid,data,archived,stamp):
    existing=c.execute('SELECT * FROM studio_contributions WHERE source_id=?',(oid,)).fetchone()
    active=bool(data.get('done')) and not archived
    if active and existing:return
    if not active and not existing:return
    if existing:
        rid=existing['row_id'];day=existing['day']
    else:
        exercise=c.execute("SELECT data_json FROM studio_objects WHERE id=? AND kind='exercise' AND archived=0",(data.get('exercise_id'),)).fetchone()
        rid=json.loads(exercise['data_json']).get('tracker_row_id') if exercise else None
        if not rid:return
        day=date.fromisoformat(data['date']).isoformat()
    row=c.execute('SELECT * FROM tracker_board_rows WHERE id=? AND archived=0',(rid,)).fetchone()
    if not row:raise ValueError('La ligne de sport est introuvable.')
    if not existing and not tracker_schedule.applies(c,row,date.fromisoformat(day)):raise ValueError('Cette ligne de tracker est prévue un autre jour.')
    if not existing and 'board_id' in row.keys():
        board=c.execute('SELECT * FROM tracker_boards WHERE id=?',(row['board_id'],)).fetchone()
        if board:day=period_mark_day(board,date.fromisoformat(day)).isoformat()
    if c.execute('SELECT 1 FROM tracker_row_steps WHERE row_id=? AND active=1',(rid,)).fetchone():raise ValueError('Pour ce lien automatique, choisis une ligne de sport sans sous-étapes.')
    marked=c.execute('SELECT * FROM tracker_board_marks WHERE row_id=? AND day=?',(rid,day)).fetchone()
    base=c.execute('SELECT * FROM studio_tracker_base WHERE row_id=? AND day=?',(rid,day)).fetchone()
    count=c.execute('SELECT count(*) FROM studio_contributions WHERE row_id=? AND day=?',(rid,day)).fetchone()[0]
    if base and count and (marked['updated_at'] if marked else '')!=base['last_stamp']:raise LookupError('Cette case de sport a été modifiée directement. Vérifie-la avant de changer la séance liée.')
    value=base['base_value'] if base and count else marked['value'] if marked else None
    if active:
        c.execute('INSERT INTO studio_contributions VALUES(?,?,?,?,?)',(oid,rid,day,value,None));count+=1
    else:
        c.execute('DELETE FROM studio_contributions WHERE source_id=?',(oid,));count-=1
    written=format(min(row['target_count'] or 1000000,float(value or 0)+count),'.8g') if row['mode']=='number' else '1' if count else value
    if written is None:c.execute('DELETE FROM tracker_board_marks WHERE row_id=? AND day=?',(rid,day))
    else:c.execute('INSERT INTO tracker_board_marks VALUES(?,?,?,?) ON CONFLICT(row_id,day) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at',(rid,day,written,stamp))
    c.execute('INSERT INTO studio_tracker_base VALUES(?,?,?,?) ON CONFLICT(row_id,day) DO UPDATE SET base_value=excluded.base_value,last_stamp=excluded.last_stamp',(rid,day,value,stamp if written is not None else ''))


def asset(c, body, stamp):
    raw = body.get('base64')
    if not isinstance(raw, str) or len(raw) > 5700000:
        raise ValueError('Photo limitée à 4 Mo.')
    content = base64.b64decode(raw, validate=True)
    if len(content) > 4200000:
        raise ValueError('Photo limitée à 4 Mo.')
    mime = ('image/png' if content.startswith(b'\x89PNG\r\n\x1a\n') else
            'image/jpeg' if content.startswith(b'\xff\xd8\xff') else
            'image/webp' if content[:4] == b'RIFF' and content[8:12] == b'WEBP' else None)
    if not mime:
        mime='audio/wav' if content[:4]==b'RIFF' and content[8:12]==b'WAVE' else 'audio/ogg' if content[:4]==b'OggS' else 'audio/mpeg' if content[:3]==b'ID3' or len(content)>2 and content[0]==255 and content[1]&224==224 else None
    if not mime:
        raise ValueError('Utilise une image PNG/JPEG/WebP ou un son WAV/MP3/OGG.')
    aid = hashlib.sha256(content).hexdigest()
    if c.execute('SELECT 1 FROM studio_assets WHERE id=?', (aid,)).fetchone():
        return {'id': aid, 'mime': mime}
    total = c.execute('SELECT coalesce(sum(length(content)),0) FROM studio_assets').fetchone()[0]
    if total + len(content) > 150000000:
        raise ValueError('Les photos occupent déjà 150 Mo. Exporte et range tes albums avant d’en ajouter.')
    c.execute('INSERT INTO studio_assets VALUES(?,?,?,?)', (aid, mime, content, stamp))
    return {'id': aid, 'mime': mime}


def tracker_mark(c, body, stamp):
    row_id = int(body['row_id']); day = date.fromisoformat(body['day']).isoformat()
    row = c.execute('SELECT r.* FROM tracker_board_rows r JOIN tracker_boards b ON b.id=r.board_id '
                    'WHERE r.id=? AND r.archived=0 AND b.archived=0', (row_id,)).fetchone()
    if not row:
        raise ValueError('Ligne introuvable.')
    board=c.execute('SELECT * FROM tracker_boards WHERE id=?',(row['board_id'],)).fetchone()
    if not tracker_schedule.applies(c,row,date.fromisoformat(day)):
        raise ValueError('Cette ligne est prévue un autre jour.')
    day=period_mark_day(board,date.fromisoformat(day)).isoformat()
    old = c.execute('SELECT value FROM tracker_board_marks WHERE row_id=? AND day=?', (row_id, day)).fetchone()
    current = old['value'] if old else None
    action = body.get('mode', 'set')
    if action == 'increment':
        if row['mode'] != 'number':
            raise ValueError('Cette ligne n’est pas un compteur.')
        step = body.get('delta', 1)
        if step not in (-1, 1) or type(step) is not int:
            raise ValueError('Incrément invalide.')
        value = format(max(0, min(row['target_count'] or 1000000, float(current or 0) + step)), '.8g')
    else:
        if body.get('base') != current:
            raise LookupError('Cette case a changé sur un autre appareil.')
        value = body.get('value')
        if value is not None and value is not True:
            raise ValueError('Case invalide.')
        if value and c.execute('SELECT 1 FROM tracker_row_steps WHERE row_id=? AND active=1', (row_id,)).fetchone():
            raise ValueError('Ouvre les étapes de cette habitude.')
        value = '1' if value else None
    if value is None:
        c.execute('DELETE FROM tracker_board_marks WHERE row_id=? AND day=?', (row_id, day))
    else:
        c.execute('INSERT INTO tracker_board_marks VALUES(?,?,?,?) ON CONFLICT(row_id,day) '
                  'DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at', (row_id, day, value, stamp))
    return {'ok': True, 'value': value}


def command(c, body, context):
    operation = identity(body.get('operation_id'))
    digest = hashlib.sha256(encode(body).encode()).hexdigest()
    prior = c.execute('SELECT * FROM studio_receipts WHERE id=?', (operation,)).fetchone()
    if prior:
        if prior['digest'] != digest:
            raise ValueError('Identifiant de requête déjà utilisé.')
        return json.loads(prior['response'])
    stamp = datetime.now().isoformat()
    action = body.get('action'); data = body.get('payload', {})
    if not isinstance(data, dict):
        raise ValueError('Action invalide.')
    if action == 'save':
        result = save(c, data, stamp)
    elif action == 'asset':
        result = asset(c, data, stamp)
    elif action == 'tracker-mark':
        result = tracker_mark(c, data, stamp)
    elif action == 'shopping-save':
        name=str(data.get('name','')).strip()
        quantity=str(data.get('quantity','')).strip()
        count=data.get('purchase_count',1);price=data.get('price')
        category=data.get('category','Alimentation')
        if not 1<=len(name)<=240 or len(quantity)>120:raise ValueError('Article ou quantité invalide.')
        if type(count) is not int or not 1<=count<=1000:raise ValueError('Choisis entre 1 et 1000 unités.')
        if price is not None:finite(price,0,1000000)
        if category not in ('Alimentation','Entretien','Hygiène','Animaux','Autres'):raise ValueError('Catégorie inconnue.')
        sid=data.get('shopping_id')
        if sid:
            current=c.execute('SELECT * FROM shopping_items WHERE id=? AND archived=0',(int(sid),)).fetchone()
            if not current or current['updated_at']!=data.get('base_updated_at'):raise LookupError('Cet article a changé sur le PC.')
            c.execute('UPDATE shopping_items SET name=?,quantity=?,purchase_count=?,price=?,updated_at=? WHERE id=?',(name,quantity,count,price,stamp,sid))
        else:
            sid=c.execute('INSERT INTO shopping_items(name,quantity,purchase_count,price,checked,archived,created_at,updated_at) VALUES(?,?,?,?,0,0,?,?)',(name,quantity,count,price,stamp,stamp)).lastrowid
        previous=c.execute('SELECT * FROM studio_objects WHERE id=?',('shopping-'+str(sid),)).fetchone()
        appearance=save(c,{'id':'shopping-'+str(sid),'kind':'purchase','revision':previous['revision'] if previous else 0,'data':{'title':name,'shopping_id':sid,'category':category}},stamp)
        result={'id':sid,'appearance':appearance,'item':dict(c.execute('SELECT * FROM shopping_items WHERE id=?',(sid,)).fetchone())}
    elif action == 'shopping-check':
        sid=int(data['shopping_id'])
        row=c.execute('SELECT checked FROM shopping_items WHERE id=? AND archived=0',(sid,)).fetchone()
        if not row or bool(row['checked'])!=data.get('base'):raise LookupError('Cet article a changé sur le PC.')
        if type(data.get('checked')) is not bool:raise ValueError('Case invalide.')
        c.execute('UPDATE shopping_items SET checked=?,updated_at=? WHERE id=?',(int(data['checked']),stamp,sid))
        result={'ok':True}
    elif action == 'capture':
        text=str(data.get('text','')).strip();target=data.get('destination','carnet')
        if not 1<=len(text)<=10000:raise ValueError('Note vide ou trop longue.')
        if target=='postit':
            shape=data.get('shape','rounded')
            if shape not in ('square','rounded','pill','star','heart','circle'):raise ValueError('Format de Post-it invalide.')
            if c.execute('SELECT count(*) FROM home_postits WHERE archived=0').fetchone()[0]>=100:raise ValueError('Archive quelques Post-it avant d’en ajouter.')
            cur=c.execute("INSERT INTO home_postits(title,body,color,shape,archived,created_at,updated_at) VALUES(?,?,'gold',?,0,?,?)",(text.splitlines()[0][:120],text,shape,stamp,stamp))
        elif target=='taches':
            cur=c.execute("INSERT INTO tasks(title,notes,completed,archived,important,order_index,created_at,updated_at) VALUES(?,?,0,0,0,0,?,?)",(text.splitlines()[0][:120],text,stamp,stamp))
        elif target=='courses':
            cur=c.execute("INSERT INTO shopping_items(name,quantity,purchase_count,checked,archived,created_at,updated_at) VALUES(?,'',1,0,0,?,?)",(text[:120],stamp,stamp))
        elif target=='administratif':
            cur=c.execute("INSERT INTO admin_documents(title,category,notes,created_at,updated_at) VALUES(?,'Général',?,?,?)",(text.splitlines()[0][:180],text,stamp,stamp))
        elif target in ('carnet','rappels','tracker','budget','sport','album'):
            cur=c.execute('INSERT INTO quick_captures(destination,body,created_at) VALUES(?,?,?)',(target if target in ('carnet','rappels','tracker') else 'carnet','#'+target+' '+text,stamp))
        else:raise ValueError('Destination inconnue.')
        result={'id':cur.lastrowid,'destination':target}
    elif action == 'tracker-tab-archive':
        oid=identity(data.get('id'))
        active=objects(c,'tracker-tab')
        tab=next((o for o in active if o['id']==oid),None)
        ids=data.get('board_ids')
        if not isinstance(ids,list) or any(type(i) is not int or i<1 for i in ids):
            raise ValueError('Tableaux invalides.')
        if tab:
            if data.get('revision')!=tab['revision'] or ids!=tab['data'].get('board_ids',[]):
                raise LookupError('Cet onglet a changé ailleurs ; actualise avant de le supprimer.')
        elif not (len(ids)==1 and oid=='board-'+str(ids[0]) and data.get('revision')==0):
            raise LookupError('Cet onglet n’existe plus ; actualise les trackers.')
        shared={int(i) for o in active if o['id']!=oid for i in o['data'].get('board_ids',[])}
        if not tab and shared.intersection(ids):
            raise LookupError('Ce tableau appartient maintenant à un onglet ; actualise les trackers.')
        archived=[]
        for bid in ids:
            if bid not in shared:
                c.execute('UPDATE tracker_boards SET archived=1,updated_at=? WHERE id=? AND archived=0',(stamp,bid))
                archived.append(bid)
        if tab:save(c,{**tab,'archived':True},stamp)
        result={'ok':True,'archived_board_ids':archived}
    elif action == 'board-title':
        row=c.execute('SELECT title FROM tracker_boards WHERE id=? AND archived=0',(int(data['id']),)).fetchone()
        if not row or row['title']!=data.get('base'):raise LookupError('Ce tableau a changé ailleurs.')
        title=str(data.get('title','')).strip()
        if len(title)>100:raise ValueError('Nom limité à 100 caractères.')
        c.execute('UPDATE tracker_boards SET title=?,updated_at=? WHERE id=?',(title,stamp,int(data['id'])))
        result={'ok':True}
    elif action == 'board-period':
        row=c.execute('SELECT * FROM tracker_boards WHERE id=? AND archived=0',(int(data['id']),)).fetchone()
        if not row or data.get('base')!=[row['period_unit'],row['period_count']] or data.get('base_mark_unit',row['mark_unit'])!=row['mark_unit']:raise LookupError('Le rythme a changé ailleurs.')
        unit,count=context['tracker_period_choice'](data['period_unit'],data['period_count'])
        mark_unit=data.get('mark_unit','auto')
        if mark_unit not in ('auto','month','quarter','semester','year'):raise ValueError('Rythme de cases invalide.')
        if mark_unit!='auto' and (unit!='years' or count!=1):raise ValueError('Ce rythme utilise une feuille annuelle.')
        c.execute('UPDATE tracker_boards SET period_unit=?,period_count=?,anchor_date=?,mark_unit=?,updated_at=? WHERE id=?',(unit,count,context['tracker_period_anchor'](unit).isoformat(),mark_unit,stamp,row['id']))
        result={'ok':True}
    elif action == 'row-archive':
        c.execute('UPDATE tracker_board_rows SET archived=1,updated_at=? WHERE id=?',(stamp,int(data['row_id'])))
        result={'ok':True}
    elif action == 'row-duplicate':
        row=c.execute('SELECT * FROM tracker_board_rows WHERE id=? AND archived=0',(int(data['row_id']),)).fetchone()
        if not row:raise ValueError('Ligne introuvable.')
        if c.execute('SELECT count(*) FROM tracker_board_rows WHERE board_id=? AND archived=0',(row['board_id'],)).fetchone()[0]>=80:raise ValueError('Limite de lignes atteinte.')
        fields=['board_id','title','mode','target_count','weekday','linked_type','linked_id','order_index','created_at','updated_at']
        values=[row['board_id'],(row['title']+' (copie)')[:100],row['mode'],row['target_count'],row['weekday'],row['linked_type'],row['linked_id'],100000,stamp,stamp]
        new=c.execute('INSERT INTO tracker_board_rows('+','.join(fields)+') VALUES('+','.join('?'*len(fields))+')',values).lastrowid
        for step in c.execute('SELECT * FROM tracker_row_steps WHERE row_id=? AND active=1 ORDER BY order_index,id',(row['id'],)).fetchall():c.execute('INSERT INTO tracker_row_steps(row_id,title,order_index,weekday,active) VALUES(?,?,?,?,1)',(new,step['title'],step['order_index'],step['weekday']))
        tracker_schedule.copy(c,row['id'],new)
        appearance=c.execute("SELECT * FROM studio_objects WHERE id=?",('tracker-row-'+str(row['id']),)).fetchone()
        if appearance:
            app=json.loads(appearance['data_json']);app['row_id']=new;app['title']=values[1]
            save(c,{'id':'tracker-row-'+str(new),'kind':'tracker-row','revision':0,'data':app},stamp)
        result={'id':new}
    elif action == 'tracker-setup':
        rid=int(data['row_id'])
        row=c.execute('SELECT * FROM tracker_board_rows WHERE id=? AND archived=0',(rid,)).fetchone()
        if not row:raise ValueError('Ligne introuvable.')
        for field in ('title','mode','weekday','target_count'):
            if data.get('base',{}).get(field)!=row[field]:raise LookupError('Cette ligne a changé ailleurs ; actualise avant de modifier sa configuration.')
        if 'base_schedule' in data:
            current=tracker_schedule.read(c,row)
            if data['base_schedule']!={k:current[k] for k in ('weekdays','interval_weeks','anchor_monday')}:raise LookupError('Le rythme de cette ligne a changé ailleurs ; actualise avant de modifier.')
        mode=data.get('mode',row['mode'])
        if mode not in ('check','number'):raise ValueError('Type de ligne invalide.')
        c.execute('UPDATE tracker_board_rows SET mode=? WHERE id=?',(mode,rid))
        result=context['tracker_rituals'].save_setup(c,rid,data,stamp)
        if data.get('appearance'):save(c,data['appearance'],stamp)
    elif action=='task-step':
        task=int(data['task_id']);current=context['utility_details'].extras(c,task)
        index=int(data['index']);steps=current['data']['checklist']
        if not 0<=index<len(steps) or steps[index]['text']!=data.get('text') or steps[index]['done']!=data.get('base'):raise LookupError('Cette sous-tâche a changé sur le PC.')
        if type(data.get('done')) is not bool:raise ValueError('Case invalide.')
        steps[index]['done']=data['done'];context['utility_details'].save_task(c,task,current)
        result={'ok':True}
    elif action == 'tracker-step':
        if 'base' in data:
            board=c.execute('SELECT b.* FROM tracker_boards b JOIN tracker_board_rows r ON r.board_id=b.id JOIN tracker_row_steps s ON s.row_id=r.id WHERE s.id=?',(int(data['step_id']),)).fetchone()
            key=period_mark_day(board,date.fromisoformat(data['day'])).isoformat() if board else data['day']
            current=bool(c.execute('SELECT 1 FROM tracker_row_step_checks WHERE step_id=? AND day=?',(int(data['step_id']),key)).fetchone())
            if current!=data['base']:raise LookupError('Cette étape a changé sur un autre appareil.')
        result = context['tracker_rituals'].toggle_step(c, int(data['step_id']), date.fromisoformat(data['day']).isoformat(), data['done'], stamp)
    elif action == 'consume-stock':
        food = c.execute("SELECT * FROM food_items WHERE id=? AND status='active'", (int(data['food_id']),)).fetchone()
        if not food:
            raise ValueError('Aliment introuvable.')
        if data.get('base_units') != food['units_count']:
            raise LookupError('Ce stock a changé ; vérifie la quantité restante.')
        count = data.get('units')
        if type(count) is not int or count < 1 or count > food['units_count']:
            raise ValueError('Choisis un nombre d’unités disponibles.')
        c.execute('UPDATE food_items SET units_count=?,status=?,updated_at=? WHERE id=?',
                  (food['units_count'] - count, 'consumed' if count == food['units_count'] else 'active', stamp, food['id']))
        if count==food['units_count']:
            import groceries
            groceries.sync_reminders(c,food['id'],stamp)
        result = {'ok': True}
    else:
        raise ValueError('Action inconnue.')
    c.execute('INSERT INTO studio_receipts VALUES(?,?,?)', (operation, digest, encode(result)))
    return result


def widget_data(c, context):
    today=date.today();end=today+timedelta(days=90)
    items=[{'title':r['title'],'date':r['due_date'],'kind':'task'} for r in c.execute("SELECT title,due_date FROM tasks WHERE completed=0 AND archived=0 AND due_date IS NOT NULL AND due_date<=? ORDER BY due_date",(end.isoformat(),))]
    completed={(r['event_id'],r['instance_date']) for r in c.execute('SELECT event_id,instance_date FROM event_completions')}
    closed={(r['event_id'],r['instance_date']) for r in c.execute("SELECT event_id,instance_date FROM event_instance_actions WHERE action IN ('postponed','cancelled','hidden')")}
    events=context['expand_events'](c.execute("SELECT * FROM events WHERE status NOT IN ('cancelled','done')").fetchall(),today.isoformat(),end.isoformat())
    for e in events:
        if (e['id'],e['instance_date']) not in completed|closed:items.append({'title':e['title'],'date':e['instance_date'],'time':e.get('start_time') or '', 'kind':'event'})
    items=sorted(items,key=lambda x:(x['date'],x.get('time','')))[:8]
    dates=sorted({date.fromisoformat(r['start_date']) for r in c.execute('SELECT start_date FROM menstrual_periods')})
    intervals=[(b-a).days for a,b in zip(dates,dates[1:]) if 21<=(b-a).days<=45][-6:]
    cycle=None
    if intervals:
        median=sorted(intervals)[len(intervals)//2]
        reliable=[v for v in intervals if abs(v-median)<=9] if len(intervals)>=4 else intervals
        values=reliable if len(reliable)>=2 else intervals
        average=max(21,min(45,int(sum(v*(i+1) for i,v in enumerate(values))/sum(range(1,len(values)+1))+.5)))
        next_day=dates[-1]+timedelta(days=average)
        manual=False
        if c.execute("SELECT 1 FROM sqlite_master WHERE name='alimentation_records'").fetchone():
            for row in c.execute("SELECT data_json FROM alimentation_records WHERE kind='cycle-plan'"):
                plan=json.loads(row['data_json'])
                if plan.get('last')==dates[-1].isoformat():
                    next_day=date.fromisoformat(plan['next']);manual=True
        cycle={'next_date':next_day.isoformat(),'estimated':True,'manual':manual,'overdue':next_day<today}
    return items,cycle


def serve(handler, method, path, q, context):
    if not path.startswith('/api/studio/'):
        return False
    try:
        with closing(sqlite3.connect(context['DB_PATH'], timeout=20)) as c:
            c.row_factory = sqlite3.Row; c.execute('PRAGMA foreign_keys=ON')
            if method == 'GET' and path == '/api/studio/snapshot':
                # No mental-health journal is mixed into this shared snapshot.
                result = {'version': 1, 'objects': objects(c), 'day': date.today().isoformat(), 'installation_id':context['utility_safety'].identity(context['DATA'])}
                reference=date.fromisoformat(q.get('day',[date.today().isoformat()])[0])
                if abs((reference-date.today()).days)>3660:raise ValueError('Date hors période disponible.')
                result['view_day']=reference.isoformat()
                boards = [dict(r) for r in c.execute('SELECT * FROM tracker_boards WHERE archived=0 ORDER BY id')]
                for board in boards:
                    board['period'] = context['tracker_window'](board,today=reference)
                    board['custom_title']=board['title'];board['title']=board['title'] or board['period']['heading']
                    board['rows'] = [dict(r) for r in c.execute('SELECT * FROM tracker_board_rows WHERE board_id=? AND archived=0 ORDER BY order_index,id', (board['id'],))]
                    for row in board['rows']:
                        row.update(tracker_schedule.read(c,row))
                        row['marks'] = {r['day']: r['value'] for r in c.execute('SELECT * FROM tracker_board_marks WHERE row_id=? AND day BETWEEN ? AND ?', (row['id'], min(board['period']['start'],(reference-timedelta(days=reference.weekday())).isoformat()), max(board['period']['end'],(reference+timedelta(days=6-reference.weekday())).isoformat())))}
                        row['steps'] = context['tracker_rituals'].steps_for_row(c, row['id'], min(board['period']['start'],(reference-timedelta(days=reference.weekday())).isoformat()), max(board['period']['end'],(reference+timedelta(days=6-reference.weekday())).isoformat()))
                result['urgent'],result['cycle']=widget_data(c,context)
                result['boards'] = boards
                result['task_details']=[{'task_id':r['task_id'],'revision':r['revision'],'data':json.loads(r['data_json'])} for r in c.execute('SELECT * FROM task_extras')]
                result['food'] = [dict(r) for r in c.execute("SELECT * FROM food_items WHERE status='active'")]
                result['shopping'] = [dict(r) for r in c.execute('SELECT * FROM shopping_items WHERE archived=0 ORDER BY id')]
                handler._json(result); return True
            if method == 'GET' and path.startswith('/api/studio/assets/'):
                aid = identity(path.rsplit('/', 1)[1])
                row = c.execute('SELECT * FROM studio_assets WHERE id=?', (aid,)).fetchone()
                if not row:
                    handler._json({'error': 'Photo introuvable.'}, 404); return True
                if q.get('json') == ['1']:
                    handler._json({'id': aid, 'mime': row['mime'], 'base64': base64.b64encode(row['content']).decode()}); return True
                handler.send_response(200); handler.send_header('Content-Type', row['mime'])
                handler.send_header('Content-Length', str(len(row['content'])))
                handler.send_header('Cache-Control', 'no-store'); handler.send_header('X-Content-Type-Options', 'nosniff')
                handler.end_headers(); handler.wfile.write(row['content']); return True
            if method == 'POST' and path == '/api/studio/actions':
                origin = handler.headers.get('Origin', '')
                if origin and origin != 'http://127.0.0.1:' + str(handler.server.server_port):
                    handler._json({'error': 'Origine refusée.'}, 403); return True
                if int(handler.headers.get('Content-Length', '0')) > 6000000:
                    raise ValueError('Envoi trop volumineux.')
                body = handler._body(); c.execute('BEGIN IMMEDIATE')
                result = command(c, body, context); c.commit(); handler._json(result); return True
            handler._json({'error': 'Action introuvable.'}, 404)
    except LookupError as error:
        handler._json({'error': str(error)}, 409)
    except (ValueError, TypeError, KeyError, sqlite3.Error) as error:
        handler._json({'error': str(error)}, 400)
    return True
