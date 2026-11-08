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
from datetime import date, datetime

KINDS = {'album', 'album-page', 'tracker-tab', 'tracker-row', 'card', 'activity',
         'jar', 'jar-operation', 'purchase', 'exercise', 'session', 'meal', 'preferences'}
IDENTITY = re.compile(r'^[A-Za-z0-9_-]{1,100}$')


def initialise(c):
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
    if row['weekday'] is not None and date.fromisoformat(day).weekday()!=row['weekday']:raise ValueError('Cette ligne de tracker est prévue un autre jour.')
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
    written=str(min(row['target_count'] or 1000000,int(float(value or 0))+count)) if row['mode']=='number' else '1' if count else value
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
    if row['weekday'] is not None and date.fromisoformat(day).weekday() != row['weekday']:
        raise ValueError('Cette ligne est prévue un autre jour.')
    old = c.execute('SELECT value FROM tracker_board_marks WHERE row_id=? AND day=?', (row_id, day)).fetchone()
    current = old['value'] if old else None
    action = body.get('mode', 'set')
    if action == 'increment':
        if row['mode'] != 'number':
            raise ValueError('Cette ligne n’est pas un compteur.')
        step = body.get('delta', 1)
        if step not in (-1, 1) or type(step) is not int:
            raise ValueError('Incrément invalide.')
        value = str(int(max(0, min(row['target_count'] or 1000000, float(current or 0) + step))))
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
    elif action == 'board-title':
        row=c.execute('SELECT title FROM tracker_boards WHERE id=? AND archived=0',(int(data['id']),)).fetchone()
        if not row or row['title']!=data.get('base'):raise LookupError('Ce tableau a changé ailleurs.')
        title=str(data.get('title','')).strip()
        if not 1<=len(title)<=100:raise ValueError('Nom du tableau requis.')
        c.execute('UPDATE tracker_boards SET title=?,updated_at=? WHERE id=?',(title,stamp,int(data['id'])))
        result={'ok':True}
    elif action == 'tracker-setup':
        rid=int(data['row_id'])
        row=c.execute('SELECT * FROM tracker_board_rows WHERE id=? AND archived=0',(rid,)).fetchone()
        if not row:raise ValueError('Ligne introuvable.')
        for field in ('title','mode','weekday','target_count'):
            if data.get('base',{}).get(field)!=row[field]:raise LookupError('Cette ligne a changé ailleurs ; actualise avant de modifier sa configuration.')
        mode=data.get('mode',row['mode'])
        if mode not in ('check','number'):raise ValueError('Type de ligne invalide.')
        c.execute('UPDATE tracker_board_rows SET mode=? WHERE id=?',(mode,rid))
        result=context['tracker_rituals'].save_setup(c,rid,data,stamp)
        if data.get('appearance'):save(c,data['appearance'],stamp)
    elif action == 'tracker-step':
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
        result = {'ok': True}
    else:
        raise ValueError('Action inconnue.')
    c.execute('INSERT INTO studio_receipts VALUES(?,?,?)', (operation, digest, encode(result)))
    return result


def serve(handler, method, path, q, context):
    if not path.startswith('/api/studio/'):
        return False
    try:
        with sqlite3.connect(context['DB_PATH'], timeout=20) as c:
            c.row_factory = sqlite3.Row; c.execute('PRAGMA foreign_keys=ON')
            if method == 'GET' and path == '/api/studio/snapshot':
                # No mental-health journal is mixed into this shared snapshot.
                result = {'version': 1, 'objects': objects(c), 'day': date.today().isoformat(), 'installation_id':context['utility_safety'].identity(context['DATA'])}
                boards = [dict(r) for r in c.execute('SELECT * FROM tracker_boards WHERE archived=0 ORDER BY id')]
                for board in boards:
                    board['period'] = context['tracker_window'](board)
                    board['rows'] = [dict(r) for r in c.execute('SELECT * FROM tracker_board_rows WHERE board_id=? AND archived=0 ORDER BY order_index,id', (board['id'],))]
                    for row in board['rows']:
                        row['marks'] = {r['day']: r['value'] for r in c.execute('SELECT * FROM tracker_board_marks WHERE row_id=? AND day BETWEEN ? AND ?', (row['id'], board['period']['start'], board['period']['end']))}
                        row['steps'] = context['tracker_rituals'].steps_for_row(c, row['id'], board['period']['start'], board['period']['end'])
                result['boards'] = boards
                result['food'] = [dict(r) for r in c.execute("SELECT * FROM food_items WHERE status='active'")]
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
