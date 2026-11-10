"""Antialiased native paper/shadow, with eight border resize cursors.

GDI+ renders premultiplied BGRA into an UpdateLayeredWindow surface. The
editable Tk widgets stay in a safe interior rectangle, owned by this paper.
No image package, generated artwork or permanent topmost window is needed.
"""
import ctypes as C
from ctypes import wintypes as W
import math
import os
import struct
import zlib

MARGIN=12
TRANSPARENT='#010203'
SHAPES=('square','rounded','pill','star','heart','circle')


def content_rect(shape,w,h):
    box={'star':(.33,.35,.34,.30),'heart':(.28,.26,.44,.38),'circle':(.18,.17,.64,.66)}.get(shape)
    if box:return tuple(round(v*s) for v,s in zip(box,(w,h,w,h)))
    return (8,5,max(1,w-16),max(1,h-10))


def minimum_size(shape):
    return {'star':(360,340),'heart':(320,300),'circle':(240,240)}.get(shape,(240,175))


def resize_rectangle(geometry,dx,dy,edge,min_size=(240,175)):
    x,y,w,h=geometry;mw,mh=min_size
    if edge=='move':return (max(0,x+dx),max(0,y+dy),w,h)
    if 'w' in edge:
        right=x+w;x=min(right-mw,max(0,x+dx));w=right-x
    if 'e' in edge:w=max(mw,min(1600,w+dx))
    if 'n' in edge:
        bottom=y+h;y=min(bottom-mh,max(0,y+dy));h=bottom-y
    if 's' in edge:h=max(mh,min(1400,h+dy))
    return (int(x),int(y),int(w),int(h))


def border_at(x,y,w,h,margin=MARGIN,grip=7):
    horizontal='w' if x<margin+grip else 'e' if x>=w-margin-grip else ''
    vertical='n' if y<margin+grip else 's' if y>=h-margin-grip else ''
    return vertical+horizontal


class Header(C.Structure):
    _fields_=[('size',W.DWORD),('width',W.LONG),('height',W.LONG),('planes',W.WORD),('bits',W.WORD),('compression',W.DWORD),('image_size',W.DWORD),('xppm',W.LONG),('yppm',W.LONG),('used',W.DWORD),('important',W.DWORD)]
class Info(C.Structure):
    _fields_=[('header',Header),('colors',W.DWORD*3)]
class Blend(C.Structure):
    _fields_=[('operation',C.c_ubyte),('flags',C.c_ubyte),('alpha',C.c_ubyte),('format',C.c_ubyte)]
class Startup(C.Structure):
    _fields_=[('version',W.UINT),('callback',C.c_void_p),('thread',W.BOOL),('codecs',W.BOOL)]


