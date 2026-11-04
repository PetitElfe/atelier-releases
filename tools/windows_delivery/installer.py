"""One-time, pinned Windows TEST update. Never changes Nathan's channel."""
from __future__ import annotations
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import re
import sys

HERE = Path(__file__).resolve().parent


def main():
    if os.name != 'nt':
        raise RuntimeError('Ce lanceur est réservé à Windows TEST.')
    config = json.loads((HERE / 'delivery.json').read_text(encoding='utf-8'))
    revision = config['revision']
    if not re.fullmatch(r'[a-f0-9]{40}', revision):
        raise RuntimeError('Révision de livraison invalide.')
    module = HERE / 'updater.py'
    if module.is_symlink() or hashlib.sha256(module.read_bytes()).hexdigest() != config['updater_sha256']:
        raise RuntimeError('Le lanceur est incomplet ou modifié. Retélécharge le ZIP officiel.')
    spec = importlib.util.spec_from_file_location('goblin_delivery_updater', module)
    updater = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(updater)
    if str(updater.BASE) != r'E:\LATELIER_TEST_0180' or updater.PORT != 8876:
        raise RuntimeError('Destination du lanceur inattendue.')
    os.environ.update(ATELIER_DATA_DIR=str(updater.DATA), ATELIER_PORT='8876', ATELIER_NO_BROWSER='1')
    updater.guard(external_runner=True)
    if (updater.CODE / 'app' / 'VERSION').read_text(encoding='utf-8').strip() != '0.18.0':
        raise RuntimeError('Cette livraison attend L’Atelier Windows TEST 0.18.0 déjà installé.')
    if updater.LOCK.exists() or updater.status().get('phase') in ('starting', 'download', 'stopping', 'backup', 'installing'):
        raise RuntimeError('Une autre mise à jour est en cours. Attends sa fin.')
    # A network/integrity failure here leaves the installed application untouched.
    manifest_bytes = updater._get('https://raw.githubusercontent.com/' + updater.REPO + '/' + revision + '/manifest.json', 200000)
    if hashlib.sha256(manifest_bytes.replace(b'\r\n', b'\n')).hexdigest() != config['manifest_sha256']:
        raise RuntimeError('Le manifeste téléchargé ne correspond pas à la version vérifiée.')
    updater._manifest(manifest_bytes)
    print('Destination : E:\\LATELIER_TEST_0180 — port 8876', flush=True)
    print('Téléchargement vérifié, sauvegarde automatique, installation puis redémarrage…', flush=True)
    # The existing server uses the same real Python interpreter as this launcher.
    if not updater._port():
        updater._start()
    updater.worker(revision, external_runner=True)
    result = updater.status()
    if result.get('phase') != 'success' or result.get('revision') != revision:
        raise RuntimeError(result.get('detail') or 'La mise à jour n’a pas abouti.')
    if hashlib.sha256((updater.CODE / 'manifest.json').read_bytes().replace(b'\r\n', b'\n')).hexdigest() != config['manifest_sha256']:
        raise RuntimeError('Le manifeste installé diffère de la livraison vérifiée.')
    # Opt in only after successful installation; no other installation is touched.
    channel = updater.DATA / 'windows-test-channel.json'
    if channel.is_symlink():
        raise RuntimeError('Configuration du canal redirigée. Mise à jour installée, canal à vérifier.')
    temp = updater.DATA / ('windows-test-channel-' + str(os.getpid()) + '.tmp')
    temp.write_text(json.dumps({'branch': updater.CANDIDATE_BRANCH, 'installed_revision': revision}, indent=2) + '\n', encoding='utf-8')
    os.replace(temp, channel)
    print('MISE À JOUR RÉUSSIE — finition utilitaire installée.', flush=True)
    print('Les données et la sauvegarde sont conservées dans ton dossier Windows TEST.', flush=True)
    print('Ouvre maintenant ton raccourci habituel L’Atelier TEST.', flush=True)
    return 0


if __name__ == '__main__':
    try:
        sys.exit(main())
    except Exception as error:
        print('\nARRÊT : ' + str(error), flush=True)
        print('Ne supprime aucun dossier. Tu peux transmettre ce message pour le dépannage.', flush=True)
        sys.exit(1)
