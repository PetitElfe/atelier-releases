"""Independent Windows desktop Post-it companion for L'Atelier du Goblin TEST.

Each note is an ordinary moveable Windows window, not a wallpaper modification
or an always-on-top overlay. It survives closing the main WebView app/server.
All note contents, sizes and positions are stored in the TEST SQLite database.
"""
from __future__ import annotations

import datetime as dt
from contextlib import contextmanager
import json
import hashlib
import re
import os
from pathlib import Path
import shutil
import sqlite3
import subprocess
import sys
import tempfile
import time
from native_postit_paper import SHAPES,PaperBackdrop,content_rect,minimum_size,TRANSPARENT

BASE = Path(r"E:\LATELIER_TEST_0180")
CODE = BASE / "code_0180"
DATA = BASE / "data"
DB = DATA / "atelier.db"
SCRIPT = CODE / "app" / "desktop_postits.py"
LOCK = DATA / "desktop-postits.lock"
WAKE = DATA / "desktop-postits-wake.txt"
RUNTIME = DATA / "desktop-postits-runtime.json"
AUTORUN_KEY = r"Software\Microsoft\Windows\CurrentVersion\Run"
AUTORUN_NAME = "LAtelierDuGoblinPostitsTEST"
COLORS = {
    "sage": ("#92B09A", "#213326"),
    "mauve": ("#AA91BE", "#2B2138"),
    "gold": ("#D2AF76", "#392919"),
    "red": ("#C48982", "#341C1A"),
    "pink": ("#D6A3B3", "#39212B"),
    "blue": ("#9FB5CA", "#273848"),
    "peach": ("#D8AD83", "#3C2C1B"),
    "cream": ("#DDC88B", "#493C23"),
    "deep-blue": ("#506F89", "#FBF3EB"),
    "deep-green": ("#4D705D", "#FBF3EB"),
}


