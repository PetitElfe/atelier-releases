"""Préparatifs de rendez-vous : modèles par série et validation par occurrence.

Aucun état n'est partagé entre profils : les tables vivent dans leur SQLite local.
Les préparatifs ne sont pas des tâches générales et ne changent pas la durée du RDV.
"""
from datetime import date, timedelta

DDL = """
CREATE TABLE IF NOT EXISTS event_preparations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_id INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  position INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_event_preparations_event
  ON event_preparations(event_id,position,id);
CREATE TABLE IF NOT EXISTS event_preparation_checks (
  preparation_id INTEGER NOT NULL REFERENCES event_preparations(id) ON DELETE CASCADE,
  instance_date TEXT NOT NULL,
  completed_at TEXT NOT NULL,
  PRIMARY KEY(preparation_id,instance_date)
);
CREATE INDEX IF NOT EXISTS idx_event_preparation_checks_day
  ON event_preparation_checks(instance_date);
"""

def initialise(c):
    c.executescript(DDL)


def _validate_date(raw):
    try:
        return date.fromisoformat(str(raw)).isoformat()
    except (TypeError, ValueError):
        raise ValueError("Date d'occurrence invalide.")


def _event(c, event_id):
    row=c.execute('SELECT * FROM events WHERE id=?',(int(event_id),)).fetchone()
    if row is None:
        raise LookupError("Rendez-vous introuvable.")
    return row


def _valid_instance(event, instance_date):
    """Refuse une validation sur un jour étranger à la série."""
    day=date.fromisoformat(_validate_date(instance_date))
    base=date.fromisoformat(event['event_date'])
    if day<base:
        return False
    recur=event['recurrence'] or 'none'
    if recur=='none':
        return day==base
    if recur=='daily':
        return True
    if recur=='weekly':
        return (day-base).days%7==0
    if recur=='monthly':
        from calendar import monthrange
        return day.day==min(base.day,monthrange(day.year,day.month)[1])
    return False


def replace_templates(c,event_id,items,ts):
    _event(c,event_id)
    if not isinstance(items,list) or len(items)>30:
        raise ValueError("Maximum 30 préparatifs par rendez-vous.")
    old={r['id']:dict(r) for r in c.execute(
        'SELECT id,title FROM event_preparations WHERE event_id=?',(event_id,))}
    keep=[]
    seen=set()
    for index,item in enumerate(items):
        if not isinstance(item,dict):
            raise ValueError("Préparatif incorrect.")
        title=str(item.get('title') or '').strip()
        if not title or len(title)>180:
            raise ValueError("Chaque préparatif doit avoir un titre (180 caractères maximum).")
        raw_id=item.get('id')
        item_id=int(raw_id) if raw_id not in (None,'') else None
        # Une occurrence éditée peut copier la liste du modèle sans ses IDs.
        # Réutiliser alors le même titre pour préserver les cases déjà cochées.
        if item_id is None:
            item_id=next((key for key,row in old.items()
                          if key not in seen and row['title']==title),None)
        if item_id is not None:
            if item_id not in old or item_id in seen:
                raise ValueError("Préparatif étranger au rendez-vous ou en double.")
            c.execute('UPDATE event_preparations SET title=?,position=?,updated_at=? WHERE id=?',
                      (title,index,ts,item_id))
        else:
            cur=c.execute('INSERT INTO event_preparations(event_id,title,position,created_at,updated_at) VALUES(?,?,?,?,?)',
                          (event_id,title,index,ts,ts))
            item_id=cur.lastrowid
        keep.append(item_id)
        seen.add(item_id)
    for item_id in old:
        if item_id not in seen:
            c.execute('DELETE FROM event_preparation_checks WHERE preparation_id=?',(item_id,))
            c.execute('DELETE FROM event_preparations WHERE id=?',(item_id,))
    return keep


def copy_to_event(c,source_id,dest_id,source_day,ts):
    """Clone une occurrence reportée, en gardant ses cases cochées."""
    if int(source_id)==int(dest_id):
        return
    if c.execute('SELECT 1 FROM event_preparations WHERE event_id=? LIMIT 1',(dest_id,)).fetchone():
        return
    source_day=_validate_date(source_day)
    for row in c.execute('SELECT id,title,position FROM event_preparations WHERE event_id=? ORDER BY position,id',(source_id,)).fetchall():
        cur=c.execute('INSERT INTO event_preparations(event_id,title,position,created_at,updated_at) VALUES(?,?,?,?,?)',
                      (dest_id,row['title'],row['position'],ts,ts))
        checked=c.execute('SELECT completed_at FROM event_preparation_checks WHERE preparation_id=? AND instance_date=?',
                          (row['id'],source_day)).fetchone()
        if checked:
            dest_day=c.execute('SELECT event_date FROM events WHERE id=?',(dest_id,)).fetchone()['event_date']
            c.execute('INSERT INTO event_preparation_checks(preparation_id,instance_date,completed_at) VALUES(?,?,?)',
                      (cur.lastrowid,dest_day,checked['completed_at']))


