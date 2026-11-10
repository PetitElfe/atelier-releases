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

    def test_creation_retry_and_old_companion_do_not_multiply_notes(self):
        import tempfile,sqlite3,json
        from contextlib import closing
        from unittest.mock import patch
        with tempfile.TemporaryDirectory() as directory:
            db=Path(directory)/'notes.db'
            with closing(sqlite3.connect(db)) as c,c:
                c.execute('CREATE TABLE home_postits(id INTEGER PRIMARY KEY,title TEXT,body TEXT,color TEXT,shape TEXT,archived INTEGER,created_at TEXT,updated_at TEXT)')
            first=desktop_postits.create_note(db,request_id='same-click')
            self.assertEqual(first,desktop_postits.create_note(db,request_id='same-click'))
            with closing(sqlite3.connect(db)) as c:self.assertEqual(c.execute('SELECT count(*) FROM home_postits').fetchone()[0],1)
            runtime=Path(directory)/'runtime.json'
            with patch.object(desktop_postits,'is_running',return_value=True),patch.object(desktop_postits,'RUNTIME',runtime),patch.object(desktop_postits,'source_signature',return_value='current'):
                with self.assertRaisesRegex(RuntimeError,'ancien compagnon'):desktop_postits.ensure_current_companion()
                runtime.write_text(json.dumps({'source':'old'}))
                with self.assertRaisesRegex(RuntimeError,'ancien compagnon'):desktop_postits.ensure_current_companion()
                runtime.write_text(json.dumps({'source':'current'}));desktop_postits.ensure_current_companion()

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
        from contextlib import closing
        import tempfile
        import tkinter as tk
        from tkinter import messagebox
        from types import SimpleNamespace
        with tempfile.TemporaryDirectory() as directory:
            db=Path(directory)/'notes.db'
            with closing(sqlite3.connect(db)) as c, c:
                c.execute("CREATE TABLE home_postits(id INTEGER PRIMARY KEY,title TEXT,body TEXT,color TEXT,shape TEXT,archived INTEGER,created_at TEXT,updated_at TEXT)")
                c.execute("INSERT INTO home_postits VALUES(1,'Note témoin','Ligne un','sage','rounded',0,'fixture','fixture')")
            desktop_postits.create_layout_table(db)
            root=tk.Tk();root.withdraw();self.addCleanup(root.destroy)
            tree=ast.parse(Path(desktop_postits.__file__).read_text(encoding='utf-8'))
            gui=next(n for n in tree.body if isinstance(n,ast.FunctionDef) and n.name=='_run_gui')
            klass=next(n for n in gui.body if isinstance(n,ast.ClassDef) and n.name=='NoteWindow')
            scope={**vars(desktop_postits),'tk':tk,'messagebox':messagebox,'root':root,'tray':object(),'closed':set(),'windows':{}}
            for name in ('save_edit','save_layout','set_layout_lock','note_rows','delete_note'):
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
            note._toggle_lock()
            # A real right-click must open one menu, not reopen on Toplevel.
            calls=[]
            original=note.menu.tk_popup
            note.menu.tk_popup=lambda *args:calls.append(args)
            note.title.event_generate('<Button-3>',x=8,y=8);root.update()
            self.assertEqual(len(calls),1)
            note.body.event_generate('<Button-3>',x=8,y=8);root.update()
            self.assertEqual(len(calls),2)
            note.menu.tk_popup=original
            formats=note.menu.nametowidget(note.menu.entrycget('Format','menu'))
            for label,shape,width in [('Carré','square',300),('Feuille arrondie','rounded',320),('Bandeau','pill',460)]:
                formats.invoke(label);root.update()
                self.assertEqual(note.note['shape'],shape)
                self.assertEqual(desktop_postits.note_rows(db)[0]['shape'],shape)
                self.assertEqual(note.window.winfo_width(),width)
            self.assertEqual(note.note['shape'],'pill');self.assertEqual(note.window.winfo_width(),460)
            note.body.insert('end','\nLigne deux');note._changed();self.assertTrue(note._save());note._save_geometry()
            note._close();root.update()
            saved=desktop_postits.note_rows(db)[0]
            self.assertEqual(saved['shape'],'pill');self.assertEqual(saved['body'],'Ligne un\nLigne deux')
            reopened=scope['NoteWindow'](saved,0);root.update()
            self.assertEqual(reopened.body.get('1.0','end-1c'),'Ligne un\nLigne deux')
            self.assertEqual(reopened.window.winfo_width(),460);self.assertEqual(reopened.last_shaped_size[2],'pill')
            from unittest.mock import patch
            with patch.object(messagebox,'askyesno',return_value=False):
                reopened.close_button.invoke();root.update()
            self.assertEqual(len(desktop_postits.note_rows(db)),1)
            with patch.object(messagebox,'askyesno',return_value=True):
                reopened.close_button.invoke();root.update()
            self.assertFalse(reopened.window.winfo_exists())
            self.assertEqual(desktop_postits.note_rows(db),[])
            with closing(sqlite3.connect(db)) as c:
                self.assertEqual(c.execute('SELECT count(*) FROM desktop_postit_layout').fetchone()[0],0)
            print('PASS: actual NoteWindow context menu, borderless format, move/lock/unlock, save and reopen on Windows')

    @unittest.skipUnless(os.name=='nt' and os.environ.get('GOBLIN_NATIVE_POSTIT_TEST')=='1','Requires isolated Windows desktop runner')
    def test_five_saved_notes_targeted_open_cross_delete_and_safe_reload(self):
        import json,sqlite3,tempfile,tkinter as tk
        from contextlib import closing,ExitStack
        from unittest.mock import patch
        from types import SimpleNamespace
        with tempfile.TemporaryDirectory() as directory:
            data=Path(directory);db=data/'notes.db';script=data/'companion.py'
            script.write_text('# first version',encoding='utf-8')
            with closing(sqlite3.connect(db)) as c,c:
                c.execute('CREATE TABLE home_postits(id INTEGER PRIMARY KEY,title TEXT,body TEXT,color TEXT,shape TEXT,archived INTEGER,created_at TEXT,updated_at TEXT)')
            desktop_postits.create_layout_table(db)
            ids=[desktop_postits.create_note(db) for _ in range(5)]
            originals={name:getattr(desktop_postits,name) for name in ('create_layout_table','note_rows','save_edit','save_layout','set_layout_lock','create_note','delete_note')}
            controls={};errors=[]
            class Tray:
                def __init__(self,root,on_show,on_new,on_archives,on_quit,*args):controls.update(show=on_show,new=on_new,quit=on_quit)
                def destroy(self):pass
            def children(widget):
                result=[]
                for child in widget.winfo_children():result.append(child);result.extend(children(child))
                return result
            with ExitStack() as stack:
                stack.enter_context(patch.multiple(desktop_postits,DATA=data,DB=db,SCRIPT=script,LOCK=data/'lock',WAKE=data/'wake',RUNTIME=data/'runtime',_update_in_progress=lambda:False))
                for name,fn in originals.items():stack.enter_context(patch.object(desktop_postits,name,lambda *a,_fn=fn,**k:_fn(*a,db_path=db,**k)))
                stack.enter_context(patch.dict(sys.modules,{'windows_tray':SimpleNamespace(WindowsTray=Tray),'native_reminders':SimpleNamespace(tick=lambda:None),'quick_capture_native':SimpleNamespace(install=lambda *a,**k:None)}))
                stack.enter_context(patch('tkinter.messagebox.askyesno',return_value=True))
                for reload in (False,True):
                    root=tk.Tk();root.withdraw()
                    def guarded(fn):
                        def run():
                            try:fn()
                            except BaseException as e:
                                import traceback
                                errors.append(traceback.format_exc());root.quit()
                        return run
                    def windows():return [w for w in root.winfo_children() if isinstance(w,tk.Toplevel)]
                    def first_step():
                        self.assertEqual(len(windows()),1,'Targeted opening must not show five saved notes')
                        if reload:
                            body=next(w for w in children(windows()[0]) if isinstance(w,tk.Text));body.insert('end','Texte avant mise à jour');body.edit_modified(True)
                            script.write_text('# second version',encoding='utf-8')
                        else:
                            next(w for w in children(windows()[0]) if isinstance(w,tk.Button) and w.cget('text')=='×').invoke()
                            self.assertEqual(windows(),[])
                            self.assertNotIn(ids[2],[r['id'] for r in originals['note_rows'](db)])
                            new=originals['create_note'](db,request_id='one-click');controls['target']=new;desktop_postits.wake(new)
                    if not reload:
                        def check_new():
                            # The poll starts after GUI/tray initialization, not
                            # when the test created the root. Wait for the real
                            # observable note instead of racing that first tick.
                            if not windows():root.after(80,guarded(check_new));return
                            self.assertEqual(len(windows()),1)
                            self.assertEqual(len(originals['note_rows'](db)),5,'Four retained notes plus one new note')
                            desktop_postits.wake(controls['target'])
                            root.after(2100,guarded(lambda:(self.assertEqual(len(windows()),1),controls['quit']())))
                    def ready():
                        root.after(120,guarded(first_step))
                        if not reload:root.after(200,guarded(check_new))
                        root.after(12000,guarded(lambda:self.fail('Companion did not close safely')))
                    with patch('tkinter.Tk',return_value=root),patch.object(sys,'argv',['desktop_postits.py','--note',str(controls.get('target',ids[2]))]):
                        result=desktop_postits._run_gui(on_ready=ready)
                    self.assertEqual(errors,[])
                    self.assertEqual(result,{'visible_ids':[controls['target']]} if reload else False)
                    self.assertFalse((data/'runtime').exists())
                    if reload:self.assertEqual(next(r for r in originals['note_rows'](db) if r['id']==controls['target'])['body'],'Texte avant mise à jour')
            print('PASS: five saved notes, one targeted window, real cross deletion, one new note, repeated wake without duplicates, safe reload with dirty text preserved')



if __name__=='__main__':unittest.main()
