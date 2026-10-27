"""Minimal native Windows notification-area icon for desktop Post-its.

No pip package required. Uses the Win32 shell on the same UI thread as Tk.
The tray is a real notification-area icon, not an open taskbar window.
"""
from __future__ import annotations

import ctypes
from ctypes import wintypes


WM_USER_TRAY = 0x0400 + 77
WM_LBUTTONUP = 0x0202
WM_LBUTTONDBLCLK = 0x0203
WM_RBUTTONUP = 0x0205
NIF_MESSAGE = 0x01
NIF_ICON = 0x02
NIF_TIP = 0x04
NIM_ADD = 0
NIM_DELETE = 2
IDI_APPLICATION = 32512


class NotifyIconData(ctypes.Structure):
    _fields_ = [
        ("cbSize", wintypes.DWORD),
        ("hWnd", wintypes.HWND),
        ("uID", wintypes.UINT),
        ("uFlags", wintypes.UINT),
        ("uCallbackMessage", wintypes.UINT),
        ("hIcon", wintypes.HICON),
        ("szTip", wintypes.WCHAR * 128),
        ("dwState", wintypes.DWORD),
        ("dwStateMask", wintypes.DWORD),
        ("szInfo", wintypes.WCHAR * 256),
        ("uVersion", wintypes.UINT),
        ("szInfoTitle", wintypes.WCHAR * 64),
        ("dwInfoFlags", wintypes.DWORD),
        ("guidItem", ctypes.c_byte * 16),
        ("hBalloonIcon", wintypes.HICON),
    ]


_WNDPROC = getattr(ctypes, "WINFUNCTYPE", ctypes.CFUNCTYPE)(
    ctypes.c_ssize_t, wintypes.HWND, wintypes.UINT,
    wintypes.WPARAM, wintypes.LPARAM
)


class WndClass(ctypes.Structure):
    _fields_ = [
        ("style", wintypes.UINT),
        ("lpfnWndProc", _WNDPROC),
        ("cbClsExtra", ctypes.c_int),
        ("cbWndExtra", ctypes.c_int),
        ("hInstance", wintypes.HINSTANCE),
        ("hIcon", wintypes.HICON),
        ("hCursor", wintypes.HANDLE),
        ("hbrBackground", wintypes.HBRUSH),
        ("lpszMenuName", wintypes.LPCWSTR),
        ("lpszClassName", wintypes.LPCWSTR),
    ]


