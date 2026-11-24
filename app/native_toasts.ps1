param([ValidateSet('register','show')][string]$Mode,[string]$Target,[string]$Arguments,[string]$Link,[string]$XmlFile,[string]$Tag)
$ErrorActionPreference='Stop'
$AppId='LAtelierDuGoblin.TEST.Reminders'
if($Mode -eq 'register') {
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
using System.Runtime.InteropServices.ComTypes;
using System.Text;
[ComImport,Guid("00021401-0000-0000-C000-000000000046")] class GoblinShellLink {}
[ComImport,Guid("000214F9-0000-0000-C000-000000000046"),InterfaceType(ComInterfaceType.InterfaceIsIUnknown)] interface IGoblinLink {
void GetPath([Out,MarshalAs(UnmanagedType.LPWStr)] StringBuilder p,int c,IntPtr d,uint f);void GetIDList(out IntPtr p);void SetIDList(IntPtr p);void GetDescription([Out,MarshalAs(UnmanagedType.LPWStr)] StringBuilder p,int c);void SetDescription([MarshalAs(UnmanagedType.LPWStr)] string p);void GetWorkingDirectory([Out,MarshalAs(UnmanagedType.LPWStr)] StringBuilder p,int c);void SetWorkingDirectory([MarshalAs(UnmanagedType.LPWStr)] string p);void GetArguments([Out,MarshalAs(UnmanagedType.LPWStr)] StringBuilder p,int c);void SetArguments([MarshalAs(UnmanagedType.LPWStr)] string p);void GetHotkey(out short h);void SetHotkey(short h);void GetShowCmd(out int c);void SetShowCmd(int c);void GetIconLocation([Out,MarshalAs(UnmanagedType.LPWStr)] StringBuilder p,int c,out int i);void SetIconLocation([MarshalAs(UnmanagedType.LPWStr)] string p,int i);void SetRelativePath([MarshalAs(UnmanagedType.LPWStr)] string p,uint r);void Resolve(IntPtr w,uint f);void SetPath([MarshalAs(UnmanagedType.LPWStr)] string p);
}
[StructLayout(LayoutKind.Sequential)] struct GoblinKey {public Guid fmtid;public uint pid;public GoblinKey(uint id){fmtid=new Guid("9F4C2855-9F79-4B39-A8D0-E1D42DE1D5F3");pid=id;}}
[StructLayout(LayoutKind.Explicit,Size=24)] struct GoblinVariant {[FieldOffset(0)]public ushort vt;[FieldOffset(8)]public IntPtr pointer;}
[ComImport,Guid("886D8EEB-8CF2-4446-8D02-CDBA1DBDCF99"),InterfaceType(ComInterfaceType.InterfaceIsIUnknown)] interface IGoblinStore {void GetCount(out uint c);void GetAt(uint i,out GoblinKey k);void GetValue(ref GoblinKey k,out GoblinVariant v);void SetValue(ref GoblinKey k,ref GoblinVariant v);void Commit();}
public static class GoblinShortcut {
public static void Create(string path,string target,string args,string appid) {
object shell=new GoblinShellLink();IGoblinLink link=(IGoblinLink)shell;link.SetPath(target);link.SetArguments(args??"");link.SetWorkingDirectory(System.IO.Path.GetDirectoryName(target));link.SetDescription("L'Atelier TEST - rappels Windows");
IGoblinStore store=(IGoblinStore)shell;GoblinKey id=new GoblinKey(5);GoblinVariant text=new GoblinVariant{vt=31,pointer=Marshal.StringToCoTaskMemUni(appid)};
try{store.SetValue(ref id,ref text);}finally{Marshal.FreeCoTaskMem(text.pointer);}
// A stub CLSID keeps protocol-only notifications in Notification Center.
GoblinKey activation=new GoblinKey(26);GoblinVariant guid=new GoblinVariant{vt=72,pointer=Marshal.AllocCoTaskMem(16)};
try{Marshal.StructureToPtr(new Guid("251DC668-3655-4EFA-ADEA-320922AE5381"),guid.pointer,false);store.SetValue(ref activation,ref guid);}finally{Marshal.FreeCoTaskMem(guid.pointer);}
store.Commit();((IPersistFile)shell).Save(path,true);Marshal.FinalReleaseComObject(shell);
}}
'@
 [GoblinShortcut]::Create($Link,$Target,$Arguments,$AppId)
 if(!(Test-Path -LiteralPath $Link)){throw 'Shortcut was not created'}
 exit 0
}
[Windows.UI.Notifications.ToastNotificationManager, Windows.UI.Notifications, ContentType=WindowsRuntime] > $null
[Windows.Data.Xml.Dom.XmlDocument, Windows.Data.Xml.Dom.XmlDocument, ContentType=WindowsRuntime] > $null
$xml=New-Object Windows.Data.Xml.Dom.XmlDocument
$xml.LoadXml([IO.File]::ReadAllText($XmlFile,[Text.Encoding]::UTF8))
$toast=[Windows.UI.Notifications.ToastNotification]::new($xml)
$toast.Tag=$Tag
$toast.Group='GoblinTEST'
[Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier($AppId).Show($toast)
