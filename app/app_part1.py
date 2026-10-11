from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlparse, parse_qs
from urllib.request import Request, urlopen
from pathlib import Path
import sqlite3, json, mimetypes, os, threading, webbrowser, re, html, socket, ipaddress
from datetime import datetime, date, timedelta

ROOT = Path(__file__).resolve().parent
INSTALL_ROOT = ROOT.parent
PUBLIC = ROOT / 'public'
DATA = Path(os.environ.get('ATELIER_DATA_DIR', str(INSTALL_ROOT / 'data')))
DB_PATH = DATA / 'atelier.db'
HOST = '127.0.0.1'
PORT = 8765

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
CREATE INDEX IF NOT EXISTS idx_events_date ON events(event_date);
CREATE INDEX IF NOT EXISTS idx_tasks_date ON tasks(due_date);
CREATE INDEX IF NOT EXISTS idx_reminders_time ON reminders(remind_at);
CREATE INDEX IF NOT EXISTS idx_food_expiry ON food_items(expiry_date);
CREATE INDEX IF NOT EXISTS idx_shopping_checked ON shopping_items(checked);
CREATE INDEX IF NOT EXISTS idx_event_completions_date ON event_completions(instance_date);
CREATE INDEX IF NOT EXISTS idx_event_instance_actions_date ON event_instance_actions(instance_date);
CREATE INDEX IF NOT EXISTS idx_recipes_book ON recipes(book_id, archived);
CREATE INDEX IF NOT EXISTS idx_meal_idea_links_recipe ON meal_idea_links(recipe_id);

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

def import_recipe_from_url(raw_url):
    url=_validate_recipe_url(raw_url)
    req=Request(url, headers={
        'User-Agent':'Mozilla/5.0 (LAtelier recipe importer)',
        'Accept':'text/html,application/xhtml+xml'
    })
    with urlopen(req, timeout=10) as response:
        final_url=response.geturl()
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
        raise ValueError("Je n’ai pas trouvé de recette structurée sur cette page. Essaie le copier-coller du texte.")
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
