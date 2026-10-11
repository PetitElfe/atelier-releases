@echo off
setlocal EnableExtensions
cd /d "%~dp0"
title L'Atelier

echo ======================================
echo          L'Atelier
echo ======================================
echo.
echo [1/3] Fermeture de L'Atelier si necessaire...

powershell -NoProfile -ExecutionPolicy Bypass -Command "$ProgressPreference='SilentlyContinue'; try { Invoke-WebRequest -UseBasicParsing -Method Post -Uri 'http://127.0.0.1:8765/api/shutdown' -ContentType 'application/json' -Body '{}' -TimeoutSec 2 | Out-Null } catch { try { Invoke-WebRequest -UseBasicParsing -Uri 'http://127.0.0.1:8765/api/shutdown' -TimeoutSec 2 | Out-Null } catch {} }; $limit=(Get-Date).AddSeconds(5); do { $c=Get-NetTCPConnection -LocalPort 8765 -State Listen -ErrorAction SilentlyContinue; if(-not $c){ break }; Start-Sleep -Milliseconds 250 } while((Get-Date) -lt $limit)" >nul 2>nul

echo [2/3] Verification des mises a jour...
if exist "%~dp0Mettre a jour.bat" (
  (echo.) | "%ComSpec%" /d /c ""%~dp0Mettre a jour.bat""
) else if exist "%~dp0Mettre à jour.bat" (
  (echo.) | "%ComSpec%" /d /c ""%~dp0Mettre à jour.bat""
) else (
  echo [ATTENTION] Le fichier de mise a jour est introuvable.
  echo L'Atelier va tout de meme demarrer.
)

echo [3/3] Demarrage de L'Atelier...
if exist "%~dp0Lancer L'Atelier.bat" (
  start "" "%~dp0Lancer L'Atelier.bat"
  exit /b 0
)

echo.
echo [ERREUR] "Lancer L'Atelier.bat" est introuvable.
echo.
pause
exit /b 1
