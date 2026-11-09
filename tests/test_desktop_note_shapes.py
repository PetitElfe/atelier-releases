"""The saved note format must shape the native window, without losing text."""
import ast
from pathlib import Path
import os
import sys
import unittest
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'app'))
import desktop_postits


class NoteFormatTests(unittest.TestCase):
    def test_shapes_keep_controls_inside_the_rounded_corners(self):
        self.assertEqual(desktop_postits.note_corner_radius('square',300,300),0)
        self.assertEqual(desktop_postits.note_corner_radius('rounded',320,400),20)
        self.assertEqual(desktop_postits.note_corner_radius('pill',460,210),44)
        self.assertLessEqual(desktop_postits.note_corner_radius('pill',40,30),15)

    @unittest.skipUnless(os.name=='nt' and os.environ.get('GOBLIN_NATIVE_POSTIT_TEST')=='1','Requires isolated Windows desktop runner')
    def test_actual_native_regions_on_open_change_resize_and_reopen(self):
        import ctypes
        from ctypes import wintypes
        import tkinter as tk
        root=tk.Tk();root.withdraw()
        self.addCleanup(root.destroy)
        gdi,user=ctypes.windll.gdi32,ctypes.windll.user32
        gdi.CreateRectRgn.restype=wintypes.HANDLE;gdi.CreateRectRgn.argtypes=[ctypes.c_int]*4
        gdi.PtInRegion.argtypes=[wintypes.HANDLE,ctypes.c_int,ctypes.c_int]
        gdi.DeleteObject.argtypes=[wintypes.HANDLE]
        user.GetWindowRgn.argtypes=[wintypes.HWND,wintypes.HANDLE]
        user.GetParent.argtypes=[wintypes.HWND];user.GetParent.restype=wintypes.HWND
        for shape,w,h in [('square',300,300),('rounded',320,400),('pill',460,210),('rounded',375,270)]:
            note=tk.Toplevel(root);note.overrideredirect(True);note.geometry(f'{w}x{h}+30+30')
            text=tk.Text(note);text.pack(fill='both',expand=True);text.insert('1.0','Texte\\nconservé')
            root.update()
            self.assertTrue(desktop_postits.apply_note_shape(note,shape))
            handle=user.GetParent(note.winfo_id()) or note.winfo_id()
            region=gdi.CreateRectRgn(0,0,0,0)
            try:
                self.assertGreater(user.GetWindowRgn(handle,region),0)
                self.assertTrue(gdi.PtInRegion(region,w//2,h//2))
                self.assertEqual(bool(gdi.PtInRegion(region,0,0)),shape=='square')
                self.assertEqual(text.get('1.0','end-1c'),'Texte\\nconservé')
            finally:gdi.DeleteObject(region);note.destroy()
        print('PASS: actual Windows square/rounded/banner regions, resize and reopening; note text intact')

    @unittest.skipUnless(os.name=='nt' and os.environ.get('GOBLIN_NATIVE_POSTIT_TEST')=='1','Requires isolated Windows desktop runner')
    def test_real_note_controls_drag_lock_format_save_and_reopen(self):
        import sqlite3
        import tempfile
        import tkinter as tk
        from tkinter import messagebox
        from types import SimpleNamespace
        with tempfile.TemporaryDirectory() as directory:
            db=Path(directory)/'notes.db'
            with sqlite3.connect(db) as c:
                c.execute("CREATE TABLE home_postits(id INTEGER PRIMARY KEY,title TEXT,body TEXT,color TEXT,shape TEXT,archived INTEGER,created_at TEXT,updated_at TEXT)")
                c.execute("INSERT INTO home_postits VALUES(1,'Note témoin','Ligne un','sage','rounded',0,'fixture','fixture')")
            desktop_postits.create_layout_table(db)
            root=tk.Tk();root.withdraw();self.addCleanup(root.destroy)
            tree=ast.parse(Path(desktop_postits.__file__).read_text(encoding='utf-8'))
            gui=next(n for n in tree.body if isinstance(n,ast.FunctionDef) and n.name=='_run_gui')
            klass=next(n for n in gui.body if isinstance(n,ast.ClassDef) and n.name=='NoteWindow')
            scope={**vars(desktop_postits),'tk':tk,'messagebox':messagebox,'root':root,'tray':object(),'closed':set(),'windows':{}}
            for name in ('save_edit','save_layout','set_layout_lock','note_rows'):
                function=getattr(desktop_postits,name)
                scope[name]=lambda *a,_fn=function,**k:_fn(*a,db_path=db,**k)
            scope['_update_in_progress']=lambda:False
            exec(compile(ast.Module(body=[klass],type_ignores=[]),'<real native NoteWindow>','exec'),scope)
            note=scope['NoteWindow'](desktop_postits.note_rows(db)[0],0);root.update()
            self.assertTrue(note.window.overrideredirect())
            self.assertFalse(note.palette.winfo_manager());self.assertFalse(note.ok_button.winfo_manager())
            labels=[note.menu.entrycget(i,'label') for i in range(note.menu.index('end')+1) if note.menu.type(i)!='separator']
            self.assertIn('Format',labels);self.assertIn('Supprimer définitivement…',labels)
            event=lambda x,y:SimpleNamespace(x_root=x,y_root=y)
            note._drag_start(event(50,50));note._drag_move(event(95,85));root.update();note._drag_end(None)
            position=(note.window.winfo_x(),note.window.winfo_y())
            note._toggle_lock();root.update()
            note._drag_start(event(50,50));note._drag_move(event(190,190));root.update()
            self.assertEqual((note.window.winfo_x(),note.window.winfo_y()),position)
            note._toggle_lock();note._change_format('pill',460,210);root.update()
            self.assertEqual(note.note['shape'],'pill');self.assertEqual(note.window.winfo_width(),460)
            note.body.insert('end','\nLigne deux');note._changed();self.assertTrue(note._save());note._save_geometry()
            note._close();root.update()
            saved=desktop_postits.note_rows(db)[0]
            self.assertEqual(saved['shape'],'pill');self.assertEqual(saved['body'],'Ligne un\nLigne deux')
            reopened=scope['NoteWindow'](saved,0);root.update()
            self.assertEqual(reopened.body.get('1.0','end-1c'),'Ligne un\nLigne deux')
            self.assertEqual(reopened.window.winfo_width(),460);self.assertEqual(reopened.last_shaped_size[2],'pill')
            reopened._close()
            print('PASS: actual NoteWindow context menu, borderless format, move/lock/unlock, save and reopen on Windows')


if __name__=='__main__':unittest.main()
