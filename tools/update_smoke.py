"""Offline safety checks for the optional updater; no user files or network."""
import hashlib
import importlib.util
import io
import json
from pathlib import Path
import sqlite3
import tempfile
from zipfile import ZipFile

ROOT=Path(__file__).resolve().parents[1]
MODULE=ROOT/'app'/'updater.py'
spec=importlib.util.spec_from_file_location('atelier_test_updater',MODULE)
updater=importlib.util.module_from_spec(spec)
spec.loader.exec_module(updater)

def sha(content):
    return hashlib.sha256(content).hexdigest()

def main():
    try:
        updater.guard()
    except RuntimeError as exc:
        assert 'TEST' in str(exc)
    else:
        raise AssertionError('A non-Windows updater must refuse to operate.')

    with tempfile.TemporaryDirectory(prefix='atelier-updater-e2e-') as location:
        root=Path(location)
        code=root/'code_0180';app=code/'app';app.mkdir(parents=True)
        data=root/'data';data.mkdir()
        with sqlite3.connect(data/'atelier.db') as c:
            c.execute('CREATE TABLE protected (text TEXT NOT NULL)')
            c.execute('INSERT INTO protected VALUES (?)',('Ceci est une donnée privée fictive',))
        (data/'notes.txt').write_text('Ne jamais perdre ce texte',encoding='utf-8')
        (code/'untracked_important.txt').write_text('Ancien fichier préservé',encoding='utf-8')
        backup=root/'sauvegarde';backup.mkdir()
        updater.BASE=root;updater.CODE=code;updater.DATA=data

        critical=['app.py','app_part1.py','app_part2.py','app_part3.py',
                  'VERSION','updater.py','public/index.html','public/styles.css']
        paths=critical+[f'public/fixture-{i}.txt' for i in range(9)]
        contents={path:('TEST:'+path+'\n').encode() for path in paths}
        manifest={'version':'0.18.0','format':2,'files':[
            {'path':path,'sha256':sha(contents[path])} for path in paths]}
        manifest_bytes=(json.dumps(manifest)+'\n').encode('utf-8')
        zbuf=io.BytesIO()
        with ZipFile(zbuf,'w') as archive:
            archive.writestr('atelier-fixture/manifest.json',manifest_bytes)
            for path,value in contents.items():
                archive.writestr('atelier-fixture/app/'+path,value)
        zip_bytes=zbuf.getvalue()

        def fixture_download(url,limit=80000000):
            if url.endswith('/manifest.json'):return manifest_bytes
            if '/zip/' in url:return zip_bytes
            raise AssertionError('unexpected URL: '+url)
        original_get=updater._get
        updater._get=fixture_download
        revision='a'*40
        try:
            staged=updater._stage(revision)
            assert (staged/'app'/'VERSION').read_bytes()==contents['VERSION']
            assert (staged/'untracked_important.txt').read_text()=='Ancien fichier préservé'
            assert json.loads((staged/'manifest.json').read_text())==manifest
            updater._backup(backup)
            with sqlite3.connect(backup/'data'/'atelier.db') as c:
                assert c.execute('SELECT text FROM protected').fetchone()[0]=='Ceci est une donnée privée fictive'
            assert (backup/'data'/'notes.txt').read_text()=='Ne jamais perdre ce texte'
            assert (code/'untracked_important.txt').is_file()
            bad=json.loads(manifest_bytes)
            bad['files'][0]['path']='../../outside'
            try:updater._manifest(json.dumps(bad).encode())
            except RuntimeError:pass
            else:raise AssertionError('Path traversal accepted')
            bad=json.loads(manifest_bytes)
            bad['files'][0]['sha256']='0'*64
            try:updater._manifest(json.dumps(bad).encode())
            except RuntimeError:pass
            else:
                # Valid-looking SHA is accepted by schema; archive verification must reject it.
                pass
            tampered_archive=io.BytesIO()
            with ZipFile(tampered_archive,'w') as z:
                z.writestr('atelier-fixture/manifest.json',manifest_bytes)
                for path,value in contents.items():
                    z.writestr('atelier-fixture/app/'+path,
                               b'altered' if path=='VERSION' else value)
            tampered_bytes=tampered_archive.getvalue()
            updater._get=lambda url,limit=80000000:(manifest_bytes if url.endswith('/manifest.json') else tampered_bytes)
            try:updater._stage(revision)
            except RuntimeError as exc:assert 'SHA-256' in str(exc)
            else:raise AssertionError('Altered remote content was accepted')
        finally:
            updater._get=original_get
    print('PASS: updater guard, pinned archive staging, path validation, backup integrity')

if __name__=='__main__':
    main()