class WindowsTray:
    def __init__(self, root, on_show, on_new, on_archives, on_quit, exe_path=None):
        import tkinter as tk
        if not hasattr(ctypes, "windll"):
            raise RuntimeError("Icône de notification Windows uniquement.")
        self.user32 = ctypes.windll.user32
        self.shell32 = ctypes.windll.shell32
        self.kernel32 = ctypes.windll.kernel32
        self.root = root
        self._destroyed = False
        self._custom_icon = False
        self._registered = False
        self._added = False
        self._wndproc = _WNDPROC(self._callback)  # Hold reference: OS calls it later.
        self._name = "LAtelierGoblinPostitsTray_%d" % self.kernel32.GetCurrentProcessId()
        self.kernel32.GetModuleHandleW.restype = wintypes.HMODULE
        self.module = self.kernel32.GetModuleHandleW(None)
        self.user32.DefWindowProcW.restype = ctypes.c_ssize_t
        self.user32.DefWindowProcW.argtypes = (
            wintypes.HWND, wintypes.UINT, wintypes.WPARAM, wintypes.LPARAM)
        self.user32.CreateWindowExW.restype = wintypes.HWND
        self.user32.CreateWindowExW.argtypes = (
            wintypes.DWORD, wintypes.LPCWSTR, wintypes.LPCWSTR, wintypes.DWORD,
            ctypes.c_int, ctypes.c_int, ctypes.c_int, ctypes.c_int,
            wintypes.HWND, wintypes.HMENU, wintypes.HINSTANCE, ctypes.c_void_p)
        self.user32.RegisterClassW.restype = wintypes.ATOM
        self.user32.RegisterClassW.argtypes = (ctypes.POINTER(WndClass),)
        self.shell32.Shell_NotifyIconW.argtypes = (
            wintypes.DWORD, ctypes.POINTER(NotifyIconData))
        self.shell32.Shell_NotifyIconW.restype = wintypes.BOOL
        self.user32.RegisterWindowMessageW.restype = wintypes.UINT
        self.user32.RegisterWindowMessageW.argtypes = (wintypes.LPCWSTR,)
        self.user32.GetCursorPos.argtypes = (ctypes.POINTER(wintypes.POINT),)
        self.user32.SetForegroundWindow.argtypes = (wintypes.HWND,)
        self.user32.DestroyWindow.argtypes = (wintypes.HWND,)
        self.user32.DestroyIcon.argtypes = (wintypes.HICON,)
        self.user32.UnregisterClassW.argtypes = (wintypes.LPCWSTR,wintypes.HINSTANCE)
        self.kernel32.GetModuleHandleW.argtypes = (wintypes.LPCWSTR,)
        self.taskbar_created = self.user32.RegisterWindowMessageW("TaskbarCreated")

        cls = WndClass()
        cls.lpfnWndProc = self._wndproc
        cls.hInstance = self.module
        cls.lpszClassName = self._name
        atom = self.user32.RegisterClassW(ctypes.byref(cls))
        if not atom:
            raise ctypes.WinError()
        self._registered = True
        self.hwnd = self.user32.CreateWindowExW(
            0, self._name, "Post-it L'Atelier du Goblin", 0,
            0, 0, 0, 0, None, None, self.module, None)
        if not self.hwnd:
            raise ctypes.WinError()

        # Use L'Atelier's real EXE icon when present; fallback is OS application icon.
        self.icon = None
        if exe_path and exe_path.is_file():
            self.shell32.ExtractAssociatedIconW.restype = wintypes.HICON
            self.shell32.ExtractAssociatedIconW.argtypes = (
                wintypes.HINSTANCE, wintypes.LPWSTR, ctypes.POINTER(ctypes.c_ushort))
            path = ctypes.create_unicode_buffer(str(exe_path))
            index = ctypes.c_ushort(0)
            self.icon = self.shell32.ExtractAssociatedIconW(
                self.module, path, ctypes.byref(index))
            self._custom_icon = bool(self.icon)
        if not self.icon:
            self.user32.LoadIconW.restype = wintypes.HICON
            self.user32.LoadIconW.argtypes = (wintypes.HINSTANCE, ctypes.c_void_p)
            self.icon = self.user32.LoadIconW(None, ctypes.c_void_p(IDI_APPLICATION))

        self.nid = NotifyIconData()
        self.nid.cbSize = ctypes.sizeof(NotifyIconData)
        self.nid.hWnd = self.hwnd
        self.nid.uID = 1
        self.nid.uFlags = NIF_ICON | NIF_MESSAGE | NIF_TIP
        self.nid.uCallbackMessage = WM_USER_TRAY
        self.nid.hIcon = self.icon
        self.nid.szTip = "L'Atelier du Goblin · Post-it Windows"
        self.menu = tk.Menu(root, tearoff=0)
        self.menu.add_command(label="Afficher tous les Post-it", command=on_show)
        self.menu.add_command(label="＋ Nouveau Post-it", command=on_new)
        self.menu.add_command(label="Mes archives…", command=on_archives)
        self.menu.add_separator()
        self.menu.add_command(label="Quitter les Post-it", command=on_quit)
        self.on_show = on_show
        if not self.shell32.Shell_NotifyIconW(NIM_ADD, ctypes.byref(self.nid)):
            self.destroy()
            raise ctypes.WinError()
        self._added = True

    def _callback(self, hwnd, message, wparam, lparam):
        try:
            if message == self.taskbar_created and not self._destroyed:
                self._added = bool(self.shell32.Shell_NotifyIconW(
                    NIM_ADD, ctypes.byref(self.nid)))
                return 0
            if message == WM_USER_TRAY:
                if lparam in (WM_LBUTTONUP, WM_LBUTTONDBLCLK):
                    self.root.after(0, self.on_show)
                elif lparam == WM_RBUTTONUP:
                    self.root.after(0, self._popup)
                return 0
        except Exception:
            pass
        return self.user32.DefWindowProcW(hwnd, message, wparam, lparam)

    def _popup(self):
        point = wintypes.POINT()
        self.user32.GetCursorPos(ctypes.byref(point))
        self.user32.SetForegroundWindow(self.hwnd)
        try:
            self.menu.tk_popup(point.x, point.y)
        finally:
            self.menu.grab_release()

    def destroy(self):
        if self._destroyed:
            return
        self._destroyed = True
        if self._added:
            self.shell32.Shell_NotifyIconW(NIM_DELETE, ctypes.byref(self.nid))
            self._added = False
        if getattr(self, "hwnd", None):
            self.user32.DestroyWindow(self.hwnd)
            self.hwnd = None
        if self._custom_icon and getattr(self, "icon", None):
            self.user32.DestroyIcon(self.icon)
        if self._registered:
            self.user32.UnregisterClassW(self._name, self.module)
            self._registered = False


if __name__ == "__main__":
    # Syntax + import are safe to check without a live GUI or Windows desktop.
    assert WM_USER_TRAY > 0x400 and NIF_ICON == 2
    print("PASS: native notification-area icon structures")
