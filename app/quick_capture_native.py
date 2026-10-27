"""Optional global Windows hotkey for the Post-it tray companion.

Uses RegisterHotKey, not a keyboard logger or system-wide key hook. The
companion must be running in the notification area; no server/browser needed.
"""
from __future__ import annotations
import ctypes
from ctypes import wintypes
import json
import sqlite3
from pathlib import Path
from datetime import datetime

HOTKEY_ID=0x4A31
WM_HOTKEY=0x0312
PM_REMOVE=0x0001
MODS={"Alt":0x0001,"Ctrl":0x0002,"Shift":0x0004,"Meta":0x0008}
DESTINATIONS=("Carnet","Tâches","Rappels","Post-it","Administratif","Tracker")

def parse_hotkey(text):
    parts=str(text or "Ctrl+Shift+Space").split("+")
    if len(parts)<2 or len(parts)>4:
        raise ValueError("Utilise au moins Ctrl, Alt ou Meta avec une touche.")
    key=parts[-1].upper()
    modifiers=parts[:-1]
    if len(set(modifiers))!=len(modifiers) or not all(p in MODS for p in modifiers):
        raise ValueError("Combinaison de touches incorrecte.")
    if not any(p in modifiers for p in ("Ctrl","Alt","Meta")):
        raise ValueError("Le raccourci doit contenir Ctrl, Alt ou Meta.")
    if len(key)==1 and ("A"<=key<="Z" or "0"<=key<="9"):
        vk=ord(key)
    elif key=="SPACE":vk=0x20
    elif key.startswith("F") and key[1:].isdigit() and 1<=int(key[1:])<=12:
        vk=0x6F+int(key[1:])
    else:
        raise ValueError("Touche non prise en charge (lettre, chiffre, Espace, F1 à F12).")
    mask=sum(MODS[p] for p in modifiers)
    return mask,vk

def read_preference(path):
    try:
        data=json.loads(Path(path).read_text(encoding="utf-8"))
        shortcut=data.get("shortcut","Ctrl+Shift+Space")
        parse_hotkey(shortcut)
        return shortcut
    except (OSError,ValueError,TypeError):
        return "Ctrl+Shift+Space"

def save_capture(db_path,destination,body):
    destination=str(destination).lower()
    body=str(body).strip()
    if not body or len(body)>10000:raise ValueError("Écris une note de 10 000 caractères maximum.")
    ts=datetime.now().replace(microsecond=0).isoformat()
    with sqlite3.connect(db_path,timeout=5) as c:
        c.execute("PRAGMA busy_timeout=5000")
        if destination=="tâches":
            c.execute("""INSERT INTO tasks(title,due_date,due_time,notes,completed,archived,important,order_index,created_at,updated_at)
                 VALUES(?,NULL,NULL,?,0,0,0,0,?,?)""",(body[:120],body[120:],ts,ts))
        elif destination=="administratif":
            c.execute("""INSERT INTO admin_documents(title,category,notes,created_at,updated_at)
                 VALUES(?,'Général',?,?,?)""",(body[:180],body[180:],ts,ts))
        elif destination=="post-it":
            c.execute("""INSERT INTO home_postits(title,body,color,shape,archived,created_at,updated_at)
                 VALUES('Capture rapide',?,'gold','rounded',0,?,?)""",(body,ts,ts))
        else:
            c.execute("INSERT INTO quick_captures(destination,body,created_at) VALUES(?,?,?)",
                      ({"carnet":"carnet","rappels":"rappels","tracker":"tracker"}.get(destination,"carnet"),body,ts))
        c.commit()

