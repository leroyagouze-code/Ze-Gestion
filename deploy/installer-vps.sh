#!/usr/bin/env bash
# Installe ou met à jour ZE Gestion sur un VPS Ubuntu, en une commande (en root) :
#   curl -fsSL https://raw.githubusercontent.com/leroyagouze-code/Ze-Gestion/main/deploy/installer-vps.sh | bash -s gestion.zegroupafrica.com
# Installe Docker et le pare-feu, récupère le code dans /opt/ze-gestion, crée deploy/.env avec des mots de passe
# aléatoires (paiements en mode test), puis lance la base, l'appli, le HTTPS et les sauvegardes.
# Relancer la même commande met l'appli à jour, sans toucher aux données ni aux mots de passe.
set -euo pipefail

say() { printf '\n\033[1;32m== %s\033[0m\n' "$*"; }
fail() { printf '\n\033[1;31mERREUR : %s\033[0m\n' "$*" >&2; exit 1; }

# Tout est dans main(), appelée à la dernière ligne : avec « curl … | bash », bash lit ainsi le script en entier
# avant de lancer la moindre commande (sinon apt ou docker pourraient avaler la suite du script).
main() {
  local DOMAIN="${1:-${DOMAIN:-gestion.zegroupafrica.com}}"
  local REPO="${ZE_REPO:-https://github.com/leroyagouze-code/Ze-Gestion.git}"
  local BRANCH="${ZE_BRANCH:-main}"
  local DIR=/opt/ze-gestion
  local COMPOSE="docker compose -f deploy/docker-compose.prod.yml --env-file deploy/.env"

  [ "$(id -u)" = 0 ] || fail "lancez la commande en root (ou avec sudo)."
  command -v apt-get >/dev/null || fail "ce script est prévu pour Ubuntu ou Debian."

  say "Vérification du domaine $DOMAIN"
  local IP DNS
  IP=$(curl -fsS4 --max-time 10 https://api.ipify.org || true)
  DNS=$(getent ahostsv4 "$DOMAIN" | awk 'NR==1{print $1}' || true)
  echo "Adresse du serveur : ${IP:-inconnue} · $DOMAIN pointe vers : ${DNS:-rien}"
  if [ -n "$IP" ] && [ "$DNS" != "$IP" ]; then
    echo "Attention : le domaine ne pointe pas encore vers ce serveur. L'appli s'installe quand même ;"
    echo "le cadenas HTTPS arrivera tout seul quand l'enregistrement DNS A « gestion » -> $IP sera actif."
  fi

  say "Paquets de base"
  export DEBIAN_FRONTEND=noninteractive
  apt-get update -qq </dev/null
  apt-get install -y -qq git curl ca-certificates openssl ufw </dev/null >/dev/null

  # La construction de l'appli demande de la mémoire : 2 Go d'échange si le serveur a moins de 6 Go et pas d'échange
  if [ -z "$(swapon --show)" ] && [ "$(awk '/MemTotal/{print int($2/1024)}' /proc/meminfo)" -lt 6000 ]; then
    say "Mémoire d'échange (2 Go)"
    fallocate -l 2G /swapfile && chmod 600 /swapfile && mkswap /swapfile >/dev/null && swapon /swapfile
    grep -q '^/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
  fi

  if ! command -v docker >/dev/null; then
    say "Installation de Docker"
    # Téléchargé dans un fichier : « curl | sh </dev/null » ferait lire à sh le vide au lieu du script
    curl -fsSL https://get.docker.com -o /tmp/get-docker.sh
    sh /tmp/get-docker.sh </dev/null >/dev/null
    rm -f /tmp/get-docker.sh
  fi

  say "Pare-feu (SSH, HTTP, HTTPS)"
  ufw allow OpenSSH >/dev/null && ufw allow 80/tcp >/dev/null && ufw allow 443/tcp >/dev/null && ufw --force enable >/dev/null

  say "Code de l'application"
  if [ -d "$DIR/.git" ]; then
    git -C "$DIR" fetch -q origin "$BRANCH" && git -C "$DIR" checkout -q "$BRANCH" && git -C "$DIR" reset -q --hard "origin/$BRANCH"
  else
    git clone -q --branch "$BRANCH" "$REPO" "$DIR"
  fi
  cd "$DIR"

  if [ ! -f deploy/.env ]; then
    say "Configuration (mots de passe aléatoires, paiements en mode test)"
    ( umask 077
      sed \
        -e "s|^DOMAIN=.*|DOMAIN=$DOMAIN|" \
        -e "s|^DB_OWNER_PASSWORD=.*|DB_OWNER_PASSWORD=$(openssl rand -hex 24)|" \
        -e "s|^DB_APP_PASSWORD=.*|DB_APP_PASSWORD=$(openssl rand -hex 24)|" \
        -e "s|^BACKUP_PASSPHRASE=.*|BACKUP_PASSPHRASE=$(openssl rand -hex 32)|" \
        -e "s|^PAYMENT_MODE=.*|PAYMENT_MODE=simulation|" \
        deploy/.env.example > deploy/.env )
  fi

  say "Construction et démarrage (5 à 10 minutes la première fois)"
  $COMPOSE up -d --build --remove-orphans </dev/null

  # Petite commande pour la suite : ze-gestion admin|maj|etat|journaux|config
  cat > /usr/local/bin/ze-gestion <<EOF
#!/usr/bin/env bash
cd $DIR
C="$COMPOSE"
case "\${1:-}" in
  admin) [ -n "\${2:-}" ] || { echo "Usage : ze-gestion admin votre@email.com"; exit 1; }
    \$C exec -T db psql -U app_owner gestion -c "update users set is_super_admin = true where lower(email) = lower('\$2');" ;;
  maj) curl -fsSL https://raw.githubusercontent.com/leroyagouze-code/Ze-Gestion/$BRANCH/deploy/installer-vps.sh | bash -s $DOMAIN ;;
  etat) \$C ps; curl -fsS https://$DOMAIN/api/health; echo ;;
  journaux) \$C logs --tail 100 app ;;
  config) nano deploy/.env && \$C up -d ;;
  *) echo "ze-gestion admin EMAIL | maj | etat | journaux | config" ;;
