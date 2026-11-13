$ErrorActionPreference = 'Stop'
function FileHash([string]$path) {
    $sha = [Security.Cryptography.SHA256]::Create()
    try { return ([BitConverter]::ToString($sha.ComputeHash([IO.File]::ReadAllBytes($path)))).Replace('-','').ToLowerInvariant() } finally { $sha.Dispose() }
}
$base = Join-Path $env:LOCALAPPDATA 'LAtelierDuGoblinNathan'
$target = Join-Path $base 'code\app\updater.py'
$data = Join-Path $base 'data'
if (!(Test-Path -LiteralPath $target) -or !(Test-Path -LiteralPath (Join-Path $data 'atelier.db'))) { throw 'Installation Nathan introuvable.' }
if (Test-Path -LiteralPath (Join-Path $data 'updater.lock')) { throw 'Une mise a jour est encore active. Attends sa fin avant de relancer.' }
$expectedOld = '5629470982060603971dc49e386028478488b5d047696b6fc5c68d4bcc6205ce'
$expectedNew = 'cce0a59b836dcb72b08f5c23fa896484cef4b1018b601a5aade9f36d49a3b3bd'
$hash = (FileHash $target)
if ($hash -eq $expectedNew) { Write-Host 'Correctif deja applique.'; exit 0 }
if ($hash -ne $expectedOld) { throw 'Version locale differente : aucun fichier modifie.' }
# Replace only the precisely recognized updater; never touch data or the executable.
$text = [IO.File]::ReadAllText($target)
$needle = "'desktop-postits.lock','desktop-postits-wake.txt',"
$replacement = "'desktop-window.lock','desktop-postits.lock','desktop-postits-wake.txt',"
if (!$text.Contains($needle)) { throw 'Code attendu introuvable.' }
$temp = $target + '.lock-fix.tmp'
$backup = $target + '.avant-lock-fix'
try {
    [IO.File]::WriteAllText($temp, $text.Replace($needle,$replacement), (New-Object Text.UTF8Encoding($false)))
    if ((FileHash $temp) -ne $expectedNew) { throw 'Verification du correctif echouee.' }
    if (Test-Path -LiteralPath $backup) { throw 'Une sauvegarde de reparation existe deja. Aucun fichier remplace.' }
    [IO.File]::Replace($temp,$target,$backup)
    Write-Host 'Correctif applique. Ferme puis rouvre L Atelier et relance la mise a jour.'
} finally {
    if (Test-Path -LiteralPath $temp) { Remove-Item -LiteralPath $temp }
}
