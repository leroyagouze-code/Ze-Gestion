@echo off
chcp 65001 >nul
cd /d "%~dp0"
where node >nul 2>&1
if errorlevel 1 (
  echo Node.js n'est pas installe. Installez Node.js 22 LTS depuis https://nodejs.org puis relancez ce fichier.
  pause
  exit /b 1
)
node scripts\installer-local.mjs
pause
