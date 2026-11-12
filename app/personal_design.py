"""Personal art skins. Installation-gated, bounded, atomic and conflict-aware."""
import base64
import json
import os
from pathlib import Path
import re
import threading
import updater

MAX_BYTES = 24_000_000
_LOCK = threading.Lock()


class Conflict(ValueError):
    pass


def available():
    return False  # Reserved owner-only creator feature; unavailable in Nathan edition.


def validate(theme):
    if not isinstance(theme, dict) or len(theme) > 150:
        raise ValueError('Le thème est limité à 150 zones.')
    result = {}
    for key, item in theme.items():
        if not re.fullmatch(r'(app|header|id:[A-Za-z][\w-]{0,100}|book:[0-9]{1,12})', key):
            raise ValueError('Zone de dessin invalide.')
        if not isinstance(item, dict):
            raise ValueError('Dessin invalide.')
        src = item.get('src', '')
        if not isinstance(src, str) or len(src) > 4_000_000:
            raise ValueError('Chaque dessin doit faire moins de 3 Mo après import.')
        match = re.fullmatch(r'data:image/(png|jpeg|webp);base64,([A-Za-z0-9+/=]+)', src)
        if not match:
            raise ValueError('Exporte ton dessin en PNG, JPEG ou WebP.')
        try:
            raw = base64.b64decode(match[2], validate=True)
        except ValueError:
            raise ValueError('Image illisible.')
        valid = {'png': raw.startswith(b'\x89PNG\r\n\x1a\n'),
                 'jpeg': raw.startswith(b'\xff\xd8\xff'),
                 'webp': raw.startswith(b'RIFF') and raw[8:12] == b'WEBP'}
        if not valid[match[1]]:
            raise ValueError('Format du dessin incorrect.')
        fit = item.get('fit', 'contain')
        if fit not in ('contain', 'cover', 'repeat'):
            raise ValueError('Affichage invalide.')
        values = {}
        for field, default, low, high in [('size',100,10,200),('x',50,0,100),('y',50,0,100),('opacity',100,10,100)]:
            value = item.get(field, default)
            if type(value) not in (int, float) or not low <= value <= high:
                raise ValueError('Réglage du dessin invalide.')
            values[field] = round(value, 2)
        name = item.get('name', 'Mon dessin')
        if not isinstance(name, str) or len(name) > 160 or type(item.get('hideLabel', False)) is not bool:
            raise ValueError('Nom ou texte du dessin invalide.')
        result[key] = dict(values, src=src, fit=fit, name=name, hideLabel=item.get('hideLabel',False))
    if len(json.dumps(result).encode()) > MAX_BYTES:
        raise ValueError('Ton thème dépasse 24 Mo. Réduis la taille de certains dessins.')
    return result


def _read(data):
    path = Path(data) / 'personal-design-v1.json'
    if not path.exists():
        return {'revision': 0, 'theme': {}}
    item = json.loads(path.read_text(encoding='utf-8'))
    if type(item.get('revision')) is not int or item['revision'] < 0:
        raise ValueError('Sauvegarde du thème illisible. Elle a été conservée.')
    return {'revision': item['revision'], 'theme': validate(item['theme'])}


def get(data):
    with _LOCK:
        return _read(data)


def save(data, revision, theme):
    theme = validate(theme)
    with _LOCK:
        current = _read(data)
        if type(revision) is not int or revision != current['revision']:
            raise Conflict('Le thème a changé dans une autre fenêtre. Exporte ton aperçu puis recharge avant de réessayer.')
        result = {'revision': revision + 1, 'theme': theme}
        path = Path(data) / 'personal-design-v1.json'
        # Keep the previous complete theme, including its image data.
        if path.exists():
            backup = path.with_suffix('.previous.json')
            temp_backup = backup.with_suffix('.tmp')
            temp_backup.write_bytes(path.read_bytes())
            os.replace(temp_backup, backup)
        temporary = path.with_suffix('.tmp')
        temporary.write_text(json.dumps(result, ensure_ascii=False), encoding='utf-8')
        os.replace(temporary, path)
        return result
