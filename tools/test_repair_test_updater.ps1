# Run only on a throwaway Windows GitHub Actions runner.
$ErrorActionPreference = 'Stop'
$mapped = $false
$holder = $null
try {
    if (Test-Path 'E:\') { throw 'E: is already in use on runner.' }
    & subst.exe E: $env:RUNNER_TEMP
    if ($LASTEXITCODE -ne 0) { throw 'Could not mount isolated E: drive.' }
    $mapped = $true
    $root = 'E:\LATELIER_TEST_0180'
    $code = Join-Path $root 'code_0180'
    $app = Join-Path $code 'app'
    $data = Join-Path $root 'data'
    $stable = 'E:\00_LATELIER'
    New-Item -ItemType Directory -Force $app, $data, $stable | Out-Null
    Copy-Item -LiteralPath 'manifest.json' -Destination (Join-Path $code 'manifest.json')
    'stable-unchanged' | Set-Content -LiteralPath (Join-Path $stable 'sentinel.txt') -Encoding ASCII
    & python -c "import sqlite3; c=sqlite3.connect(r'E:\LATELIER_TEST_0180\data\atelier.db'); c.execute('create table keep (value text)'); c.execute('insert into keep values (?)',('preserved',)); c.commit(); c.close()"
    if ($LASTEXITCODE -ne 0) { throw 'SQLite test setup failed.' }
    $target = Join-Path $app 'updater.py'
    $oldCode = "import pathlib,subprocess; pathlib.Path(r'$target').write_bytes(subprocess.check_output(['git','show','d257c4ed41f6ec1ff088619f4c6e39a95b4b7de9:app/updater.py']))"
    & python -c $oldCode
    if ($LASTEXITCODE -ne 0) { throw 'Could not restore pre-fix updater from Git.' }
    $oldSha = (Get-FileHash -LiteralPath $target -Algorithm SHA256).Hash
    $dbSha = (Get-FileHash -LiteralPath (Join-Path $data 'atelier.db') -Algorithm SHA256).Hash
    $manifestSha = (Get-FileHash -LiteralPath (Join-Path $code 'manifest.json') -Algorithm SHA256).Hash
    $stableSha = (Get-FileHash -LiteralPath (Join-Path $stable 'sentinel.txt') -Algorithm SHA256).Hash
    $expected = 'cbbe1a4e4e09ab5df6f4a5cb3938917f95fe569be9268a12d838dda64dd1e028'
    # Git for Windows may check out .py files with CRLF, while the signed
    # release manifest hashes the original LF blob. Read the immutable blob.
    $verifiedSource = Join-Path $env:RUNNER_TEMP 'atelier-fixed-updater.py'
    $fixedCode = "import pathlib,subprocess; pathlib.Path(r'$verifiedSource').write_bytes(subprocess.check_output(['git','show','bb24fd99e22458eebad8e47220be88a6fdd82ee9:app/updater.py']))"
    & python -c $fixedCode
    if ($LASTEXITCODE -ne 0) { throw 'Cannot read the immutable fixed updater blob.' }
    if ((Get-FileHash -LiteralPath $verifiedSource -Algorithm SHA256).Hash.ToLowerInvariant() -ne $expected) {
        throw 'The pinned upstream SHA-256 does not match the immutable Git blob.'
    }

    # Reproduce the exact Windows directory lock: a second process uses CODE/app as cwd.
    $holdScript = Join-Path $data 'hold-code-cwd.py'
    'import time; time.sleep(180)' | Set-Content -LiteralPath $holdScript -Encoding ASCII
    $holder = Start-Process -FilePath (Get-Command python).Source -ArgumentList @($holdScript) -WorkingDirectory $app -PassThru -NoNewWindow
    Start-Sleep -Seconds 2
    if ($holder.HasExited) { throw 'Failed to simulate the Windows Post-it directory lock.' }

    & powershell.exe -NoProfile -ExecutionPolicy Bypass -File 'tools/Reparer_LAtelier_TEST.ps1' -SourceFile $verifiedSource
    if ($LASTEXITCODE -ne 0) { throw 'Offline repair with locked directory failed.' }
    if ((Get-FileHash -LiteralPath $target -Algorithm SHA256).Hash.ToLowerInvariant() -ne $expected) {
        throw 'Repair installed the wrong updater.'
    }
    if ($holder.HasExited) { throw 'Repair unexpectedly stopped the independent companion.' }
    $backups = @(Get-ChildItem -LiteralPath $root -Directory -Filter 'SAUVEGARDE_REPARATION_TEST_*')
    if ($backups.Count -ne 1) { throw 'Expected one dedicated pre-repair backup.' }
    if ((Get-FileHash -LiteralPath (Join-Path $backups[0].FullName 'updater.py') -Algorithm SHA256).Hash -ne $oldSha) {
        throw 'Backup does not match the original updater.'
    }

    # Running twice must be harmless and must not create another backup.
    & powershell.exe -NoProfile -ExecutionPolicy Bypass -File 'tools/Reparer_LAtelier_TEST.ps1' -SourceFile $verifiedSource
    if ($LASTEXITCODE -ne 0) { throw 'Idempotent repair failed.' }
    if (@(Get-ChildItem -LiteralPath $root -Directory -Filter 'SAUVEGARDE_REPARATION_TEST_*').Count -ne 1) {
        throw 'Idempotent repair created a redundant backup.'
    }

    # Corrupt source must be rejected before replacing anything.
    & python -c $oldCode
    $bad = Join-Path $data 'bad-updater.py'
    'corrupt source' | Set-Content -LiteralPath $bad -Encoding ASCII
    & powershell.exe -NoProfile -ExecutionPolicy Bypass -File 'tools/Reparer_LAtelier_TEST.ps1' -SourceFile $bad
    if ($LASTEXITCODE -ne 1) { throw 'Corrupt updater source was not rejected.' }
    if ((Get-FileHash -LiteralPath $target -Algorithm SHA256).Hash -ne $oldSha) {
        throw 'Invalid source changed the installed updater.'
    }

    # Exercise the actual end-user path: immutable HTTPS download + SHA-256 check.
    & powershell.exe -NoProfile -ExecutionPolicy Bypass -File 'tools/Reparer_LAtelier_TEST.ps1'
    if ($LASTEXITCODE -ne 0) { throw 'Online repair via GitHub failed.' }
    if ((Get-FileHash -LiteralPath $target -Algorithm SHA256).Hash.ToLowerInvariant() -ne $expected) {
        throw 'Online repair installed the wrong updater.'
    }
    if ((Get-FileHash -LiteralPath (Join-Path $data 'atelier.db') -Algorithm SHA256).Hash -ne $dbSha) {
        throw 'Personal SQLite data changed during the repair.'
    }
    if ((Get-FileHash -LiteralPath (Join-Path $code 'manifest.json') -Algorithm SHA256).Hash -ne $manifestSha) {
        throw 'The repair changed the installed build manifest.'
    }
    if ((Get-FileHash -LiteralPath (Join-Path $stable 'sentinel.txt') -Algorithm SHA256).Hash -ne $stableSha) {
        throw 'The repair touched the stable application.'
    }
    if ($holder.HasExited) { throw 'The companion process was terminated.' }
    Write-Host 'PASS: real online/offline Windows repair, locked cwd, backup, idempotence, bad SHA, preserved DB/manifest/stable.'
} finally {
    if ($null -ne $holder -and -not $holder.HasExited) {
        Stop-Process -Id $holder.Id -Force
    }
    if ($mapped) { & subst.exe E: /D }
}