def set_checked(c,event_id,preparation_id,instance_date,done,ts):
    event=_event(c,event_id)
    instance_date=_validate_date(instance_date)
    if not _valid_instance(event,instance_date):
        raise ValueError("Cette date n'appartient pas au rendez-vous.")
    row=c.execute('SELECT id FROM event_preparations WHERE event_id=? AND id=?',
                  (event_id,preparation_id)).fetchone()
    if not row:
        raise LookupError("Préparatif introuvable.")
    action=c.execute('SELECT action FROM event_instance_actions WHERE event_id=? AND instance_date=?',
                     (event_id,instance_date)).fetchone()
    if action and action['action'] in ('cancelled','postponed','hidden'):
        raise ValueError("Cette occurrence est annulée ou reportée.")
    if done:
        c.execute('INSERT INTO event_preparation_checks(preparation_id,instance_date,completed_at) VALUES(?,?,?) ON CONFLICT(preparation_id,instance_date) DO UPDATE SET completed_at=excluded.completed_at',
                  (preparation_id,instance_date,ts))
    else:
        c.execute('DELETE FROM event_preparation_checks WHERE preparation_id=? AND instance_date=?',
                  (preparation_id,instance_date))


def attach(c,events):
    """Joint les cases de chaque occurrence sans écraser les autres dates."""
    if not events:
        return events
    ids=sorted({int(e['id']) for e in events})
    placeholders=','.join('?' for _ in ids)
    templates={}
    for r in c.execute(f'SELECT id,event_id,title,position FROM event_preparations WHERE event_id IN ({placeholders}) ORDER BY position,id',ids):
        templates.setdefault(r['event_id'],[]).append(dict(r))
    days=sorted({e.get('instance_date') or e['event_date'] for e in events})
    if not days:
        return events
    checks={}
    daymarks=','.join('?' for _ in days)
    for r in c.execute(f"""SELECT pc.preparation_id,pc.instance_date
      FROM event_preparation_checks pc JOIN event_preparations ep ON ep.id=pc.preparation_id
      WHERE ep.event_id IN ({placeholders}) AND pc.instance_date IN ({daymarks})""",ids+days):
        checks[(r['preparation_id'],r['instance_date'])]=True
    for event in events:
        day=event.get('instance_date') or event['event_date']
        event['preparations']=[{'id':r['id'],'title':r['title'],'done':bool(checks.get((r['id'],day)))}
                               for r in templates.get(event['id'],[])]
        event['preparations_remaining']=sum(not x['done'] for x in event['preparations'])
    return events


def upcoming(c,expand_events,today=None):
    """J-1 et jour J seulement, sans doublons ni occurrences clôturées."""
    day=date.fromisoformat(_validate_date(today or date.today().isoformat()))
    last=day+timedelta(days=1)
    rows=c.execute('SELECT * FROM events WHERE event_date<=? ORDER BY event_date,id',(last.isoformat(),)).fetchall()
    events=expand_events(rows,day.isoformat(),last.isoformat())
    action_map={(r['event_id'],r['instance_date']):r['action'] for r in c.execute(
        'SELECT event_id,instance_date,action FROM event_instance_actions WHERE instance_date BETWEEN ? AND ?',
        (day.isoformat(),last.isoformat()))}
    done={(r['event_id'],r['instance_date']) for r in c.execute(
        'SELECT event_id,instance_date FROM event_completions WHERE instance_date BETWEEN ? AND ?',
        (day.isoformat(),last.isoformat()))}
    visible=[e for e in events if e['status'] not in ('cancelled','done')
             and (e['id'],e['instance_date']) not in done
             and action_map.get((e['id'],e['instance_date'])) not in ('cancelled','postponed','hidden')]
    attach(c,visible)
    return [{'id':e['id'],'title':e['title'],'instance_date':e['instance_date'],
             'start_time':e['start_time'],'preparations':e['preparations'],
             'preparations_remaining':e['preparations_remaining']}
            for e in visible if e['preparations_remaining']]
