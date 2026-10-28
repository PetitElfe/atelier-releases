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
  $link=Join-Path $shell.SpecialFolders.Item('Desktop') "L'Atelier du Goblin TEST.lnk"
  if(Test-Path $link) {throw 'Unexpected existing shortcut on isolated runner.'}
  $p=Start-Process -FilePath (Resolve-Path 'dist/LAtelierDuGoblin_TEST.exe') -ArgumentList '--install-only' -Wait -PassThru
  if($p.ExitCode -ne 0) {throw "The launcher installation failed (exit code $($p.ExitCode))."}
  $target=Join-Path $root 'desktop\LAtelierDuGoblin_TEST.exe'
  if(Test-Path (Join-Path $root 'desktop\LAtelier_TEST.exe')){throw 'Old desktop EXE should never be replaced by renamed app.'}
  if(-not(Test-Path $target)) {throw 'Installed EXE missing.'}
  if(-not(Test-Path $link)) {throw 'The Windows Desktop shortcut was not created.'}
  $shortcut=$shell.CreateShortcut($link)
  if($shortcut.TargetPath -ine $target) {throw "Shortcut points to wrong executable: $($shortcut.TargetPath)"}
  $sourceHash=(Get-FileHash 'dist/LAtelierDuGoblin_TEST.exe' -Algorithm SHA256).Hash
  $installedHash=(Get-FileHash $target -Algorithm SHA256).Hash
  if($sourceHash -ne $installedHash) {throw 'Installed EXE checksum changed.'}
  if((Get-Content (Join-Path $data 'test_important.txt') -Raw) -notmatch 'Ne jamais écraser') {
    throw 'The shortcut installation modified test data.'
  }
  # A pre-existing outdated EXE must be backed up, then replaced safely.
  [IO.File]::WriteAllBytes($target,[Text.Encoding]::ASCII.GetBytes('legacy-test-executable'))
  $legacyHash=(Get-FileHash $target -Algorithm SHA256).Hash
  $upgrade=Start-Process -FilePath (Resolve-Path 'dist/LAtelierDuGoblin_TEST.exe') -ArgumentList '--install-only' -Wait -PassThru
  if($upgrade.ExitCode -ne 0){throw ('TEST desktop EXE upgrade failed: '+$upgrade.ExitCode)}
  if((Get-FileHash $target -Algorithm SHA256).Hash -ne $sourceHash){
    throw 'Upgraded EXE does not match the verified source.'
  }
  $backups=@(Get-ChildItem (Join-Path $root 'desktop') -File -Filter 'LAtelierDuGoblin_TEST.exe.backup-*')
  if($backups.Count -ne 1){throw 'Previous EXE was not backed up exactly once.'}
  if((Get-FileHash $backups[0].FullName -Algorithm SHA256).Hash -ne $legacyHash){
    throw 'The previous EXE backup is corrupt.'
  }
  if((Get-Content (Join-Path $data 'test_important.txt') -Raw) -notmatch 'Ne jamais écraser') {
    throw 'Upgrading the launcher modified user data.'
  }
  Write-Host 'PASS: one-click .exe install + safe upgrade, verified backup, shortcut and preserved data.'
} finally {
  if($link -and (Test-Path $link)) {Remove-Item $link -Force -ErrorAction SilentlyContinue}
  if($mapped) { & subst.exe E: /D | Out-Null }
}
