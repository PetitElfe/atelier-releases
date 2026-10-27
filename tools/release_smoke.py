from __future__ import annotations

import hashlib
import http.client
import json
import os
import sqlite3
import subprocess
import sys
import tempfile
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
APP = ROOT / "app"
MANIFEST = ROOT / "manifest.json"
PORT = 18765


def fail(message: str) -> None:
    raise RuntimeError(message)


def sha256(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()


def request(method: str, path: str, payload=None):
    conn = http.client.HTTPConnection("127.0.0.1", PORT, timeout=2)
    body = None
    headers = {}
    if payload is not None:
        body = json.dumps(payload).encode("utf-8")
        headers["Content-Type"] = "application/json"
    conn.request(method, path, body=body, headers=headers)
    res = conn.getresponse()
    raw = res.read()
    conn.close()
    data = json.loads(raw.decode("utf-8")) if raw else {}
    return res.status, data


def wait_ready(proc: subprocess.Popen, timeout: float = 15.0) -> None:
    deadline = time.time() + timeout
    while time.time() < deadline:
        if proc.poll() is not None:
            fail(f"Le serveur s'est arrêté prématurément avec le code {proc.returncode}.")
        try:
            status, data = request("GET", "/api/runtime-version")
            if status == 200 and data.get("version"):
                return
        except Exception:
            pass
        time.sleep(0.15)
    fail("Le serveur de test n'a pas répondu à temps.")


def start_server(data_dir: Path):
    env = os.environ.copy()
    env["ATELIER_DATA_DIR"] = str(data_dir)
    env["ATELIER_NO_BROWSER"] = "1"
    env["ATELIER_PORT"] = str(PORT)
    proc = subprocess.Popen(
        [sys.executable, str(APP / "app.py")],
        cwd=str(ROOT),
        env=env,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
    )
    wait_ready(proc)
    return proc


def stop_server(proc: subprocess.Popen) -> None:
    try:
        request("POST", "/api/shutdown", {})
    except Exception:
        pass
    try:
        proc.wait(timeout=5)
    except subprocess.TimeoutExpired:
        proc.terminate()
        proc.wait(timeout=5)


def check_manifest() -> str:
    manifest = json.loads(MANIFEST.read_text(encoding="utf-8"))
    version = (APP / "VERSION").read_text(encoding="utf-8").strip()
    if manifest.get("version") != version:
        fail(f"VERSION={version} mais manifest={manifest.get('version')}.")
    files = manifest.get("files") or []
    listed = set()
    for item in files:
        rel = item["path"]
        listed.add(rel)
        path = APP / rel
        if not path.is_file():
            fail(f"Fichier du manifeste absent : {rel}")
        actual = sha256(path)
        if actual.lower() != str(item.get("sha256", "")).lower():
            fail(f"SHA-256 incorrect dans le manifeste : {rel}")
    required = {
        "app.py", "app_part1.py", "app_part2.py", "app_part3.py",
        "VERSION", "public/index.html", "public/app_part1.js",
        "public/app_part2.js", "public/app_part3.js", "public/styles.css",
    }
    missing = required - listed
    if missing:
        fail("Fichiers essentiels absents du manifeste : " + ", ".join(sorted(missing)))
    return version


def check_python_syntax() -> None:
    for path in sorted(APP.glob("*.py")):
        compile(path.read_text(encoding="utf-8"), str(path), "exec")



def check_frontend_contract() -> None:
    index = (APP / "public" / "index.html").read_text(encoding="utf-8")
    js = (APP / "public" / "app_part3.js").read_text(encoding="utf-8")
    css = (APP / "public" / "styles.css").read_text(encoding="utf-8")
    version = (APP / "VERSION").read_text(encoding="utf-8").strip()
    if f"ALPHA {version}" not in index.upper():
        fail(f"La version affichée dans index.html ne correspond pas à VERSION={version}.")
    for required in ('id="sideNav"', 'id="sideNavToggle"', 'id="sideNavDragHandle"', 'id="addStandaloneReminder"', 'id="settingsBtn"', 'id="settingsView"', 'id="settingsDateFormat"', 'id="settingsNotificationPersistent"', 'id="settingsNotificationPermission"', 'id="settingsNavReset"', 'id="jumpDateLabel"', 'id="libraryView"', 'id="libraryHubPanel"', 'id="libraryDomainShelf"', 'id="addLibraryDomain"', 'id="libraryDomainPanel"', 'id="libraryNotebookList"', 'id="libraryProgressPanel"', 'id="libraryDomainMain"', 'id="libraryNotebookPageList"', 'id="addLibraryPageSmall"'):
        if required not in index:
            fail(f"Élément frontend obligatoire absent : {required}")
    if 'id="todayBtn"' in index:
        fail("Le bouton Aujourd’hui ne doit plus être présent.")
    if "Rappel :" not in js or "Clique pour ouvrir L’Atelier." not in js:
        fail("Le nouveau format clair des notifications est absent.")
    if "reminder-icon-action" not in (APP / "public" / "app_part2.js").read_text(encoding="utf-8"):
        fail("Les actions de rappel par icônes sont absentes.")
    if "initSideNavDrag()" not in js:
        fail("Le glisser-déposer du tiroir n’est pas initialisé.")
    if "syncSideNavEdge(" not in js or "side-nav-on-left" not in js:
        fail("La flèche du tiroir ne s’adapte pas au côté de l’écran.")
    if "setInterval(checkDue,10000)" not in js:
        fail("La fréquence de vérification des rappels n’est pas celle attendue.")
    if "Notification système impossible" not in js:
        fail("Les erreurs de notification système ne sont pas isolées.")
    if "requireInteraction:notificationPersistentPreference()" not in js:
        fail("Les notifications persistantes ne sont pas activées via le réglage.")
    if "systemNotification.onclick" not in js or "window.focus()" not in js or "showView('reminders')" not in js:
        fail("Le clic sur une notification ne ramène pas correctement vers L’Atelier.")
    if "atelierDateFormat" not in js or "DATE_FORMAT_OPTIONS" not in js:
        fail("Le réglage du format de date est absent.")
    if "atelierNotificationPersistent" not in js:
        fail("Le réglage de persistance des notifications est absent.")
    js2 = (APP / "public" / "app_part2.js").read_text(encoding="utf-8")
    if "function renderLibrary()" not in js2 or "function openLibraryDomainCreateModal" not in js2:
        fail("La Bibliothèque et son constructeur de domaines sont absents.")
    if "objectiveSelectOptions" not in js2 or "objective_node_id" not in js:
        fail("La liaison des tâches à la Bibliothèque est absente.")
    if "openLibraryNotebookModal" not in js2 or "createLibraryPage" not in js2 or "renderLibraryPageEditor" not in js2:
        fail("L’éditeur de carnets et de pages est absent.")
    if "libraryProgressForDomain" not in js2 or "libraryProgressPanel" not in index:
        fail("Le module d’avancée de la Bibliothèque est absent.")
    if "libraryPageBody" not in js2 or "scheduleLibraryAutosave" not in js2 or "libraryPersistOnExit" not in js2:
        fail("L’écriture directe avec autosauvegarde persistante est absente.")
    if "libraryCommand" not in js2 or "libraryTextColor" not in js2 or "libraryHighlightColor" not in js2 or "libraryFontFamily" not in js2:
        fail("La barre de mise en forme riche est absente.")
    if "$('.library-format-btn').forEach" not in js2 or "insertUnorderedList" not in js2 or "insertOrderedList" not in js2 or "strikeThrough" not in js2:
        fail("Les commandes classiques de traitement de texte ne sont pas correctement branchées.")
    if "libraryPageExpand" not in js2 or "library-notebook-expanded" not in js2:
        fail("L’agrandissement de la page est absent.")
    if "renderLibraryReader" not in js2 or "libraryReaderPrev" not in js2 or "libraryReaderNext" not in js2 or "libraryReaderPageNumber" not in js2:
        fail("La lecture paginée est absente.")
    if "libraryReaderTocList" not in js2 or "Sommaire" not in js2:
        fail("Le sommaire cliquable du carnet est absent.")
    if "persistLibraryBeforeNavigation" not in js2 or "state.view==='library'&&view!=='library'" not in js:
        fail("La sauvegarde avant de quitter la Bibliothèque est absente.")
    if "libraryUndo" not in js2 or "libraryRedo" not in js2 or "libraryHistory" not in js2:
        fail("L’historique Annuler / Rétablir de l’éditeur est absent.")
    if "oncontextmenu" not in js2 or "libraryOpenWriteLink" not in js2:
        fail("Les liens ne sont pas ouvrables / modifiables directement en écriture.")
    if "libraryReaderSpreadToggle" not in js2 or "libraryReaderSpread" not in js2 or "is-spread" not in css:
        fail("Le choix une page / double page en lecture est absent.")
    if "createLibraryPage" not in js2 or "notebook.entries.push(entry)" not in js2:
        fail("La création locale de page sans rechargement est absente.")
    if "saveLibraryDomainConfig" not in js2 or "saveLibraryDomainCreate" not in js2 or "saveLibraryNotebook" not in js2:
        fail("Les éditeurs de structure n’utilisent pas de boutons d’enregistrement explicites.")
    if "insertLibraryImage" not in js2 or "library-image-resize-handle" not in js2 or "ondragstart" not in js2:
        fail("L’ajout, le déplacement ou le redimensionnement des images est absent.")
    if "makeInternalLibraryToken" not in js2 or "openLibraryInternalLinkModal" not in js2 or "libraryBacklinks" not in js2:
        fail("Les liens typés entre pages sont absents.")
    if "openLibraryWebLinkModal" not in js2 or "libraryOpenSelectedLink" not in js2 or "libraryEditSelectedLink" not in js2:
        fail("Les liens web ouvrables et modifiables sont absents.")
    if "openLibraryInternalLinkModal" not in js2 or "libraryBacklinks" not in js2 or "removeLibraryInternalLink" not in js2:
        fail("Les liens internes typés et modifiables sont absents.")
    if "libraryNodeProgress" not in js2 or "library-progress-presets" not in js2 or "calculé automatiquement" not in js2:
        fail("La progression assistée / automatique est absente.")
    if "Objectif principal" not in js2 or "Sous-objectifs / niveaux" not in js2:
        fail("Le constructeur Domaine → objectif → niveaux est absent.")
    if 'data-view="library"' not in index or '>Bibliothèque<' not in index:
        fail("La navigation principale ne contient pas Bibliothèque.")
    binding = "document.querySelectorAll('.tabs button[data-view]').forEach"
    if binding not in js:
        fail("Branchement des onglets de navigation absent.")
    if "main{margin-left:" in css or ".topbar{margin-left:" in css:
        fail("Le tiroir de navigation ne doit pas déplacer l'accueil ou l'en-tête.")

# 0.12.1 validates notebook persistence, history and reader spread.
def check_server(version: str) -> None:
    with tempfile.TemporaryDirectory(prefix="atelier-ci-") as td:
        data = Path(td) / "data"
        data.mkdir()

        proc = start_server(data)
        try:
            # Organisation 0.14 : CRUD réel sur une base de test isolée.
            status, habit = request("POST", "/api/habits", {"title":"Lire un chapitre","frequency":"weekly","target_per_week":3})
            if status != 201:fail("Création d'une habitude impossible.")
            hid=habit["id"]
            status, _ = request("PUT", f"/api/habits/{hid}/check", {"date":"2026-10-13","done":True})
            if status!=200:fail("Validation d'une journée impossible.")
            status, habits = request("GET", "/api/habits")
            if status!=200 or "2026-10-13" not in next(x for x in habits if x["id"]==hid)["checked_dates"]:
                fail("Journée non enregistrée.")
            status, _ = request("PUT", f"/api/habits/{hid}/check", {"date":"2026-10-13","done":False})
            if status!=200:fail("Annulation d'une journée impossible.")
            status, habits = request("GET", "/api/habits")
            if "2026-10-13" in next(x for x in habits if x["id"]==hid)["checked_dates"]:fail("Journée non annulée.")
            status, period = request("POST", "/api/cycle-periods", {"start_date":"2026-10-01","end_date":"2026-10-05"})
            if status!=201:fail("Création de période impossible.")
            status, _ = request("POST", "/api/cycle-periods", {"start_date":"2026-11-01","end_date":"2026-10-20"})
            if status!=400:fail("Une fin antérieure au début doit être refusée.")
            status, periods = request("GET", "/api/cycle-periods")
            if status!=200 or not any(x["id"]==period["id"] for x in periods):fail("Période non conservée.")
            status, _=request("DELETE",f"/api/cycle-periods/{period['id']}")
            if status!=200:fail("Suppression de période impossible.")
            status, _=request("DELETE",f"/api/habits/{hid}")
            if status!=200:fail("Archivage impossible.")
            status, runtime = request("GET", "/api/runtime-version")
            if status != 200 or runtime.get("version") != version:
                fail("Version runtime incorrect.")

            status, _ = request("GET", "/api/shutdown")
            if status != 404:
                fail("GET /api/shutdown doit être refusé.")

            status, created = request("POST", "/api/events", {
                "title": "Test 31",
                "event_date": "2027-01-31",
                "start_time": "10:00",
                "end_time": "11:00",
                "category": "general",
                "recurrence": "monthly",
                "show_in_month": True,
            })
            if status != 201 or not created.get("id"):
                fail("Impossible de créer l'événement de test.")

            status, events = request("GET", "/api/events?start=2027-01-01&end=2027-03-31")
            dates = [e.get("instance_date") for e in events if e.get("title") == "Test 31"]
            expected = ["2027-01-31", "2027-02-28", "2027-03-31"]
            if dates != expected:
                fail(f"Récurrence mensuelle incorrecte : {dates!r}")

            status, reminder = request("POST", "/api/reminders", {
                "title": "Test rappel indépendant",
                "remind_at": "2027-03-15T09:30",
            })
            if status != 201 or not reminder.get("id"):
                fail("Impossible de créer un rappel indépendant.")
            status, reminders = request("GET", "/api/reminders")
            if status != 200 or not any(r.get("entity_type") == "standalone" and r.get("title") == "Test rappel indépendant" for r in reminders):
                fail("Le rappel indépendant n'est pas relu correctement.")

            status, due = request("GET", "/api/reminders/due?now=2027-03-15T09:31:00")
            if status != 200 or not any(r.get("id") == reminder["id"] for r in due):
                fail("Un rappel arrivé à échéance n'est pas renvoyé par /api/reminders/due.")

            status, domain = request("POST", "/api/objective-nodes", {
                "node_type": "domain",
                "title": "Apprentissage",
                "description": "Domaine racine",
                "progress": 10,
            })
            if status != 201 or not domain.get("id"):
                fail("Impossible de créer un domaine d’objectif.")

            status, objective = request("POST", "/api/objective-nodes", {
                "parent_id": domain["id"],
                "node_type": "objective",
                "title": "Anglais",
                "description": "Objectif de test",
                "progress": 25,
            })
            if status != 201 or not objective.get("id"):
                fail("Impossible de créer un objectif enfant.")

            status, step = request("POST", "/api/objective-nodes", {
                "parent_id": objective["id"],
                "node_type": "step",
                "title": "Articles",
                "progress": 50,
            })
            if status != 201 or not step.get("id"):
                fail("Impossible de créer une sous-étape.")

            status, nodes = request("GET", "/api/objective-nodes")
            obj_row = next((x for x in nodes if x.get("id") == objective["id"]), None)
            if status != 200 or not obj_row or obj_row.get("parent_id") != domain["id"]:
                fail("La hiérarchie des objectifs n’est pas relue correctement.")

            status, linked_task = request("POST", "/api/tasks", {
                "title": "Réviser les articles",
                "objective_node_id": objective["id"],
                "due_date": "2027-03-16",
            })
            if status != 201 or not linked_task.get("id"):
                fail("Impossible de créer une tâche liée à un objectif.")
            status, tasks = request("GET", "/api/tasks")
            task_row = next((x for x in tasks if x.get("id") == linked_task["id"]), None)
            if not task_row or task_row.get("objective_node_id") != objective["id"] or task_row.get("objective_title") != "Anglais":
                fail("La tâche n’est pas reliée correctement à l’objectif.")

            status, section = request("POST", "/api/objective-library-sections", {
                "node_id": objective["id"],
                "title": "Grammaire",
                "section_type": "courses",
            })
            if status != 201 or not section.get("id"):
                fail("Impossible de créer une section de bibliothèque.")

            status, entry = request("POST", "/api/objective-library-entries", {
                "section_id": section["id"],
                "title": "Articles anglais",
                "url": "https://example.com/articles",
                "notes": "Référence de test",
            })
            if status != 201 or not entry.get("id"):
                fail("Impossible d’ajouter une ressource à la bibliothèque.")

            status, library = request("GET", f"/api/objective-library?node_id={objective['id']}")
            if status != 200 or not library.get("sections") or library["sections"][0].get("entries", [{}])[0].get("title") != "Articles anglais":
                fail("La bibliothèque personnalisée n’est pas relue correctement.")

            rich_notes = '@@ATELIER_RICH_V1@@<p><strong>Texte riche</strong> avec <a href="https://example.com" data-library-link-kind="web">un lien</a>.</p>'
            status, _ = request("PUT", f"/api/objective-library-entries/{entry['id']}", {
                "notes": rich_notes,
            })
            if status != 200:
                fail("Impossible d’enregistrer une page riche.")
            status, library_rich = request("GET", f"/api/objective-library?node_id={objective['id']}")
            rich_entry = library_rich.get("sections", [{}])[0].get("entries", [{}])[0]
            if rich_entry.get("notes") != rich_notes:
                fail("Le contenu riche d’une page n’est pas conservé à l’identique.")

            status, _ = request("PUT", f"/api/objective-nodes/{objective['id']}", {
                "title": "Anglais avancé",
                "progress": 60,
            })
            if status != 200:
                fail("Impossible de modifier un objectif.")

            status, _ = request("DELETE", f"/api/objective-nodes/{objective['id']}")
            if status != 200:
                fail("Impossible de supprimer un objectif et ses sous-éléments.")
            status, nodes_after = request("GET", "/api/objective-nodes")
            if any(x.get("id") in (objective["id"], step["id"]) for x in nodes_after):
                fail("La suppression en cascade de la carte des objectifs a échoué.")
            status, tasks_after_objective_delete = request("GET", "/api/tasks")
            detached = next((x for x in tasks_after_objective_delete if x.get("id") == linked_task["id"]), None)
            if not detached or detached.get("objective_node_id") is not None:
                fail("Une tâche doit être détachée quand son objectif est supprimé.")

            status, linked_event = request("POST", "/api/events", {
                "title": "RDV avec rappel",
                "event_date": "2027-03-20",
                "start_time": "14:00",
                "end_time": "15:00",
                "category": "general",
                "recurrence": "none",
                "show_in_month": True,
                "reminders": [{"title": "", "remind_at": "2027-03-19T09:00"}],
            })
            if status != 201 or not linked_event.get("id"):
                fail("Impossible de créer le rendez-vous avec rappel lié.")
            status, reminders = request("GET", "/api/reminders")
            linked = next((r for r in reminders if r.get("entity_type") == "event" and r.get("entity_id") == linked_event["id"]), None)
            if not linked:
                fail("Le rappel lié au rendez-vous est introuvable.")
            status, _ = request("PUT", f"/api/reminders/{linked['id']}", {
                "title": "Rappel modifié",
                "remind_at": "2027-03-19T10:15",
            })
            if status != 200:
                fail("Un rappel lié ne peut pas être modifié.")
            status, reminders = request("GET", "/api/reminders")
            edited = next((r for r in reminders if r.get("id") == linked["id"]), None)
            if not edited or edited.get("title") != "Rappel modifié" or edited.get("remind_at") != "2027-03-19T10:15":
                fail("La modification du rappel lié n'est pas conservée.")
            status, _ = request("DELETE", f"/api/reminders/{linked['id']}")
            if status != 200:
                fail("Un rappel lié ne peut pas être supprimé.")
            status, events_after = request("GET", "/api/events?start=2027-03-20&end=2027-03-20")
            if not any(e.get("id") == linked_event["id"] for e in events_after):
                fail("Supprimer un rappel lié ne doit pas supprimer son rendez-vous.")
            # Post-it : notes en base, pas uniquement dans le navigateur.
            status, notes = request("GET", "/api/postits")
            if status != 200 or not any(n['title'] == "Aujourd'hui" for n in notes):
                fail("Le Post-it par défaut n'a pas été créé.")
            status, created = request("POST", "/api/postits", {
                "title": "Courses à prévoir", "body": "Pense au lait", "color": "sage", "shape": "square"
            })
            if status != 201 or not created.get("id"):
                fail("Impossible de créer un Post-it.")
            note_id=created["id"]
            status, _ = request("PUT", f"/api/postits/{note_id}", {
                "title": "Courses et idées", "body": "Lien https://example.com",
                "color": "deep-blue", "shape": "pill"
            })
            if status != 200:
                fail("Impossible de modifier un Post-it.")
            status, notes = request("GET", "/api/postits")
            saved=next((n for n in notes if n['id'] == note_id), None)
            if not saved or saved['color'] != "deep-blue" or saved['shape'] != "pill" or "example.com" not in saved['body']:
                fail("Texte ou apparence du Post-it non persistés.")
            status, _ = request("PUT", f"/api/postits/{note_id}", {"archived": True})
            if status != 200 or any(n['id'] == note_id for n in request("GET", "/api/postits")[1]):
                fail("La note archivée doit disparaître de l'Accueil.")
            archived=request("GET", "/api/postits?archived=1")[1]
            if not any(n['id']==note_id for n in archived):
                fail("Le Post-it archivé doit rester récupérable.")
            status, _=request("PUT", f"/api/postits/{note_id}", {"archived": False})
            if status != 200:
                fail("Restauration du Post-it impossible.")

        finally:
            stop_server(proc)

        db = data / "atelier.db"
        with sqlite3.connect(db) as c:
            if c.execute("PRAGMA user_version").fetchone()[0] != 9:
                fail("PRAGMA user_version n'a pas été appliqué.")
            cols={row[1] for row in c.execute("PRAGMA table_info(desktop_postit_layout)")}
            if "locked" not in cols:
                fail("Le verrouillage des positions Post-it manque à la migration.")
            c.execute("PRAGMA user_version = 0")
            c.commit()

        proc = start_server(data)
        stop_server(proc)
        backups = list((data / "backups").glob("atelier-before-schema-*.db"))
        if not backups:
            fail("Aucune sauvegarde de base créée avant migration.")


if __name__ == "__main__":
    check_python_syntax()
    check_frontend_contract()
    version = check_manifest()
    check_server(version)
    print(f"OK — L'Atelier {version} passe les contrôles de release.")
