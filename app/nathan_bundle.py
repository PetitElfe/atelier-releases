"""Build an isolated per-Windows-user Nathan edition from the verified TEST sources.

Only transform known, anchored files. Never copy source data or E: drive files.
The upstream TEST modules stay untouched; the personalized app imports only
Nathan guards for updates and Post-it windows.
"""
from __future__ import annotations

import hashlib
import json
import os
from pathlib import Path
import shutil


EXE_NAME = "LAtelierDuGoblin_Nathan.exe"
PORT = 18877
PART1_IMPORT = "import progression, objective_maps, updater, desktop_postits"
NATHAN_IMPORT = "import progression, objective_maps, nathan_updater as updater, nathan_postits as desktop_postits"
POSTIT_BASE = 'BASE = Path(r"E:\\LATELIER_TEST_0180")'
UPSTREAM_POSTIT_PATH = "desktop_postits.py"


def user_home():
    local = os.environ.get("LOCALAPPDATA", "")
    if not local:
        raise RuntimeError("LOCALAPPDATA est introuvable : profil Windows requis.")
    path = Path(local).resolve() / "PetitGoblin" / "LAtelierNathan"
    # Never redirect this profile via supplied ATELIER_* environment variables.
    if not path.is_absolute() or "LATELIER_TEST_0180" in str(path).upper():
        raise RuntimeError("Dossier utilisateur invalide pour Nathan.")
    return path


def _replace_once(content, old, new, label):
    if content.count(old) != 1:
        raise RuntimeError(f"Transformation Nathan incertaine : {label}.")
    return content.replace(old, new)


def patch_server(app_dir):
    file = app_dir / "app_part1.py"
    content = file.read_text(encoding="utf-8")
    content = _replace_once(content, PART1_IMPORT, NATHAN_IMPORT, "modules serveur")
    file.write_text(content, encoding="utf-8", newline="\n")

    file = app_dir / "app_part2.py"
    content = file.read_text(encoding="utf-8")
    content = _replace_once(content, "'http://127.0.0.1:8876'",
                            "'http://127.0.0.1:18877'", "origine des commandes natives")
    content = _replace_once(content,
                            "server_version = 'AtelierLocal/' + atelier_version()",
                            "server_version = 'AtelierLocal/Nathan/' + atelier_version()",
                            "identité serveur propre à Nathan")
    file.write_text(content, encoding="utf-8", newline="\n")

    file = app_dir / "app_part3.py"
    content = file.read_text(encoding="utf-8")
    content = _replace_once(content,
                            "        _kill_stale_atelier(pid_file)",
                            "        # Ne jamais arrêter un processus par PID recyclé ou étranger.\n        pass",
                            "aucun arrêt forcé d'un serveur étranger")
    file.write_text(content, encoding="utf-8", newline="\n")

    file = app_dir / "public" / "index.html"
    content = file.read_text(encoding="utf-8")
    content = content.replace("Installer la mise à jour TEST", "Installer la mise à jour Nathan")
    content = content.replace("L’Atelier TEST", "L’Atelier de Nathan")
    file.write_text(content, encoding="utf-8", newline="\n")


