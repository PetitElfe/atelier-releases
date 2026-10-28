"""Pièces jointes administratives locales : données BLOB en SQLite, aucun chemin client exécuté."""
import base64
import binascii
import re
from pathlib import PurePath

MAX_ATTACHMENT_BYTES = 4 * 1024 * 1024
MAX_ATTACHMENT_REQUEST = 6 * 1024 * 1024
ALLOWED_TYPES = {'.pdf': 'application/pdf', '.png': 'image/png',
                 '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.txt': 'text/plain'}


def initialise(c):
    c.executescript("""
    CREATE TABLE IF NOT EXISTS admin_attachments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      admin_id INTEGER NOT NULL REFERENCES admin_documents(id) ON DELETE CASCADE,
      filename TEXT NOT NULL,
      mime_type TEXT NOT NULL,
      byte_size INTEGER NOT NULL,
      content BLOB NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_admin_attachments ON admin_attachments(admin_id,id);
    CREATE TABLE IF NOT EXISTS event_attachments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      event_id INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
      filename TEXT NOT NULL,
      mime_type TEXT NOT NULL,
      byte_size INTEGER NOT NULL,
      content BLOB NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_event_attachments ON event_attachments(event_id,id);
    """)


def filename_and_bytes(filename, mime, encoded):
    if not isinstance(filename, str) or not isinstance(encoded, str):
        raise ValueError('Nom et fichier requis.')
    # Ne jamais faire confiance aux chemins transmis par un navigateur.
    name = filename.strip()
    if not name or len(name) > 180 or '/' in name or '\\' in name or '\x00' in name:
        raise ValueError('Nom de fichier invalide.')
    if name in ('.', '..') or any(ord(ch) < 32 for ch in name):
        raise ValueError('Nom de fichier invalide.')
    suffix = PurePath(name).suffix.lower()
    expected_mime = ALLOWED_TYPES.get(suffix)
    if not expected_mime or mime != expected_mime:
        raise ValueError('Formats acceptés : PDF, PNG, JPEG et TXT.')
    if len(encoded) > (MAX_ATTACHMENT_BYTES * 4 // 3 + 8):
        raise ValueError('Fichier trop volumineux (4 Mo maximum).')
    try:
        content = base64.b64decode(encoded, validate=True)
    except (binascii.Error, ValueError) as exc:
        raise ValueError('Contenu du fichier invalide.') from exc
    if not content or len(content) > MAX_ATTACHMENT_BYTES:
        raise ValueError('Fichier vide ou trop volumineux (4 Mo maximum).')
    if suffix == '.pdf' and not content.startswith(b'%PDF-'):
        raise ValueError('Le contenu ne correspond pas à un PDF.')
    if suffix == '.png' and not content.startswith(b'\x89PNG\r\n\x1a\n'):
        raise ValueError('Le contenu ne correspond pas à un PNG.')
    if suffix in ('.jpg', '.jpeg') and not content.startswith(b'\xff\xd8\xff'):
        raise ValueError('Le contenu ne correspond pas à une image JPEG.')
    if suffix == '.txt':
        try: content.decode('utf-8')
        except UnicodeDecodeError as exc:
            raise ValueError('Les fichiers TXT doivent être en UTF-8.') from exc
    return name, expected_mime, content


def summaries(c, admin_id):
    return [dict(r) for r in c.execute(
        'SELECT id,filename,mime_type,byte_size,created_at FROM admin_attachments '
        'WHERE admin_id=? ORDER BY id DESC', (admin_id,))]


def detail(c, admin_id, file_id):
    return c.execute(
        'SELECT filename,mime_type,byte_size,content FROM admin_attachments '
        'WHERE admin_id=? AND id=?', (admin_id, file_id)).fetchone()


def event_summaries(c, event_id):
    """Only metadata leaves SQLite in the calendar's JSON responses."""
    return [dict(r) for r in c.execute(
        'SELECT id,filename,mime_type,byte_size,created_at FROM event_attachments '
        'WHERE event_id=? ORDER BY id DESC', (event_id,))]


def event_detail(c, event_id, file_id):
    return c.execute(
        'SELECT filename,mime_type,byte_size,content FROM event_attachments '
        'WHERE event_id=? AND id=?', (event_id, file_id)).fetchone()
