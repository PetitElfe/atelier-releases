param([string]$InputPng,[string]$OutputDir)
$ErrorActionPreference='Stop'
Add-Type -AssemblyName System.Drawing
$image=[Drawing.Image]::FromFile($InputPng)
try{
 if($image.RawFormat.Guid -ne [Drawing.Imaging.ImageFormat]::Png.Guid -or $image.Width -gt 8192 -or $image.Height -gt 8192 -or ([long]$image.Width*$image.Height) -gt 16777216){throw 'PNG invalide'}
 $bitmap=New-Object Drawing.Bitmap(1024,1024,[Drawing.Imaging.PixelFormat]::Format32bppArgb);$graphics=[Drawing.Graphics]::FromImage($bitmap)
 try{$graphics.Clear([Drawing.Color]::Transparent);$graphics.InterpolationMode=[Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic;$ratio=[Math]::Min(1024/$image.Width,1024/$image.Height);$w=[int]($image.Width*$ratio);$h=[int]($image.Height*$ratio);$graphics.DrawImage($image,[int]((1024-$w)/2),[int]((1024-$h)/2),$w,$h);$bitmap.Save((Join-Path $OutputDir 'prepared.png'),[Drawing.Imaging.ImageFormat]::Png)}finally{$graphics.Dispose();$bitmap.Dispose()}
}finally{$image.Dispose()}
& (Join-Path $PSScriptRoot 'local_icon.ps1') -Mode ImportTest -InputPng (Join-Path $OutputDir 'prepared.png') -OutputIcon (Join-Path $OutputDir 'prepared.ico')
if($LASTEXITCODE -and $LASTEXITCODE -ne 0){exit $LASTEXITCODE}
