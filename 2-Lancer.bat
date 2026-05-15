@echo off
chcp 65001 >nul
title AI Master Studio
cd /d "%~dp0"

if not exist "node_modules" goto no_deps

echo.
echo ========================================================
echo   AI Master Studio - Demarrage
echo ========================================================
echo.
echo PREMIERE fois: compilation Rust 3 a 10 minutes.
echo Suivantes: 10 a 30 secondes.
echo.
echo ATTENTION: ne fermez PAS cette fenetre tant que vous
echo utilisez l'application.
echo.
echo Pour quitter:
echo   1. Fermez la fenetre de l'application
echo   2. Ctrl+C dans cette fenetre
echo.
echo --------------------------------------------------------
echo.

call npm run tauri dev

echo.
echo --------------------------------------------------------
echo Application fermee.
echo --------------------------------------------------------
pause
exit /b 0

:no_deps
echo.
echo [X] Le dossier node_modules n'existe pas.
echo.
echo Lancez d'abord "1-Installer.bat" pour preparer
echo l'environnement. C'est a faire une seule fois.
echo.
pause
exit /b 1
