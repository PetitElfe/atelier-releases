"""Package a reviewed immutable update launcher; no installation occurs here."""
import argparse
import hashlib
import json
from pathlib import Path
import re
import shutil
from zipfile import ZipFile, ZIP_DEFLATED

ROOT = Path(__file__).resolve().parents[1]


def build(revision, output):
    if not re.fullmatch(r'[a-f0-9]{40}', revision):
        raise ValueError('Invalid pinned revision')
    kit = output / 'Goblin_MAJ_Windows_TEST_20261104'
    kit.mkdir(parents=True, exist_ok=False)
    for name in ('installer.py', 'Installer_la_MAJ_TEST.cmd', 'LIRE_MOI.txt'):
        shutil.copyfile(ROOT / 'tools' / 'windows_delivery' / name, kit / name)
    shutil.copyfile(ROOT / 'app' / 'updater.py', kit / 'updater.py')
    metadata = {'revision': revision,
                'updater_sha256': hashlib.sha256((kit / 'updater.py').read_bytes()).hexdigest(),
                'manifest_sha256': hashlib.sha256((ROOT / 'manifest.json').read_bytes().replace(b'\r\n', b'\n')).hexdigest()}
    (kit / 'delivery.json').write_text(json.dumps(metadata, indent=2) + '\n', encoding='utf-8')
    archive = kit.with_suffix('.zip')
    with ZipFile(archive, 'w', ZIP_DEFLATED) as zipped:
        for file in sorted(kit.iterdir()):
            zipped.write(file, arcname=kit.name + '/' + file.name)
    archive.with_suffix('.zip.sha256').write_text(hashlib.sha256(archive.read_bytes()).hexdigest() + '  ' + archive.name + '\n')
    print(archive)
    return kit


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--revision', required=True)
    parser.add_argument('--output', type=Path, default=ROOT / 'dist')
    args = parser.parse_args()
    build(args.revision, args.output)
