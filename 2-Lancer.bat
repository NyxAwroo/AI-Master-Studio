@echo off
chcp 65001 >nul
title AI Master Studio
cd /d "%~dp0"

if not exist "node_modules" goto no_deps

set "AMS_ROOT=%~dp0"

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

echo Verification du port Vite 5173...
powershell -NoProfile -ExecutionPolicy Bypass -Command "$root=$env:AMS_ROOT.TrimEnd([IO.Path]::DirectorySeparatorChar); $busy=Get-NetTCPConnection -LocalAddress 127.0.0.1 -LocalPort 5173 -State Listen -ErrorAction SilentlyContinue; if(-not $busy){exit 0}; $blocked=$false; foreach($c in $busy){$p=Get-CimInstance Win32_Process -Filter ('ProcessId = ' + $c.OwningProcess) -ErrorAction SilentlyContinue; if($p -and $p.CommandLine -like ('*' + $root + '*') -and $p.CommandLine -like '*vite*'){Write-Host ('[OK] Ancien serveur Vite detecte (PID ' + $c.OwningProcess + '), fermeture...'); Stop-Process -Id $c.OwningProcess -Force -ErrorAction SilentlyContinue} else {$blocked=$true; Write-Host ('[X] Le port 5173 est utilise par le PID ' + $c.OwningProcess + '.'); if($p){Write-Host $p.CommandLine}; Write-Host 'Fermez ce programme puis relancez 2-Lancer.bat.'}}; if($blocked){exit 2}; Start-Sleep -Milliseconds 700; exit 0"
if errorlevel 1 goto port_busy

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

:port_busy
echo.
echo [X] Impossible de demarrer tant que le port 5173 est occupe.
echo.
pause
exit /b 1
