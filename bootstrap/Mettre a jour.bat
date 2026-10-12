@echo off
setlocal EnableExtensions
cd /d "%~dp0"
title L'Atelier - Mise a jour

echo ======================================
echo       L'Atelier - Mise a jour
echo ======================================
echo.

where py >nul 2>nul
if not errorlevel 1 goto :use_py
where python >nul 2>nul
if not errorlevel 1 goto :use_python

echo [ERREUR] Python 3 n'a pas ete trouve sur ce PC.
set "RC=1"
goto :finish

:use_py
py -3 "%~dp0updater\update.py"
set "RC=%ERRORLEVEL%"
goto :finish

:use_python
python "%~dp0updater\update.py"
set "RC=%ERRORLEVEL%"

:finish
echo.
if "%RC%"=="0" (
  echo Mise a jour terminee c:
) else (
  echo La mise a jour a rencontre une erreur.
)
echo.
if not defined ATELIER_NO_PAUSE pause
exit /b %RC%
