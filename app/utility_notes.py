"""One note, many tags; revision checks and recoverable tombstones."""
import hashlib
import json
from pathlib import Path
import re
import threading
import unicodedata
import utility_safety

LOCK=threading.RLock()
MAX_BYTES=8_000_000


class Conflict(ValueError):pass


def clean(notes):
    if not isinstance(notes,list) or len(notes)>1000:raise ValueError('Les notes sont limitées à 1 000 entrées.')
    output=[];seen=set()
    for item in notes:
        if not isinstance(item,dict):raise ValueError('Note invalide.')
        note={}
        for field,limit,default in [('id',100,''),('title',200,'Sans titre'),('category',100,'Général'),('content',100000,''),('updated',80,''),('deleted_at',80,'')]:
            value=item.get(field,default)
            if not isinstance(value,str) or len(value)>limit:raise ValueError('Champ de note invalide ou trop long : '+field)
            note[field]=value
        if not note['id']:note['id']='legacy-'+hashlib.sha256(json.dumps(item,sort_keys=True).encode()).hexdigest()[:32]
        if note['id'] in seen:raise ValueError('Deux notes portent le même identifiant.')
        seen.add(note['id'])
        tags=item.get('tags',[])
        if not isinstance(tags,list) or any(not isinstance(t,str) or len(t)>60 for t in tags) or len(tags)>50:raise ValueError('Catégories de note invalides.')
        extracted=re.findall(r'(?<!\w)#([\w-]{1,60})',' '.join([note['title'],note['content'],note['category']]),re.UNICODE)
        note['tags']=list(dict.fromkeys(unicodedata.normalize('NFC',t.strip().lstrip('#')).casefold() for t in tags+extracted if t.strip().lstrip('#')))
        links=item.get('links',[])
        if not isinstance(links,list) or len(links)>40:raise ValueError('Trop de liens dans la note.')
        for link in links:
            if not isinstance(link,dict) or link.get('kind') not in ('task','objective','note') or not isinstance(link.get('id'),(int,str)) or len(str(link['id']))>100:raise ValueError('Lien de note incorrect.')
        note['links']=links;output.append(note)
    if len(json.dumps(output).encode())>MAX_BYTES:raise ValueError('Les notes dépassent 8 Mo.')
    return output


def _read(data):
    path=Path(data)/'mobile-notes.json'
    notes=clean(json.loads(path.read_text(encoding='utf-8'))) if path.exists() else []
    revision=hashlib.sha256(json.dumps(notes,sort_keys=True,ensure_ascii=False).encode()).hexdigest()
    return {'revision':revision,'notes':notes}


def get(data):
    with LOCK:return _read(data)


def _store(data,notes):
    path=Path(data)/'mobile-notes.json';folder=Path(data)/'notes-history'
    if path.exists():
        old=json.loads(path.read_text(encoding='utf-8'))
        utility_safety.atomic(folder/('notes-'+utility_safety.stamp()+'.json'),old)
        original=folder/'original-before-first-revision.json'
        if not original.exists():utility_safety.atomic(original,old)
        for old_path in sorted(folder.glob('notes-*.json'),reverse=True)[100:]:old_path.unlink()
    utility_safety.atomic(path,notes)
    return _read(data)


def save(data,revision,notes):
    notes=clean(notes)
    with LOCK:
        current=_read(data)
        if notes==current['notes']:return current
        if revision!=current['revision']:raise Conflict('Les notes ont changé ailleurs. Ton brouillon est conservé ; recharge les notes avant de réessayer.')
        return _store(data,notes)


def legacy_save(data,notes):
    notes=clean(notes)
    with LOCK:
        old=_read(data)['notes'];by_id={n['id']:n for n in notes}
        for previous in old:
            incoming=by_id.get(previous['id'])
            if previous.get('deleted_at'):
                if incoming and not incoming.get('deleted_at'):raise Conflict('Une note a été archivée ailleurs. Actualise avant de synchroniser.')
                if not incoming:notes.append(previous)
            elif not incoming:raise Conflict('Des notes plus récentes manquent. Actualise avant de synchroniser ; aucune note n’a été effacée.')
            elif any(previous[k]!=incoming[k] for k in ('title','category','content','updated')):raise Conflict('Cette ancienne version ne peut pas modifier une note sans contrôle de révision. Mets Goblin à jour ; ton texte est conservé localement.')
        return _store(data,notes)
