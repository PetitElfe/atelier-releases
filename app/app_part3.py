def make_server():
    # 8765 est le port habituel. Si un ancien processus l'utilise encore,
    # on essaie automatiquement les ports suivants au lieu de planter.
    last_error = None
    for port in range(PORT, PORT + 11):
        try:
            return ThreadingHTTPServer((HOST, port), Handler), port
        except OSError as exc:
            last_error = exc
    raise last_error or OSError('Aucun port local disponible')


if __name__ == '__main__':
    version_file = ROOT / 'VERSION'
    version = version_file.read_text(encoding='utf-8').strip() if version_file.exists() else '0.0.5'
    pid_file = DATA / 'server.pid'
    port_file = DATA / 'server.port'

    try:
        server, active_port = make_server()
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
                f.unlink(missing_ok=True)
            except Exception:
                pass