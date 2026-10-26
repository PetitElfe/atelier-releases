# Creates a disposable test E: drive on the Actions runner (never user's disk).
$ErrorActionPreference='Stop'
$mapped=$false
$link=$null
try {
  if (Test-Path "E:\") {throw 'E: exists; cannot safely run isolated shortcut test.'}
  & subst.exe E: $env:RUNNER_TEMP
  if ($LASTEXITCODE -ne 0) {throw 'Could not create virtual E:.'}
  $mapped=$true
  $root='E:\LATELIER_TEST_0180'
  $app=Join-Path $root 'code_0180\app'
  $data=Join-Path $root 'data'
  New-Item -ItemType Directory -Force $app,$data | Out-Null
  Set-Content (Join-Path $app 'app.py') '# mock'
  Set-Content (Join-Path $app 'VERSION') '0.18.0'
  Set-Content (Join-Path $root 'code_0180\manifest.json') '{}'
  Set-Content (Join-Path $data 'atelier.db') 'dummy database placeholder'
  Set-Content (Join-Path $data 'test_important.txt') 'Ne jamais écraser mes données'
  $shell=New-Object -ComObject WScript.Shell
  $link=Join-Path $shell.SpecialFolders.Item('Desktop') "L'Atelier TEST.lnk"
  if(Test-Path $link) {throw 'Unexpected existing shortcut on isolated runner.'}
  $p=Start-Process -FilePath (Resolve-Path 'dist/LAtelier_TEST.exe') -ArgumentList '--install-only' -Wait -PassThru
  if($p.ExitCode -ne 0) {throw "The launcher installation failed (exit code $($p.ExitCode))."}
  $target=Join-Path $root 'desktop\LAtelier_TEST.exe'
  if(-not(Test-Path $target)) {throw 'Installed EXE missing.'}
  if(-not(Test-Path $link)) {throw 'The Windows Desktop shortcut was not created.'}
  $shortcut=$shell.CreateShortcut($link)
  if($shortcut.TargetPath -ine $target) {throw "Shortcut points to wrong executable: $($shortcut.TargetPath)"}
  $sourceHash=(Get-FileHash 'dist/LAtelier_TEST.exe' -Algorithm SHA256).Hash
  $installedHash=(Get-FileHash $target -Algorithm SHA256).Hash
  if($sourceHash -ne $installedHash) {throw 'Installed EXE checksum changed.'}
  if((Get-Content (Join-Path $data 'test_important.txt') -Raw) -notmatch 'Ne jamais écraser') {
    throw 'The shortcut installation modified test data.'
  }
  Write-Host 'PASS: one-click .exe installation, correct Desktop shortcut, matching bytes and preserved data.'
} finally {
  if($link -and (Test-Path $link)) {Remove-Item $link -Force -ErrorAction SilentlyContinue}
  if($mapped) { & subst.exe E: /D | Out-Null }
}
