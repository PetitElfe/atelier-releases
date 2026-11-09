@echo off
setlocal EnableExtensions DisableDelayedExpansion
chcp 65001 >nul
set "PYTHONUTF8=1"
set "CHECK_EXIT=0"
cd /d "%~dp0"
for %%F in (verification.py verification.html checks.js ink.js) do if not exist "%~dp0%%F" goto :incomplete
echo Essais locaux de L'Atelier TEST. Aucune installation automatique.
python -c "import sys; assert sys.version_info >= (3,10)" >nul 2>&1
if errorlevel 1 goto :try_py
python -u "%~dp0verification.py" %*
set "CHECK_EXIT=%errorlevel%"
goto :done
:try_py
py -3 -c "import sys; assert sys.version_info >= (3,10)" >nul 2>&1
if errorlevel 1 goto :missing_python
py -3 -u "%~dp0verification.py" %*
set "CHECK_EXIT=%errorlevel%"
goto :done
:incomplete
echo Extrais tout le ZIP puis relance ce fichier dans le dossier extrait.
set "CHECK_EXIT=2"
goto :done
:missing_python
echo Python 3.10 ou plus recent est necessaire. Aucun logiciel n'a ete installe.
set "CHECK_EXIT=3"
:done
pause
exit /b %CHECK_EXIT%
