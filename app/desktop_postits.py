"""Independent Windows desktop Post-it companion for L'Atelier du Goblin TEST.

Each note is an ordinary moveable Windows window, not a wallpaper modification
or an always-on-top overlay. It survives closing the main WebView app/server.
All note contents, sizes and positions are stored in the TEST SQLite database.
"""
from __future__ import annotations

import datetime as dt
import json
import os
from pathlib import Path
import shutil
import sqlite3
import subprocess
import sys
import tempfile
import time

BASE = Path(r"E:\LATELIER_TEST_0180")
CODE = BASE / "code_0180"
DATA = BASE / "data"
DB = DATA / "atelier.db"
SCRIPT = CODE / "app" / "desktop_postits.py"
LOCK = DATA / "desktop-postits.lock"
WAKE = DATA / "desktop-postits-wake.txt"
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


def _db(db_path=DB):
    connection = sqlite3.connect(db_path, timeout=12)
    connection.row_factory = sqlite3.Row
    connection.execute("PRAGMA busy_timeout=12000")
    return connection


def create_layout_table(db_path=DB):
    with _db(db_path) as c:
        c.execute("""CREATE TABLE IF NOT EXISTS desktop_postit_layout(
            note_id INTEGER PRIMARY KEY REFERENCES home_postits(id) ON DELETE CASCADE,
            x INTEGER NOT NULL, y INTEGER NOT NULL,
            width INTEGER NOT NULL, height INTEGER NOT NULL
        )""")
        c.commit()


def note_rows(db_path=DB):
    with _db(db_path) as c:
        return [dict(r) for r in c.execute(
            """SELECT p.*,l.x,l.y,l.width,l.height
               FROM home_postits p LEFT JOIN desktop_postit_layout l ON p.id=l.note_id
               WHERE p.archived=0 ORDER BY p.id"""
        )]


def save_edit(note_id, prior, title, body, color, shape, db_path=DB):
    """Atomic compare-and-swap: never silently overwrite web editor changes."""
    if color not in COLORS or shape not in ("square", "rounded", "pill"):
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
    width, height = max(220, min(950, int(width))), max(160, min(900, int(height)))
    with _db(db_path) as c:
        c.execute(
            """INSERT INTO desktop_postit_layout(note_id,x,y,width,height)
               SELECT id,?,?,?,? FROM home_postits WHERE id=? AND archived=0
               ON CONFLICT(note_id) DO UPDATE SET
                 x=excluded.x,y=excluded.y,width=excluded.width,height=excluded.height""",
            (x, y, width, height, note_id))
        c.commit()


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


def wake():
    # The companion checks this on its own clock; server may shut down now.
    WAKE.write_text(str(time.time_ns()), encoding="ascii")


def launch():
    _guard()
    if is_running():
        wake()
        return {"ok": True, "running": True, "already_running": True}
    flags = (getattr(subprocess, "CREATE_NO_WINDOW", 0) |
             getattr(subprocess, "CREATE_NEW_PROCESS_GROUP", 0))
    env = os.environ.copy()
    env.update(ATELIER_DATA_DIR=str(DATA), ATELIER_PORT="8876")
    logfile = (DATA / "desktop-postits.log").open("ab", buffering=0)
    try:
        subprocess.Popen([_pythonw(), str(SCRIPT)], cwd=str(CODE / "app"),
                         env=env, stdin=subprocess.DEVNULL,
                         stdout=logfile, stderr=subprocess.STDOUT,
                         close_fds=True, creationflags=flags)
    finally:
        logfile.close()
    return {"ok": True, "running": True, "already_running": False}


