@echo off
setlocal EnableExtensions DisableDelayedExpansion
title L'Atelier - Mise a jour TEST 0.18
set "ROOT=E:\LATELIER_TEST_0180\code_0180\"
set "ALLOWED=E:\LATELIER_TEST_0180\code_0180\"
set "TEST_DATA=E:\LATELIER_TEST_0180\data"
set "BRANCH=feature/0180-progression-foundations"
set "REPO="
set "CURRENT="

echo.
echo ===== L'ATELIER - MISE A JOUR DU CLONE TEST =====
echo.
if /I not "%ROOT%"=="%ALLOWED%" (
  echo SECURITE : ce lanceur doit rester dans %ALLOWED%
  goto :fail
)
if not exist "%TEST_DATA%\atelier.db" (
  echo Donnees de test introuvables : arret sans modification.
  goto :fail
)
where git >nul 2>&1
if errorlevel 1 (
  echo Git est introuvable sur ce PC.
  goto :fail
)
where python >nul 2>&1
if errorlevel 1 (
  echo Python est introuvable sur ce PC.
  goto :fail
)
for /f "delims=" %%A in ('git -C "%ROOT%" rev-parse --abbrev-ref HEAD 2^>nul') do set "CURRENT=%%A"
if not "%CURRENT%"=="%BRANCH%" (
  echo Branche inattendue : %CURRENT%
  echo Aucun changement effectue.
  goto :fail
)
for /f "delims=" %%A in ('git -C "%ROOT%" remote get-url origin 2^>nul') do set "REPO=%%A"
if /I "%REPO%"=="https://github.com/PetitElfe/atelier-releases.git" goto :remote_ok
if /I "%REPO%"=="https://github.com/PetitElfe/atelier-releases" goto :remote_ok
if /I "%REPO%"=="git@github.com:PetitElfe/atelier-releases.git" goto :remote_ok
echo Depot GitHub inattendu : %REPO%
goto :fail

:remote_ok
git -C "%ROOT%" diff --quiet
if errorlevel 1 (
  echo Modifications locales detectees : aucune mise a jour.
  goto :fail
)
git -C "%ROOT%" diff --cached --quiet
if errorlevel 1 (
  echo Modifications indexees detectees : aucune mise a jour.
  goto :fail
)
python -c "import socket,sys; s=socket.socket(); s.settimeout(0.5); result=s.connect_ex(('127.0.0.1',8876)); s.close(); sys.exit(1 if result==0 else 0)"
if errorlevel 1 (
  echo Ferme d'abord la fenetre du serveur TEST sur le port 8876.
  goto :fail
)
for /f "delims=" %%A in ('powershell -NoProfile -Command "Get-Date -Format yyyyMMdd_HHmmss"') do set "STAMP=%%A"
if not defined STAMP (
  echo Impossible de creer un nom de sauvegarde.
  goto :fail
)
set "BACKUP=E:\LATELIER_TEST_0180\SAUVEGARDE_TEST_%STAMP%"
if exist "%BACKUP%" (
  echo Une sauvegarde porte deja ce nom. Arret de securite.
  goto :fail
)
mkdir "%BACKUP%" || goto :fail
echo Sauvegarde des donnees de test...
robocopy "%TEST_DATA%" "%BACKUP%" /E /COPY:DAT /R:1 /W:1 >nul
if errorlevel 8 (
  echo Erreur pendant la copie de sauvegarde : aucune mise a jour.
  goto :fail
)
python -c "from pathlib import Path;import hashlib,sys; a=Path(r'%TEST_DATA%');b=Path(r'%BACKUP%');files=[p for p in a.rglob('*') if p.is_file()];checksum=lambda p:hashlib.sha256(p.read_bytes()).digest();sys.exit(0 if files and all((b/p.relative_to(a)).is_file() and checksum(p)==checksum(b/p.relative_to(a)) for p in files) else 1)"
if errorlevel 1 (
  echo Verification SHA-256 de la sauvegarde echouee.
  goto :fail
)
python -c "import sqlite3,sys; db=r'%BACKUP%\atelier.db'; c=sqlite3.connect(db); result=c.execute('PRAGMA integrity_check').fetchone()[0]; c.close(); sys.exit(0 if result=='ok' else 1)"
if errorlevel 1 (
  echo Base SQLite sauvegardee non integre : aucune mise a jour.
  goto :fail
)
echo Sauvegarde verifiee : %BACKUP%
echo.
echo Mise a jour Git (avance rapide seulement)...
git -C "%ROOT%" pull --ff-only origin %BRANCH%
if errorlevel 1 (
  echo Echec du pull : aucune suppression automatique de fichier.
  goto :fail
)
echo.
echo Version de test a jour. Demarrage sur port 8876.
set "ATELIER_DATA_DIR=%TEST_DATA%"
set "ATELIER_PORT=8876"
set "ATELIER_NO_BROWSER=0"
python -u "%ROOT%app\app.py"
echo.
echo Le serveur TEST s'est ferme.
pause
exit /b 0

:fail
echo.
echo Mise a jour arretee pour securite. L'installation habituelle E:\00_LATELIER n'a pas ete touchee.
echo Ferme cette fenetre apres avoir lu le message.
pause
exit /b 1
