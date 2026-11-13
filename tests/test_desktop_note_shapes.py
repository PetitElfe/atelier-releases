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
            for name in ('save_edit','save_layout','set_layout_lock','note_rows','delete_note','set_corner_style'):
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
            originals={name:getattr(desktop_postits,name) for name in ('create_layout_table','note_rows','save_edit','save_layout','set_layout_lock','create_note','delete_note','set_corner_style')}
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
                stack.enter_context(patch.dict(sys.modules,{'windows_tray':SimpleNamespace(WindowsTray=Tray,WndClass=__import__('windows_tray').WndClass,_WNDPROC=__import__('windows_tray')._WNDPROC),'native_reminders':SimpleNamespace(tick=lambda:None),'quick_capture_native':SimpleNamespace(install=lambda *a,**k:None)}))
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


    def test_launch_confirmation_reports_process_failure_instead_of_success(self):
        import tempfile,json
        from unittest.mock import patch
        from types import SimpleNamespace
        with tempfile.TemporaryDirectory() as directory:
            data=Path(directory);script=data/'companion.py';script.write_text('# fixture')
            (data/'desktop-postits.log').write_text('RuntimeError: Erreur témoin compagnon\n',encoding='utf-8')
            with patch.multiple(desktop_postits,DATA=data,SCRIPT=script,RUNTIME=data/'runtime'):
                with self.assertRaisesRegex(RuntimeError,'Erreur témoin compagnon'):
                    desktop_postits._wait_for_display(1,process=SimpleNamespace(poll=lambda:1),timeout=.1)
                desktop_postits.RUNTIME.write_text(json.dumps({'source':desktop_postits.source_signature(),'ready':True,'visible_ids':[7]}))
                desktop_postits._wait_for_display(7,timeout=.1)
                with self.assertRaisesRegex(RuntimeError,'pas confirmé'):desktop_postits._wait_for_display(8,timeout=.1)

    @unittest.skipUnless(os.name=='nt' and os.environ.get('GOBLIN_NATIVE_POSTIT_TEST')=='1','Requires isolated Windows desktop runner')
    def test_real_pythonw_process_confirms_visible_note_and_failed_launch(self):
        import ctypes,shutil,sqlite3,subprocess,tempfile,time,json
        from ctypes import wintypes
        from contextlib import closing
        from unittest.mock import patch
        source=Path(desktop_postits.__file__)
        with tempfile.TemporaryDirectory() as directory:
            base=Path(directory);app=base/'code_0180'/'app';app.mkdir(parents=True);data=base/'data';data.mkdir()
            script=app/'desktop_postits.py';original=source.read_text(encoding='utf-8')
            configured=original.replace('BASE = Path(r"E:\\LATELIER_TEST_0180")','BASE = Path('+repr(str(base))+')')
            self.assertNotEqual(configured,original,'Isolate every native path from the real TEST profile')
            script.write_text(configured,encoding='utf-8');(app/'VERSION').write_text('0.18.0');(app.parent/'manifest.json').write_text('{}')
            shutil.copyfile(source.with_name('windows_tray.py'),app/'windows_tray.py')
            shutil.copyfile(source.with_name('native_postit_paper.py'),app/'native_postit_paper.py')
            (app/'native_reminders.py').write_text('def tick():pass\n')
            (app/'quick_capture_native.py').write_text('def install(*a,**k):return None\n')
            db=data/'atelier.db'
            with closing(sqlite3.connect(db)) as c,c:c.execute('CREATE TABLE home_postits(id INTEGER PRIMARY KEY,title TEXT,body TEXT,color TEXT,shape TEXT,archived INTEGER,created_at TEXT,updated_at TEXT)')
            desktop_postits.create_layout_table(db)
            ids=[desktop_postits.create_note(db) for _ in range(5)]
            import tkinter as tk
            occluder=tk.Tk();occluder.title('Atelier main window fixture');occluder.geometry('1000x800+0+0');occluder.update();occluder.lift();occluder.focus_force()
            processes=[];popen=subprocess.Popen
            def spawn(*a,**k):
                process=popen(*a,**k);processes.append(process);return process
            try:
                with patch.multiple(desktop_postits,BASE=base,CODE=app.parent,DATA=data,DB=db,SCRIPT=script,LOCK=data/'desktop-postits.lock',WAKE=data/'desktop-postits-wake.txt',RUNTIME=data/'desktop-postits-runtime.json',_guard=lambda:None),patch.object(subprocess,'Popen',side_effect=spawn):
                    result=desktop_postits.launch(ids[2])
                    self.assertTrue(result['display_confirmed']);self.assertTrue(desktop_postits.is_running())
                    runtime=json.loads(desktop_postits.RUNTIME.read_text());self.assertEqual(runtime['visible_ids'],[ids[2]])
                    user=ctypes.windll.user32;handles=[];stacking=[]
                    user.GetParent.argtypes=[wintypes.HWND];user.GetParent.restype=wintypes.HWND
                    parent_handle=user.GetParent(occluder.winfo_id()) or occluder.winfo_id()
                    user.GetWindowThreadProcessId.argtypes=[wintypes.HWND,ctypes.POINTER(wintypes.DWORD)]
                    user.IsWindowVisible.argtypes=[wintypes.HWND]
                    user.GetWindowLongW.argtypes=[wintypes.HWND,ctypes.c_int]
                    callback=ctypes.WINFUNCTYPE(wintypes.BOOL,wintypes.HWND,wintypes.LPARAM)
                    def visit(hwnd,_):
                        pid=wintypes.DWORD();user.GetWindowThreadProcessId(hwnd,ctypes.byref(pid))
                        if user.IsWindowVisible(hwnd):
                            stacking.append(hwnd)
                            if pid.value==processes[0].pid:handles.append(hwnd)
                        return True
                    deadline=time.monotonic()+3
                    while time.monotonic()<deadline:
                        handles.clear();stacking.clear();user.EnumWindows(callback(visit),0)
                        if handles and all(not user.GetWindowLongW(h,-20)&8 for h in handles):break
                        time.sleep(.08)
                    self.assertTrue(handles,'Actual pythonw process must expose a visible Windows window')
                    self.assertTrue(all(not user.GetWindowLongW(h,-20)&8 for h in handles),'No permanent always-on-top windows')
                    self.assertIn(parent_handle,stacking)
                    self.assertLess(stacking.index(handles[0]),stacking.index(parent_handle),'Requested note must be above the occluding main-window fixture')
                    again=desktop_postits.launch(ids[2]);self.assertTrue(again['display_confirmed']);self.assertEqual(len(processes),1)
                    processes[0].terminate();processes[0].wait(timeout=10)
                    script.write_text("raise RuntimeError('Erreur témoin compagnon')\n",encoding='utf-8')
                    with self.assertRaisesRegex(RuntimeError,'Erreur témoin compagnon'):desktop_postits.launch(ids[0])
                    self.assertEqual(len(desktop_postits.note_rows(db)),5,'A failed launch must not erase notes')
            finally:
                for process in processes:
                    if process.poll() is None:process.terminate()
                    process.wait(timeout=10)
                occluder.destroy()
            print('PASS: actual isolated pythonw launch, five saved notes/one visible, reused process, ordinary stacking restored, crash surfaced instead of false success')


    def test_eight_resize_edges_keep_opposite_corner_and_minimum(self):
        from native_postit_paper import resize_rectangle,border_at,content_rect
        initial=(100,100,400,300)
        self.assertEqual(resize_rectangle(initial,30,20,'nw'),(130,120,370,280))
        self.assertEqual(resize_rectangle(initial,-30,20,'se'),(100,100,370,320))
        self.assertEqual(resize_rectangle(initial,1000,1000,'nw'),(260,225,240,175))
        self.assertEqual({border_at(x,y,424,324) for x,y in [(1,1),(212,1),(423,1),(1,162),(423,162),(1,323),(212,323),(423,323)]},{'nw','n','ne','w','e','sw','s','se'})
        for shape in ('star','heart','circle'):
            x,y,w,h=content_rect(shape,540,540);self.assertGreater(w,150);self.assertGreater(h,150);self.assertTrue(x>0 and y>0 and x+w<540 and y+h<540)

    @unittest.skipUnless(os.name=='nt' and os.environ.get('GOBLIN_NATIVE_POSTIT_TEST')=='1','Requires isolated Windows desktop runner')
    def test_actual_smooth_paper_new_shapes_corners_shadow_and_reopen(self):
        import tkinter as tk,sqlite3,tempfile
        from tkinter import messagebox
        from contextlib import closing
        from native_postit_paper import MARGIN
        with tempfile.TemporaryDirectory() as directory:
            db=Path(directory)/'notes.db'
            with closing(sqlite3.connect(db)) as c,c:
                c.execute('CREATE TABLE home_postits(id INTEGER PRIMARY KEY,title TEXT,body TEXT,color TEXT,shape TEXT,archived INTEGER,created_at TEXT,updated_at TEXT)')
                c.execute("INSERT INTO home_postits VALUES(1,'Formes','Texte conservé','mauve','rounded',0,'t','t')")
            desktop_postits.create_layout_table(db)
            root=tk.Tk();root.withdraw()
            tree=ast.parse(Path(desktop_postits.__file__).read_text(encoding='utf-8'));gui=next(n for n in tree.body if isinstance(n,ast.FunctionDef) and n.name=='_run_gui');klass=next(n for n in gui.body if isinstance(n,ast.ClassDef) and n.name=='NoteWindow')
            scope={**vars(desktop_postits),'tk':tk,'messagebox':messagebox,'root':root,'tray':object(),'closed':set(),'windows':{}}
            for name in ('save_edit','save_layout','set_layout_lock','note_rows','set_corner_style','delete_note'):
                fn=getattr(desktop_postits,name);scope[name]=lambda *a,_fn=fn,**k:_fn(*a,db_path=db,**k)
            scope['_update_in_progress']=lambda:False
            exec(compile(ast.Module(body=[klass],type_ignores=[]),'<native shapes>','exec'),scope)
            note=scope['NoteWindow'](desktop_postits.note_rows(db)[0],0)
            try:
                root.update();formats=note.menu.nametowidget(note.menu.entrycget('Format','menu'))
                Path('artifacts').mkdir(exist_ok=True)
                for label,shape in [('Étoile','star'),('Cœur','heart'),('Rond','circle'),('Feuille arrondie','rounded'),('Carré','square'),('Bandeau','pill')]:
                    formats.invoke(label);root.update();note._apply_shape();root.update()
                    self.assertEqual(note.note['shape'],shape);self.assertIsNotNone(note.paper)
                    alpha=bytes(note.paper.pixels)[3::4]
                    self.assertIn(255,alpha)
                    if shape!='square':self.assertTrue(any(40<a<250 for a in alpha),'Actual curved GDI+ edge pixels must be antialiased')
                    self.assertEqual(note.body.get('1.0','end-1c'),'Texte conservé')
                    w,h=note.window.winfo_width(),note.window.winfo_height()
                    paper_area=note.paper_area.winfo_width();self.assertGreater(paper_area,100)
                    note.paper.save_png('artifacts/postit-'+shape+'.png')
                    # Moving must reuse the rendered paper, with no allocation
                    # or full bitmap upload for an unchanged size/style.
                    bitmap=note.paper.bitmap;pixels=note.paper.pixels
                    px,py,pw,ph=note.paper.geometry
                    note.paper.update((px+3,py+4,pw,ph))
                    self.assertEqual(note.paper.bitmap,bitmap);self.assertIs(note.paper.pixels,pixels)
                    note._native_geometry((px+3,py+4,pw,ph));root.update()

                    # Real Windows mouse capture, not just geometry arithmetic.
                    # Hit an empty corner outside Tk's client rectangle for every
                    # silhouette, grow and shrink repeatedly, then remap it.
                    import ctypes,time
                    user=note.paper.user
                    user.SetCursorPos.argtypes=[ctypes.c_int,ctypes.c_int]
                    user.mouse_event.argtypes=[ctypes.c_uint,ctypes.c_uint,ctypes.c_uint,ctypes.c_uint,ctypes.c_size_t]
                    def pump():
                        for _ in range(8):root.update();time.sleep(.015)
                    for delta in (24,-18,30,-20):
                        x,y,pw,ph=note.paper.geometry
                        user.SetCursorPos(x+pw+7,y+ph+7);pump()
                        user.mouse_event(2,0,0,0,0);pump()
                        user.SetCursorPos(x+pw+7+delta,y+ph+7+delta);pump()
                        user.mouse_event(4,0,0,0,0);pump()
                        self.assertEqual(note.window.winfo_width(),pw+delta,'Real mouse resize must reach '+shape)
                        self.assertTrue(note.window.winfo_ismapped())
                        self.assertTrue(user.IsWindowVisible(note.paper.hwnd),'Paper must stay visible while resizing '+shape)
                        self.assertEqual(note.body.get('1.0','end-1c'),'Texte conservé')
                    note.menu.invoke('Taille…');pump()
                    size_dialog=next(w for w in note.window.winfo_children() if isinstance(w,tk.Toplevel))
                    inputs=[w for w in size_dialog.winfo_children() if isinstance(w,tk.Entry)]
                    desired=(note.window.winfo_width()+12,note.window.winfo_height()+10)
                    for entry,value in zip(inputs,desired):entry.delete(0,'end');entry.insert(0,str(value))
                    next(w for w in size_dialog.winfo_children() if isinstance(w,tk.Button) and w.cget('text')=='Appliquer').invoke();pump()
                    self.assertEqual((note.window.winfo_width(),note.window.winfo_height()),desired)
                    note.window.withdraw();pump();note.window.deiconify();pump()
                    self.assertTrue(user.IsWindowVisible(note.paper.hwnd),'Paper must return after a map transition')

                # A real paper edge, with optional square/rounded corners and a faint shadow.
                note.corners.set(False);note._change_corners();root.update();note._apply_shape()
                self.assertFalse(note.paper.style[2]);note._save_geometry();note._close();root.update()
                saved=desktop_postits.note_rows(db)[0];self.assertEqual(saved['corner_rounded'],0)
                reopened=scope['NoteWindow'](saved,0);root.update();self.assertFalse(reopened.corners.get());reopened._close();root.update()
            finally:
                for callback in root.tk.call('after','info'):root.after_cancel(callback)
                root.destroy()
            print('PASS: real antialiased star/heart/circle paper, shadow, optional corner style, editable text and persisted reopening')



if __name__=='__main__':unittest.main()