def render_postits(source):
    content = source
    content = _replace_once(
        content, POSTIT_BASE,
        'BASE = Path(os.environ["LOCALAPPDATA"]).resolve() / "PetitGoblin" / "LAtelierNathan"',
        "racine personnelle des Post-it")
    content = _replace_once(content, 'CODE = BASE / "code_0180"',
                            'CODE = BASE / "code"', "code Nathan")
    content = _replace_once(content,
                            'SCRIPT = CODE / "app" / "desktop_postits.py"',
                            'SCRIPT = CODE / "app" / "nathan_postits.py"', "script Post-it")
    content = _replace_once(content,
                            'AUTORUN_NAME = "LAtelierDuGoblinPostitsTEST"',
                            'AUTORUN_NAME = "LAtelierDuGoblinPostitsNathan"', "auto-start Nathan")
    content = _replace_once(content,
                            'if os.name != "nt" or Path(__file__).resolve() != SCRIPT.resolve():',
                            'if os.name != "nt" or Path(__file__).resolve() != SCRIPT.resolve() or os.environ.get("ATELIER_EDITION") != "NATHAN":',
                            "garde Nathan Post-it")
    content = _replace_once(content,
                            'os.environ.get("ATELIER_PORT", "8876") != "8876"',
                            'os.environ.get("ATELIER_PORT", "18877") != "18877"',
                            "port Nathan Post-it")
    content = _replace_once(content,
                            'return subprocess.list2cmdline([_pythonw(), str(SCRIPT)])',
                            'return subprocess.list2cmdline([str(BASE / "desktop" / "LAtelierDuGoblin_Nathan.exe"), "--postits"])',
                            "démarrage auto Post-it")
    content = _replace_once(content,
                            'env.update(ATELIER_DATA_DIR=str(DATA), ATELIER_PORT="8876")',
                            'env.update(ATELIER_DATA_DIR=str(DATA), ATELIER_PORT="18877", ATELIER_EDITION="NATHAN")',
                            "environnement Post-it")
    content = _replace_once(content,
                            'subprocess.Popen([_pythonw(), str(SCRIPT)], cwd=str(CODE / "app"),',
                            'subprocess.Popen([str(BASE / "desktop" / "LAtelierDuGoblin_Nathan.exe"), "--postits"], cwd=str(CODE / "app"),',
                            "processus Post-it autonome")
    content = _replace_once(content,
                            'BASE / "desktop" / "LAtelierDuGoblin_TEST.exe"',
                            'BASE / "desktop" / "LAtelierDuGoblin_Nathan.exe"',
                            "icône native Nathan")
    return content


def personalize_payload(code_root):
    """Call only on a disposable staging directory, NEVER on the user's code."""
    app = code_root / "app"
    patch_server(app)
    postits_source=(app / UPSTREAM_POSTIT_PATH).read_text(encoding="utf-8")
    (app / "nathan_postits.py").write_text(
        render_postits(postits_source),encoding="utf-8",newline="\n")
    # Remove accidentally usable TEST launch entry points from the private
    # installation. They are never needed by the Nathan fork.
    (app / "desktop_shell.py").unlink(missing_ok=True)


def copy_verified_source(source_root, code_root):
    """Copy only manifest-listed source, no SQLite data or user preferences."""
    manifest_bytes=(source_root/"manifest.json").read_bytes()
    manifest=json.loads(manifest_bytes)
    if manifest.get("version")!="0.18.0" or manifest.get("format")!=2:
        raise RuntimeError("Manifest incompatible avec L’Atelier de Nathan.")
    files=manifest.get("files")
    if not isinstance(files,list) or len(files)<18:
        raise RuntimeError("Manifest incomplet pour Nathan.")
    code_root.mkdir(parents=True, exist_ok=False)
    app=code_root/"app"
    app.mkdir()
    for item in files:
        rel=item["path"]
        p=Path(rel)
        if p.is_absolute() or ".." in p.parts or "\\" in rel:
            raise RuntimeError("Chemin distant refusé.")
        source=source_root/"app"/p
        content=source.read_bytes()
        if hashlib.sha256(content).hexdigest()!=item["sha256"]:
            raise RuntimeError("Fichier source non vérifié : "+rel)
        target=app/p
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(content)
    (code_root/"manifest.json").write_bytes(manifest_bytes)
    personalize_payload(code_root)
    # This module is independent of the upstream TEST branch's app manifest.
    for name in ("nathan_updater.py","nathan_bundle.py"):
        original=source_root/"app"/name
        shutil.copyfile(original,app/name)
    assert (app/"nathan_postits.py").exists() and (app/"app.py").exists()
    return code_root


def verify_payload(code_root):
    app=code_root/"app"
    p1=(app/"app_part1.py").read_text(encoding="utf-8")
    p2=(app/"app_part2.py").read_text(encoding="utf-8")
    pn=(app/"nathan_postits.py").read_text(encoding="utf-8")
    if (NATHAN_IMPORT not in p1 or PART1_IMPORT in p1 or
            "'http://127.0.0.1:18877'" not in p2 or
            "'AtelierLocal/Nathan/'" not in p2 or
            'ATELIER_EDITION="NATHAN"' not in pn or
            'LAtelierDuGoblin_Nathan.exe' not in pn):
        raise RuntimeError("Le paquet Nathan contient encore une référence TEST active.")
    if not (code_root/"manifest.json").is_file():
        raise RuntimeError("Manifeste de vérification manquant.")
    return True
