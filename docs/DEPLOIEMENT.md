# Mise en ligne de Ze-Gestion

Ce guide installe Ze-Gestion sur un serveur, avec HTTPS automatique et une sauvegarde quotidienne de la base. Compter environ 30 minutes la première fois.

## Ce qu'il faut

| Élément | Recommandation | Coût indicatif |
|---|---|---|
| Serveur (VPS) Linux | Hetzner CX22 ou OVH VPS Starter, Ubuntu 24.04, 2 vCPU / 4 Go de RAM | 4 à 6 € par mois |
| Nom de domaine | Un sous-domaine de celui que vous avez déjà, par exemple `gestion.zegroupafrica.com` | inclus |
| Accès | Pouvoir se connecter au serveur en SSH | — |

Une seule machine suffit pour les premières centaines d'entreprises. La base peut ensuite passer sur un PostgreSQL managé sans changer le code.

## 1. Faire pointer le domaine vers le serveur

Chez votre registraire (là où `zegroupafrica.com` est géré), ajoutez un enregistrement DNS :

| Type | Nom | Valeur |
|---|---|---|
| A | `gestion` | adresse IP du serveur |

La propagation prend de quelques minutes à quelques heures. Vérification : `ping gestion.zegroupafrica.com` doit répondre avec l'IP du serveur.

## 2. Préparer le serveur (une seule fois)

Connecté en SSH sur le serveur :

```bash
# Docker et le pare-feu
curl -fsSL https://get.docker.com | sh
ufw allow OpenSSH && ufw allow 80 && ufw allow 443 && ufw --force enable

# Le code
git clone https://github.com/leroyagouze-code/Ze-Gestion.git /opt/ze-gestion
cd /opt/ze-gestion
```

## 3. Configurer

```bash
cp deploy/.env.example deploy/.env
nano deploy/.env
```

Renseigner :

- `DOMAIN` : le sous-domaine de l'étape 1.
- `DB_OWNER_PASSWORD` et `DB_APP_PASSWORD` : deux mots de passe différents, générés avec `openssl rand -hex 24`.
- `BACKUP_PASSPHRASE` : la clé de chiffrement des sauvegardes, générée avec `openssl rand -hex 32`.

Protégez le fichier (`chmod 600 deploy/.env`) et gardez-en une copie **hors du serveur**, dans un gestionnaire de mots de passe. Sans `BACKUP_PASSPHRASE`, les sauvegardes sont illisibles, y compris pour vous.

## 4. Lancer

```bash
docker compose -f deploy/docker-compose.prod.yml --env-file deploy/.env up -d --build
```

La commande construit l'application, crée la base, applique les migrations, démarre le site et obtient le certificat HTTPS. Au bout de 2 à 5 minutes, `https://gestion.zegroupafrica.com` affiche la page de connexion.

Vérifier l'état :

```bash
docker compose -f deploy/docker-compose.prod.yml ps
curl https://gestion.zegroupafrica.com/api/health   # {"status":"ok"}
```

## 5. Créer le compte super admin

Inscrivez votre propre entreprise depuis le site (`/signup`), puis donnez-vous les droits d'administrateur de la plateforme :

```bash
docker compose -f deploy/docker-compose.prod.yml exec db \
  psql -U app_owner gestion -c "update users set is_super_admin = true where email = 'votre@email.com';"
```

Le menu « Super admin » apparaît à la connexion suivante.

## Emails (codes de vérification et mot de passe oublié)

L'application envoie des codes à 6 chiffres depuis `noreply@zegroupafrica.com` : confirmation de l'adresse à l'inscription (et à la première connexion d'un employé créé dans Utilisateurs), et réinitialisation du mot de passe (`/mot-de-passe-oublie`). Tant que `SMTP_PASSWORD` est vide, rien n'est envoyé : les comptes ne sont pas vérifiés et le mot de passe oublié renvoie vers l'administrateur de l'entreprise. Le logiciel Windows n'envoie jamais d'emails.