def install(root,data_dir,db_path,on_postit=None):
    """Register global hotkey while the Windows tray process is alive."""
    import tkinter as tk
    from tkinter import messagebox
    if not hasattr(ctypes,"windll"):return None
    user32=ctypes.windll.user32
    user32.RegisterHotKey.argtypes=[wintypes.HWND,ctypes.c_int,wintypes.UINT,wintypes.UINT]
    user32.RegisterHotKey.restype=wintypes.BOOL
    user32.UnregisterHotKey.argtypes=[wintypes.HWND,ctypes.c_int]
    user32.UnregisterHotKey.restype=wintypes.BOOL
    user32.PeekMessageW.argtypes=[ctypes.POINTER(wintypes.MSG),wintypes.HWND,wintypes.UINT,wintypes.UINT,wintypes.UINT]
    user32.PeekMessageW.restype=wintypes.BOOL
    pref=Path(data_dir)/"quick-capture-hotkey.json"
    current=None
    registered=False
    popup=None

    def show():
        nonlocal popup
        if popup and popup.winfo_exists():
            popup.deiconify();popup.lift();popup.focus_force();return
        popup=tk.Toplevel(root)
        popup.title("Capture rapide — L'Atelier du Goblin")
        popup.geometry("510x365")
        popup.minsize(370,270)
        popup.configure(bg="#231c17")
        popup.attributes("-topmost",True)
        tk.Label(popup,text="✎ Capture rapide",font=("Segoe UI",16,"bold"),
                 fg="#f0d6a9",bg="#231c17").pack(anchor="w",padx=16,pady=(12,4))
        tk.Label(popup,text="Commence par #Carnet, #Tâches, #Rappels, #Post-it…",
                 fg="#c7ad8c",bg="#231c17").pack(anchor="w",padx=16)
        body=tk.Text(popup,wrap="word",undo=True,font=("Segoe UI",11),
                     bg="#eee3cd",fg="#2e261d",insertbackground="#2e261d",
                     padx=9,pady=8,height=6)
        body.pack(fill="both",expand=True,padx=16,pady=8)
        options=tk.Listbox(popup,height=3,font=("Segoe UI",10),exportselection=False)
        options.pack(fill="x",padx=16)
        def update_suggestions(_=None):
            text=body.get("1.0","end-1c")
            word=text.split(maxsplit=1)[0] if text.strip() else ""
            options.delete(0,"end")
            if word.startswith("#"):
                for dest in DESTINATIONS:
                    if word[1:].casefold() in dest.casefold():options.insert("end","#"+dest)
        def select_suggestion(_=None):
            selection=options.curselection()
            if not selection:return
            tag=options.get(selection[0])
            text=body.get("1.0","end-1c")
            rest=text.split(maxsplit=1)
            body.delete("1.0","end")
            body.insert("1.0",tag+" "+(rest[1] if len(rest)>1 else ""))
            body.focus_set()
            options.delete(0,"end")
        options.bind("<Double-Button-1>",select_suggestion)
        body.bind("<KeyRelease>",update_suggestions)
        footer=tk.Frame(popup,bg="#231c17");footer.pack(fill="x",padx=16,pady=(0,12))
        def send(_=None):
            raw=body.get("1.0","end-1c").strip()
            words=raw.split(maxsplit=1)
            destination="carnet";content=raw
            if words and words[0].startswith("#"):
                for dest in DESTINATIONS:
                    if words[0].casefold()=="#"+dest.casefold():
                        destination=dest.casefold()
                        content=words[1] if len(words)>1 else ""
                        break
            try:
                save_capture(db_path,destination,content)
                if destination=="post-it" and on_postit:on_postit()
            except (ValueError,sqlite3.Error,OSError) as exc:
                messagebox.showerror("Capture non enregistrée",str(exc),parent=popup)
                return
            popup.destroy()
        tk.Button(footer,text="Envoyer · Ctrl+Entrée",command=send,
                  bg="#806744",fg="white").pack(side="right")
        tk.Button(footer,text="Annuler",command=popup.destroy).pack(side="right",padx=8)
        popup.bind("<Control-Return>",send)
        popup.bind("<Escape>",lambda _:popup.destroy())
        popup.after(20,body.focus_set)

    def poll():
        nonlocal current,registered
        shortcut=read_preference(pref)
        if shortcut!=current:
            if registered:user32.UnregisterHotKey(None,HOTKEY_ID);registered=False
            current=shortcut
            try:
                mods,vk=parse_hotkey(shortcut)
                registered=bool(user32.RegisterHotKey(None,HOTKEY_ID,mods,vk))
            except (ValueError,OSError):
                registered=False
        msg=wintypes.MSG()
        while user32.PeekMessageW(ctypes.byref(msg),None,WM_HOTKEY,WM_HOTKEY,PM_REMOVE):
            if msg.message==WM_HOTKEY and msg.wParam==HOTKEY_ID:show()
        root.after(180,poll)
    root.after(150,poll)
    def cleanup():
        if registered:user32.UnregisterHotKey(None,HOTKEY_ID)
    return cleanup
