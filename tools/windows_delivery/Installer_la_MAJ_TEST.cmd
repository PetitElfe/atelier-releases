@echo off
setlocal EnableExtensions DisableDelayedExpansion
chcp 65001 >nul
set "PYTHONUTF8=1"
title L'Atelier du Goblin - Mise a jour Windows TEST
cd /d "%~dp0"
echo Mise a jour de L'Atelier Windows TEST - tableaux, budget et albums
for %%F in (installer.py updater.py delivery.json LIRE_MOI.txt) do if not exist "%~dp0%%F" goto :incomplete
echo.
python -c "import sys; assert sys.version_info >= (3,10)" >nul 2>&1
if errorlevel 1 goto :try_py
python -u "%~dp0installer.py"
set "GOBLIN_RESULT=%ERRORLEVEL%"
goto :done
:try_py
py -3 -c "import sys; assert sys.version_info >= (3,10)" >nul 2>&1
if errorlevel 1 goto :incomplete
echo Le dossier de mise a jour est incomplet.
echo Ferme cette fenetre, puis clique droit sur le ZIP et choisis Extraire tout.
echo Ouvre le dossier extrait et relance Installer_la_MAJ_TEST.cmd.
echo Tous les fichiers doivent rester ensemble. Aucune modification effectuee.
set "GOBLIN_RESULT=1"
goto :done
:missing
py -3 -u "%~dp0installer.py"
set "GOBLIN_RESULT=%ERRORLEVEL%"
goto :done
:incomplete
echo Le dossier de mise a jour est incomplet.
echo Ferme cette fenetre, puis clique droit sur le ZIP et choisis Extraire tout.
echo Ouvre le dossier extrait et relance Installer_la_MAJ_TEST.cmd.
echo Tous les fichiers doivent rester ensemble. Aucune modification effectuee.
set "GOBLIN_RESULT=1"
goto :done
:missing
echo Python est introuvable. Aucune modification effectuee.
set "GOBLIN_RESULT=1"
:done
echo.
pause
exit /b %GOBLIN_RESULT%
