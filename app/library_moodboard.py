"""Domain moodboards: additive SQLite storage, bounded content and revision leases."""
import base64
import json
import math
import re
from urllib.parse import urlparse

MAX_BYTES = 8_000_000
COLORS = {'paper', 'sage', 'lilac', 'sand', 'rose', 'blue'}


class Conflict(ValueError):
    pass


def initialise(conn):
    conn.execute('''CREATE TABLE IF NOT EXISTS library_moodboards (
        domain_id INTEGER PRIMARY KEY REFERENCES objective_nodes(id) ON DELETE CASCADE,
        revision INTEGER NOT NULL DEFAULT 0,
        items_json TEXT NOT NULL DEFAULT '[]',
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )''')


def _domain(conn, domain_id):
    row = conn.execute("SELECT id FROM objective_nodes WHERE id=? AND node_type='domain'", (domain_id,)).fetchone()
    if not row:
        raise ValueError('Domaine introuvable.')


def get(conn, domain_id):
    _domain(conn, domain_id)
    row = conn.execute('SELECT revision,items_json FROM library_moodboards WHERE domain_id=?', (domain_id,)).fetchone()
    return {'domain_id': domain_id, 'revision': row['revision'] if row else 0,
            'items': json.loads(row['items_json']) if row else []}


def _number(item, field, low, high, default):
    value = item.get(field, default)
    if type(value) not in (int, float) or not math.isfinite(value) or not low <= value <= high:
        raise ValueError('Position ou taille invalide : ' + field)
    return round(value, 2)


def validate(items):
    if not isinstance(items, list) or len(items) > 100:
        raise ValueError('Le moodboard accepte au maximum 100 éléments.')
    checked, seen = [], set()
    for item in items:
        if not isinstance(item, dict):
            raise ValueError('Élément invalide.')
        ident = item.get('id')
        if not isinstance(ident, str) or not re.fullmatch(r'[A-Za-z0-9_-]{1,80}', ident) or ident in seen:
            raise ValueError('Identifiant invalide ou dupliqué.')
        seen.add(ident)
        kind = item.get('kind')
        if kind not in ('text', 'image', 'link') or item.get('color', 'paper') not in COLORS:
            raise ValueError('Type ou couleur invalide.')
        text = item.get('text', '')
        if not isinstance(text, str) or len(text) > 10000:
            raise ValueError('Texte limité à 10 000 caractères par élément.')
        clean = {'id': ident, 'kind': kind, 'text': text, 'color': item.get('color', 'paper')}
        for field, low, high, default in [('x', 0, 10000, 24), ('y', 0, 20000, 24),
                                          ('w', 160, 1400, 280), ('h', 120, 1400, 220)]:
            clean[field] = _number(item, field, low, high, default)
        if kind == 'image':
            data = item.get('src', '')
            if not isinstance(data, str) or len(data) > 2_000_000 or not re.match(r'^data:image/(?:png|jpeg|webp);base64,', data):
                raise ValueError('Image PNG/JPEG/WebP invalide ou trop volumineuse.')
            try:
                binary = base64.b64decode(data.split(',', 1)[1], validate=True)
            except (ValueError, TypeError):
                raise ValueError('Image corrompue.')
            valid = (data.startswith('data:image/png;') and binary.startswith(b'\x89PNG\r\n\x1a\n') or
                     data.startswith('data:image/jpeg;') and binary.startswith(b'\xff\xd8\xff') or
                     data.startswith('data:image/webp;') and binary.startswith(b'RIFF') and binary[8:12] == b'WEBP')
            if not valid:
                raise ValueError('Le contenu du fichier ne correspond pas à une image prise en charge.')
            clean['src'] = data
        if kind == 'link':
            url = item.get('url', '')
            if not isinstance(url, str) or len(url) > 2000:
                raise ValueError('Lien invalide.')
            parsed = urlparse(url)
            if parsed.scheme not in ('http', 'https') or not parsed.netloc or parsed.username or parsed.password:
                raise ValueError('Utilise un lien Web http ou https sans identifiants.')
            clean['url'] = url
        checked.append(clean)
    raw = json.dumps(checked, ensure_ascii=False, separators=(',', ':'))
    if len(raw.encode('utf-8')) > MAX_BYTES:
        raise ValueError('Ce moodboard dépasse 8 Mo. Retire des images ou choisis des fichiers plus petits.')
    return raw


def save(conn, domain_id, revision, items):
    if type(revision) is not int or revision < 0:
        raise ValueError('Révision invalide.')
    raw = validate(items)
    conn.execute('BEGIN IMMEDIATE')
    _domain(conn, domain_id)
    existing = conn.execute('SELECT revision FROM library_moodboards WHERE domain_id=?', (domain_id,)).fetchone()
    current = existing['revision'] if existing else 0
    if current != revision:
        raise Conflict('Le moodboard a été modifié ailleurs. Tes changements sont conservés en brouillon.')
    conn.execute('''INSERT INTO library_moodboards(domain_id,revision,items_json) VALUES(?,?,?)
        ON CONFLICT(domain_id) DO UPDATE SET revision=excluded.revision,
        items_json=excluded.items_json,updated_at=CURRENT_TIMESTAMP''', (domain_id, current + 1, raw))
    return {'domain_id': domain_id, 'revision': current + 1}
