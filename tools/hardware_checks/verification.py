"""Local, read-only hardware observations. Never installs or promotes an app."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import platform
import re
import secrets
import shutil
import subprocess
import threading
from datetime import datetime, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlsplit
from urllib.request import build_opener, HTTPRedirectHandler
import webbrowser

PACKAGE = 'fr.atelierdugoblin.mobile'
HERE = Path(__file__).resolve().parent
LOCK = threading.RLock()
CHECKS = (
    'pen_pressure', 'album_edit_reopen', 'notebook_edit_reopen', 'pc_sound',
    'windows_notification_minimized', 'windows_notification_locked', 'windows_notification_game',
    'android_widget', 'android_reminder_locked', 'android_two_timers_locked',
    'android_sound_locked', 'sync_both_directions', 'sync_reconnect', 'sync_conflict', 'reminder_pc_off',
)


def run(args):
    result = subprocess.run(args, capture_output=True, text=True, encoding='utf-8', errors='replace', timeout=15,
                            creationflags=getattr(subprocess, 'CREATE_NO_WINDOW', 0))
    if result.returncode:
        raise RuntimeError('Commande indisponible ou appareil non autorisé.')
    return result.stdout


class NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, *_args, **_kwargs):
        raise ValueError('Redirection refusée.')


def read_pc(base):
    opener = build_opener(NoRedirect())
    with opener.open(base + '/api/runtime-version', timeout=8) as response:
        value = json.loads(response.read(100000))
    with opener.open(base + '/api/sync/capabilities', timeout=8) as response:
        caps = json.loads(response.read(100000))
    identity = caps.get('installation_id')
    if not isinstance(identity, str) or not identity or value.get('version') != '0.18.0':
        raise ValueError('Installation Atelier 0.18.0 attendue non reconnue.')
    # The version endpoint does not identify a build or prove the TEST edition.
    return {'version': value['version'], 'identity_hash': hashlib.sha256(identity.encode()).hexdigest(),
            'exact_build_verified': False}


def tailnet_url(value):
    parsed = urlsplit(value)
    if (parsed.scheme != 'https' or not parsed.hostname or not parsed.hostname.endswith('.ts.net')
            or parsed.username or parsed.password or parsed.port not in (None, 443)
            or parsed.query or parsed.fragment or parsed.path not in ('', '/')):
        raise ValueError('Utilise uniquement l’adresse HTTPS .ts.net du PC.')
    return 'https://' + parsed.hostname


def bound_widget(raw):
    # A provider declaration alone is not a widget placed on the Home screen.
    section = re.search(r'^\s*Widgets:\s*$(.*?)(?=^\s*(?:Hosts|Providers|Grants|Packages|RemoteViews)[^\n]*:|\Z)', raw, re.M | re.S)
    return bool(section and widget_provider(section.group(1)))


def widget_provider(raw):
    component = re.escape(PACKAGE) + r'/(?:' + re.escape(PACKAGE) + r')?\.AgendaWidgetProvider(?=[}\s,]|$)'
    return bool(re.search(component, raw))


def own_notification_observations(raw):
    # Only active NotificationRecord bodies, never archive or package preferences.
    active = re.search(r'^(?P<indent>[ \t]*)Notification List:[ \t]*\n', raw, re.M)
    lines = []
    if active:
        for line in raw[active.end():].splitlines():
            if line.strip() and len(line) - len(line.lstrip()) <= len(active['indent']):
                break
            lines.append(line)
    records = re.findall(r'^\s*NotificationRecord\(([^\n]*)\)(.*?)(?=^\s*NotificationRecord\(|\Z)',
                         '\n'.join(lines), re.M | re.S)
    own = [body for header, body in records if re.search(r'\bpkg=' + re.escape(PACKAGE) + r'(?=[\s,)])', header)]
    # No titles, contents, other applications or full notification dumps are saved.
    return {'atelier_active_records': len(own),
            'test_reminder_observed': any('Rappel de test Android' in r for r in own),
            'timer_a_observed': any('Verification_Atelier_A' in r for r in own),
            'timer_b_observed': any('Verification_Atelier_B' in r for r in own)}


def observe(options):
    result = {'observed_at': datetime.now(timezone.utc).isoformat(), 'system': platform.system(),
              'physical_acceptance': 'NOT_VALIDATED', 'master_update_allowed': False}
    try:
        result['pc'] = read_pc('http://127.0.0.1:8876')
    except Exception:
        result['pc'] = {'blocked': 'Atelier TEST ne répond pas sur ce PC (port 8876).'}
    if options.tailnet:
        try:
            remote = read_pc(tailnet_url(options.tailnet))
            result['tailscale'] = {'https_reachable_from_this_pc': True,
                                   'same_installation': remote['identity_hash'] == result['pc'].get('identity_hash')}
        except Exception:
            result['tailscale'] = {'blocked': 'Connexion HTTPS Tailscale non vérifiée depuis ce PC.'}
    else:
        result['tailscale'] = {'blocked': 'Adresse HTTPS .ts.net du PC non renseignée.'}
    adb = options.adb or shutil.which('adb') or shutil.which('adb.exe')
    if not adb and (HERE / 'platform-tools/adb.exe').is_file():
        adb = str(HERE / 'platform-tools/adb.exe')
    if not adb:
        result['android'] = {'blocked': 'ADB absent : aucune liaison au téléphone. Aucune installation automatique.'}
        return result
    try:
        rows = run([adb, 'devices']).splitlines()[1:]
        connected = [line.split()[0] for line in rows if len(line.split()) == 2 and line.split()[1] == 'device']
        serial = options.serial or (connected[0] if len(connected) == 1 else None)
        if serial not in connected:
            raise ValueError('Sélectionne un seul téléphone USB et autorise sa connexion ADB.')
        prefix = [adb, '-s', serial, 'shell']
        if run(prefix + ['getprop', 'ro.kernel.qemu']).strip() == '1' or serial.startswith('emulator-'):
            raise ValueError('Un émulateur ne valide pas le téléphone réel.')
        package = run(prefix + ['dumpsys', 'package', PACKAGE])
        version = re.search(r'\bversionCode=(\d+)', package)
        if not version:
            raise ValueError('Goblin n’est pas installé sur ce téléphone.')
        widgets = run(prefix + ['dumpsys', 'appwidget'])
        notifications = run(prefix + ['dumpsys', 'notification', '--noredact'])
        result['android'] = {'physical_device': True, 'version_code': int(version.group(1)),
                             'expected_version': int(version.group(1)) == 115,
                             'widget_provider_registered': widget_provider(widgets),
                             'widget_bound_to_host': bound_widget(widgets),
                             'notification_permission': 'android.permission.POST_NOTIFICATIONS: granted=true' in package,
                             **own_notification_observations(notifications)}
    except subprocess.TimeoutExpired:
        result['android'] = {'blocked': 'Le téléphone n’a pas répondu dans le délai prévu. Relance le relevé.'}
    except (OSError, RuntimeError):
        result['android'] = {'blocked': 'ADB indisponible ou connexion au téléphone non autorisée.'}
    except ValueError as error:
        result['android'] = {'blocked': str(error)}
    return result


def clean_observation(value):
    if not isinstance(value, dict):
        raise ValueError('Résultat invalide.')
    result = {}
    for field in ('pen_samples', 'pen_min', 'pen_max', 'strokes'):
        if field in value:
            number = value[field]
            if type(number) not in (int, float) or not 0 <= number <= (1 if field.startswith('pen_m') else 1000000):
                raise ValueError('Mesure incorrecte.')
            if field in ('pen_samples', 'strokes') and type(number) is not int:
                raise ValueError('Compteur incorrect.')
            result[field] = number
    for field in ('xp_pen_used', 'heard_on_pc', 'heard_phone_locked', 'widget_readable', 'phone_pc_sync_ok'):
        if field in value:
            if type(value[field]) is not bool:
                raise ValueError('Confirmation incorrecte.')
            result[field] = value[field]
    if 'audio_decoded' in value:
        result['audio_decoded'] = value['audio_decoded'] is True
    if 'checks' in value:
        checks = value['checks']
        if not isinstance(checks, dict) or set(checks) - set(CHECKS):
            raise ValueError('Essais inconnus.')
        if any(outcome not in ('not_tested', 'pass', 'fail') for outcome in checks.values()):
            raise ValueError('Résultat d’essai incorrect.')
        result['checks'] = checks
    return result


def new_report(options):
    return {'format': 'atelier-physical-observations-v1', 'observations': observe(options),
            'participant': {}, 'history': [], 'review_required': True}


def make_server(options, report, save):
    token = secrets.token_urlsafe(32)
    class Handler(BaseHTTPRequestHandler):
        def log_message(self, *_args):
            pass
        def local_request(self):
            return self.headers.get('Host') == '127.0.0.1:' + str(self.server.server_port)
        def send_json(self, value, status=200):
            raw = json.dumps(value, ensure_ascii=False).encode()
            self.send_response(status)
            self.send_header('Content-Type', 'application/json; charset=utf-8')
            self.send_header('Cache-Control', 'no-store')
            self.end_headers()
            self.wfile.write(raw)
        def do_GET(self):
            if not self.local_request():
                return self.send_json({'error': 'Adresse locale requise'}, 403)
            if self.path == '/observations':
                if self.headers.get('X-Test-Token') != token:
                    return self.send_json({'error': 'Accès local requis'}, 403)
                with LOCK:
                    report['history'] = (report['history'] + [report['observations']])[-24:]
                    report['observations'] = observe(options)
                    save()
                    return self.send_json(report)
            names = {'/': ('verification.html', 'text/html'), '/ink.js': ('ink.js', 'text/javascript'),
                     '/checks.js': ('checks.js', 'text/javascript')}
            if self.path not in names:
                return self.send_json({'error': 'Introuvable'}, 404)
            name, mime = names[self.path]
            content = (HERE / name).read_bytes().replace(b'__LOCAL_TEST_TOKEN__', token.encode())
            self.send_response(200)
            self.send_header('Content-Type', mime + '; charset=utf-8')
            self.send_header('Cache-Control', 'no-store')
            self.end_headers()
            self.wfile.write(content)
        def do_POST(self):
            origin = 'http://127.0.0.1:' + str(self.server.server_port)
            if (not self.local_request() or self.path not in ('/observations', '/tailnet')
                    or self.headers.get('Origin') != origin or self.headers.get('X-Test-Token') != token):
                return self.send_json({'error': 'Origine locale requise'}, 403)
            try:
                size = int(self.headers.get('Content-Length', '0'))
                if not 0 < size <= 4096:
                    raise ValueError('Résultat trop grand.')
                value = json.loads(self.rfile.read(size))
                if self.path == '/tailnet':
                    if not isinstance(value, dict) or not isinstance(value.get('url'), str):
                        raise ValueError('Adresse incorrecte.')
                    options.tailnet = tailnet_url(value['url']) if value['url'] else None
                    return self.send_json({'configured': bool(options.tailnet)})
                result = clean_observation(value)
                with LOCK:
                    report['participant'] = result
                    save()
                return self.send_json({'saved': True, 'review_required': True})
            except (ValueError, TypeError, json.JSONDecodeError):
                return self.send_json({'error': 'Résultat invalide'}, 400)
    return ThreadingHTTPServer(('127.0.0.1', options.port), Handler)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--tailnet', help='Adresse HTTPS .ts.net du PC ; jamais publiée dans le rapport.')
    parser.add_argument('--adb', help='Chemin vers adb.exe déjà installé.')
    parser.add_argument('--serial', help='Téléphone autorisé si plusieurs appareils sont branchés.')
    parser.add_argument('--output', type=Path, default=HERE / 'resultats')
    parser.add_argument('--collect-only', action='store_true')
    parser.add_argument('--no-browser', action='store_true')
    parser.add_argument('--port', type=int, default=0)
    options = parser.parse_args()
    if options.tailnet:
        tailnet_url(options.tailnet)
    options.output.mkdir(exist_ok=True, parents=True)
    stamp = datetime.now().strftime('%Y%m%d_%H%M%S')
    target = options.output / ('observations_' + stamp + '_' + secrets.token_hex(3) + '.json')
    report = new_report(options)
    def save():
        with LOCK:
            temp = target.with_suffix('.tmp')
            temp.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf-8')
            os.replace(temp, target)
    save()
    print('Observations locales :', target, flush=True)
    print('Aucune installation, aucune modification du master ou des documents du projet.', flush=True)
    if options.collect_only:
        return
    server = make_server(options, report, save)
    url = 'http://127.0.0.1:' + str(server.server_port)
    print('Ouvre cette page :', url, flush=True)
    if not options.no_browser:
        webbrowser.open(url)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()
        save()


if __name__ == '__main__':
    main()
