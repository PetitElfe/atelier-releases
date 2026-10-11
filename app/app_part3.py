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
    if not _probe_atelier():
        return False
    if _request_clean_shutdown():
        return True
    try:
        pid=int(pid_file.read_text(encoding='ascii').strip())
        if pid>0 and pid!=os.getpid():
            os.kill(pid, signal.SIGTERM)
            return True
    except Exception as exc:
        print(f"[Atelier] Impossible d'arreter l'ancienne instance : {exc}")
    return False

def make_server(pid_file):
    try:
        return ThreadingHTTPServer((HOST, PORT), Handler), PORT
    except OSError as first_error:
        print("[Atelier] Une ancienne instance semble encore utiliser le port 8765.")
        _kill_stale_atelier(pid_file)
        last_error=first_error
        for _ in range(30):
            time.sleep(0.1)
            try:
                return ThreadingHTTPServer((HOST, PORT), Handler), PORT
            except OSError as exc:
                last_error=exc
        raise OSError("Une ancienne instance de L'Atelier est encore active sur le port 8765. Ferme-la puis relance L'Atelier.") from last_error


if __name__ == '__main__':
    version_file = ROOT / 'VERSION'
    version = version_file.read_text(encoding='utf-8').strip() if version_file.exists() else '0.0.5'
    pid_file = DATA / 'server.pid'
    port_file = DATA / 'server.port'

    try:
        server, active_port = make_server(pid_file)
    except Exception as exc:
        print(f"[ERREUR] Impossible de demarrer le serveur local : {exc}")
        raise SystemExit(1)

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
