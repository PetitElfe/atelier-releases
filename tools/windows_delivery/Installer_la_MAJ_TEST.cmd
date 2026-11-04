@echo off
setlocal EnableExtensions DisableDelayedExpansion
chcp 65001 >nul
set "PYTHONUTF8=1"
title L'Atelier du Goblin - Mise a jour Windows TEST
cd /d "%~dp0"
echo Mise a jour de L'Atelier Windows TEST - bibliotheque et calendrier
echo.
python -c "import sys; assert sys.version_info >= (3,10)" >nul 2>&1
if errorlevel 1 goto :try_py
python -u "%~dp0installer.py"
set "GOBLIN_RESULT=%ERRORLEVEL%"
goto :done
:try_py
py -3 -c "import sys; assert sys.version_info >= (3,10)" >nul 2>&1
if errorlevel 1 goto :missing
py -3 -u "%~dp0installer.py"
set "GOBLIN_RESULT=%ERRORLEVEL%"
goto :done
:missing
echo Python est introuvable. Aucune modification effectuee.
set "GOBLIN_RESULT=1"
:done
echo.
pause
exit /b %GOBLIN_RESULT%