def _run_gui():
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

    create_layout_table()
    root = tk.Tk()
    root.withdraw()
    closed = set()
    windows = {}
    wake_value = WAKE.read_text(encoding="ascii") if WAKE.exists() else ""

    class NoteWindow:
        def __init__(self, note, index):
            self.note = dict(note)
            self.dirty = False
            self.pending = None
            self.geo_pending = None
            paper, ink = COLORS.get(note["color"], COLORS["gold"])
            self.window = tk.Toplevel(root)
            self.window.title("L'Atelier du Goblin · " + note["title"])
            self.window.configure(bg=paper)
            x = note["x"] if note["x"] is not None else 45 + (index % 5) * 46
            y = note["y"] if note["y"] is not None else 90 + (index % 5) * 45
            max_x = max(0, root.winfo_screenwidth()-240)
            max_y = max(0, root.winfo_screenheight()-160)
            x, y = max(0, min(int(x), max_x)), max(0, min(int(y), max_y))
            w, h = note["width"] or 300, note["height"] or 260
            self.window.geometry(f"{w}x{h}+{x}+{y}")
            self.window.minsize(240, 175)
            self.header = tk.Frame(self.window, bg=paper)
            self.header.pack(fill="x", padx=10, pady=(9, 1))
            self.title = tk.Entry(self.header, relief="flat", bg=paper, fg=ink,
                                  font=("Segoe UI", 12, "bold"), insertbackground=ink)
            self.title.pack(side="left", fill="x", expand=True)
            self.title.insert(0, note["title"])
            self.color = tk.StringVar(value=note["color"])
            self.palette = tk.OptionMenu(self.header, self.color, *COLORS.keys(),
                                         command=lambda _: self._change_color())
            self.palette.configure(font=("Segoe UI", 8), bg=paper, fg=ink,
                                   activebackground=paper, highlightthickness=0,
                                   relief="flat", width=7)
            self.palette.pack(side="right")
            self.body = tk.Text(self.window, wrap="word", undo=True, relief="flat",
                                bg=paper, fg=ink, insertbackground=ink,
                                font=("Segoe UI", 11), padx=12, pady=10)
            self.body.pack(fill="both", expand=True)
            self.body.insert("1.0", note["body"])
            self.hint = tk.Label(self.window, text="● Enregistré · Post-it indépendant",
                                 bg=paper, fg=ink, font=("Segoe UI", 8),
                                 anchor="w", padx=10)
            self.hint.pack(fill="x", pady=(0, 5))
            self.menu = tk.Menu(self.window, tearoff=0)
            self.menu.add_command(label="Archiver ce Post-it", command=self._archive)
            self.menu.add_command(label="Fermer cette note (session)", command=self._close)
            self.window.bind("<Button-3>", self._menu)
            self.title.bind("<Button-3>", self._menu)
            self.body.bind("<Button-3>", self._menu)
            self.title.bind("<KeyRelease>", self._changed)
            self.body.bind("<<Modified>>", self._body_changed)
            self.body.edit_modified(False)
            self.window.bind("<Configure>", self._geometry_changed)
            self.window.protocol("WM_DELETE_WINDOW", self._close)

        def _menu(self, event):
            try:
                self.menu.tk_popup(event.x_root, event.y_root)
            finally:
                self.menu.grab_release()

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
            for item in (self.window, self.header, self.title, self.palette,
                         self.body, self.hint):
                item.configure(bg=paper)
            self.title.config(fg=ink, insertbackground=ink)
            self.body.config(fg=ink, insertbackground=ink)
            self.hint.config(fg=ink)
            self.palette.config(fg=ink, activebackground=paper)
            self._changed()

        def _save(self):
            self.pending = None
            if not self.dirty:
                return True
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
            for item in (self.window, self.header, self.title, self.palette,
                         self.body, self.hint):
                item.configure(bg=paper)
            self.title.config(fg=ink, insertbackground=ink)
            self.body.config(fg=ink, insertbackground=ink)
            self.hint.config(fg=ink)
            self.window.title("L'Atelier du Goblin · " + note["title"])

        def _geometry_changed(self, event):
            if event.widget != self.window or self.window.state() != "normal":
                return
            if self.geo_pending:
                root.after_cancel(self.geo_pending)
            self.geo_pending = root.after(1200, self._save_geometry)

        def _save_geometry(self):
            self.geo_pending = None
            if not self.window.winfo_exists():
                return
            try:
                save_layout(self.note["id"], self.window.winfo_x(),
                            self.window.winfo_y(), self.window.winfo_width(),
                            self.window.winfo_height())
            except (sqlite3.Error, OSError):
                pass

        def _archive(self):
            if not messagebox.askyesno("Archiver", "Archiver ce Post-it ?", parent=self.window):
                return
            if self.pending:
                root.after_cancel(self.pending)
            with _db() as c:
                c.execute("UPDATE home_postits SET archived=1 WHERE id=?",
                          (self.note["id"],))
                c.commit()
            self.dirty = False
            self._close()

        def _close(self):
            if self.pending and self.window.winfo_exists():
                root.after_cancel(self.pending)
                self._save()
            if self.dirty:
                self.hint.config(text="Non enregistré — réessaie avant de fermer")
                return
            if self.geo_pending:
                root.after_cancel(self.geo_pending)
                self._save_geometry()
            closed.add(self.note["id"])
            windows.pop(self.note["id"], None)
            self.window.destroy()

    def sync():
        nonlocal wake_value
        try:
            current_wake = WAKE.read_text(encoding="ascii") if WAKE.exists() else ""
            if current_wake != wake_value:
                closed.clear()
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
        except (OSError, sqlite3.Error) as exc:
            print("Post-it sync error:", str(exc), flush=True)
        root.after(1700, sync)

    sync()
    try:
        root.mainloop()
    finally:
        for widget in list(windows.values()):
            widget._save()
            widget._save_geometry()
        lock_file.close()


def _self_test():
    with tempfile.TemporaryDirectory() as work:
        db = Path(work) / "test.db"
        with sqlite3.connect(db) as c:
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
        assert not any(note["title"] == "Archivée" for note in note_rows(db))
        with sqlite3.connect(db) as c:
            c.execute("UPDATE home_postits SET archived=1 WHERE id=1")
        assert len(note_rows(db)) == 0
    print("PASS: Post-it shared SQLite, compare-and-swap, archive, geometry")


if __name__ == "__main__":
    if "--self-test" in sys.argv:
        _self_test()
    else:
        _guard()
        _run_gui()