esac
EOF
  chmod 755 /usr/local/bin/ze-gestion

  say "Vérification"
  local ok="" https=""
  for _ in $(seq 1 60); do
    if $COMPOSE exec -T app node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))" </dev/null >/dev/null 2>&1; then
      ok=1; break
    fi
    sleep 5
  done
  $COMPOSE ps
  [ -z "$ok" ] && fail "l'appli ne répond pas. Voir les journaux : ze-gestion journaux"
  for _ in $(seq 1 12); do
    curl -fsS --max-time 5 "https://$DOMAIN/api/health" >/dev/null 2>&1 && { https=1; break; }
    sleep 5
  done

  if [ -n "$https" ]; then
    say "ZE Gestion est en ligne : https://$DOMAIN"
  else
    say "L'appli tourne. Le HTTPS s'activera dès que $DOMAIN pointera vers ${IP:-ce serveur} (vérifier : ze-gestion etat)"
  fi
  cat <<EOF

Étapes suivantes :
  1. Ouvrez https://$DOMAIN/signup et créez votre entreprise.
  2. Donnez-vous les droits super admin :   ze-gestion admin votre@email.com
  3. Pour vendre des licences Windows, ajoutez LICENSE_PRIVATE_KEY :   ze-gestion config

Les mots de passe sont dans $DIR/deploy/.env : gardez-en une copie hors du serveur
(sans BACKUP_PASSPHRASE, les sauvegardes sont illisibles).
Mettre à jour plus tard :   ze-gestion maj
EOF
}

main "$@"
