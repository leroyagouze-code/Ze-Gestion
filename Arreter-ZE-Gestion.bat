@echo off
cd /d "%~dp0"
docker compose -f deploy\docker-compose.local.yml stop
echo ZE Gestion est arrete. Vos donnees sont conservees.
pause
