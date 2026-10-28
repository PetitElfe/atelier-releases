from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlparse, parse_qs
from urllib.request import Request, urlopen, build_opener, HTTPRedirectHandler
from pathlib import Path
from calendar import monthrange
import sqlite3, json, mimetypes, os, threading, webbrowser, re, html, socket, ipaddress, shutil, math
from datetime import datetime, date, timedelta
import progression, objective_maps, updater, desktop_postits, event_preparations, quick_capture_native

ROOT = Path(__file__).resolve().parent
INSTALL_ROOT = ROOT.parent
PUBLIC = ROOT / 'public'
DATA = Path(os.environ.get('ATELIER_DATA_DIR', str(INSTALL_ROOT / 'data')))
DB_PATH = DATA / 'atelier.db'
HOST = '127.0.0.1'
PORT = int(os.environ.get('ATELIER_PORT', '8765'))
SCHEMA_VERSION = 13

def atelier_version():
    version_file = ROOT / 'VERSION'
    try:
        return version_file.read_text(encoding='utf-8').strip() if version_file.exists() else '0.0.5'
    except Exception:
        return '0.0.5'

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
  color TEXT NOT NULL DEFAULT 'auto',
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
  objective_node_id INTEGER,
  order_index INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS reminders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  entity_type TEXT NOT NULL CHECK(entity_type IN ('event','task','standalone')),
  entity_id INTEGER NOT NULL,
  title TEXT DEFAULT '',
  remind_at TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  snoozed_until TEXT,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS event_completions (
  event_id INTEGER NOT NULL,
  instance_date TEXT NOT NULL,
  completed_at TEXT NOT NULL,
  PRIMARY KEY(event_id, instance_date)
);
CREATE TABLE IF NOT EXISTS event_instance_actions (
  event_id INTEGER NOT NULL,
  instance_date TEXT NOT NULL,
  action TEXT NOT NULL,
  moved_event_id INTEGER,
  action_at TEXT NOT NULL,
  PRIMARY KEY(event_id, instance_date)
);
CREATE TABLE IF NOT EXISTS shopping_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  quantity TEXT DEFAULT '',
  purchase_count INTEGER NOT NULL DEFAULT 1,
  price REAL,
  calories REAL,
  checked INTEGER NOT NULL DEFAULT 0,
  archived INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS food_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  quantity TEXT DEFAULT '',
  units_count INTEGER NOT NULL DEFAULT 1,
  price REAL,
  calories REAL,
  expiry_date TEXT,
  expiry_mode TEXT NOT NULL DEFAULT 'pending',
  notes TEXT DEFAULT '',
  status TEXT NOT NULL DEFAULT 'active',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS meal_ideas (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  notes TEXT DEFAULT '',
  recipe TEXT DEFAULT '',
  base_servings INTEGER NOT NULL DEFAULT 4,
  ingredients_json TEXT DEFAULT '[]',
  image_data TEXT DEFAULT '',
  archived INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS recipe_books (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL COLLATE NOCASE UNIQUE,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS recipes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  legacy_meal_id INTEGER UNIQUE,
  title TEXT NOT NULL,
  book_id INTEGER,
  notes TEXT DEFAULT '',
  recipe TEXT DEFAULT '',
  base_servings INTEGER NOT NULL DEFAULT 1,
  ingredients_json TEXT DEFAULT '[]',
  image_data TEXT DEFAULT '',
  source_url TEXT DEFAULT '',
  archived INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY(book_id) REFERENCES recipe_books(id)
);
CREATE TABLE IF NOT EXISTS meal_idea_links (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  recipe_id INTEGER NOT NULL UNIQUE,
  created_at TEXT NOT NULL,
  FOREIGN KEY(recipe_id) REFERENCES recipes(id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS objective_nodes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  parent_id INTEGER,
  node_type TEXT NOT NULL CHECK(node_type IN ('domain','objective','milestone','step')),
  title TEXT NOT NULL,
  description TEXT DEFAULT '',
  status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','paused','done')),
  progress INTEGER NOT NULL DEFAULT 0,
  order_index INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY(parent_id) REFERENCES objective_nodes(id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS objective_library_sections (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  node_id INTEGER NOT NULL,
  title TEXT NOT NULL,
  section_type TEXT NOT NULL DEFAULT 'resources',
  order_index INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY(node_id) REFERENCES objective_nodes(id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS objective_library_entries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  section_id INTEGER NOT NULL,
  title TEXT NOT NULL,
  url TEXT DEFAULT '',
  notes TEXT DEFAULT '',
  done INTEGER NOT NULL DEFAULT 0,
  order_index INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY(section_id) REFERENCES objective_library_sections(id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS habits (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 title TEXT NOT NULL,
 frequency TEXT NOT NULL DEFAULT 'daily' CHECK(frequency IN ('daily','weekly')),
 target_per_week INTEGER NOT NULL DEFAULT 7,
 archived INTEGER NOT NULL DEFAULT 0,
 created_at TEXT NOT NULL,
 updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS habit_checks (
 habit_id INTEGER NOT NULL,
 checked_date TEXT NOT NULL,
 completed_at TEXT NOT NULL,
 PRIMARY KEY(habit_id,checked_date),
 FOREIGN KEY(habit_id) REFERENCES habits(id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS menstrual_periods (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 start_date TEXT NOT NULL,
 end_date TEXT,
 notes TEXT NOT NULL DEFAULT '',
 created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_habit_checks_date ON habit_checks(checked_date);
CREATE TABLE IF NOT EXISTS budget_settings (
 id INTEGER PRIMARY KEY CHECK(id=1), opening_balance_cents INTEGER NOT NULL DEFAULT 0,
 opening_date TEXT NOT NULL DEFAULT '2026-01-01'
);
CREATE TABLE IF NOT EXISTS budget_rules (
 id INTEGER PRIMARY KEY AUTOINCREMENT, kind TEXT NOT NULL CHECK(kind IN ('income','fixed')),
 title TEXT NOT NULL, category TEXT NOT NULL DEFAULT 'Général',
 amount_cents INTEGER NOT NULL CHECK(amount_cents>=0),
 day_of_month INTEGER NOT NULL CHECK(day_of_month BETWEEN 1 AND 31),
 start_date TEXT NOT NULL, end_date TEXT, active INTEGER NOT NULL DEFAULT 1,
 created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS budget_debts (
 id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT NOT NULL, total_cents INTEGER NOT NULL CHECK(total_cents>0),
 monthly_cents INTEGER NOT NULL CHECK(monthly_cents>0),
 day_of_month INTEGER NOT NULL CHECK(day_of_month BETWEEN 1 AND 31),
 start_date TEXT NOT NULL, end_date TEXT, archived INTEGER NOT NULL DEFAULT 0,
 created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS budget_entries (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 rule_id INTEGER, debt_id INTEGER, scheduled_date TEXT NOT NULL,
 title TEXT NOT NULL, kind TEXT NOT NULL CHECK(kind IN ('income','expense')),
 category TEXT NOT NULL DEFAULT 'Général', amount_cents INTEGER NOT NULL CHECK(amount_cents>=0),
 status TEXT NOT NULL CHECK(status IN ('pending','presumed','confirmed','skipped')),
 source TEXT NOT NULL CHECK(source IN ('scheduled','manual')),
 actual_date TEXT, notes TEXT DEFAULT '', created_at TEXT NOT NULL,
 UNIQUE(rule_id, scheduled_date), UNIQUE(debt_id, scheduled_date)
);
CREATE TABLE IF NOT EXISTS budget_month_notes (
 month TEXT PRIMARY KEY, notes TEXT NOT NULL DEFAULT ''
);
-- Notes de l'Accueil : texte dans SQLite pour les sauvegardes, pas dans localStorage.
CREATE TABLE IF NOT EXISTS home_postits (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 title TEXT NOT NULL,
 body TEXT NOT NULL DEFAULT '',
 color TEXT NOT NULL DEFAULT 'gold',
 shape TEXT NOT NULL DEFAULT 'rounded',
 archived INTEGER NOT NULL DEFAULT 0,
 created_at TEXT NOT NULL,
 updated_at TEXT NOT NULL
);
-- Positions des fenêtres Post-it sur le Bureau Windows : sauvegardées avec SQLite.
CREATE TABLE IF NOT EXISTS desktop_postit_layout(
 note_id INTEGER PRIMARY KEY REFERENCES home_postits(id) ON DELETE CASCADE,
 x INTEGER NOT NULL,
 y INTEGER NOT NULL,
 width INTEGER NOT NULL,
 height INTEGER NOT NULL,
 locked INTEGER NOT NULL DEFAULT 0 CHECK(locked IN (0,1))
);
CREATE INDEX IF NOT EXISTS idx_home_postits_archived ON home_postits(archived,id);
CREATE INDEX IF NOT EXISTS idx_budget_entries_date ON budget_entries(scheduled_date);
CREATE INDEX IF NOT EXISTS idx_menstrual_period_start ON menstrual_periods(start_date);
CREATE INDEX IF NOT EXISTS idx_events_date ON events(event_date);
CREATE INDEX IF NOT EXISTS idx_tasks_date ON tasks(due_date);
CREATE INDEX IF NOT EXISTS idx_reminders_time ON reminders(remind_at);
CREATE INDEX IF NOT EXISTS idx_food_expiry ON food_items(expiry_date);
CREATE INDEX IF NOT EXISTS idx_shopping_checked ON shopping_items(checked);
CREATE INDEX IF NOT EXISTS idx_event_completions_date ON event_completions(instance_date);
CREATE INDEX IF NOT EXISTS idx_event_instance_actions_date ON event_instance_actions(instance_date);
CREATE INDEX IF NOT EXISTS idx_recipes_book ON recipes(book_id, archived);
CREATE INDEX IF NOT EXISTS idx_meal_idea_links_recipe ON meal_idea_links(recipe_id);
CREATE INDEX IF NOT EXISTS idx_objective_parent ON objective_nodes(parent_id, order_index);
CREATE INDEX IF NOT EXISTS idx_objective_library_node ON objective_library_sections(node_id, order_index);
CREATE INDEX IF NOT EXISTS idx_objective_library_section ON objective_library_entries(section_id, order_index);
-- Carnet de bord, trackers et administratif : données locales, séparées par installation.
CREATE TABLE IF NOT EXISTS personal_trackers (
 id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT NOT NULL,
 unit TEXT NOT NULL DEFAULT '', target REAL, archived INTEGER NOT NULL DEFAULT 0,
 created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS personal_tracker_entries (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 tracker_id INTEGER NOT NULL REFERENCES personal_trackers(id) ON DELETE CASCADE,
 entry_date TEXT NOT NULL, value REAL NOT NULL, notes TEXT NOT NULL DEFAULT '',
 created_at TEXT NOT NULL,
 UNIQUE(tracker_id,entry_date)
);
CREATE INDEX IF NOT EXISTS idx_tracker_entries ON personal_tracker_entries(tracker_id,entry_date);
-- Tableaux de suivi façon bullet journal : distincts des mesures historiques.
-- Chaque tableau contient des lignes et une marque par jour, conservées à l'archive.
CREATE TABLE IF NOT EXISTS tracker_boards (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 title TEXT NOT NULL,
 color TEXT NOT NULL DEFAULT 'sage',
 period_unit TEXT NOT NULL DEFAULT 'months' CHECK(period_unit IN ('days','weeks','months','years')),
 period_count INTEGER NOT NULL DEFAULT 1 CHECK(period_count BETWEEN 1 AND 90),
 anchor_date TEXT NOT NULL DEFAULT '2000-01-01',
 archived INTEGER NOT NULL DEFAULT 0,
 created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS tracker_board_rows (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 board_id INTEGER NOT NULL REFERENCES tracker_boards(id) ON DELETE CASCADE,
 title TEXT NOT NULL,
 mode TEXT NOT NULL DEFAULT 'check' CHECK(mode IN ('check','number')),
 order_index INTEGER NOT NULL DEFAULT 0,
 archived INTEGER NOT NULL DEFAULT 0,
 target_count INTEGER CHECK(target_count IS NULL OR target_count BETWEEN 1 AND 1000),
 weekday INTEGER CHECK(weekday IS NULL OR weekday BETWEEN 0 AND 6),
 linked_type TEXT NOT NULL DEFAULT '' CHECK(linked_type IN ('','task','objective','admin')),
 linked_id INTEGER,
 created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS tracker_row_steps (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 row_id INTEGER NOT NULL REFERENCES tracker_board_rows(id) ON DELETE CASCADE,
 title TEXT NOT NULL,
 order_index INTEGER NOT NULL DEFAULT 0,
 active INTEGER NOT NULL DEFAULT 1
);
CREATE TABLE IF NOT EXISTS tracker_row_step_checks (
 step_id INTEGER NOT NULL REFERENCES tracker_row_steps(id) ON DELETE CASCADE,
 day TEXT NOT NULL,
 PRIMARY KEY(step_id,day)
);
CREATE INDEX IF NOT EXISTS idx_tracker_steps ON tracker_row_steps(row_id,order_index,id);
CREATE TABLE IF NOT EXISTS tracker_board_marks (
 row_id INTEGER NOT NULL REFERENCES tracker_board_rows(id) ON DELETE CASCADE,
 day TEXT NOT NULL,
 value TEXT NOT NULL,
 updated_at TEXT NOT NULL,
 PRIMARY KEY(row_id,day)
);
CREATE INDEX IF NOT EXISTS idx_tracker_board_rows ON tracker_board_rows(board_id,archived,order_index,id);
CREATE INDEX IF NOT EXISTS idx_tracker_board_marks ON tracker_board_marks(day,row_id);
CREATE TABLE IF NOT EXISTS admin_documents (
 id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT NOT NULL,
 category TEXT NOT NULL DEFAULT 'Général', due_date TEXT,
 status TEXT NOT NULL DEFAULT 'todo' CHECK(status IN ('todo','waiting','done')),
 notes TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_admin_due ON admin_documents(status,due_date);
-- Préparatifs autonomes : listes indépendantes des rendez-vous et des Trackers.
-- Pas de conversion automatique : chaque source reste distincte et retrouvable.
CREATE TABLE IF NOT EXISTS standalone_preparation_lists (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 title TEXT NOT NULL,
 due_date TEXT,
 archived INTEGER NOT NULL DEFAULT 0,
 created_at TEXT NOT NULL,
 updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS standalone_preparation_items (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 list_id INTEGER NOT NULL REFERENCES standalone_preparation_lists(id) ON DELETE CASCADE,
 title TEXT NOT NULL,
 done INTEGER NOT NULL DEFAULT 0,
 archived INTEGER NOT NULL DEFAULT 0,
 order_index INTEGER NOT NULL DEFAULT 0,
 created_at TEXT NOT NULL,
 updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_standalone_prep_lists
 ON standalone_preparation_lists(archived,due_date,id);
CREATE INDEX IF NOT EXISTS idx_standalone_prep_items
 ON standalone_preparation_items(list_id,archived,order_index,id);
CREATE TABLE IF NOT EXISTS quick_captures (
 id INTEGER PRIMARY KEY AUTOINCREMENT, destination TEXT NOT NULL,
 body TEXT NOT NULL, seen INTEGER NOT NULL DEFAULT 0,
 created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_quick_capture_unread ON quick_captures(destination,seen);


'''

def conn():
    c = sqlite3.connect(DB_PATH, timeout=5)
    c.row_factory = sqlite3.Row
    c.execute('PRAGMA foreign_keys = ON')
    c.execute('PRAGMA busy_timeout = 5000')
    return c

def _backup_db_before_migration():
    if not DB_PATH.exists() or DB_PATH.stat().st_size == 0:
        return
    try:
        probe = sqlite3.connect(DB_PATH, timeout=2)
        current = int(probe.execute('PRAGMA user_version').fetchone()[0] or 0)
        probe.close()
    except Exception:
        current = 0
    if current >= SCHEMA_VERSION:
        return
    backup_dir = DATA / 'backups'
    backup_dir.mkdir(parents=True, exist_ok=True)
    stamp = datetime.now().strftime('%Y%m%d-%H%M%S-%f')
    target = backup_dir / f'atelier-before-schema-{SCHEMA_VERSION}-{stamp}.db'
    source = sqlite3.connect(DB_PATH, timeout=5)
    destination = sqlite3.connect(target)
    try:
        source.backup(destination)
    finally:
        destination.close()
        source.close()
    backups = sorted(backup_dir.glob('atelier-before-schema-*.db'), key=lambda p: p.stat().st_mtime, reverse=True)
    for old in backups[5:]:
        try:
            old.unlink()
        except Exception:
            pass

_backup_db_before_migration()

with conn() as c:
    c.execute('PRAGMA journal_mode = WAL')
    c.executescript(SCHEMA)
    progression.initialise(c)
    objective_maps.initialise(c)
    event_preparations.initialise(c)
    # Première activation uniquement : créer un Post-it vide « Aujourd'hui ».
    # Ne jamais recréer une note que l'utilisateur a archivée ou supprimée.
    if not c.execute('SELECT 1 FROM home_postits LIMIT 1').fetchone():
        first_time = c.execute('PRAGMA user_version').fetchone()[0] < 5
        if first_time:
            timestamp = datetime.now().replace(microsecond=0).isoformat()
            c.execute('INSERT INTO home_postits(title,body,color,shape,archived,created_at,updated_at) VALUES(?,?,?,?,0,?,?)',
                      ("Aujourd'hui", '', 'gold', 'rounded', timestamp, timestamp))
    layout_cols = {r['name'] for r in c.execute('PRAGMA table_info(desktop_postit_layout)').fetchall()}
    if 'locked' not in layout_cols:
        c.execute('ALTER TABLE desktop_postit_layout ADD COLUMN locked INTEGER NOT NULL DEFAULT 0')
    reminder_cols = {r['name'] for r in c.execute('PRAGMA table_info(reminders)').fetchall()}
    if 'title' not in reminder_cols:
        c.execute("ALTER TABLE reminders ADD COLUMN title TEXT DEFAULT ''")
    reminder_sql = (c.execute("SELECT sql FROM sqlite_master WHERE type='table' AND name='reminders'").fetchone() or [''])[0] or ''
    if "'standalone'" not in reminder_sql:
        c.executescript("""
        CREATE TABLE reminders__new (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          entity_type TEXT NOT NULL CHECK(entity_type IN ('event','task','standalone')),
          entity_id INTEGER NOT NULL,
          title TEXT DEFAULT '',
          remind_at TEXT NOT NULL,
          status TEXT NOT NULL DEFAULT 'pending',
          snoozed_until TEXT,
          created_at TEXT NOT NULL
        );
        INSERT INTO reminders__new(id,entity_type,entity_id,title,remind_at,status,snoozed_until,created_at)
          SELECT id,entity_type,entity_id,title,remind_at,status,snoozed_until,created_at FROM reminders;
        DROP TABLE reminders;
        ALTER TABLE reminders__new RENAME TO reminders;
        CREATE INDEX IF NOT EXISTS idx_reminders_time ON reminders(remind_at);
        """)
    task_cols = {r['name'] for r in c.execute('PRAGMA table_info(tasks)').fetchall()}
    if 'objective_node_id' not in task_cols:
        c.execute("ALTER TABLE tasks ADD COLUMN objective_node_id INTEGER")

    event_cols = {r['name'] for r in c.execute('PRAGMA table_info(events)').fetchall()}
    if 'travel_time' not in event_cols:
        c.execute("ALTER TABLE events ADD COLUMN travel_time TEXT DEFAULT ''")
    if 'color' not in event_cols:
        c.execute("ALTER TABLE events ADD COLUMN color TEXT NOT NULL DEFAULT 'auto'")
    shopping_cols = {r['name'] for r in c.execute('PRAGMA table_info(shopping_items)').fetchall()}
    if 'purchase_count' not in shopping_cols:
        c.execute("ALTER TABLE shopping_items ADD COLUMN purchase_count INTEGER NOT NULL DEFAULT 1")
    if 'price' not in shopping_cols:
        c.execute("ALTER TABLE shopping_items ADD COLUMN price REAL")
    if 'calories' not in shopping_cols:
        c.execute("ALTER TABLE shopping_items ADD COLUMN calories REAL")
    food_cols = {r['name'] for r in c.execute('PRAGMA table_info(food_items)').fetchall()}
    if 'units_count' not in food_cols:
        c.execute("ALTER TABLE food_items ADD COLUMN units_count INTEGER NOT NULL DEFAULT 1")
    if 'price' not in food_cols:
        c.execute("ALTER TABLE food_items ADD COLUMN price REAL")
    if 'calories' not in food_cols:
        c.execute("ALTER TABLE food_items ADD COLUMN calories REAL")
    if 'expiry_mode' not in food_cols:
        c.execute("ALTER TABLE food_items ADD COLUMN expiry_mode TEXT NOT NULL DEFAULT 'pending'")
        c.execute("UPDATE food_items SET expiry_mode=CASE WHEN expiry_date IS NOT NULL AND expiry_date<>'' THEN 'date' ELSE 'none' END")
    meal_cols = {r['name'] for r in c.execute('PRAGMA table_info(meal_ideas)').fetchall()}
    if 'recipe' not in meal_cols:
        c.execute("ALTER TABLE meal_ideas ADD COLUMN recipe TEXT DEFAULT ''")
    if 'base_servings' not in meal_cols:
        c.execute("ALTER TABLE meal_ideas ADD COLUMN base_servings INTEGER NOT NULL DEFAULT 4")
    if 'ingredients_json' not in meal_cols:
        c.execute("ALTER TABLE meal_ideas ADD COLUMN ingredients_json TEXT DEFAULT '[]'")
    if 'image_data' not in meal_cols:
        c.execute("ALTER TABLE meal_ideas ADD COLUMN image_data TEXT DEFAULT ''")
    recipe_cols = {r['name'] for r in c.execute('PRAGMA table_info(recipes)').fetchall()}
    if 'source_url' not in recipe_cols:
        c.execute("ALTER TABLE recipes ADD COLUMN source_url TEXT DEFAULT ''")

    migration_ts = datetime.now().replace(microsecond=0).isoformat()
    for book_name in ('À classer', 'Salé', 'Sucré', 'Sauces'):
        c.execute('INSERT OR IGNORE INTO recipe_books(name,created_at) VALUES(?,?)', (book_name,migration_ts))
    default_book = c.execute("SELECT id FROM recipe_books WHERE name='À classer'").fetchone()
    if default_book:
        c.execute('''INSERT OR IGNORE INTO recipes(
                       legacy_meal_id,title,book_id,notes,recipe,base_servings,ingredients_json,image_data,archived,created_at,updated_at
                     )
                     SELECT id,title,?,notes,recipe,
                            CASE WHEN base_servings IS NULL OR base_servings < 1 THEN 1 ELSE base_servings END,
                            ingredients_json,image_data,archived,created_at,updated_at
                     FROM meal_ideas''', (default_book['id'],))
        c.execute('''INSERT OR IGNORE INTO meal_idea_links(recipe_id,created_at)
                     SELECT id,COALESCE(created_at,?) FROM recipes WHERE legacy_meal_id IS NOT NULL''',
                  (migration_ts,))

    # 0.5.4 : la Potiflette générée pour les tests utilise un potimarron entier,
    # pas 800 g. On ne touche qu'à cette recette d'exemple connue.
    demo_rows=c.execute("SELECT id,ingredients_json FROM recipes WHERE title='Potiflette — recette de test'").fetchall()
    for demo in demo_rows:
        try:
            ingredients=json.loads(demo['ingredients_json'] or '[]')
            changed=False
            for ing in ingredients:
                if str(ing.get('name','')).strip().lower()=='potimarron' and str(ing.get('quantity','')).strip()=='800' and str(ing.get('unit','')).strip().lower()=='g':
                    ing['quantity']='1'; ing['unit']=''; changed=True
            if changed:
                c.execute('UPDATE recipes SET ingredients_json=?,updated_at=? WHERE id=?',
                          (json.dumps(ingredients,ensure_ascii=False),migration_ts,demo['id']))
        except Exception:
            pass

    # 0.5.5 : les imports 0.5.4 plaçaient « Source : URL » dans la petite note.
    # On extrait ce lien vers son vrai champ, sans perdre le reste de la note.
    for row in c.execute("SELECT id,notes,source_url FROM recipes").fetchall():
        if (row['source_url'] or '').strip():
            continue
        notes=row['notes'] or ''
        match=re.search(r'(?mi)^\s*Source\s*:\s*(https?://\S+)\s*$', notes)
        if match:
            source_url=match.group(1).strip()
            cleaned=(notes[:match.start()]+notes[match.end():]).strip()
            c.execute('UPDATE recipes SET source_url=?,notes=?,updated_at=? WHERE id=?',
                      (source_url,cleaned,migration_ts,row['id']))
    # 0.18.0: add independent recurring periods to existing tracker boards.
    # Old monthly boards keep their calendar alignment and ALL their marks.
    existing={row['name'] for row in c.execute('PRAGMA table_info(tracker_boards)')}
    for column,specification in (
        ('period_unit', "TEXT NOT NULL DEFAULT 'months'"),
        ('period_count', 'INTEGER NOT NULL DEFAULT 1'),
        ('anchor_date', "TEXT NOT NULL DEFAULT '2000-01-01'"),
    ):
        if column not in existing:
            c.execute(f'ALTER TABLE tracker_boards ADD COLUMN {column} {specification}')
    # 0.18.0: opt-in ritual steps, positive counters and weekly day restrictions.
    # Preserve every existing mark and all earlier standalone preparation data.
    row_columns={r['name'] for r in c.execute('PRAGMA table_info(tracker_board_rows)')}
    for column,definition in (
        ('target_count','INTEGER'),
        ('weekday','INTEGER'),
        ('linked_type',"TEXT NOT NULL DEFAULT ''"),
        ('linked_id','INTEGER'),
    ):
        if column not in row_columns:
            c.execute(f'ALTER TABLE tracker_board_rows ADD COLUMN {column} {definition}')
    c.execute(f'PRAGMA user_version = {SCHEMA_VERSION}')
    c.commit()



def now_iso():
    return datetime.now().replace(microsecond=0).isoformat()

def rowdict(row):
    return dict(row) if row else None

def float_or_none(value):
    try:
        if value is None or str(value).strip() == '':
            return None
        return float(str(value).replace(',', '.'))
    except Exception:
        return None

def int_or_none(value):
    try:
        if value is None or str(value).strip() == '':
            return None
        return int(value)
    except Exception:
        return None


def _recipe_type_is_recipe(value):
    if isinstance(value, str):
        return value.lower() == 'recipe'
    if isinstance(value, list):
        return any(_recipe_type_is_recipe(v) for v in value)
    return False

def _find_recipe_schema(value):
    if isinstance(value, dict):
        if _recipe_type_is_recipe(value.get('@type')):
            return value
        for key in ('@graph', 'mainEntity', 'mainEntityOfPage', 'itemListElement'):
            if key in value:
                found = _find_recipe_schema(value[key])
                if found: return found
        for child in value.values():
            found = _find_recipe_schema(child)
            if found: return found
    elif isinstance(value, list):
        for child in value:
            found = _find_recipe_schema(child)
            if found: return found
    return None

def _recipe_instructions_text(value):
    out=[]
    def walk(v):
        if isinstance(v, str):
            s=v.strip()
            if s: out.append(s)
        elif isinstance(v, dict):
            text=(v.get('text') or '').strip() if isinstance(v.get('text'),str) else ''
            if text: out.append(text)
            if 'itemListElement' in v: walk(v['itemListElement'])
        elif isinstance(v, list):
            for x in v: walk(x)
    walk(value)
    return '\n'.join(out)

def _recipe_image_url(value):
    if isinstance(value, str): return value.strip()
    if isinstance(value, list):
        for x in value:
            u=_recipe_image_url(x)
            if u: return u
    if isinstance(value, dict):
        for k in ('url','contentUrl'):
            if isinstance(value.get(k),str) and value[k].strip(): return value[k].strip()
    return ''

def _recipe_servings(value):
    if isinstance(value, (int,float)):
        return max(1,int(value))
    if isinstance(value, list):
        for x in value:
            n=_recipe_servings(x)
            if n: return n
    if isinstance(value, str):
        m=re.search(r'\d+', value)
        if m: return max(1,int(m.group(0)))
    return 1

def _validate_recipe_url(raw_url):
    raw=(raw_url or '').strip()
    u=urlparse(raw)
    if u.scheme not in ('http','https') or not u.hostname:
        raise ValueError('Colle une URL http ou https valide.')
    try:
        infos=socket.getaddrinfo(u.hostname, u.port or (443 if u.scheme=='https' else 80), type=socket.SOCK_STREAM)
        for info in infos:
            ip=ipaddress.ip_address(info[4][0])
            if ip.is_private or ip.is_loopback or ip.is_link_local or ip.is_multicast or ip.is_reserved or ip.is_unspecified:
                raise ValueError('Cette adresse locale ou privée ne peut pas être importée.')
    except ValueError:
        raise
    except Exception:
        raise ValueError('Impossible de résoudre cette adresse.')
    return raw

class _SafeRecipeRedirectHandler(HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        _validate_recipe_url(newurl)
        return super().redirect_request(req, fp, code, msg, headers, newurl)

def import_recipe_from_url(raw_url):
    url=_validate_recipe_url(raw_url)
    req=Request(url, headers={
        'User-Agent':'Mozilla/5.0 (LAtelier recipe importer)',
        'Accept':'text/html,application/xhtml+xml'
    })
    opener=build_opener(_SafeRecipeRedirectHandler())
    with opener.open(req, timeout=10) as response:
        final_url=response.geturl()
        _validate_recipe_url(final_url)
        length=response.headers.get('Content-Length')
        if length and int(length)>3_000_000:
            raise ValueError('La page est trop volumineuse pour être importée.')
        raw=response.read(3_000_001)
        if len(raw)>3_000_000:
            raise ValueError('La page est trop volumineuse pour être importée.')
        charset=response.headers.get_content_charset() or 'utf-8'
    page=raw.decode(charset, errors='replace')
    scripts=re.findall(r'<script\b[^>]*type=["\']application/ld\+json["\'][^>]*>(.*?)</script\s*>', page, flags=re.I|re.S)
    recipe=None
    for blob in scripts:
        try:
            data=json.loads(html.unescape(blob).strip())
        except Exception:
            continue
        recipe=_find_recipe_schema(data)
        if recipe: break
    if not recipe:
        raise ValueError("Je n’ai pas trouvé de recette structurée sur cette page. Essaie une autre recette ou ajoute-la manuellement.")
    title=str(recipe.get('name') or '').strip()
    if not title:
        raise ValueError("La page contient une recette, mais son titre n’a pas pu être lu.")
    ingredients=recipe.get('recipeIngredient') or recipe.get('ingredients') or []
    if isinstance(ingredients,str): ingredients=[ingredients]
    ingredients=[str(x).strip() for x in ingredients if str(x).strip()]
    description=html.unescape(str(recipe.get('description') or '')).strip()
    description=re.sub(r'<[^>]+>',' ',description)
    description=re.sub(r'\s+',' ',description).strip()
    instructions=_recipe_instructions_text(recipe.get('recipeInstructions') or recipe.get('instructions') or '')
    return {
        'source_url': final_url,
        'title': title,
        'base_servings': _recipe_servings(recipe.get('recipeYield')),
        'ingredients': ingredients,
        'recipe': instructions,
        'notes': description[:800],
        'image_data': _recipe_image_url(recipe.get('image'))
    }

def _next_recurrence_date(current, recurrence, anchor_day):
    if recurrence == 'daily':
        return current + timedelta(days=1)
    if recurrence == 'weekly':
        return current + timedelta(days=7)
    if recurrence == 'monthly':
        year = current.year + (1 if current.month == 12 else 0)
        month = 1 if current.month == 12 else current.month + 1
        return date(year, month, min(anchor_day, monthrange(year, month)[1]))
    return None

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
        anchor_day = base.day
        while d < start:
            nxt = _next_recurrence_date(d, recur, anchor_day)
            if not nxt: break
            d = nxt
        guard = 0
        while d <= end and guard < 500:
            ee = dict(e)
            ee['instance_date'] = d.isoformat()
            ee['series_id'] = e['id']
            out.append(ee)
            nxt = _next_recurrence_date(d, recur, anchor_day)
            if not nxt: break
            d = nxt
            guard += 1
    return out
