"""Gracefully reopen only the installed Misu TEST window after an update.

The existing executable needs no rebuild: the updated server runs this helper.
No process is killed, and the independent Post-it companion is never selected.
"""
import base64
import json
import os
from pathlib import Path
import re
import subprocess
import time


def restart_script(base, data):
    def quote(path):
        return "'" + str(path).replace("'", "''") + "'"
    exe = Path(base) / 'desktop' / 'LAtelierDuGoblin_TEST.exe'
    return r"""
$ErrorActionPreference='Stop'
$exe=EXE_PATH
$data=DATA_PATH
$state=Join-Path $data 'desktop-restart-state.json'
function State($phase,$detail){@{phase=$phase;detail=$detail}|ConvertTo-Json|Set-Content -LiteralPath $state -Encoding utf8}
try {
  for($i=0;$i -lt 150 -and (Test-Path -LiteralPath (Join-Path $data 'updater.lock'));$i++){Start-Sleep -Milliseconds 200}
  if(Test-Path -LiteralPath (Join-Path $data 'updater.lock')){throw 'La mise à jour est encore en cours.'}
  if(-not (Test-Path -LiteralPath $exe)){State 'skipped' 'Aucune fenêtre native installée.';exit 0}
  $matches=@(Get-CimInstance Win32_Process | Where-Object {$_.ExecutablePath -and $_.ExecutablePath -ieq $exe})
  if($matches.Count -eq 0){State 'skipped' 'Installation ouverte dans un navigateur.';exit 0}
  # PyInstaller can have a bootloader and GUI child: select only the GUI window.
  $windows=@($matches | ForEach-Object {Get-Process -Id $_.ProcessId -ErrorAction SilentlyContinue} | Where-Object {$_.MainWindowHandle -ne 0})
  if($windows.Count -ne 1){throw 'Fenêtre TEST non identifiée de manière unique.'}
  $window=$windows[0]
  State 'closing' 'Fermeture de la fenêtre TEST.'
  if(-not $window.CloseMainWindow()){throw 'La fermeture de la fenêtre a été refusée.'}
  if(-not $window.WaitForExit(20000)){throw 'La fenêtre reste ouverte. Ferme-la puis relance L’Atelier.'}
  # The old host closes its own server and releases its single-window lock.
  Start-Sleep -Milliseconds 1200
  Start-Process -FilePath $exe -WorkingDirectory (Split-Path -Parent $exe)
  State 'reopened' 'La fenêtre TEST a été relancée.'
} catch {State 'error' $_.Exception.Message;exit 1}
""".replace('EXE_PATH', quote(exe)).replace('DATA_PATH', quote(data))


def schedule(base, data, revision):
    if os.name != 'nt' or not re.fullmatch(r'[0-9a-f]{40}', revision or ''):
        return {'scheduled': False}
    data = Path(data)
    state = json.loads((data / 'updater-state.json').read_text(encoding='utf-8'))
    if (state.get('phase') != 'success' or state.get('revision') != revision
            or time.time() - (data / 'updater-state.json').stat().st_mtime > 600):
        return {'scheduled': False}
    # One automatic reopen per delivery, even after its new document loads.
    marker = data / ('desktop-restarted-' + revision + '.lock')
    try:
        fd = os.open(marker, os.O_CREAT | os.O_EXCL | os.O_WRONLY, 0o600)
    except FileExistsError:
        return {'scheduled': False, 'already_requested': True}
    os.close(fd)
    try:
        encoded = base64.b64encode(restart_script(base, data).encode('utf-16le')).decode('ascii')
        with (data / 'desktop-restart.log').open('ab') as log:
            subprocess.Popen(['powershell.exe', '-NoProfile', '-NonInteractive',
                              '-EncodedCommand', encoded], stdin=subprocess.DEVNULL,
                             stdout=log, stderr=log, close_fds=True,
                             creationflags=getattr(subprocess, 'CREATE_NO_WINDOW', 0))
    except Exception:
        marker.unlink(missing_ok=True)
        raise
    return {'scheduled': True}