1. **Créer la boîte chez LWS** : espace client LWS > votre domaine `zegroupafrica.com` > **Adresses email** (ou « Mail ») > **Créer une adresse** : `noreply`, avec un mot de passe long (`openssl rand -hex 16`). Un quota minimal suffit : la boîte ne fait qu'envoyer.
2. **Vérifier les réglages SMTP** affichés par LWS pour cette adresse (en général serveur `mail.zegroupafrica.com`, port `465`, SSL). S'ils diffèrent, ajustez `SMTP_HOST`, `SMTP_PORT` (587 avec `SMTP_SECURE=false` pour STARTTLS) dans `deploy/.env`.
3. **Donner le mot de passe à l'application** :

   ```bash
   ze-gestion config        # ouvre deploy/.env ; renseigner SMTP_PASSWORD=..., enregistrer (Ctrl+O, Entrée, Ctrl+X)
   ```

   La commande redémarre l'application avec la nouvelle configuration.
4. **Tester** : ouvrez `https://VOTRE-DOMAINE/mot-de-passe-oublie`, saisissez votre email : le code doit arriver en moins d'une minute. Sinon, `ze-gestion journaux` affiche l'erreur (`[email] échec de l'envoi…`, souvent un mot de passe erroné).
5. **Éviter les courriers indésirables** : dans la zone DNS du domaine chez LWS, vérifiez que l'enregistrement SPF (`v=spf1 … include:… ~all`) et la signature DKIM proposés par LWS sont actifs.

Les comptes qui existaient avant cette fonction sont considérés comme vérifiés. En développement, `MAIL_TRANSPORT=console` (sans `SMTP_PASSWORD`) active les codes et les écrit dans la console du serveur au lieu de les envoyer.

## Mettre à jour

```bash
cd /opt/ze-gestion
git pull
docker compose -f deploy/docker-compose.prod.yml --env-file deploy/.env up -d --build
```

Les migrations s'appliquent automatiquement avant le redémarrage de l'application.

## Sauvegardes

- Une sauvegarde complète de la base est écrite chaque jour dans `deploy/backups/` (fichiers `gestion-AAAAMMJJ-HHMM.sql.gz.enc`) et conservée 14 jours. Elle est chiffrée en AES-256 et lisible par root seulement.
- Les logos et justificatifs sont dans le volume Docker `ze-gestion_uploads`.
- **Copiez-les aussi hors du serveur** : par exemple une synchronisation quotidienne vers un stockage objet (Backblaze B2, OVH Object Storage) avec `rclone`. Une sauvegarde qui reste sur la même machine ne protège pas contre la perte du serveur. Exemple, une fois `rclone config` fait avec un stockage nommé `distant` :

  ```bash
  # crontab -e (root) : copie chaque nuit à 3 h ; les fichiers sont déjà chiffrés
  0 3 * * * rclone copy /opt/ze-gestion/deploy/backups distant:ze-gestion-sauvegardes --max-age 48h
  ```

Restaurer une sauvegarde (écrase les données actuelles) :

```bash
docker compose -f deploy/docker-compose.prod.yml stop app
docker compose -f deploy/docker-compose.prod.yml exec -T db psql -U app_owner -d postgres -c "drop database gestion with (force)" -c "create database gestion"
set -a; . deploy/.env; set +a
openssl enc -d -aes-256-cbc -pbkdf2 -iter 200000 -pass env:BACKUP_PASSPHRASE -in deploy/backups/gestion-AAAAMMJJ-HHMM.sql.gz.enc \
  | gunzip | docker compose -f deploy/docker-compose.prod.yml exec -T db psql -U app_owner gestion
docker compose -f deploy/docker-compose.prod.yml start app
```

## Surveillance et journaux

```bash
docker compose -f deploy/docker-compose.prod.yml logs -f app     # journaux de l'application
docker compose -f deploy/docker-compose.prod.yml logs -f caddy   # accès HTTP et certificats
```

Pour être prévenu d'une panne, créer une sonde gratuite (UptimeRobot, Better Stack) sur `https://gestion.zegroupafrica.com/api/health`.

## Architecture déployée

```
Internet ──443──> Caddy (HTTPS Let's Encrypt)
                    └──> app (Next.js, port 3000 interne)
                            └──> db (PostgreSQL 16, non exposé)
                  backup ──> pg_dump quotidien ──> deploy/backups/
                  migrate ──> migrations au démarrage, puis s'arrête
```

Seuls les ports 80 et 443 sont ouverts ; la base n'est pas accessible depuis Internet.
