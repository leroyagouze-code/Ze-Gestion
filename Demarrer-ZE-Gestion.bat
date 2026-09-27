@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo === ZE Gestion : demarrage ===
docker info >nul 2>&1
if errorlevel 1 (
  echo.
  echo Docker Desktop n'est pas lance. Ouvrez Docker Desktop, attendez qu'il soit pret, puis relancez ce fichier.
  pause
  exit /b 1
)
echo La premiere fois, la preparation prend 5 a 10 minutes. Ne fermez pas cette fenetre.
docker compose -f deploy\docker-compose.local.yml up -d --build
if errorlevel 1 (
  echo.
  echo Le demarrage a echoue. Envoyez une capture de cette fenetre.
  pause
  exit /b 1
)
echo.
echo Pret. Ouverture de ZE Gestion dans le navigateur : http://localhost:3000
timeout /t 5 /nobreak >nul
start "" http://localhost:3000
pause
