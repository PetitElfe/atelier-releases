# One-time, standalone repair for the Windows TEST updater (WinError 5).
# Does not modify the stable app, personal data, Nathan's app, or the manifest.
param([string]$SourceFile = '')

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$root = 'E:\LATELIER_TEST_0180'
$code = Join-Path $root 'code_0180'
$app = Join-Path $code 'app'
$data = Join-Path $root 'data'
$target = Join-Path $app 'updater.py'
$manifestPath = Join-Path $code 'manifest.json'
$expectedSha = 'cbbe1a4e4e09ab5df6f4a5cb3938917f95fe569be9268a12d838dda64dd1e028'
$fixedCommit = 'bb24fd99e22458eebad8e47220be88a6fdd82ee9'
$url = 'https://raw.githubusercontent.com/PetitElfe/atelier-releases/' + $fixedCommit + '/app/updater.py'
$stage = $null
$backup = $null
$replaced = $false

function FileSha([string]$path) {
    return (Get-FileHash -LiteralPath $path -Algorithm SHA256).Hash.ToLowerInvariant()
}

try {
    Write-Host "L'Atelier du Goblin - Reparation securisee de la version TEST"
    foreach ($path in @($root, $code, $app, $data, $target, $manifestPath)) {
        if (-not (Test-Path -LiteralPath $path)) {
            throw "Dossier ou fichier TEST introuvable : $path"
        }
        if (((Get-Item -LiteralPath $path -Force).Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) {
            throw "Lien ou jonction detecte(e), reparation annulee : $path"
        }
    }
    if (-not (Test-Path -LiteralPath (Join-Path $data 'atelier.db') -PathType Leaf)) {
        throw "La base de donnees TEST est absente. Aucune modification effectuee."
    }
    $manifest = Get-Content -LiteralPath $manifestPath -Raw -Encoding UTF8 | ConvertFrom-Json
    if ($manifest.version -ne '0.18.0' -or $manifest.format -ne 2) {
        throw "Version TEST inattendue. Aucune modification effectuee."
    }
    $currentSha = FileSha $target
    if ($currentSha -eq $expectedSha) {
        Write-Host "OK : le reparateur est deja installe. Ferme puis rouvre L'Atelier TEST." -ForegroundColor Green
        exit 0
    }
    $oldText = [Text.Encoding]::UTF8.GetString([IO.File]::ReadAllBytes($target))
    if (-not $oldText.Contains("CODE.rename(backup/'code_avant')")) {
        throw "Le fichier actuel ne correspond pas a l'ancien updater connu. Aucune modification."
    }

    $tcp = New-Object System.Net.Sockets.TcpClient
    try {
        $tcp.Connect('127.0.0.1', 8876)
        throw "Le serveur TEST utilise encore le port 8876. Ferme L'Atelier TEST et recommence."
    } catch [System.Net.Sockets.SocketException] {
        # Connection refused: no TEST server is listening.
    } finally {
        $tcp.Dispose()
    }

    $stage = Join-Path $app ('updater.py.repair-' + [guid]::NewGuid().ToString('N') + '.tmp')
    if ($SourceFile) {
        $source = (Resolve-Path -LiteralPath $SourceFile).Path
        Copy-Item -LiteralPath $source -Destination $stage -ErrorAction Stop
    } else {
        [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
        Invoke-WebRequest -Uri $url -OutFile $stage -UseBasicParsing -TimeoutSec 60
    }
    if ((FileSha $stage) -ne $expectedSha) {
        throw "Le fichier recu ne correspond pas a l'empreinte SHA-256 attendue. Aucune installation."
    }

    $backup = Join-Path $root ('SAUVEGARDE_REPARATION_TEST_' +
                (Get-Date -Format 'yyyyMMdd_HHmmss') + '_' + [guid]::NewGuid().ToString('N').Substring(0, 8))
    New-Item -ItemType Directory -Path $backup -ErrorAction Stop | Out-Null
    $saved = Join-Path $backup 'updater.py'
    Copy-Item -LiteralPath $target -Destination $saved -ErrorAction Stop
    if ((FileSha $saved) -ne $currentSha) {
        throw "Sauvegarde de l'ancien updater non conforme. Installation annulee."
    }

    # File.Replace is atomic on the same NTFS volume; no CODE directory rename.
    [IO.File]::Replace($stage, $target, $null)
    $replaced = $true
    $stage = $null
    if ((FileSha $target) -ne $expectedSha) {
        throw "Verification du fichier installe echouee."
    }
    Write-Host "OK : le correctif est installe et verifie." -ForegroundColor Green
    Write-Host "Sauvegarde de l'ancien fichier : $saved"
    Write-Host "Les donnees, la version stable et l'application Nathan sont intactes."
    Write-Host "Rouvre L'Atelier TEST, puis Parametres > Mises a jour > Verifier > Installer."
    exit 0
} catch {
    $detail = $_.Exception.Message
    if ($replaced -and $backup -and (Test-Path -LiteralPath (Join-Path $backup 'updater.py'))) {
        $restore = Join-Path $app ('updater.py.restore-' + [guid]::NewGuid().ToString('N') + '.tmp')
        try {
            Copy-Item -LiteralPath (Join-Path $backup 'updater.py') -Destination $restore -ErrorAction Stop
            [IO.File]::Replace($restore, $target, $null)
            $detail += ' Ancien fichier restaure.'
        } catch {
            $detail += ' ATTENTION : restauration manuelle necessaire. Sauvegarde : ' + $backup
        } finally {
            if (Test-Path -LiteralPath $restore) { Remove-Item -LiteralPath $restore -Force }
        }
    }
    Write-Host ("ERREUR : " + $detail) -ForegroundColor Red
    Write-Host "N'utilise pas le bouton de mise a jour. Envoie ce message pour diagnostic."
    exit 1
} finally {
    if ($stage -and (Test-Path -LiteralPath $stage)) {
        Remove-Item -LiteralPath $stage -Force -ErrorAction SilentlyContinue
    }
}
