"""Explicit start/finish and per-day corrections for the local cycle calendar."""
from contextlib import closing
from datetime import date
import sqlite3


def initialise(c):
    if 'ongoing' not in {r[1] for r in c.execute('PRAGMA table_info(menstrual_periods)')}:
        c.execute('ALTER TABLE menstrual_periods ADD COLUMN ongoing INTEGER NOT NULL DEFAULT 0')
    c.execute('CREATE UNIQUE INDEX IF NOT EXISTS idx_cycle_one_ongoing ON menstrual_periods(ongoing) WHERE ongoing=1')
    c.execute('CREATE TABLE IF NOT EXISTS cycle_day_overrides(day TEXT PRIMARY KEY,recorded INTEGER NOT NULL,revision INTEGER NOT NULL DEFAULT 1)')


def real_day(value, today):
    day = date.fromisoformat(str(value))
    if day > today:
        raise ValueError('Choisis un jour réel, aujourd’hui ou dans le passé.')
    return day.isoformat()


def start(c, body, today):
    day = real_day(body.get('start_date'), today)
    active = c.execute('SELECT * FROM menstrual_periods WHERE ongoing=1').fetchone()
    if active:
        if active['start_date'] == day:
            return {'ok': True, 'id': active['id']}
        raise LookupError('Un suivi est déjà en cours. Indique sa fin avant un nouveau début.')
    overlapping = c.execute('SELECT * FROM menstrual_periods WHERE start_date<=? AND COALESCE(end_date,start_date)>=?',
                            (today.isoformat(), day)).fetchall()
    # Explicitly confirming an existing single-day legacy entry can open its tracking.
    if len(overlapping) == 1 and overlapping[0]['start_date'] == day:
        item = overlapping[0]
        c.execute('UPDATE menstrual_periods SET ongoing=1,end_date=NULL WHERE id=?', (item['id'],))
        identifier = item['id']
    elif overlapping:
        raise LookupError('Ce début chevauche une autre période enregistrée.')
    else:
        identifier = c.execute('INSERT INTO menstrual_periods(start_date,end_date,notes,created_at,ongoing) VALUES(?,NULL,?,?,1)',
                               (day, '', today.isoformat())).lastrowid
    c.execute('DELETE FROM cycle_day_overrides WHERE day=?', (day,))
    return {'ok': True, 'id': identifier}


def finish(c, body, today):
    identifier = body.get('id')
    if type(identifier) is not int:
        raise ValueError('Période invalide.')
    end = real_day(body.get('end_date') or today.isoformat(), today)
    item = c.execute('SELECT * FROM menstrual_periods WHERE id=?', (identifier,)).fetchone()
    if not item:
        raise LookupError('Cette période n’existe plus. Recharge le calendrier.')
    if not item['ongoing']:
        if item['end_date'] == end:
            return {'ok': True, 'id': identifier}
        raise LookupError('Cette période a déjà été terminée. Recharge le calendrier.')
    if end < item['start_date']:
        raise ValueError('La fin doit suivre le début.')
    c.execute('UPDATE menstrual_periods SET end_date=?,ongoing=0 WHERE id=?', (end, identifier))
    return {'ok': True, 'id': identifier}


def set_day(c, body, today):
    day = real_day(body.get('day'), today)
    recorded, revision = body.get('recorded'), body.get('revision')
    if type(recorded) is not bool or type(revision) is not int or revision < 0:
        raise ValueError('État du jour ou version invalide.')
    previous = c.execute('SELECT * FROM cycle_day_overrides WHERE day=?', (day,)).fetchone()
    current = previous['revision'] if previous else 0
    if revision != current:
        if previous and bool(previous['recorded']) == recorded:
            return {'ok': True, 'revision': current}
        raise LookupError('Ce jour a été modifié ailleurs. Recharge le calendrier.')
    c.execute('INSERT INTO cycle_day_overrides(day,recorded,revision) VALUES(?,?,?) ON CONFLICT(day) DO UPDATE SET recorded=excluded.recorded,revision=excluded.revision',
              (day, int(recorded), current + 1))
    return {'ok': True, 'revision': current + 1}


def serve(h, method, path, db):
    if not path.startswith('/api/cycle-tracking'):
        return False
    try:
        with closing(sqlite3.connect(db, timeout=15)) as c:
            c.row_factory = sqlite3.Row
            if method == 'GET' and path == '/api/cycle-tracking':
                h._json({'overrides': [dict(r) for r in c.execute('SELECT * FROM cycle_day_overrides ORDER BY day')]})
                return True
            operations = {('POST','/api/cycle-tracking/start'): start,
                          ('POST','/api/cycle-tracking/finish'): finish,
                          ('PUT','/api/cycle-tracking/day'): set_day}
            operation = operations.get((method,path))
            if operation is None:
                h._json({'error':'Action inconnue.'},404)
                return True
            body = h._body()
            c.execute('BEGIN IMMEDIATE')
            result = operation(c, body, date.today())
            c.commit()
            h._json(result)
    except LookupError as error:
        h._json({'error':str(error)},409)
    except (ValueError, TypeError) as error:
        h._json({'error':str(error)},400)
    return True
