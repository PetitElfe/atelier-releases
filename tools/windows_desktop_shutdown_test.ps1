# Only on a disposable GitHub Actions Windows runner, never on user E:.
$ErrorActionPreference='Stop'
$mapped=$false
try {
  if (Test-Path 'E:\') {throw 'E: already exists: refuse to run test.'}
  & subst.exe E: $env:RUNNER_TEMP
  if($LASTEXITCODE -ne 0){throw 'Unable to mount fake E:.'}
  $mapped=$true
  $root='E:\LATELIER_TEST_0180'
  $code=Join-Path $root 'code_0180'
  $data=Join-Path $root 'data'
  New-Item -ItemType Directory -Force $code,$data | Out-Null
  Copy-Item -LiteralPath 'app' -Destination (Join-Path $code 'app') -Recurse
  Copy-Item -LiteralPath 'manifest.json' -Destination (Join-Path $code 'manifest.json')
  'protected user content' | Set-Content -LiteralPath (Join-Path $data 'user-content.txt') -Encoding utf8
  & python -m unittest discover -s tests -p 'test_desktop_shutdown.py' -v
  if($LASTEXITCODE -ne 0){throw 'Windows desktop shutdown unit tests failed.'}
  & python tools/test_desktop_shutdown_integration.py
  if($LASTEXITCODE -ne 0){throw 'TEST desktop lifecycle integration failed.'}
  if((Get-Content -LiteralPath (Join-Path $data 'user-content.txt') -Raw) -notmatch 'protected user content'){
    throw 'The desktop lifecycle test changed user data.'
  }
  Write-Host 'PASS: Windows TEST lifecycle, update restart, busy-phase protection and isolated data.'
} finally {
  if($mapped){ & subst.exe E: /D }
}
