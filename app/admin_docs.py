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
    CREATE TABLE IF NOT EXISTS admin_attachment_labels(attachment_id INTEGER PRIMARY KEY REFERENCES admin_attachments(id) ON DELETE CASCADE,display_name TEXT NOT NULL,document_state TEXT NOT NULL DEFAULT 'blank',revision INTEGER NOT NULL DEFAULT 1,original_admin_id INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS admin_document_changes(id INTEGER PRIMARY KEY AUTOINCREMENT,attachment_id INTEGER NOT NULL REFERENCES admin_attachments(id) ON DELETE CASCADE,old_owner INTEGER NOT NULL,new_owner INTEGER NOT NULL,old_name TEXT NOT NULL,new_name TEXT NOT NULL,old_state TEXT NOT NULL,new_state TEXT NOT NULL,changed_at TEXT NOT NULL);
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
        "SELECT a.id,COALESCE(m.display_name,a.filename) AS filename,a.filename AS original_filename,a.mime_type,a.byte_size,a.created_at,COALESCE(m.document_state,'blank') AS document_state,COALESCE(m.revision,0) AS metadata_revision FROM admin_attachments a LEFT JOIN admin_attachment_labels m ON m.attachment_id=a.id WHERE a.admin_id=? ORDER BY a.id DESC", (admin_id,))]


def detail(c, admin_id, file_id):
    return c.execute(
        "SELECT COALESCE(m.display_name,a.filename) AS filename,a.filename AS original_filename,a.mime_type,a.byte_size,a.content FROM admin_attachments a LEFT JOIN admin_attachment_labels m ON m.attachment_id=a.id WHERE a.admin_id=? AND a.id=?", (admin_id, file_id)).fetchone()


def event_summaries(c, event_id):
    """Only metadata leaves SQLite in the calendar's JSON responses."""
    return [dict(r) for r in c.execute(
        'SELECT id,filename,mime_type,byte_size,created_at FROM event_attachments '
        'WHERE event_id=? ORDER BY id DESC', (event_id,))]


def event_detail(c, event_id, file_id):
    return c.execute(
        'SELECT filename,mime_type,byte_size,content FROM event_attachments '
        'WHERE event_id=? AND id=?', (event_id, file_id)).fetchone()


def update_document(c,owner,file_id,body):
    from datetime import datetime
    c.execute('BEGIN IMMEDIATE')
    row=c.execute('SELECT * FROM admin_attachments WHERE admin_id=? AND id=?',(owner,file_id)).fetchone()
    if not row:raise ValueError('Document introuvable dans cette démarche.')
    meta=c.execute('SELECT * FROM admin_attachment_labels WHERE attachment_id=?',(file_id,)).fetchone()
    revision=meta['revision'] if meta else 0
    if type(body.get('revision')) is not int or body['revision']!=revision:raise LookupError('Ce document a changé ailleurs. Actualise avant de le modifier.')
    previous_name=meta['display_name'] if meta else row['filename'];previous_state=meta['document_state'] if meta else 'blank'
    name=body.get('filename',previous_name);state=body.get('document_state',previous_state);target=body.get('admin_id',owner)
    if not isinstance(name,str) or not 1<=len(name)<=180 or any(ord(x)<32 for x in name) or any(x in name for x in '/\\') or name in ('.','..'):raise ValueError('Nom de document invalide.')
    if ALLOWED_TYPES.get(PurePath(name).suffix.lower())!=row['mime_type']:raise ValueError('Conserve l’extension correspondant au format original.')
    if state not in ('blank','completed','sent','waiting','valid','expired'):raise ValueError('État de document invalide.')
    if type(target) is not int or not c.execute('SELECT 1 FROM admin_documents WHERE id=?',(target,)).fetchone():raise ValueError('Démarche de destination introuvable.')
    c.execute('INSERT INTO admin_document_changes(attachment_id,old_owner,new_owner,old_name,new_name,old_state,new_state,changed_at) VALUES(?,?,?,?,?,?,?,?)',(file_id,owner,target,previous_name,name,previous_state,state,datetime.now().isoformat()))
    c.execute('INSERT INTO admin_attachment_labels VALUES(?,?,?,?,?) ON CONFLICT(attachment_id) DO UPDATE SET display_name=excluded.display_name,document_state=excluded.document_state,revision=excluded.revision',(file_id,name,state,revision+1,meta['original_admin_id'] if meta else owner))
    c.execute('UPDATE admin_attachments SET admin_id=? WHERE id=?',(target,file_id))
    return {'ok':True,'revision':revision+1,'original_filename':row['filename']}
