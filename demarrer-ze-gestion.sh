#!/bin/sh
# ZE Gestion sur Mac ou Linux (Docker Desktop requis)
cd "$(dirname "$0")" || exit 1
if ! docker info >/dev/null 2>&1; then
  echo "Docker Desktop n'est pas lancé. Ouvrez-le, attendez qu'il soit prêt, puis relancez ce fichier."
  exit 1
fi
echo "La première fois, la préparation prend 5 à 10 minutes."
docker compose -f deploy/docker-compose.local.yml up -d --build || exit 1
echo "Prêt : http://localhost:3000"
(open http://localhost:3000 || xdg-open http://localhost:3000) >/dev/null 2>&1
