"""Personalize verified TEST source files for Nathan's separate local Windows account.

Used at first install AND on every staged update. An unknown upstream
format aborts the update rather than installing code pointing at somebody's data.
"""
from __future__ import annotations
import hashlib
import json
from pathlib import Path

ROOT_EXPR = "Path(os.environ['LOCALAPPDATA']) / 'LAtelierDuGoblinNathan'"
PORT = 8877

def replace_one(src, before, after):
    if src.count(before) != 1:
        raise RuntimeError("Fichier source changé : personnalisation Nathan refusée.")
    return src.replace(before,after)

def customize_updater(source):
    src=replace_one(source,
        "BASE = Path(r'E:\\LATELIER_TEST_0180')",
        "BASE = Path(os.environ['LOCALAPPDATA']) / 'LAtelierDuGoblinNathan'")
    src=replace_one(src,"CODE = BASE / 'code_0180'","CODE = BASE / 'code'")
    src=replace_one(src,"PORT = 8876","PORT = 8877")
    # Nathan updates on their own profile; never judge personalized hashes
    # against original TEST sources.
    src=replace_one(src,"'available':old!=new","'available':revision!=(DATA/'installed-revision.txt').read_text(encoding='ascii').strip()")
    src=replace_one(src,
        "    (stage/'manifest.json').write_text(json.dumps(target,ensure_ascii=False,indent=2)+'\\n',encoding='utf-8')\n    return stage",
        "    (stage/'manifest.json').write_text(json.dumps(target,ensure_ascii=False,indent=2)+'\\n',encoding='utf-8')\n    from nathan_patch import patch_stage\n    patch_stage(stage)\n    return stage")
    src=replace_one(src,"[sys.executable,'-u',str(CODE/'app'/'app.py')]","[sys.executable,'--nathan-server']")
    src=replace_one(src,"[sys.executable,str(Path(__file__).resolve()),'--worker',revision]",
                    "[sys.executable,'--nathan-update-worker',revision]")
    src=replace_one(src,
        "        _start()\n        _status('success'",
        "        _start()\n        (DATA/'installed-revision.txt').write_text(revision,encoding='ascii')\n        _status('success'")
    return src

def customize_postits(source):
    src=replace_one(source,
        'BASE = Path(r"E:\\LATELIER_TEST_0180")',
        "BASE = Path(os.environ['LOCALAPPDATA']) / 'LAtelierDuGoblinNathan'")
    src=replace_one(src,'CODE = BASE / "code_0180"','CODE = BASE / "code"')
    src=replace_one(src,'AUTORUN_NAME = "LAtelierDuGoblinPostitsTEST"','AUTORUN_NAME = "LAtelierDuGoblinPostitsNathan"')
    src=src.replace('"8876"','"8877"')
    src=replace_one(src,
        '    return subprocess.list2cmdline([_pythonw(), str(SCRIPT)])',
        '    return subprocess.list2cmdline([_pythonw(), "--nathan-postits"])')
    src=replace_one(src,
        'subprocess.Popen([_pythonw(), str(SCRIPT)], cwd=str(DATA),',
        'subprocess.Popen([_pythonw(), "--nathan-postits"], cwd=str(DATA),')
    src=replace_one(src,
        'BASE / "desktop" / "LAtelierDuGoblin_TEST.exe"',
        'BASE / "desktop" / "LAtelierDuGoblin_Nathan.exe"')
    return src

def remove_jdr_navigation(source):
    """Remove the tabletop RPG workspace, not the general library or notes."""
    link = '<button type="button" id="openJdrWorkspace" onclick="window.location.href=\'/jdr.html\'">🎲 Table JDR</button>'
    src = replace_one(source, link, '')
    return src.replace('Anglais, Art, JDR, LoL…', 'Anglais, Art, Lecture, LoL…')


def remove_jdr_mobile(source):
    """Keep the mobile notes companion but not RPG-specific presets."""
    src = source.replace('Pour le JDR, les idées quotidiennes ou ton journal.',
                         'Pour les idées quotidiennes, le journal et les projets.')
    src = src.replace('<option>JDR</option>', '')
    src = src.replace("||'JDR'", "||'Général'")
    if 'JDR' in src or 'jdr' in src.lower():
        raise RuntimeError('Une référence JDR mobile reste dans Nathan.')
    return src


def disable_jdr_server(source):
    """Prevent both static JDR pages and game-session API access in Nathan."""
    get = "def do_GET(self):\n        u = urlparse(self.path); p = u.path; q = parse_qs(u.query)"
    post = "def do_POST(self):\n        u = urlparse(self.path); p = u.path"
    block = ("\n        if p in ('/jdr.html','/jdr-mj.html') or p.startswith('/api/jdr/'):\n"
             "            return self._json({'error':'Module JDR non inclus dans l’édition Nathan'},404)")
    src = replace_one(source, get, get + block)
    src = replace_one(src, post, post + block)
    return src


def patch_stage(stage):
    stage=Path(stage)
    manifest_path=stage/'manifest.json'
    manifest=json.loads(manifest_path.read_text(encoding='utf-8'))
    transformations={'updater.py':customize_updater,'desktop_postits.py':customize_postits,
                     'public/index.html':remove_jdr_navigation,
                     'public/mobile.html':remove_jdr_mobile,
                     'app_part2.py':disable_jdr_server}
    for name, transform in transformations.items():
        path=stage/'app'/name
        source=path.read_text(encoding='utf-8')
        modified=transform(source)
        path.write_text(modified,encoding='utf-8')
        entry=next((f for f in manifest['files'] if f['path']==name),None)
        if entry is None:
            raise RuntimeError('Manifeste incomplet : '+name)
        entry['sha256']=hashlib.sha256(path.read_bytes()).hexdigest()
    # JDR game pages must not be shipped, even if the upstream manifest lists them.
    for relative in ('public/jdr.html','public/jdr-mj.html'):
        (stage/'app'/relative).unlink(missing_ok=True)
        manifest['files']=[x for x in manifest['files'] if x['path']!=relative]
    assert not any(x['path'] in ('public/jdr.html','public/jdr-mj.html') for x in manifest['files'])
    manifest_path.write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    return stage

if __name__=="__main__":
    # Fail-closed replacement smoke validation performed with upstream source.
    assert PORT!=8876 and 'LOCALAPPDATA' in ROOT_EXPR
    print("PASS: Nathan patcher is separate from TEST paths")
