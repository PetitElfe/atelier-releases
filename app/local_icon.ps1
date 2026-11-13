param([ValidateSet('Choose','Apply','Reset','ImportTest')][string]$Mode,[string]$TargetExe,[string]$OutputIcon,[string]$InputPng)
$ErrorActionPreference='Stop'
Add-Type -AssemblyName System.Drawing
Add-Type -AssemblyName System.Windows.Forms
if($Mode -eq 'Choose'){
  $owner=New-Object Windows.Forms.Form;$owner.TopMost=$true;$owner.ShowInTaskbar=$false
  $dialog=New-Object Windows.Forms.OpenFileDialog;$dialog.Filter='Image PNG (*.png)|*.png';$dialog.Title='Choisir ton icône — le dessin reste sur cet ordinateur';$dialog.Multiselect=$false;$dialog.RestoreDirectory=$true
  try{if($dialog.ShowDialog($owner) -ne [Windows.Forms.DialogResult]::OK){exit 2};$InputPng=$dialog.FileName}finally{$dialog.Dispose();$owner.Dispose()}
}
if($Mode -in @('Choose','ImportTest')){
  if(-not(Test-Path -LiteralPath $InputPng -PathType Leaf)){throw 'PNG absent'}
  if((Get-Item -LiteralPath $InputPng).Length -gt 16777216){throw 'PNG trop volumineux'}
  $image=[Drawing.Image]::FromFile($InputPng)
  try{
    if($image.RawFormat.Guid -ne [Drawing.Imaging.ImageFormat]::Png.Guid -or $image.Width -gt 8192 -or $image.Height -gt 8192 -or ([long]$image.Width*$image.Height) -gt 16777216){throw 'PNG invalide'}
    $sizes=@(16,24,32,48,64,128,256);$parts=New-Object 'System.Collections.Generic.List[byte[]]'
    foreach($size in $sizes){
      $bitmap=New-Object Drawing.Bitmap($size,$size,[Drawing.Imaging.PixelFormat]::Format32bppArgb);$g=[Drawing.Graphics]::FromImage($bitmap);$stream=New-Object IO.MemoryStream
      try{
        $g.Clear([Drawing.Color]::Transparent);$g.InterpolationMode=[Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic;$g.PixelOffsetMode=[Drawing.Drawing2D.PixelOffsetMode]::HighQuality;$g.CompositingQuality=[Drawing.Drawing2D.CompositingQuality]::HighQuality
        $ratio=[Math]::Min($size/$image.Width,$size/$image.Height);$w=[int][Math]::Max(1,[Math]::Round($image.Width*$ratio));$h=[int][Math]::Max(1,[Math]::Round($image.Height*$ratio))
        $g.DrawImage($image,[int](($size-$w)/2),[int](($size-$h)/2),$w,$h);$bitmap.Save($stream,[Drawing.Imaging.ImageFormat]::Png);$parts.Add($stream.ToArray())
      }finally{$g.Dispose();$bitmap.Dispose();$stream.Dispose()}
    }
    $file=[IO.File]::Create($OutputIcon);$writer=New-Object IO.BinaryWriter($file)
    try{
      $writer.Write([uint16]0);$writer.Write([uint16]1);$writer.Write([uint16]$sizes.Count);$offset=6+16*$sizes.Count
      for($i=0;$i -lt $sizes.Count;$i++){$v=if($sizes[$i] -eq 256){0}else{$sizes[$i]};$writer.Write([byte]$v);$writer.Write([byte]$v);$writer.Write([byte]0);$writer.Write([byte]0);$writer.Write([uint16]1);$writer.Write([uint16]32);$writer.Write([uint32]$parts[$i].Length);$writer.Write([uint32]$offset);$offset+=$parts[$i].Length}
      foreach($part in $parts){$writer.Write([byte[]]$part)}
    }finally{$writer.Dispose();$file.Dispose()}
  }finally{$image.Dispose()}
}
if($Mode -ne 'ImportTest'){
  Add-Type -TypeDefinition 'using System;using System.Text;using System.IO;using System.Runtime.InteropServices;public static class AtelierIconPath{[DllImport("kernel32.dll",CharSet=CharSet.Unicode)]static extern uint GetLongPathName(string p,StringBuilder b,uint n);public static string Canonical(string p){var b=new StringBuilder(32768);return GetLongPathName(p,b,32768)>0?b.ToString():Path.GetFullPath(p);}}'
  $canonicalTarget=[AtelierIconPath]::Canonical($TargetExe)
  $shell=New-Object -ComObject WScript.Shell
  $desktop=$shell.SpecialFolders.Item('Desktop')
  $dirs=@($desktop,(Join-Path $env:APPDATA 'Microsoft\Internet Explorer\Quick Launch\User Pinned\TaskBar'))
  $shortcutCount=0
  foreach($dir in $dirs){if(-not(Test-Path -LiteralPath $dir)){continue};Get-ChildItem -LiteralPath $dir -Filter '*.lnk' -File|ForEach-Object{
    $link=$shell.CreateShortcut($_.FullName)
    if(-not $link.TargetPath){return}
    if([string]::Equals([AtelierIconPath]::Canonical($link.TargetPath),$canonicalTarget,[StringComparison]::OrdinalIgnoreCase)){
      $link.IconLocation=if($Mode -eq 'Reset'){$TargetExe+',0'}else{$OutputIcon+',0'};$link.Save();$shortcutCount++
    }
  }}
  # Apply directly, with bounded messages; do not rely on a background watcher.
  $windowCount=0
  if($Mode -ne 'Reset'){
    Add-Type -TypeDefinition 'using System;using System.Runtime.InteropServices;public static class AtelierApplyWindowIcon{delegate bool Visit(IntPtr w,IntPtr l);[DllImport("user32.dll")]static extern bool EnumWindows(Visit v,IntPtr l);[DllImport("user32.dll",CharSet=CharSet.Unicode)]static extern int GetWindowText(IntPtr w,System.Text.StringBuilder b,int n);[DllImport("user32.dll")]static extern uint GetWindowThreadProcessId(IntPtr w,out uint p);public static uint ProcessId(IntPtr w){uint p;GetWindowThreadProcessId(w,out p);return p;}public static IntPtr[] Windows(){var a=new System.Collections.Generic.List<IntPtr>();EnumWindows((w,l)=>{var b=new System.Text.StringBuilder(512);GetWindowText(w,b,512);if(b.ToString().Replace((char)0x2019,(char)39).StartsWith("L"+(char)39+"Atelier du Goblin"))a.Add(w);return true;},IntPtr.Zero);return a.ToArray();}[DllImport("user32.dll",CharSet=CharSet.Unicode)]public static extern IntPtr LoadImage(IntPtr h,string p,uint t,int x,int y,uint f);[DllImport("user32.dll",SetLastError=true)]public static extern IntPtr SendMessageTimeout(IntPtr w,uint m,UIntPtr p,IntPtr l,uint f,uint ms,out UIntPtr result);[DllImport("user32.dll")]public static extern bool DestroyIcon(IntPtr i);}'
    foreach($hwnd in [AtelierApplyWindowIcon]::Windows()){
      $owned=$false
      try{
        $process=Get-Process -Id ([AtelierApplyWindowIcon]::ProcessId($hwnd))
        if(-not $process.Path){continue}
        if(-not [string]::Equals([AtelierIconPath]::Canonical($process.Path),$canonicalTarget,[StringComparison]::OrdinalIgnoreCase)){continue}
        $owned=$true;$applied=$true
        foreach($pair in @(@(0,16),@(1,48))){
          $icon=[AtelierApplyWindowIcon]::LoadImage([IntPtr]::Zero,$OutputIcon,1,$pair[1],$pair[1],0x10)
          if($icon -eq [IntPtr]::Zero){throw 'Cannot load icon'}
          $result=[UIntPtr]::Zero
          $ack=[AtelierApplyWindowIcon]::SendMessageTimeout($hwnd,0x80,([UIntPtr]::new([uint32]$pair[0])),$icon,2,1500,[ref]$result)
          if($ack -eq [IntPtr]::Zero){$applied=$false;[AtelierApplyWindowIcon]::DestroyIcon($icon)|Out-Null}
        }
        if($applied){$windowCount++}
      }catch{if($owned){throw};continue}
    }
  }
  Add-Type -TypeDefinition 'using System;using System.Runtime.InteropServices;public static class AtelierIconRefresh{[DllImport("shell32.dll")]public static extern void SHChangeNotify(uint e,uint f,IntPtr a,IntPtr b);}'
  [AtelierIconRefresh]::SHChangeNotify(0x8000000,0,[IntPtr]::Zero,[IntPtr]::Zero)
  @{shortcuts=$shortcutCount;windows=$windowCount}|ConvertTo-Json -Compress
}
