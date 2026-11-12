import time, signal
from urllib.request import urlopen, Request

def _probe_atelier():
    try:
        with urlopen(f"http://{HOST}:{PORT}/", timeout=0.5) as r:
            body=r.read(12000).decode('utf-8','ignore')
            return "L’Atelier" in body or "L'Atelier" in body or "L’ATELIER" in body
    except Exception:
        return False

def _request_clean_shutdown():
    try:
        req=Request(f"http://{HOST}:{PORT}/api/shutdown", data=b"{}", method="POST", headers={"Content-Type":"application/json"})
        with urlopen(req, timeout=0.8):
            pass
        return True
    except Exception:
        return False

def _kill_stale_atelier(pid_file):
    return False  # Never stop an unrelated/recycled PID in Nathan edition.


def make_server(pid_file):
    return ThreadingHTTPServer((HOST, PORT), Handler), PORT



if __name__ == '__main__':
    version = atelier_version()
    pid_file = DATA / 'server.pid'
    port_file = DATA / 'server.port'

    try:
        server, active_port = make_server(pid_file)
    except Exception as exc:
        print(f"[ERREUR] Impossible de demarrer le serveur local : {exc}")
        raise SystemExit(1)

    try:
        utility_safety.save_snapshot(DATA,version,active_port,reason='startup')
    except Exception as exc:
        utility_safety.atomic(DATA/'safety-status.json',{'error':'Sauvegarde de démarrage impossible : '+str(exc)})
    (DATA/'safety-maintenance.json').unlink(missing_ok=True)
    if native_reminders.status(DATA).get('enabled') and os.name=='nt' and PORT==8877:
        try:desktop_postits.launch()
        except (OSError,RuntimeError):pass
    url = f"http://{HOST}:{active_port}/"
    try:
        pid_file.write_text(str(os.getpid()), encoding='ascii')
        port_file.write_text(str(active_port), encoding='ascii')
    except Exception:
        pass

    print(f"L'Atelier {version} : {url}")
    print("Le navigateur va s'ouvrir automatiquement.")
    print("Ferme cette fenetre pour arreter le serveur.")

    if os.environ.get('ATELIER_NO_BROWSER') != '1':
        timer = threading.Timer(0.6, lambda: webbrowser.open(url))
        timer.daemon = True
        timer.start()

    try:
        local_icon.start(DATA,'NATHAN' if active_port==8877 else 'MISU')
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        try:
            server.server_close()
        except Exception:
            pass
        for f in (pid_file, port_file):
            try:
                if f.exists():
                    if f == pid_file:
                        try:
                            if f.read_text(encoding='ascii').strip() != str(os.getpid()):
                                continue
                        except Exception:
                            pass
                    f.unlink(missing_ok=True)
            except Exception:
                pass
