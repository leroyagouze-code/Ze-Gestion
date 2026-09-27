@echo off
chcp 65001 >nul
cd /d "%~dp0"
title ZE Gestion
if not exist .next\BUILD_ID (
  echo ZE Gestion n'est pas encore installe. Lancez d'abord Installer-ZE-Gestion-sans-Docker.bat
  pause
  exit /b 1
)
echo ZE Gestion demarre sur http://localhost:3000
echo Laissez cette fenetre ouverte. La fermer arrete ZE Gestion (vos donnees sont conservees).
start "" cmd /c "timeout /t 6 /nobreak >nul & start http://localhost:3000"
npx next start -H 127.0.0.1 -p 3000
pause