def note_corner_radius(shape, width, height):
    """Round the real window on Windows 10 as well as Windows 11."""
    if shape == 'square':
        return 0
    if shape == 'pill':
        return max(0, min(44, int(width) // 4, int(height) // 2))
    return max(0, min(20, int(width) // 4, int(height) // 4))


def apply_note_shape(window, shape):
    if os.name != 'nt':
        return False
    import ctypes
    from ctypes import wintypes
    user, gdi = ctypes.windll.user32, ctypes.windll.gdi32
    user.GetParent.argtypes = [wintypes.HWND]
    user.GetParent.restype = wintypes.HWND
    user.GetWindowRect.argtypes = [wintypes.HWND, ctypes.POINTER(wintypes.RECT)]
    gdi.CreateRoundRectRgn.argtypes = [ctypes.c_int] * 6
    gdi.CreateRoundRectRgn.restype = wintypes.HANDLE
    gdi.CreateRectRgn.argtypes = [ctypes.c_int] * 4
    gdi.CreateRectRgn.restype = wintypes.HANDLE
    gdi.DeleteObject.argtypes = [wintypes.HANDLE]
    user.SetWindowRgn.argtypes = [wintypes.HWND, wintypes.HANDLE, wintypes.BOOL]
    hwnd = user.GetParent(window.winfo_id()) or window.winfo_id()
    bounds = wintypes.RECT()
    if not user.GetWindowRect(hwnd, ctypes.byref(bounds)):
        return False
    width, height = bounds.right-bounds.left, bounds.bottom-bounds.top
    radius = note_corner_radius(shape, width, height)
    region = (gdi.CreateRoundRectRgn(0, 0, width+1, height+1, radius*2, radius*2)
              if radius else gdi.CreateRectRgn(0, 0, width, height))
    if not region:
        return False
    if not user.SetWindowRgn(hwnd, region, True):
        gdi.DeleteObject(region)
        return False
    # Windows owns the region after SetWindowRgn succeeds.
    return True


def _guard():
    if os.name != "nt" or Path(__file__).resolve() != SCRIPT.resolve():
        raise RuntimeError("Post-it Windows réservés à l'installation TEST.")
    if (not (CODE / "manifest.json").is_file() or not DB.is_file() or
            (CODE / "app" / "VERSION").read_text(encoding="utf-8").strip() != "0.18.0"):
        raise RuntimeError("L'Atelier du Goblin TEST n'est pas installé ici.")
    if os.environ.get("ATELIER_PORT", "8876") != "8876":
        raise RuntimeError("Port TEST incorrect.")
    if (os.environ.get("ATELIER_DATA_DIR") and
            Path(os.environ["ATELIER_DATA_DIR"]).resolve() != DATA.resolve()):
        raise RuntimeError("Le dossier de données ne correspond pas au TEST.")
    for path in (BASE, CODE, CODE / "app", DATA):
        if path.is_symlink() or getattr(path, "is_junction", lambda: False)():
            raise RuntimeError("Dossier TEST redirigé, Post-it refusés.")


@contextmanager
def _db(db_path=DB):
    connection = sqlite3.connect(db_path, timeout=12)
    connection.row_factory = sqlite3.Row
    connection.execute("PRAGMA busy_timeout=12000")
    try:
        with connection:
            yield connection
    finally:
        connection.close()


def _update_in_progress():
    if (DATA/'safety-maintenance.json').exists():return True
    try:
        status = json.loads((DATA / "updater-state.json").read_text(encoding="utf-8"))
        return status.get("phase") in (
            "starting", "download", "stopping", "backup", "installing")
    except (OSError, ValueError):
        return False


def create_layout_table(db_path=DB):
    with _db(db_path) as c:
        c.execute("""CREATE TABLE IF NOT EXISTS desktop_postit_layout(
            note_id INTEGER PRIMARY KEY REFERENCES home_postits(id) ON DELETE CASCADE,
            x INTEGER NOT NULL, y INTEGER NOT NULL,
            width INTEGER NOT NULL, height INTEGER NOT NULL,
            locked INTEGER NOT NULL DEFAULT 0 CHECK(locked IN (0,1))
        )""")
        columns = {r["name"] for r in c.execute("PRAGMA table_info(desktop_postit_layout)")}
        if "locked" not in columns:
            c.execute("ALTER TABLE desktop_postit_layout ADD COLUMN locked INTEGER NOT NULL DEFAULT 0")
        if 'corner_rounded' not in columns:c.execute('ALTER TABLE desktop_postit_layout ADD COLUMN corner_rounded INTEGER')
        c.commit()


def note_rows(db_path=DB):
    with _db(db_path) as c:
        return [dict(r) for r in c.execute(
            """SELECT p.*,l.x,l.y,l.width,l.height,l.locked,l.corner_rounded
               FROM home_postits p LEFT JOIN desktop_postit_layout l ON p.id=l.note_id
               WHERE p.archived=0 ORDER BY p.id"""
        )]


def save_edit(note_id, prior, title, body, color, shape, db_path=DB):
    """Atomic compare-and-swap: never silently overwrite web editor changes."""
    if color not in COLORS or shape not in SHAPES:
        raise ValueError("Couleur ou forme incorrecte.")
    title = str(title).strip()[:120] or "Sans titre"
    body = str(body)[:20000]
    with _db(db_path) as c:
        stamp = dt.datetime.now().isoformat(timespec="microseconds")
        result = c.execute(
            """UPDATE home_postits SET title=?,body=?,color=?,shape=?,updated_at=?
               WHERE id=? AND archived=0 AND title=? AND body=? AND color=? AND shape=?""",
            (title, body, color, shape, stamp, note_id,
             prior["title"], prior["body"], prior["color"], prior["shape"]))
        c.commit()
        return bool(result.rowcount)


def save_layout(note_id, x, y, width, height, db_path=DB):
    x, y = int(x), int(y)
    width, height = max(240, min(1600, int(width))), max(175, min(1400, int(height)))
    with _db(db_path) as c:
        c.execute(
            """INSERT INTO desktop_postit_layout(note_id,x,y,width,height)
               SELECT id,?,?,?,? FROM home_postits WHERE id=? AND archived=0
               ON CONFLICT(note_id) DO UPDATE SET
                 x=excluded.x,y=excluded.y,width=excluded.width,height=excluded.height
               WHERE desktop_postit_layout.locked=0""",
            (x, y, width, height, note_id))
        c.commit()


def set_layout_lock(note_id, locked, db_path=DB):
    with _db(db_path) as c:
        changed = c.execute(
            "UPDATE desktop_postit_layout SET locked=? WHERE note_id=?",
            (int(bool(locked)), int(note_id)))
        if not changed.rowcount:
            raise ValueError("La position de cette note doit être enregistrée avant verrouillage.")


def set_corner_style(note_id,rounded,db_path=DB):
    with _db(db_path) as c:
        if not c.execute('UPDATE desktop_postit_layout SET corner_rounded=? WHERE note_id=?',(int(bool(rounded)),int(note_id))).rowcount:
            raise ValueError('Enregistre la position du Post-it avant ses coins.')


def create_note(db_path=DB, request_id=None):
    if request_id is not None and (not isinstance(request_id,str) or not re.fullmatch(r'[A-Za-z0-9_-]{1,100}',request_id)):
        raise ValueError('Identifiant de création invalide.')
    with _db(db_path) as c:
        c.execute('CREATE TABLE IF NOT EXISTS desktop_postit_requests(id TEXT PRIMARY KEY,note_id INTEGER NOT NULL)')
        c.execute('BEGIN IMMEDIATE')
        if request_id:
            previous=c.execute('SELECT note_id FROM desktop_postit_requests WHERE id=?',(request_id,)).fetchone()
            if previous:return previous['note_id']
        count=c.execute("SELECT COUNT(*) FROM home_postits WHERE archived=0").fetchone()[0]
        if count>=100:
            raise ValueError("Archive quelques Post-it avant d'en ajouter.")
        stamp=dt.datetime.now().isoformat(timespec="microseconds")
        cur=c.execute("""INSERT INTO home_postits
            (title,body,color,shape,archived,created_at,updated_at)
            VALUES('Nouveau Post-it','','gold','rounded',0,?,?)""", (stamp,stamp))
        if request_id:c.execute('INSERT INTO desktop_postit_requests VALUES(?,?)',(request_id,cur.lastrowid))
        return cur.lastrowid


def archived_notes(db_path=DB):
    with _db(db_path) as c:
        return [dict(row) for row in c.execute(
            "SELECT id,title,archived FROM home_postits WHERE archived=1 ORDER BY id DESC")]


def restore_note(note_id, db_path=DB):
    with _db(db_path) as c:
        if c.execute("SELECT COUNT(*) FROM home_postits WHERE archived=0").fetchone()[0]>=100:
            raise ValueError("Archive quelques Post-it avant de les restaurer.")
        result=c.execute(
            "UPDATE home_postits SET archived=0,updated_at=? WHERE id=? AND archived=1",
            (dt.datetime.now().isoformat(timespec="microseconds"),int(note_id)))
        return bool(result.rowcount)


def delete_note(note_id, db_path=DB):
    """Permanently delete a specific note and its window coordinates."""
    with _db(db_path) as c:
        c.execute("DELETE FROM desktop_postit_layout WHERE note_id=?", (int(note_id),))
        result = c.execute("DELETE FROM home_postits WHERE id=?", (int(note_id),))
        return bool(result.rowcount)


def _pythonw():
    executable = Path(sys.executable)
    if executable.name.lower() == "python.exe":
        gui = executable.with_name("pythonw.exe")
        if gui.exists():
            return str(gui)
    return str(executable)


def _startup_command():
    # Explicitly quote both absolute paths for Windows registry Run.
    return subprocess.list2cmdline([_pythonw(), str(SCRIPT)])


def startup_enabled():
    if os.name != "nt":
        return False
    import winreg
    try:
        with winreg.OpenKey(winreg.HKEY_CURRENT_USER, AUTORUN_KEY) as key:
            current, _ = winreg.QueryValueEx(key, AUTORUN_NAME)
        return str(current) == _startup_command()
    except FileNotFoundError:
        return False


def set_startup(enabled):
    _guard()
    import winreg
    if enabled:
        with winreg.CreateKeyEx(winreg.HKEY_CURRENT_USER, AUTORUN_KEY,
                                0, winreg.KEY_SET_VALUE) as key:
            winreg.SetValueEx(key, AUTORUN_NAME, 0, winreg.REG_SZ,
                              _startup_command())
    else:
        try:
            with winreg.OpenKey(winreg.HKEY_CURRENT_USER, AUTORUN_KEY, 0,
                                winreg.KEY_SET_VALUE) as key:
                winreg.DeleteValue(key, AUTORUN_NAME)
        except FileNotFoundError:
            pass
    return startup_enabled()


def is_running():
    if os.name != "nt" or not LOCK.parent.is_dir():
        return False
    import msvcrt
    with LOCK.open("a+b") as f:
        f.seek(0)
        try:
            msvcrt.locking(f.fileno(), msvcrt.LK_NBLCK, 1)
        except OSError:
            return True
        else:
            msvcrt.locking(f.fileno(), msvcrt.LK_UNLCK, 1)
            return False


def source_signature():
    digest=hashlib.sha256(SCRIPT.read_bytes());paper=SCRIPT.with_name('native_postit_paper.py')
    if paper.exists():digest.update(b'\0native_postit_paper\0'+paper.read_bytes())
    return digest.hexdigest()


def ensure_current_companion():
    if not is_running():return
    try:
        runtime=json.loads(RUNTIME.read_text(encoding='utf-8'))
        if runtime.get('source')==source_signature():return
    except (OSError,ValueError):pass
    raise RuntimeError('Un ancien compagnon Post-it est encore ouvert. Près de l’horloge Windows, ouvre son icône puis « Quitter les Post-it ». Rouvre ensuite les Post-it dans L’Atelier. Aucune nouvelle note n’a été créée.')


def wake(note_id=None, show_all=False, note_ids=None):
    value=json.dumps({'token':str(time.time_ns()),'note_id':note_id,'show_all':show_all,'note_ids':note_ids or []})
    WAKE.write_text(value,encoding='ascii')
    return value


def _wait_for_display(note_id=None, *, process=None, wake_token=None, timeout=8):
    expected=source_signature()
    deadline=time.monotonic()+timeout
    while time.monotonic()<deadline:
        if process is not None and process.poll() is not None:
            try:
                lines=(DATA/'desktop-postits.log').read_text(encoding='utf-8',errors='replace').splitlines()
                detail=next((line.strip() for line in reversed(lines) if line.strip()),'Arrêt du processus.')[:600]
            except OSError:detail='Le processus s’est arrêté.'
            raise RuntimeError('Le compagnon Post-it ne démarre pas : '+detail+' La note reste conservée ; réessaie sans en recréer une.')
        try:
            runtime=json.loads(RUNTIME.read_text(encoding='utf-8'))
            if runtime.get('source')==expected and runtime.get('ready') and (wake_token is None or runtime.get('wake_token')==wake_token):
                if note_id is not None and note_id in runtime.get('visible_ids',[]):return
                if note_id is None and (wake_token is None or runtime.get('wake_token')==wake_token):return
        except (OSError,ValueError):pass
        time.sleep(.08)
    raise RuntimeError('Le compagnon n’a pas confirmé l’affichage du Post-it. La note reste conservée. Ferme le compagnon près de l’horloge puis réessaie ; la même demande sera reprise sans doublon.')


def launch(note_id=None, *, show_all=False, visible_ids=None):
    _guard()
    ensure_current_companion()
    if is_running():
        token=wake(note_id,show_all=show_all,note_ids=visible_ids) if note_id is not None or show_all or visible_ids is not None else None
        _wait_for_display(note_id,wake_token=token)
        return {"ok": True, "running": True, "already_running": True, "display_confirmed":True}
    flags = (getattr(subprocess, "CREATE_NO_WINDOW", 0) |
             getattr(subprocess, "CREATE_NEW_PROCESS_GROUP", 0))
    env = os.environ.copy()
    env.update(ATELIER_DATA_DIR=str(DATA), ATELIER_PORT="8876")
    logfile = (DATA / "desktop-postits.log").open("ab", buffering=0)
    arguments=(['--notes',','.join(map(str,visible_ids))] if visible_ids is not None else ['--note',str(note_id)] if note_id is not None else [] if show_all else ['--background'])
    # Never hold CODE/app as the working directory: Windows then refuses
    # to rename that folder during updates, even after the server stops.
    try:
        process=subprocess.Popen([_pythonw(), str(SCRIPT)]+arguments, cwd=str(DATA),
                         env=env, stdin=subprocess.DEVNULL,
                         stdout=logfile, stderr=subprocess.STDOUT,
                         close_fds=True, creationflags=flags)
    finally:
        logfile.close()
    _wait_for_display(note_id,process=process)
    return {"ok": True, "running": True, "already_running": False, "display_confirmed":True}


def _run_gui(on_ready=None):
    import tkinter as tk
    from tkinter import messagebox
    import msvcrt

    lock_file = LOCK.open("a+b")
    lock_file.seek(0)
    try:
        msvcrt.locking(lock_file.fileno(), msvcrt.LK_NBLCK, 1)
    except OSError:
        wake()
        return

    loaded_signature=source_signature()
    RUNTIME.write_text(json.dumps({'pid':os.getpid(),'source':loaded_signature}),encoding='utf-8')
    restart_requested=False
    create_layout_table()
    root = tk.Tk()
    root.withdraw()
    initial_ids=({int(i) for i in sys.argv[sys.argv.index('--notes')+1].split(',') if i} if '--notes' in sys.argv else {int(sys.argv[sys.argv.index('--note')+1])} if '--note' in sys.argv else set() if '--background' in sys.argv else None)
    closed = {n['id'] for n in note_rows() if initial_ids is not None and n['id'] not in initial_ids}
    windows = {}
    wake_value = WAKE.read_text(encoding="ascii") if WAKE.exists() else ""
    tray = None

    class NoteWindow:
        def __init__(self, note, index):
            self.note = dict(note)
            self.dirty = False
            self.pending = None
            self.geo_pending = None
            self.lock_restore_pending = None
            self.shape_pending = None
            self.last_shaped_size = None
            self.drag_origin = None
            self.paper=None
            paper, ink = COLORS.get(note["color"], COLORS["gold"])
            self.window = tk.Toplevel(root)
            self.window.overrideredirect(tray is not None)
            if tray is not None:
                # WS_EX_TOOLWINDOW removes a note from taskbar and Alt+Tab.
                self.window.wm_attributes("-toolwindow", True)
            self.window.title("L'Atelier du Goblin · " + note["title"])
            self.window.configure(bg=paper)
            x = note["x"] if note["x"] is not None else 45 + (index % 5) * 46
            y = note["y"] if note["y"] is not None else 90 + (index % 5) * 45
            max_x = max(0, root.winfo_screenwidth()-240)
            max_y = max(0, root.winfo_screenheight()-160)
            x, y = max(0, min(int(x), max_x)), max(0, min(int(y), max_y))
            w, h = note["width"] or 300, note["height"] or 260
            self.window.geometry(f"{w}x{h}+{x}+{y}")
            self.window.minsize(*minimum_size(note['shape']))
            self.corners=tk.BooleanVar(value=bool(note.get('corner_rounded')) if note.get('corner_rounded') is not None else note['shape']!='square')
            self.paper_area=tk.Frame(self.window,bg=paper)
            self.paper_area.place(x=0,y=0,relwidth=1,relheight=1)
            self.locked = bool(note["locked"])
            self.fixed_geometry = (int(x),int(y),int(w),int(h))
            self.window.resizable(not self.locked, not self.locked)
            self.header = tk.Frame(self.paper_area, bg=paper)
            self.header.pack(fill="x", padx=10, pady=(9, 1))
            self.drag_handle = tk.Label(self.header, text="⠿", bg=paper, fg=ink,
                                        font=("Segoe UI", 13), width=2, cursor="fleur")
            self.drag_handle.pack(side="left")
            for widget in (self.header, self.drag_handle):
                widget.bind('<ButtonPress-1>', self._drag_start)
                widget.bind('<B1-Motion>', self._drag_move)
                widget.bind('<ButtonRelease-1>', self._drag_end)
            self.title = tk.Entry(self.header, relief="flat", bg=paper, fg=ink,
                                  font=("Segoe UI", 12, "bold"), insertbackground=ink)
            self.title.pack(side="left", fill="x", expand=True)
            self.title.insert(0, note["title"])
            self.new_button = tk.Button(self.header, text="＋", relief="flat",
                                        font=("Segoe UI", 14, "bold"), bg=paper, fg=ink,
                                        padx=8,pady=5,command=self._new_note, cursor="hand2")
            self.lock_button = tk.Button(self.header, relief="flat",
                                        bg=paper, fg=ink, cursor="hand2",
                                        font=("Segoe UI",12),padx=9,pady=6,
                                        command=self._toggle_lock)
            self._refresh_lock_button()
            self.color = tk.StringVar(value=note["color"])
            self.palette = tk.OptionMenu(self.header, self.color, *COLORS.keys(),
                                         command=lambda _: self._change_color())
            self.palette.configure(font=("Segoe UI", 8), bg=paper, fg=ink,
                                   activebackground=paper, highlightthickness=0,
                                   relief="flat", width=7)
            self.palette.pack(side="right")
            self.body = tk.Text(self.paper_area, wrap="word", undo=True, relief="flat",
                                bg=paper, fg=ink, insertbackground=ink,
                                font=("Segoe UI", 11), padx=12, pady=10)
            self.body.pack(fill="both", expand=True)
            self.body.insert("1.0", note["body"])
            self.footer = tk.Frame(self.paper_area, bg=paper)
            self.footer.pack(fill="x", padx=9, pady=(5, 2))
            self.ok_button = tk.Button(self.footer, text="✓ OK", bg=paper, fg=ink,
                                       relief="groove", font=("Segoe UI", 11, "bold"),
                                       padx=12,pady=6,command=self._close, cursor="hand2")
            self.delete_button = tk.Button(self.footer, text="Supprimer", bg=paper, fg=ink,
                                           relief="flat", font=("Segoe UI", 10),
                                           padx=9,pady=6,command=self._delete, cursor="hand2")
            self.delete_button.pack(side="left")
            self.resize_grip = tk.Label(self.footer, text="↘", bg=paper, fg=ink,
                                        font=("Segoe UI", 12), cursor="size_nw_se", padx=9, pady=3)
            # Resize handles live on the native border, not a permanent button.
            self.resize_grip.bind('<ButtonPress-1>', self._resize_start)
            self.resize_grip.bind('<B1-Motion>', self._resize_move)
            self.resize_grip.bind('<ButtonRelease-1>', self._drag_end)
            self.hint = tk.Label(self.paper_area, text="● Enregistré · Post-it indépendant",
                                 bg=paper, fg=ink, font=("Segoe UI", 8),
                                 anchor="w", padx=10)
            self.hint.pack(fill="x", padx=12, pady=(0, 9))
            menu_style=dict(tearoff=0,font=('Segoe UI',10),bg='#253128',fg='#ebeadd',activebackground='#455c45',activeforeground='#ffffff',borderwidth=1,relief='solid')
            self.menu = tk.Menu(self.window, **menu_style)
            self.menu.add_command(label='Modifier le texte',command=lambda:self.body.focus_set())
            self.menu.add_command(label="Nouveau Post-it", command=self._new_note)
            self.menu.add_command(label="Mes archives…", command=self._show_archives)
            self.menu.add_command(label="Verrouiller / Déverrouiller la position", command=self._toggle_lock)
            colors_menu=tk.Menu(self.menu,**menu_style)
            for color_name in COLORS:
                colors_menu.add_radiobutton(label={'gold':'Doré','sage':'Sauge','mauve':'Mauve','blue':'Bleu','pink':'Rose','red':'Rouge','peach':'Pêche','cream':'Crème','deep-blue':'Bleu profond','deep-green':'Vert profond'}.get(color_name,color_name),variable=self.color,value=color_name,command=self._change_color)
            self.menu.add_cascade(label="Couleur",menu=colors_menu)
            shapes_menu=tk.Menu(self.menu,**menu_style)
            for label,shape,width,height in (("Carré","square",300,300),("Feuille arrondie","rounded",320,400),("Bandeau","pill",460,210),("Étoile","star",540,540),("Cœur","heart",460,440),("Rond","circle",360,360)):
                shapes_menu.add_command(label=label,command=lambda s=shape,w=width,h=height:self._change_format(s,w,h))
            self.menu.add_cascade(label="Format",menu=shapes_menu)
            self.menu.add_command(label='Taille…',command=self._size_dialog)
            self.menu.add_checkbutton(label='Coins arrondis',variable=self.corners,command=self._change_corners)
            self.palette.pack_forget()
            self.delete_button.pack_forget()
            self.menu.add_separator()
            self.menu.add_command(label="Archiver ce Post-it", command=self._archive)
            self.menu.add_command(label="Supprimer définitivement…", command=self._delete)
            self.menu.add_command(label="✓ OK · Enregistrer et fermer", command=self._close)
            self.menu_button = tk.Button(self.header, text="···", relief="flat",
                                         font=("Segoe UI", 14, "bold"), bg=paper, fg=ink,
                                         padx=9, pady=3, cursor="hand2", command=self._open_menu)
            self.close_button=tk.Button(self.header,text="×",relief="flat",font=("Segoe UI",14),bg=paper,fg=ink,padx=8,pady=3,cursor="hand2",command=self._delete)
            self.close_button.pack(side="right")
            self.menu_button.pack(side="right")
            self.window.bind("<Button-3>", self._menu)
            self.title.bind("<Button-3>", self._menu)
            self.body.bind("<Button-3>", self._menu)
            self.title.bind("<KeyRelease>", self._changed)
            self.body.bind("<<Modified>>", self._body_changed)
            # Entrée insère toujours une nouvelle ligne dans le corps de la
            # note (et ne déclenche jamais le bouton « OK » par défaut).
            self.body.bind("<Return>", self._insert_newline)
            self.body.bind("<KP_Enter>", self._insert_newline)
            self.body.edit_modified(False)
            self.window.bind("<Configure>", self._geometry_changed)
            self.window.protocol("WM_DELETE_WINDOW", self._delete)
            self.window.bind('<Alt-F4>', lambda _: (self._close(), 'break')[1])
            self.window.update_idletasks()
            self.paper=PaperBackdrop(self.window,self._native_geometry,lambda:root.after_idle(self._save_geometry),self._paper_menu,lambda:self.locked)
            self.window.configure(bg=TRANSPARENT)
            self.window.attributes('-transparentcolor',TRANSPARENT)
            self.window.bind('<Destroy>',self._destroy_paper,add='+')
            self.window.bind('<Unmap>',self._mapping_changed,add='+')
            self.window.bind('<Map>',self._mapping_changed,add='+')
            root.after_idle(self._apply_shape)

        def _paper_menu(self,x,y):
            from types import SimpleNamespace
            self._menu(SimpleNamespace(x_root=x,y_root=y))

        def _native_geometry(self,geometry):
            if self.locked:return
            x,y,w,h=geometry
            self.window.geometry(f'{w}x{h}+{x}+{y}')

        def _mapping_changed(self,event):
            if event.widget!=self.window:return
            # Windows/Tk can temporarily unmap the wrapper while resizing it.
            # Do not hide its owner in the middle of that transition: hiding
            # the owner would hide the editor too, with no subsequent redraw.
            self.last_shaped_size=None
            root.after_idle(self._sync_mapping)

        def _sync_mapping(self):
            if not self.window.winfo_exists() or not self.paper:return
            if self.window.state()=='normal' and self.window.winfo_ismapped():self._apply_shape()
            else:self.paper.hide()

        def _size_dialog(self):
            if self.locked:
                self.hint.config(text='Déverrouille la position pour modifier la taille')
                return
            dialog=tk.Toplevel(self.window);dialog.title('Taille du Post-it');dialog.resizable(False,False)
            dialog.transient(self.window)
            values=[]
            for row,(label,value) in enumerate([('Largeur (px)',self.window.winfo_width()),('Hauteur (px)',self.window.winfo_height())]):
                tk.Label(dialog,text=label).grid(row=row,column=0,padx=12,pady=8,sticky='w')
                entry=tk.Entry(dialog,width=10);entry.insert(0,str(value));entry.grid(row=row,column=1,padx=12,pady=8);values.append(entry)
            def apply():
                try:
                    w,h=[int(e.get()) for e in values];mw,mh=minimum_size(self.note['shape'])
                    if not(mw<=w<=1600 and mh<=h<=1400):raise ValueError(f'Largeur : {mw} à 1600 px ; hauteur : {mh} à 1400 px.')
                except ValueError as error:
                    messagebox.showerror('Taille du Post-it',str(error),parent=dialog);return
                self._native_geometry((self.window.winfo_x(),self.window.winfo_y(),w,h))
                self.last_shaped_size=None;root.after_idle(self._apply_shape);root.after_idle(self._save_geometry);dialog.destroy()
            tk.Button(dialog,text='Annuler',command=dialog.destroy).grid(row=2,column=0,padx=12,pady=12)
            tk.Button(dialog,text='Appliquer',command=apply).grid(row=2,column=1,padx=12,pady=12)
            dialog.bind('<Return>',lambda _:apply());dialog.bind('<Escape>',lambda _:dialog.destroy());values[0].focus_set()

        def _destroy_paper(self,event):
            if event.widget==self.window and self.paper:self.paper.destroy();self.paper=None

        def _change_corners(self):
            self._save_geometry()
            try:set_corner_style(self.note['id'],self.corners.get());self.note['corner_rounded']=int(self.corners.get())
            except (sqlite3.Error,OSError,ValueError) as error:messagebox.showerror('Post-it',str(error),parent=self.window)
            self.last_shaped_size=None;root.after_idle(self._apply_shape)

        def present(self):
            self.window.deiconify()
            if self.paper:self.last_shaped_size=None;self._apply_shape();self.paper.raise_briefly()
            # A tool window can otherwise open behind the foreground WebView.
            # Raise it for this explicit request, then restore ordinary stacking.
            self.window.attributes('-topmost',True)
            self.window.lift()
            self.window.focus_force()
            def release():
                if self.window.winfo_exists():self.window.attributes('-topmost',False)
            root.after(220,release)

        def _open_menu(self):
            try:
                self.menu.tk_popup(self.menu_button.winfo_rootx(),
                                   self.menu_button.winfo_rooty()+self.menu_button.winfo_height())
            finally:
                self.menu.grab_release()

        def _drag_start(self, event):
            if self.locked:
                self.hint.config(text="Position verrouillée · options dans ···")
                return 'break'
            self.drag_origin=(event.x_root,event.y_root,self.window.winfo_x(),self.window.winfo_y())

        def _drag_move(self, event):
            if self.locked or not self.drag_origin:return 'break'
            px,py,x,y=self.drag_origin
            self.window.geometry(f'+{max(0,x+event.x_root-px)}+{max(0,y+event.y_root-py)}')

        def _resize_start(self, event):
            if not self.locked:
                self.drag_origin=(event.x_root,event.y_root,self.window.winfo_width(),self.window.winfo_height())

        def _resize_move(self, event):
            if self.locked or not self.drag_origin:return 'break'
            px,py,w,h=self.drag_origin
            self.window.geometry(f'{max(240,w+event.x_root-px)}x{max(175,h+event.y_root-py)}')

        def _drag_end(self, _):
            self.drag_origin=None
            self._save_geometry()

        def _apply_shape(self):
            self.shape_pending=None
            if not self.window.winfo_exists():return
            if self.window.state()!='normal':
                if self.paper:self.paper.hide()
                return
            w,h=self.window.winfo_width(),self.window.winfo_height()
            size=(w,h,self.note['shape'],self.color.get(),self.corners.get(),self.window.winfo_x(),self.window.winfo_y())
            if size==self.last_shaped_size:return
            if self.paper:
                self.paper_area.place(relwidth='',relheight='',x=content_rect(self.note['shape'],w,h)[0],y=content_rect(self.note['shape'],w,h)[1],width=content_rect(self.note['shape'],w,h)[2],height=content_rect(self.note['shape'],w,h)[3])
                self.paper.update((self.window.winfo_x(),self.window.winfo_y(),w,h),self.note['shape'],COLORS[self.color.get()][0],self.corners.get())
                self.last_shaped_size=size

        def _refresh_lock_button(self):
            self.lock_button.configure(text="🔒" if self.locked else "🔓")
            self.lock_button.bind("<Enter>", lambda _: self.hint.config(
                text="Position verrouillée : le texte reste modifiable" if self.locked
                else "Cliquer sur le cadenas pour bloquer la position"))
            self.lock_button.bind("<Leave>", lambda _: self.hint.config(
                text="● Enregistré · Post-it indépendant" if not self.dirty
                else "● Modification…"))

        def _toggle_lock(self):
            if _update_in_progress():
                self.hint.config(text="● Mise à jour en cours — réessaie après")
                return
            if self.geo_pending:
                root.after_cancel(self.geo_pending)
                self.geo_pending = None
            if self.lock_restore_pending:
                root.after_cancel(self.lock_restore_pending)
                self.lock_restore_pending = None
            self.window.update_idletasks()
            geometry=(self.window.winfo_x(),self.window.winfo_y(),
                      self.window.winfo_width(),self.window.winfo_height())
            try:
                if not self.locked:
                    save_layout(self.note["id"], *geometry)
                else:
                    # Existing frozen coordinates must not move when unlocking.
                    geometry=self.fixed_geometry
                set_layout_lock(self.note["id"], not self.locked)
            except (sqlite3.Error,OSError,ValueError):
                self.hint.config(text="● Impossible de modifier le verrouillage")
                return
            self.locked = not self.locked
            self.fixed_geometry = geometry
            self.window.resizable(not self.locked, not self.locked)
            if self.locked:
                x,y,w,h=self.fixed_geometry
                self.window.geometry(f"{w}x{h}+{x}+{y}")
            self.note["locked"]=int(self.locked)
            self._refresh_lock_button()
            self.hint.config(text="🔒 Position et taille verrouillées" if self.locked
                             else "🔓 Position et taille modifiables")

        def _change_format(self,shape,width,height):
            if not self._save():return
            try:
                if not save_edit(self.note["id"],self.note,self.note["title"],self.note["body"],self.note["color"],shape):
                    self.hint.config(text="Modifié ailleurs : actualise le Post-it")
                    return
                self.note["shape"]=shape
                if self.note.get('corner_rounded') is None:self.corners.set(shape!='square')
                self.window.minsize(*minimum_size(shape))
                self.menu.entryconfigure('Coins arrondis',state='disabled' if shape=='circle' else 'normal')
                if not self.locked:
                    self.window.geometry(f"{width}x{height}+{self.window.winfo_x()}+{self.window.winfo_y()}")
                root.after_idle(self._apply_shape)
                self.hint.config(text="Format enregistré"+(" · taille verrouillée" if self.locked else ""))
            except (sqlite3.Error,OSError,ValueError) as error:
                messagebox.showerror("Post-it",str(error),parent=self.window)

        def _new_note(self):
            if _update_in_progress():
                self.hint.config(text="● Patiente jusqu’à la fin de la mise à jour")
                return
            try:
                note_id=create_note()
                wake(note_id)
            except (sqlite3.Error,OSError,ValueError) as error:
                messagebox.showerror("Post-it", str(error), parent=self.window)

        def _show_archives(self):
            show_archives(self.window)

        def _menu(self, event):
            try:
                self.menu.tk_popup(event.x_root, event.y_root)
            finally:
                self.menu.grab_release()
            # Stop Tk bindtag propagation: title/body and Toplevel both bind
            # Button-3. Otherwise a second menu reopens after choosing an action.
            return "break"

        def _insert_newline(self, _=None):
            self.body.insert("insert", "\n")
            self.body.see("insert")
            self._changed()
            return "break"

        def _body_changed(self, _=None):
            if self.body.edit_modified():
                self.body.edit_modified(False)
                self._changed()

        def _changed(self, _=None):
            self.dirty = True
            self.hint.config(text="● Modification…")
            if self.pending:
                root.after_cancel(self.pending)
            self.pending = root.after(900, self._save)

        def _change_color(self):
            paper, ink = COLORS[self.color.get()]
            for item in (self.paper_area, self.header, self.title, self.palette, self.drag_handle, self.menu_button, self.close_button, self.resize_grip,
                         self.footer, self.ok_button, self.delete_button,
                         self.new_button, self.lock_button, self.body, self.hint):
                item.configure(bg=paper)
            self.title.config(fg=ink, insertbackground=ink)
            self.body.config(fg=ink, insertbackground=ink)
            self.hint.config(fg=ink)
            self.palette.config(fg=ink, activebackground=paper)
            self._changed()
            root.after_idle(self._apply_shape)

        def _save(self):
            self.pending = None
            if not self.dirty:
                return True
            if _update_in_progress():
                self.hint.config(text="● Mise à jour en cours — sauvegarde après redémarrage")
                self.pending = root.after(1700, self._save)
                return False
            title = self.title.get().strip() or "Sans titre"
            body = self.body.get("1.0", "end-1c")
            color = self.color.get()
            if len(body) > 20000:
                self.hint.config(text="Texte trop long — 20 000 caractères maximum")
                return False
            try:
                ok = save_edit(self.note["id"], self.note, title, body,
                               color, self.note["shape"])
            except (OSError, sqlite3.Error, ValueError) as exc:
                self.hint.config(text="Enregistrement impossible, réessaie")
                return False
            if not ok:
                self.hint.config(text="● Modifié dans L’Atelier — vérifie la version")
                self.dirty = False
                self.refresh(next((n for n in note_rows()
                                   if n["id"] == self.note["id"]), None))
                return False
            self.note.update(title=title, body=body, color=color)
            self.dirty = False
            self.window.title("L'Atelier du Goblin · " + title)
            self.hint.config(text="● Enregistré · Post-it indépendant")
            return True

        def refresh(self, note):
            if not note or self.dirty:
                return
            changes = any(self.note.get(k) != note[k] for k in
                          ("title", "body", "color", "shape"))
            if not changes:
                return
            self.note = dict(note)
            self.title.delete(0, "end")
            self.title.insert(0, note["title"])
            self.body.delete("1.0", "end")
            self.body.insert("1.0", note["body"])
            self.body.edit_modified(False)
            self.color.set(note["color"])
            paper, ink = COLORS.get(note["color"], COLORS["gold"])
            for item in (self.paper_area, self.header, self.title, self.palette, self.drag_handle, self.menu_button, self.close_button, self.resize_grip,
                         self.footer, self.ok_button, self.delete_button,
                         self.new_button, self.lock_button, self.body, self.hint):
                item.configure(bg=paper)
            self.title.config(fg=ink, insertbackground=ink)
            self.body.config(fg=ink, insertbackground=ink)
            self.hint.config(fg=ink)
            self.window.title("L'Atelier du Goblin · " + note["title"])
            root.after_idle(self._apply_shape)

        def _geometry_changed(self, event):
            if event.widget != self.window or self.window.state() != "normal":
                return
            if self.shape_pending:root.after_cancel(self.shape_pending)
            self.shape_pending=root.after(16,self._apply_shape)
            if self.locked:
                # Ne pas repositionner à chaque événement Configure : cela fait
                # trembler la fenêtre lorsque Windows termine un glisser.
                if self.lock_restore_pending:
                    root.after_cancel(self.lock_restore_pending)
                x,y,w,h=self.fixed_geometry
                real=(self.window.winfo_x(),self.window.winfo_y(),
                      self.window.winfo_width(),self.window.winfo_height())
                if real!=(x,y,w,h):
                    self.lock_restore_pending=root.after(350,self._restore_locked_geometry)
                return
            if self.geo_pending:
                root.after_cancel(self.geo_pending)
            self.geo_pending = root.after(1200, self._save_geometry)

        def _restore_locked_geometry(self):
            self.lock_restore_pending=None
            if not self.locked or not self.window.winfo_exists():return
            x,y,w,h=self.fixed_geometry
            actual=(self.window.winfo_x(),self.window.winfo_y(),
                    self.window.winfo_width(),self.window.winfo_height())
            if actual!=(x,y,w,h):
                self.window.geometry(f"{w}x{h}+{x}+{y}")

        def _save_geometry(self):
            self.geo_pending = None
            if self.locked or not self.window.winfo_exists():
                return
            if _update_in_progress():
                self.geo_pending = root.after(1700, self._save_geometry)
                return
            try:
                save_layout(self.note["id"], self.window.winfo_x(),
                            self.window.winfo_y(), self.window.winfo_width(),
                            self.window.winfo_height())
            except (sqlite3.Error, OSError):
                pass

        def _archive(self):
            if _update_in_progress():
                self.hint.config(text="● Termine d’abord la mise à jour")
                return
            if not messagebox.askyesno("Archiver", "Archiver ce Post-it ?", parent=self.window):
                return
            if self.pending:
                root.after_cancel(self.pending)
                self.pending=None
            if not self._save():
                return
            with _db() as c:
                c.execute("UPDATE home_postits SET archived=1 WHERE id=?",
                          (self.note["id"],))
                c.commit()
            self.dirty = False
            self._close()

        def _delete(self):
            if _update_in_progress():
                self.hint.config(text="● Attends la fin de la mise à jour")
                return
            if not messagebox.askyesno(
                "Supprimer définitivement ?",
                "Supprimer définitivement « " + self.title.get().strip() +
                " » ?\n\nCette action est irréversible. "
                "Pour conserver la note, utilise plutôt « Archiver ».",
                icon="warning", parent=self.window):
                return
            try:
                if not delete_note(self.note["id"]):
                    raise ValueError("Cette note n'existe plus.")
            except (sqlite3.Error,OSError,ValueError) as exc:
                messagebox.showerror("Suppression impossible",str(exc),parent=self.window)
                return
            self.dirty=False
            if self.pending:
                root.after_cancel(self.pending)
                self.pending=None
            if self.geo_pending:
                root.after_cancel(self.geo_pending)
                self.geo_pending=None
            closed.add(self.note["id"])
            windows.pop(self.note["id"],None)
            self.window.destroy()

        def _close(self):
            if self.pending and self.window.winfo_exists():
                root.after_cancel(self.pending)
                self.pending=None
            if not self._save():
                self.hint.config(text="Non enregistré — réessaie avant de fermer")
                return
            if self.dirty:
                self.hint.config(text="Non enregistré — réessaie avant de fermer")
                return
            if self.geo_pending:
                root.after_cancel(self.geo_pending)
                self._save_geometry()
            closed.add(self.note["id"])
            windows.pop(self.note["id"], None)
            self.window.destroy()

    def show_archives(parent=None):
        if _update_in_progress():
            return
        rows=archived_notes()
        if not rows:
            messagebox.showinfo("Archives", "Aucun Post-it archivé.", parent=parent or root)
            return
        dialog=tk.Toplevel(root)
        dialog.title("Archives des Post-it — L’Atelier du Goblin")
        dialog.geometry("390x350")
        if parent is not None:
            dialog.transient(parent)
        elif tray is not None:
            dialog.wm_attributes("-toolwindow",True)
        tk.Label(dialog, text="Choisis la note à restaurer :", pady=12).pack()
        listing=tk.Listbox(dialog, font=("Segoe UI", 10))
        listing.pack(fill="both",expand=True,padx=15)
        for note in rows:
            listing.insert("end",note["title"])
        def restore_selected():
            current=listing.curselection()
            if not current or _update_in_progress():
                return
            try:
                if restore_note(rows[current[0]]["id"]):
                    wake(rows[current[0]]["id"])
                dialog.destroy()
            except (sqlite3.Error,OSError,ValueError) as exc:
                messagebox.showerror("Archives",str(exc),parent=dialog)
        tk.Button(dialog,text="Restaurer sur le Bureau",command=restore_selected).pack(pady=9)
        tk.Button(dialog,text="Fermer",command=dialog.destroy).pack(pady=(0,9))
        dialog.lift()

    def show_all():
        # Closing a note with OK only hides it for this session.
        closed.clear()
        for window in list(windows.values()):
            window.present()
        wake()

    def create_new():
        if _update_in_progress():
            return
        try:
            note_id=create_note()
            wake(note_id)
        except (sqlite3.Error,OSError,ValueError) as exc:
            messagebox.showerror("Post-it",str(exc),parent=root)

    def quit_all():
        if _update_in_progress():
            messagebox.showinfo("Post-it", "La mise à jour est en cours.",parent=root)
            return
        # Never close the independent process with an unsaved note.
        for widget in list(windows.values()):
            if widget.pending:
                root.after_cancel(widget.pending)
                widget.pending=None
            if not widget._save():
                messagebox.showwarning("Post-it non enregistré",
                    "Impossible de quitter : une note n'a pas été sauvegardée.",
                    parent=widget.window)
                return
            if widget.geo_pending:
                root.after_cancel(widget.geo_pending)
                widget._save_geometry()
        root.quit()
        return True

    try:
        from windows_tray import WindowsTray
        tray = WindowsTray(root,show_all,create_new,show_archives,quit_all,
                           BASE / "desktop" / "LAtelierDuGoblin_TEST.exe")
    except (OSError,RuntimeError,AttributeError) as exc:
        # If Explorer's tray is unavailable, keep ordinary taskbar windows
        # rather than hiding the Post-its without a way to reopen them.
        print("Windows tray unavailable:",exc,flush=True)
        tray = None

    def publish_runtime():
        visible=[note_id for note_id,widget in windows.items() if widget.window.winfo_exists() and widget.window.winfo_viewable()]
        value={'pid':os.getpid(),'source':loaded_signature,'ready':True,'visible_ids':visible,'wake_token':wake_value}
        try:
            pending=RUNTIME.with_suffix('.tmp')
            pending.write_text(json.dumps(value),encoding='utf-8');pending.replace(RUNTIME)
        except OSError as exc:print('Post-it display confirmation:',str(exc),flush=True)

    def sync():
        nonlocal wake_value,restart_requested
        if _update_in_progress():
            root.after(1700, sync)
            return
        try:
            if source_signature()!=loaded_signature:
                if quit_all():restart_requested=True;return
                root.after(1700,sync);return
        except OSError:pass
        try:
            import native_reminders
            native_reminders.tick()
        except (ImportError,OSError,RuntimeError):pass
        try:
            current_wake = WAKE.read_text(encoding="ascii") if WAKE.exists() else ""
            if current_wake != wake_value:
                try:request=json.loads(current_wake)
                except ValueError:request={}
                if not isinstance(request,dict):request={}
                if request.get('show_all'):closed.clear()
                targets={i for i in request.get('note_ids',[]) if type(i) is int}
                target=request.get('note_id')
                if type(target) is int:targets.add(target)
                closed.difference_update(targets)
                for note_id,widget in list(windows.items()):
                    if request.get('show_all') or note_id in targets:
                        widget.present()
                wake_value = current_wake
            rows = note_rows()
            ids = {row["id"] for row in rows}
            for note_id in list(windows):
                if note_id not in ids:
                    widget = windows.pop(note_id)
                    widget.dirty = False
                    closed.add(note_id)
                    widget.window.destroy()
            for i, note in enumerate(rows):
                if note["id"] in windows:
                    windows[note["id"]].refresh(note)
                elif note["id"] not in closed:
                    windows[note["id"]] = NoteWindow(note, i)
                    windows[note["id"]].present()
            root.after_idle(publish_runtime)
        except (OSError, sqlite3.Error) as exc:
            print("Post-it sync error:", str(exc), flush=True)
        root.after(1700, sync)

    sync()
    # Raccourci Windows disponible même après fermeture de la fenêtre de
    # L'Atelier, tant que le compagnon est actif près de l'horloge.
    hotkey_cleanup = None
    try:
        import quick_capture_native
        hotkey_cleanup = quick_capture_native.install(root, DATA, DB, on_postit=wake)
    except (OSError, RuntimeError, AttributeError, ImportError) as exc:
        print("Capture globale indisponible:", str(exc), flush=True)
    if on_ready is not None:root.after_idle(on_ready)
    try:
        root.mainloop()
    finally:
        if hotkey_cleanup:
            try:hotkey_cleanup()
            except OSError:pass
        for widget in list(windows.values()):
            widget._save()
            widget._save_geometry()
        # All callbacks belong to this GUI session. Never let a pending shape,
        # geometry or polling callback survive destroying its Tk interpreter.
        for callback in root.tk.call('after','info'):
            root.after_cancel(callback)
        if tray is not None:
            tray.destroy()
        root.destroy()
        lock_file.close()
        RUNTIME.unlink(missing_ok=True)
    return {'visible_ids':list(windows)} if restart_requested else False


def _self_test():
    with tempfile.TemporaryDirectory() as work:
        db = Path(work) / "test.db"
        with _db(db) as c:
            c.executescript("""PRAGMA foreign_keys=ON;
            CREATE TABLE home_postits (
              id INTEGER PRIMARY KEY, title TEXT NOT NULL, body TEXT NOT NULL,
              color TEXT NOT NULL, shape TEXT NOT NULL, archived INTEGER NOT NULL,
              created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
            INSERT INTO home_postits VALUES
              (1,'Texte original','Bonjour','gold','rounded',0,'t','t'),
              (2,'Archivée','secret','sage','square',1,'t','t');""")
        create_layout_table(db)
        assert len(note_rows(db)) == 1
        old = note_rows(db)[0]
        assert save_edit(1, old, "Nouvelle note", "Bonsoir", "sage", "rounded", db)
        assert not save_edit(1, old, "Ecrasement", "NON", "gold", "rounded", db)
        save_layout(1, 123, 234, 320, 260, db)
        row = note_rows(db)[0]
        assert (row["title"], row["body"], row["x"], row["width"]) == (
            "Nouvelle note", "Bonsoir", 123, 320)
        set_layout_lock(1, True, db)
        assert note_rows(db)[0]["locked"]==1
        save_layout(1,500,600,500,500,db)
        assert (note_rows(db)[0]["x"],note_rows(db)[0]["width"])==(123,320)
        assert save_edit(1,note_rows(db)[0],"Verrouillée","texte éditable","blue","rounded",db)
        set_layout_lock(1,False,db)
        save_layout(1,321,432,350,275,db)
        assert (note_rows(db)[0]["x"],note_rows(db)[0]["width"])==(321,350)
        fresh=create_note(db)
        assert any(row["id"]==fresh for row in note_rows(db))
        assert len(archived_notes(db))==1
        assert restore_note(2,db)
        assert any(row["id"]==2 for row in note_rows(db))
        with _db(db) as c:
            c.execute("UPDATE home_postits SET archived=1 WHERE id=2")
        # Ancienne base v6 : ajouter une colonne locked sans perte de géométrie.
        with _db(db) as c:
            c.execute("ALTER TABLE desktop_postit_layout RENAME TO old_layout")
            c.execute("""CREATE TABLE desktop_postit_layout(
                note_id INTEGER PRIMARY KEY,x INTEGER NOT NULL,y INTEGER NOT NULL,
                width INTEGER NOT NULL,height INTEGER NOT NULL)""")
            c.execute("""INSERT INTO desktop_postit_layout
                SELECT note_id,x,y,width,height FROM old_layout""")
            c.execute("DROP TABLE old_layout")
        create_layout_table(db)
        assert note_rows(db)[0]["x"]==321 and note_rows(db)[0]["locked"]==0
        assert not any(note["title"] == "Archivée" for note in note_rows(db))
        with _db(db) as c:
            c.execute("UPDATE home_postits SET archived=1 WHERE id=1")
        assert all(note['id'] != 1 for note in note_rows(db))
        assert any(note['id'] == fresh for note in note_rows(db))
        assert delete_note(1,db)
        assert not delete_note(1,db)
        with _db(db) as c:
            assert c.execute("SELECT COUNT(*) FROM desktop_postit_layout WHERE note_id=1").fetchone()[0]==0
            assert c.execute("SELECT COUNT(*) FROM home_postits WHERE id=1").fetchone()[0]==0
            assert c.execute("SELECT COUNT(*) FROM home_postits WHERE id=?", (fresh,)).fetchone()[0]==1
    print("PASS: Post-it SQLite, lock, archive, deletion, geometry")


if __name__ == "__main__":
    if "--self-test" in sys.argv:
        _self_test()
    else:
        _guard()
        restart=_run_gui()
        if restart:launch(visible_ids=restart['visible_ids'])
