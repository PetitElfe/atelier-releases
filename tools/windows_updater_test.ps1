# Isolated Windows E: drive on a throwaway GitHub Actions runner.
# The user's E:\00_LATELIER path must never be read or written.
$ErrorActionPreference='Stop'
$mapped=$false
try {
  if (Test-Path 'E:\') { throw 'E: is already in use; cannot run isolated updater test.' }
  & subst.exe E: $env:RUNNER_TEMP
  if ($LASTEXITCODE -ne 0) { throw 'Could not create isolated E: drive.' }
  $mapped=$true
  $root='E:\LATELIER_TEST_0180'
  $code=Join-Path $root 'code_0180'
  $data=Join-Path $root 'data'
  New-Item -ItemType Directory -Force $code,$data | Out-Null
  Copy-Item -Path 'app' -Destination (Join-Path $code 'app') -Recurse
  Copy-Item -Path 'manifest.json' -Destination (Join-Path $code 'manifest.json')
  'Donnée fictive préservée pendant redémarrage.' | Set-Content -Path (Join-Path $data 'note_test.txt') -Encoding utf8
  # Force a published update while the code remains valid: same version,
  # an outdated local manifest entry (no real user files).
  $manifestPath=Join-Path $code 'manifest.json'
  $manifest=Get-Content $manifestPath -Raw | ConvertFrom-Json
  $manifest.files[0].sha256=('0'*64)
  $manifest | ConvertTo-Json -Depth 10 | Set-Content $manifestPath -Encoding utf8
  $env:ATELIER_DATA_DIR=$data
  $env:ATELIER_PORT='8876'
  $env:ATELIER_NO_BROWSER='1'
  $app=Join-Path $code 'app\app.py'
  $old=Start-Process -FilePath python -ArgumentList @('-u',$app) -NoNewWindow -PassThru
  $base='http://127.0.0.1:8876'
  $ready=$false
  for($i=0;$i -lt 45;$i++){
    try {
      $runtime=Invoke-RestMethod "$base/api/runtime-version" -TimeoutSec 2
      if($runtime.version -eq '0.18.0'){$ready=$true;break}
    }catch{Start-Sleep -Seconds 1}
  }
  if(-not $ready){throw 'Initial test server did not start.'}
  $check=Invoke-RestMethod "$base/api/update/check" -TimeoutSec 30
  if(-not $check.available){throw 'Outdated test manifest not detected.'}
  if($check.installed_build -notmatch '^[0-9a-f]{8}$'){throw 'Installed build fingerprint not reported.'}
  Write-Host ('Candidate GitHub revision: '+$check.revision)
  $body=@{revision=$check.revision} | ConvertTo-Json
  $start=Invoke-RestMethod "$base/api/update/start" -Method Post -Body $body -ContentType 'application/json' -Headers @{'Origin'=$base;'X-Atelier-Update'='1'} -TimeoutSec 30
  if(-not $start.ok){throw 'Updater did not start.'}
  $ok=$false
  for($i=0;$i -lt 150;$i++){
    Start-Sleep -Seconds 2
    try{
      $progress=Invoke-RestMethod "$base/api/update/status" -TimeoutSec 2
      if($progress.phase -eq 'error'){throw ('UPDATE FAILED: '+$progress.detail)}
      if($progress.phase -eq 'success'){$ok=$true;break}
    }catch{
      if($_.Exception.Message -like '*UPDATE FAILED*'){throw}
      # Expected while the local server is restarting.
    }
  }
  if(-not $ok){throw 'TEST updater did not reconnect before timeout.'}
  $current=Invoke-RestMethod "$base/api/update/check" -TimeoutSec 20
  if($current.available){throw 'Update completed but manifest remains outdated.'}
  if($check.installed_build -eq $current.installed_build){throw 'Installed build fingerprint did not change.'}
  $backups=@(Get-ChildItem $root -Directory -Filter 'SAUVEGARDE_AUTO_TEST_*')
  if($backups.Count -ne 1){throw ('Expected one validated backup, got '+$backups.Count)}
  if(-not (Test-Path (Join-Path $backups[0].FullName 'data\atelier.db'))){throw 'Database backup missing.'}
  $note=Get-Content (Join-Path $data 'note_test.txt') -Raw
  if($note -notmatch 'Donnée fictive préservée'){throw 'User test data changed.'}
  Write-Host 'PASS: full Windows in-app update, local backup, automatic restart, preserved data.'
  try{Invoke-RestMethod "$base/api/shutdown" -Method Post -Body '{}' -ContentType 'application/json' -TimeoutSec 3 | Out-Null}catch{}
} catch {
  Write-Error $_
  $log='E:\LATELIER_TEST_0180\data\updater-worker.log'
  if(Test-Path $log){Get-Content $log -Tail 70 | Write-Host}
  throw
} finally {
  Start-Sleep -Seconds 1
  if($mapped){ & subst.exe E: /D }
}
