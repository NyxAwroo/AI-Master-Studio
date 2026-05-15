@echo off
chcp 65001 >nul
title AI Master Studio - Construction .exe
cd /d "%~dp0"

if not exist "node_modules" goto no_deps

echo.
echo ========================================================
echo   AI Master Studio - Construction du .exe
echo ========================================================
echo.
echo Operation longue: 5 a 15 minutes.
echo Compilation en mode release optimise.
echo.
echo Resultat:
echo   .exe portable: src-tauri\target\release\
echo   Installeurs:   src-tauri\target\release\bundle\
echo.
pause

call npm run tauri build
if errorlevel 1 goto build_fail

echo.
echo ========================================================
echo   Construction terminee !
echo ========================================================
echo.
echo .exe portable:
echo   src-tauri\target\release\
echo.
echo Installeurs Windows:
echo   src-tauri\target\release\bundle\
echo.

start "" "src-tauri\target\release"

pause
exit /b 0

:no_deps
echo.
echo [X] Le dossier node_modules n'existe pas.
echo Lancez d'abord 1-Installer.bat.
echo.
pause
exit /b 1

:build_fail
echo.
echo [X] La construction a echoue.
echo Consultez le message d'erreur ci-dessus.
echo.
pause
exit /b 1