class PaperBackdrop:
    _token=None
    def __init__(self,window,on_geometry,on_end,on_menu,locked):
        if os.name!='nt':raise OSError('Windows compositor required')
        from windows_tray import WndClass,_WNDPROC
        self.window=window;self.on_geometry=on_geometry;self.on_end=on_end;self.on_menu=on_menu;self.locked=locked
        self.user=C.WinDLL('user32',use_last_error=True);self.gdi=C.WinDLL('gdi32',use_last_error=True);self.gdip=C.WinDLL('gdiplus');self.kernel=C.WinDLL('kernel32')
        def bind(dll,name,args,result=C.c_int):
            f=getattr(dll,name);f.argtypes=args;f.restype=result;return f
        ptr=C.c_void_p;out=C.POINTER(ptr);f=C.c_float
        bind(self.kernel,'GetModuleHandleW',[W.LPCWSTR],W.HMODULE)
        bind(self.user,'GetParent',[W.HWND],W.HWND)
        bind(self.user,'IsWindow',[W.HWND],W.BOOL)
        bind(self.user,'IsWindowVisible',[W.HWND],W.BOOL)
        bind(self.user,'DefWindowProcW',[W.HWND,W.UINT,W.WPARAM,W.LPARAM],C.c_ssize_t)
        bind(self.user,'RegisterClassW',[C.POINTER(WndClass)],W.ATOM)
        bind(self.user,'CreateWindowExW',[W.DWORD,W.LPCWSTR,W.LPCWSTR,W.DWORD,C.c_int,C.c_int,C.c_int,C.c_int,W.HWND,W.HMENU,W.HINSTANCE,ptr],W.HWND)
        self.set_owner=bind(self.user,'SetWindowLongPtrW' if C.sizeof(ptr)==8 else 'SetWindowLongW',[W.HWND,C.c_int,C.c_ssize_t],C.c_ssize_t)
        bind(self.user,'UpdateLayeredWindow',[W.HWND,W.HDC,C.POINTER(W.POINT),C.POINTER(W.SIZE),W.HDC,C.POINTER(W.POINT),W.DWORD,C.POINTER(Blend),W.DWORD],W.BOOL)
        bind(self.user,'SetWindowPos',[W.HWND,W.HWND,C.c_int,C.c_int,C.c_int,C.c_int,W.UINT],W.BOOL)
        bind(self.user,'ShowWindow',[W.HWND,C.c_int],W.BOOL)
        bind(self.user,'DestroyWindow',[W.HWND],W.BOOL)
        bind(self.user,'UnregisterClassW',[W.LPCWSTR,W.HINSTANCE],W.BOOL)
        bind(self.user,'GetCursorPos',[C.POINTER(W.POINT)],W.BOOL)
        bind(self.user,'LoadCursorW',[W.HINSTANCE,ptr],W.HANDLE)
        bind(self.user,'SetCursor',[W.HANDLE],W.HANDLE)
        bind(self.user,'SetCapture',[W.HWND],W.HWND)
        bind(self.user,'ReleaseCapture',[],W.BOOL)
        bind(self.gdi,'CreateCompatibleDC',[W.HDC],W.HDC)
        bind(self.gdi,'CreateDIBSection',[W.HDC,C.POINTER(Info),W.UINT,out,W.HANDLE,W.DWORD],W.HBITMAP)
        bind(self.gdi,'SelectObject',[W.HDC,W.HANDLE],W.HANDLE)
        bind(self.gdi,'DeleteObject',[W.HANDLE],W.BOOL)
        bind(self.gdi,'DeleteDC',[W.HDC],W.BOOL)
        bind(self.gdip,'GdiplusStartup',[C.POINTER(C.c_size_t),C.POINTER(Startup),ptr])
        bind(self.gdip,'GdipCreateBitmapFromScan0',[C.c_int,C.c_int,C.c_int,C.c_int,ptr,out])
        bind(self.gdip,'GdipGetImageGraphicsContext',[ptr,out])
        bind(self.gdip,'GdipSetSmoothingMode',[ptr,C.c_int])
        bind(self.gdip,'GdipSetPixelOffsetMode',[ptr,C.c_int])
        bind(self.gdip,'GdipGraphicsClear',[ptr,W.DWORD])
        bind(self.gdip,'GdipCreatePath',[C.c_int,out])
        bind(self.gdip,'GdipAddPathLine',[ptr,f,f,f,f])
        bind(self.gdip,'GdipAddPathBezier',[ptr]+[f]*8)
        bind(self.gdip,'GdipAddPathEllipse',[ptr,f,f,f,f])
        bind(self.gdip,'GdipClosePathFigure',[ptr])
        bind(self.gdip,'GdipCreateSolidFill',[W.DWORD,out])
        bind(self.gdip,'GdipFillPath',[ptr,ptr,ptr])
        for name in ['GdipDeleteBrush','GdipDeletePath','GdipDeleteGraphics','GdipDisposeImage']:bind(self.gdip,name,[ptr])
        bind(self.gdip,'GdipFlush',[ptr,C.c_int])
        if PaperBackdrop._token is None:
            token=C.c_size_t();self._ok(self.gdip.GdiplusStartup(C.byref(token),C.byref(Startup(1,None,False,False)),None));PaperBackdrop._token=token
        self.module=self.kernel.GetModuleHandleW(None);self.name='GoblinPaper_%d_%d'%(os.getpid(),id(self));self.proc=_WNDPROC(self._dispatch)
        cls=WndClass();cls.lpfnWndProc=self.proc;cls.hInstance=self.module;cls.lpszClassName=self.name
        if not self.user.RegisterClassW(C.byref(cls)):raise C.WinError(C.get_last_error())
        self.hwnd=self.user.CreateWindowExW(0x00080000|0x00000080|0x08000000,self.name,'Post-it · papier',0x80000000,0,0,1,1,None,None,self.module,None)
        if not self.hwnd:raise C.WinError(C.get_last_error())
        self.editor=self.user.GetParent(window.winfo_id()) or window.winfo_id()
        self.old_owner=self.set_owner(self.editor,-8,int(self.hwnd))
        self.dc=self.gdi.CreateCompatibleDC(None);self.bitmap=None;self.previous=None;self.image=None;self.graphics=None;self.buffer=None;self.pixels=None
        self.geometry=(0,0,300,260);self.paint_key=None;self.style=('rounded','#D2AF76',True);self.drag=None;self.destroyed=False
        self.events=[];self.poll=window.after(16,self._flush_events)

    def _flush_events(self):
        if self.destroyed:return
        events,self.events=self.events,[]
        for event in events:
            if event[0]=='geometry':self.on_geometry(event[1])
            elif event[0]=='end':self.on_end()
            elif event[0]=='menu':self.on_menu(*event[1:])
        if not self.destroyed:self.poll=self.window.after(16,self._flush_events)

    @staticmethod
    def _ok(status):
        if status:raise OSError('GDI+ status '+str(status))

    def _free_bitmap(self):
        if self.graphics:self.gdip.GdipDeleteGraphics(self.graphics);self.graphics=None
        if self.image:self.gdip.GdipDisposeImage(self.image);self.image=None
        if self.bitmap:
            self.gdi.SelectObject(self.dc,self.previous);self.gdi.DeleteObject(self.bitmap);self.bitmap=None

    def _polygon(self,path,points,radius):
        if not radius:
            for a,b in zip(points,points[1:]+points[:1]):self._ok(self.gdip.GdipAddPathLine(path,*a,*b))
        else:
            corners=[]
            for i,v in enumerate(points):
                prev,nxt=points[i-1],points[(i+1)%len(points)];d1=math.dist(v,prev);d2=math.dist(v,nxt);r=min(radius,d1*.3,d2*.3)
                a=tuple(v[k]+(prev[k]-v[k])*r/d1 for k in (0,1));b=tuple(v[k]+(nxt[k]-v[k])*r/d2 for k in (0,1));corners.append((a,v,b))
            for i,(a,v,b) in enumerate(corners):
                self._ok(self.gdip.GdipAddPathLine(path,*corners[i-1][2],*a))
                c1=tuple(a[k]+(v[k]-a[k])*2/3 for k in (0,1));c2=tuple(b[k]+(v[k]-b[k])*2/3 for k in (0,1))
                self._ok(self.gdip.GdipAddPathBezier(path,*a,*c1,*c2,*b))
        self._ok(self.gdip.GdipClosePathFigure(path))

    def _path(self,shape,rounded,x,y,w,h):
        path=C.c_void_p();self._ok(self.gdip.GdipCreatePath(0,C.byref(path)))
        if shape=='circle':self._ok(self.gdip.GdipAddPathEllipse(path,x,y,w,h))
        elif shape=='heart':
            segments=[((.48,.91),(.32,.8),(.04,.57),(.04,.32)),((.04,.32),(.04,.08),(.32,.025),(.48,.21)),((.48,.21),(.49,.225),(.51,.225),(.52,.21)),((.52,.21),(.68,.025),(.96,.08),(.96,.32)),((.96,.32),(.96,.57),(.68,.8),(.52,.91)),((.52,.91),(.505,.925),(.495,.925),(.48,.91))] if rounded else [((.5,.94),(.34,.8),(.04,.57),(.04,.32)),((.04,.32),(.04,.08),(.34,.025),(.5,.23)),((.5,.23),(.66,.025),(.96,.08),(.96,.32)),((.96,.32),(.96,.57),(.66,.8),(.5,.94))]
            for seg in segments:self._ok(self.gdip.GdipAddPathBezier(path,*[value for a,b in seg for value in (x+a*w,y+b*h)]))
            self._ok(self.gdip.GdipClosePathFigure(path))
        elif shape=='star':
            points=[(x+w*(.5+(.49 if i%2==0 else .255)*math.cos(-math.pi/2+i*math.pi/5)),y+h*(.51+(.49 if i%2==0 else .255)*math.sin(-math.pi/2+i*math.pi/5)))for i in range(10)]
            self._polygon(path,points,12 if rounded else 0)
        else:self._polygon(path,[(x,y),(x+w,y),(x+w,y+h),(x,y+h)],min(44 if shape=='pill' else 20,w/4,h/4) if rounded else 0)
        return path

    def _fill(self,shape,rounded,box,color):
        path=self._path(shape,rounded,*box);brush=C.c_void_p()
        try:
            self._ok(self.gdip.GdipCreateSolidFill(color,C.byref(brush)));self._ok(self.gdip.GdipFillPath(self.graphics,brush,path))
        finally:
            if brush:self.gdip.GdipDeleteBrush(brush)
            self.gdip.GdipDeletePath(path)

    def update(self,geometry,shape=None,color=None,rounded=None):
        if self.destroyed:return
        x,y,w,h=map(int,geometry);shape=shape or self.style[0];color=color or self.style[1];rounded=self.style[2] if rounded is None else rounded
        self.geometry=(x,y,w,h);self.style=(shape,color,rounded);cw,ch=w+2*MARGIN,h+2*MARGIN;key=(w,h,shape,color,rounded)
        if key!=self.paint_key:
            self._free_bitmap();bits=C.c_void_p();info=Info();info.header=Header(C.sizeof(Header),cw,-ch,1,32,0,cw*ch*4,0,0,0,0)
            self.bitmap=self.gdi.CreateDIBSection(self.dc,C.byref(info),0,C.byref(bits),None,0)
            if not self.bitmap:raise C.WinError(C.get_last_error())
            self.previous=self.gdi.SelectObject(self.dc,self.bitmap);self.pixels=(C.c_ubyte*(cw*ch*4)).from_address(bits.value)
            self.image=C.c_void_p();self.graphics=C.c_void_p()
            self._ok(self.gdip.GdipCreateBitmapFromScan0(cw,ch,cw*4,0xE200B,bits,C.byref(self.image)))
            self._ok(self.gdip.GdipGetImageGraphicsContext(self.image,C.byref(self.graphics)))
            self._ok(self.gdip.GdipSetSmoothingMode(self.graphics,4));self._ok(self.gdip.GdipSetPixelOffsetMode(self.graphics,4));self._ok(self.gdip.GdipGraphicsClear(self.graphics,0))
            for dx,dy,spread,alpha in [(6,8,2,4),(5,7,1,6),(4,6,0,10),(3,4,0,12)]:self._fill(shape,rounded,(MARGIN+dx-spread,MARGIN+dy-spread,w+2*spread,h+2*spread),alpha<<24)
            self._fill(shape,rounded,(MARGIN,MARGIN,w,h),0xFF000000|int(color.lstrip('#'),16));self._ok(self.gdip.GdipFlush(self.graphics,1))
            # Almost transparent boundary makes all eight resize targets reachable,
            # including the empty corners around round/star/heart paper.
            for row in range(ch):
                for col in range(cw):
                    index=(row*cw+col)*4
                    if not self.pixels[index+3]:self.pixels[index+3]=1
            self.paint_key=key
        dest=W.POINT(x-MARGIN,y-MARGIN);size=W.SIZE(cw,ch);origin=W.POINT(0,0);blend=Blend(0,0,255,1)
        if not self.user.UpdateLayeredWindow(self.hwnd,None,C.byref(dest),C.byref(size),self.dc,C.byref(origin),0,C.byref(blend),2):raise C.WinError(C.get_last_error())
        # Repeated ShowWindow calls during captured mouse movement send owner
        # visibility messages back into Tk. Only map a hidden paper once.
        if not self.user.IsWindowVisible(self.hwnd):self.user.ShowWindow(self.hwnd,4)

    def raise_briefly(self):
        if self.destroyed:return
        self.user.SetWindowPos(self.hwnd,W.HWND(-1),0,0,0,0,0x13)
        self.window.after(220,self.normal_stacking)

    def normal_stacking(self):
        if not self.destroyed:self.user.SetWindowPos(self.hwnd,W.HWND(-2),0,0,0,0,0x13)

    def hide(self):
        if not self.destroyed:self.user.ShowWindow(self.hwnd,0)

    def _cursor(self):
        p=W.POINT();self.user.GetCursorPos(C.byref(p));x,y,w,h=self.geometry
        edge=border_at(p.x-x+MARGIN,p.y-y+MARGIN,w+2*MARGIN,h+2*MARGIN) if not self.locked() else ''
        code={'e':32644,'w':32644,'n':32645,'s':32645,'ne':32642,'sw':32642,'nw':32643,'se':32643}.get(edge,32512)
        self.user.SetCursor(self.user.LoadCursorW(None,C.c_void_p(code)));return edge,p

    def _dispatch(self,hwnd,message,wparam,lparam):
        try:
            if message==0x21:return 3  # activate editor on explicit present, not shadow
            if message==0x20:self._cursor();return 1
            if message==0x201:
                edge,p=self._cursor()
                if not self.locked():self.drag=(p.x,p.y,self.geometry,edge or 'move');self.user.SetCapture(hwnd)
                return 0
            if message==0x200:
                _,p=self._cursor()
                if self.drag:
                    px,py,geo,edge=self.drag;new=resize_rectangle(geo,p.x-px,p.y-py,edge,minimum_size(self.style[0]));self.update(new)
                    # A ctypes WndProc runs inside Tcl's native event dispatch.
                    # Re-entering Tk here can fatally corrupt its GIL state.
                    # Hand widget changes back to the Tk timer instead.
                    if self.events and self.events[-1][0]=='geometry':self.events[-1]=('geometry',new)
                    else:self.events.append(('geometry',new))
                return 0
            if message==0x202:
                if self.drag:self.drag=None;self.user.ReleaseCapture();self.events.append(('end',))
                return 0
            if message==0x215:self.drag=None;return 0
            if message==0x205:
                p=W.POINT();self.user.GetCursorPos(C.byref(p));self.events.append(('menu',p.x,p.y));return 0
        except Exception as exc:print('Post-it paper event:',str(exc),flush=True)
        return self.user.DefWindowProcW(hwnd,message,wparam,lparam)

    def save_png(self,path):
        w,h=self.geometry[2]+2*MARGIN,self.geometry[3]+2*MARGIN;raw=bytearray()
        for y in range(h):
            raw.append(0)
            for x in range(w):
                i=(y*w+x)*4;b,g,r,a=self.pixels[i:i+4];raw.extend((min(255,r*255//a) if a else 0,min(255,g*255//a) if a else 0,min(255,b*255//a) if a else 0,a))
        def chunk(tag,data):return struct.pack('!I',len(data))+tag+data+struct.pack('!I',zlib.crc32(tag+data)&0xffffffff)
        from pathlib import Path
        Path(path).write_bytes(b'\x89PNG\r\n\x1a\n'+chunk(b'IHDR',struct.pack('!2I5B',w,h,8,6,0,0,0))+chunk(b'IDAT',zlib.compress(raw))+chunk(b'IEND',b''))

    def destroy(self):
        if self.destroyed:return
        self.destroyed=True
        try:self.window.after_cancel(self.poll)
        except Exception:pass  # The Tk interpreter may already be closing.
        if self.user.IsWindow(self.editor):self.set_owner(self.editor,-8,self.old_owner)
        self._free_bitmap();self.gdi.DeleteDC(self.dc);self.user.DestroyWindow(self.hwnd);self.user.UnregisterClassW(self.name,self.module)
