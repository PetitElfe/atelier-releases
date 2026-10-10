from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlparse, parse_qs
from pathlib import Path
import sqlite3, json, mimetypes, os, threading, webbrowser
from datetime import datetime, date, timedelta

ROOT = Path(__file__).resolve().parent
INSTALL_ROOT = ROOT.parent
PUBLIC = ROOT / 'public'
DATA = Path(os.environ.get('ATELIER_DATA_DIR', str(INSTALL_ROOT / 'data')))
DB_PATH = DATA / 'atelier.db'
HOST = '127.0.0.1'
PORT = 8765

DATA.mkdir(exist_ok=True)

SCHEMA = '''
PRAGMA foreign_keys = ON;
CREATE TABLE IF NOT EXISTS events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  event_date TEXT NOT NULL,
  start_time TEXT,
  end_time TEXT,
  all_day INTEGER NOT NULL DEFAULT 0,
  category TEXT NOT NULL DEFAULT 'general',
  location TEXT DEFAULT '',
  notes TEXT DEFAULT '',
  contact TEXT DEFAULT '',
  travel_time TEXT DEFAULT '',
  url TEXT DEFAULT '',
  status TEXT NOT NULL DEFAULT 'planned',
  recurrence TEXT NOT NULL DEFAULT 'none',
  show_in_month INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS tasks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  due_date TEXT,
  due_time TEXT,
  notes TEXT DEFAULT '',
  completed INTEGER NOT NULL DEFAULT 0,
  archived INTEGER NOT NULL DEFAULT 0,
  important INTEGER NOT NULL DEFAULT 0,
  order_index INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS reminders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  entity_type TEXT NOT NULL CHECK(entity_type IN ('event','task')),
  entity_id INTEGER NOT NULL,
  title TEXT DEFAULT '',
  remind_at TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  snoozed_until TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_events_date ON events(event_date);
CREATE INDEX IF NOT EXISTS idx_tasks_date ON tasks(due_date);
CREATE INDEX IF NOT EXISTS idx_reminders_time ON reminders(remind_at);
'''

def conn():
    c = sqlite3.connect(DB_PATH)
    c.row_factory = sqlite3.Row
    c.execute('PRAGMA foreign_keys = ON')
    return c

with conn() as c:
    c.executescript(SCHEMA)
    reminder_cols = {r['name'] for r in c.execute('PRAGMA table_info(reminders)').fetchall()}
    if 'title' not in reminder_cols:
        c.execute("ALTER TABLE reminders ADD COLUMN title TEXT DEFAULT ''")
    event_cols = {r['name'] for r in c.execute('PRAGMA table_info(events)').fetchall()}
    if 'travel_time' not in event_cols:
        c.execute("ALTER TABLE events ADD COLUMN travel_time TEXT DEFAULT ''")
    c.commit()


def now_iso():
    return datetime.now().replace(microsecond=0).isoformat()

def rowdict(row):
    return dict(row) if row else None

def expand_events(rows, start_s, end_s):
    try:
        start = date.fromisoformat(start_s)
        end = date.fromisoformat(end_s)
    except Exception:
        return [dict(r) for r in rows]
    out = []
    for r in rows:
        e = dict(r)
        base = date.fromisoformat(e['event_date'])
        recur = e.get('recurrence') or 'none'
        if recur == 'none':
            if start <= base <= end:
                e['instance_date'] = e['event_date']
                e['series_id'] = e['id']
                out.append(e)
            continue
        d = base
        # advance quickly enough for normal local use
        while d < start:
            if recur == 'daily': d += timedelta(days=1)
            elif recur == 'weekly': d += timedelta(days=7)
            elif recur == 'monthly':
                y = d.year + (1 if d.month == 12 else 0)
                m = 1 if d.month == 12 else d.month + 1
                day = min(d.day, [31,29 if y%4==0 and (y%100!=0 or y%400==0) else 28,31,30,31,30,31,31,30,31,30,31][m-1])
                d = date(y,m,day)
            else: break
        guard = 0
        while d <= end and guard < 500:
            ee = dict(e)
            ee['instance_date'] = d.isoformat()
            ee['series_id'] = e['id']
            out.append(ee)
            if recur == 'daily': d += timedelta(days=1)
            elif recur == 'weekly': d += timedelta(days=7)
            elif recur == 'monthly':
                y = d.year + (1 if d.month == 12 else 0)
                m = 1 if d.month == 12 else d.month + 1
                day = min(d.day, [31,29 if y%4==0 and (y%100!=0 or y%400==0) else 28,31,30,31,30,31,31,30,31,30,31][m-1])
                d = date(y,m,day)
            else: break
            guard += 1
    return out
