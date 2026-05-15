@echo off
chcp 65001 >nul
title AI Master Studio - Installation
cd /d "%~dp0"

echo.
echo ========================================================
echo   AI Master Studio - Installation des prerequis
echo ========================================================
echo.
echo Ce script verifie les outils necessaires
echo puis installe les dependances JavaScript.
echo.
echo A executer UNE SEULE FOIS au premier lancement.
echo.
pause

echo.
echo --------------------------------------------------------
echo [1/4] Verification de Node.js / npm
echo --------------------------------------------------------
where node >nul 2>&1
if errorlevel 1 goto no_node
call node --version
call npm --version
echo [OK] Node.js detecte.
goto check_rust

:no_node
echo.
echo [X] Node.js n'est pas installe ou pas dans le PATH.
echo.
echo Telechargez la version LTS sur https://nodejs.org
echo Installez, redemarrez le terminal, puis relancez ce script.
echo.
pause
exit /b 1

:check_rust
echo.
echo --------------------------------------------------------
echo [2/4] Verification de Rust
echo --------------------------------------------------------
where rustc >nul 2>&1
if errorlevel 1 goto no_rust
call rustc --version
echo [OK] Rust detecte.
goto check_cpp

:no_rust
echo.
echo [X] Rust n'est pas installe ou pas dans le PATH.
echo.
echo Telechargez rustup-init.exe sur https://rustup.rs
echo Choisissez option 1 - installation standard.
echo Redemarrez le PC, puis relancez ce script.
echo.
pause
exit /b 1

:check_cpp
echo.
echo --------------------------------------------------------
echo [3/4] Verification des Build Tools Visual C++
echo --------------------------------------------------------
where cl >nul 2>&1
if errorlevel 1 goto cpp_warn
echo [OK] Compilateur C++ detecte.
goto npm_install

:cpp_warn
echo [!] Compilateur C++ non detecte dans le PATH actuel.
echo C'est NORMAL - Rust le trouvera automatiquement.
echo.
echo Si la compilation echoue avec "linker not found",
echo installez les Build Tools depuis:
echo https://visualstudio.microsoft.com/visual-cpp-build-tools/
echo et cochez "Developpement Desktop en C++".
goto npm_install

:npm_install
echo.
echo --------------------------------------------------------
echo [4/4] Installation des dependances JavaScript
echo --------------------------------------------------------
echo Cela peut prendre 1 a 3 minutes...
echo.
call npm install
if errorlevel 1 goto npm_fail

echo.
echo ========================================================
echo   Installation terminee avec succes !
echo ========================================================
echo.
echo Lancez maintenant l'application avec:
echo   Double-clic sur 2-Lancer.bat
echo.
echo PREMIER lancement: compilation Rust 3 a 10 minutes.
echo Suivants: 10 a 30 secondes.
echo.
pause
exit /b 0

:npm_fail
echo.
echo [X] npm install a echoue.
echo Verifiez votre connexion internet et reessayez.
echo.
pause
exit /b 1
