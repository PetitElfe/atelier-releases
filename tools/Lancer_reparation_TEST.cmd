@echo off
chcp 65001 >nul
title L'Atelier du Goblin - Reparation TEST
echo.
echo Ferme d'abord la fenetre de L'Atelier TEST.
echo Cette operation ne touche ni aux donnees, ni a la version stable.
echo.
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0Reparer_LAtelier_TEST.ps1"
echo.
echo Garde cette fenetre ouverte et envoie une capture du resultat.
pause
