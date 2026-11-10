"""Multiple weekdays and anchored alternating weeks, without moving old marks."""
import json
from datetime import date,timedelta


def initialise(c):
    c.execute('CREATE TABLE IF NOT EXISTS tracker_schedules(row_id INTEGER PRIMARY KEY,weekdays_json TEXT NOT NULL,interval_weeks INTEGER NOT NULL,anchor_monday TEXT NOT NULL)')


def read(c,row):
    legacy=row['weekday'] if 'weekday' in row.keys() else None
    result={'weekdays':list(range(7)) if legacy is None else [legacy],'interval_weeks':1,'anchor_monday':None,'schedule_explicit':False}
    try:saved=c.execute('SELECT * FROM tracker_schedules WHERE row_id=?',(row['id'],)).fetchone()
    except Exception as exc:
        import sqlite3
        if isinstance(exc,sqlite3.OperationalError) and 'no such table' in str(exc):return result
        raise
    if saved:result.update(weekdays=json.loads(saved['weekdays_json']),interval_weeks=saved['interval_weeks'],anchor_monday=saved['anchor_monday'],schedule_explicit=True)
    return result


def validate(body):
    if not any(k in body for k in ('weekdays','interval_weeks','anchor_monday')):return None
    days=body.get('weekdays',list(range(7)))
    if not isinstance(days,list) or not days or len(days)>7 or any(type(d) is not int or not 0<=d<=6 for d in days) or len(set(days))!=len(days):raise ValueError('Choisis au moins un jour, sans doublon.')
    interval=body.get('interval_weeks',1)
    if type(interval) is not int or interval not in (1,2):raise ValueError('Choisis chaque semaine ou une semaine sur deux.')
    try:anchor=date.fromisoformat(body.get('anchor_monday') or date.today().isoformat())
    except (ValueError,TypeError):raise ValueError('Semaine de référence invalide.')
    anchor-=timedelta(days=anchor.weekday())
    return {'weekdays':sorted(days),'interval_weeks':interval,'anchor_monday':anchor.isoformat()}


def save(c,row_id,body,prior=None):
    value=validate(body)
    if value is None:
        if prior is None or 'weekday' not in body or body['weekday']==prior['weekday']:return
        previous=read(c,prior)
        if not previous['schedule_explicit']:return
        value={**previous,'weekdays':list(range(7)) if body['weekday'] is None else [int(body['weekday'])]}
    initialise(c)
    c.execute('INSERT INTO tracker_schedules VALUES(?,?,?,?) ON CONFLICT(row_id) DO UPDATE SET weekdays_json=excluded.weekdays_json,interval_weeks=excluded.interval_weeks,anchor_monday=excluded.anchor_monday',(row_id,json.dumps(value['weekdays']),value['interval_weeks'],value['anchor_monday']))
    c.execute('UPDATE tracker_board_rows SET weekday=? WHERE id=?',(value['weekdays'][0] if len(value['weekdays'])==1 else None,row_id))


def applies(c,row,day):
    config=read(c,row)
    if day.weekday() not in config['weekdays']:return False
    if config['interval_weeks']==2:
        monday=day-timedelta(days=day.weekday())
        return ((monday-date.fromisoformat(config['anchor_monday'])).days//7)%2==0
    return True


def copy(c,source,target):
    try:c.execute('INSERT OR REPLACE INTO tracker_schedules SELECT ?,weekdays_json,interval_weeks,anchor_monday FROM tracker_schedules WHERE row_id=?',(target,source))
    except Exception as exc:
        import sqlite3
        if not isinstance(exc,sqlite3.OperationalError) or 'no such table' not in str(exc):raise
