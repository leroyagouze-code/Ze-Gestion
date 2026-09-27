# ZE LOYER

**La gestion locative, simplement.** Votre location. Votre historique. Votre carnet. Toujours avec vous.

Web App responsive / PWA pour les propriétaires, agences et locataires au Togo : logements, loyers en FCFA, paiements (espèces, TMoney, Flooz, virement), paiements partiels, avances, cautions, arriérés, quittances PDF, et un **carnet locatif** partagé où le locataire voit sa situation en temps réel.

Architecture, schéma de base de données, pages, API, rôles et parcours : [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).

**Application Android** : [`mobile/README.md`](mobile/README.md) — un fichier `.apk` qui ouvre le site ZE LOYER hébergé sur votre serveur (même code, mêmes comptes), construit automatiquement par GitHub (Actions → « ZE LOYER Android »).

## Démarrage local

Prérequis : Node.js 22 et PostgreSQL 16 (ou Docker).

```bash
cd ze-loyer
cp .env.example .env
docker compose up -d          # PostgreSQL (bases zeloyer + zeloyer_test)
npm install
npm run db:migrate            # crée les tables
npm run db:seed               # données de démonstration (EFFACE la base)
npm run dev                   # http://localhost:3000
```

### Comptes de démonstration

Mot de passe pour tous : `zeloyer2026`. On se connecte avec le **numéro de téléphone**.

| Téléphone | Compte | Situation |
|---|---|---|
| 90 00 00 01 | Admin de l'agence **ZE IMMOBILIER** | 8 propriétaires, 14 immeubles, 126 logements (109 occupés, 12 vacants, 5 réservés), 5 impayés |
| 90 00 00 02 | **Leroy Agouze**, propriétaire suivi par l'agence | 3 immeubles, 12 logements (consultation seule) |
| 90 00 00 03 | **Kossi Mensah**, locataire A03 (75 000 FCFA) | 🟢 à jour |
| 90 00 00 04 | **Ama Doe**, locataire B02 | 🔴 en retard (150 000 F), contestation ouverte |
| 90 00 00 05 | **Yao Agbeko**, locataire A01 | 🔵 en avance (3 mois) |
| 90 00 00 06 | Afi, comptable de l'agence | rôle Comptable |

D'autres situations sont présentes : paiement partiel en retard (Kofi Ayité, V1), paiement partiel avant l'échéance (Enyonam Klutse, A02), un mois impayé (Esso Bawa, Ch1), logements vacants et réservés. Les dates sont calculées à partir du jour du seed.

## Commandes

| Commande | Rôle |
|---|---|
| `npm run dev` | Serveur de développement |
| `npm run build && npm start` | Build et serveur de production |
| `npm run typecheck` | Vérification TypeScript (strict) |
| `npm test` | Tests unitaires (règles financières) + intégration (PostgreSQL, base `TEST_DATABASE_URL` **vidée**) |
| `npm run test:unit` | Tests unitaires seuls (sans base) |
| `npm run db:generate` | Génère une migration après modification de `src/db/schema.ts` |
| `npm run db:migrate` | Applique les migrations |
| `npm run db:seed` | Recrée la démo (refusé si `NODE_ENV=production`, sauf `SEED_FORCE=1`) |
| `npm run cron:rappels` | Rappels du jour (J-7, J-3, J-1, J, J+3, J+7) |

## Variables d'environnement

| Variable | Obligatoire | Description |
|---|---|---|
| `DATABASE_URL` | oui | Connexion PostgreSQL |
| `APP_URL` | oui | URL publique, utilisée dans les liens d'invitation (`https://app.zeloyer.tg`) |
| `UPLOAD_DIR` | non (`./uploads`) | Dossier des contrats et preuves. Brancher S3/R2 dans `src/lib/storage.ts` si besoin. |
| `CRON_SECRET` | pour les rappels | Secret de `GET /api/cron/rappels` (en-tête `Authorization: Bearer …`). Refusé s'il vaut `change-moi`. |
| `TEST_DATABASE_URL` | pour les tests | Base dédiée aux tests d'intégration (elle est vidée) |
| `DB_POOL_MAX` | non (10) | Taille du pool de connexions |

Aucune clé Mobile Money, SMS, WhatsApp ou email n'est nécessaire : ces intégrations **ne sont pas branchées** en V1 (voir la fin de `docs/ARCHITECTURE.md`).

## Tests

- `tests/unit/ledger.test.ts` : règles financières du brief (loyer 75 000 − paiement 50 000 = reste 25 000 · paiement complet = PAYÉ · avance 450 000 / 75 000 = 6 mois, « à jour jusqu'au 31 mars 2027 » · répartition sur les mois les plus anciens · caution hors loyer · remboursements et ajustements · périodicité trimestrielle).
- `tests/integration/core.test.ts` : isolation entre agences, propriétaire limité à ses biens, permissions par rôle, quittance numérotée et statut PARTIEL, annulation sans suppression, journal d'audit non modifiable, invitation à usage unique, contestation, blocage après 5 échecs de connexion.

## Déploiement

**Mise en ligne guidée sur https://loyer.zegroupafrica.com (Render + Neon)** : [`docs/MISE-EN-LIGNE.md`](docs/MISE-EN-LIGNE.md).

1. **Base** : PostgreSQL 16 managé (Neon, Supabase, Scaleway, OVH…) avec **sauvegardes automatiques quotidiennes** activées.
2. **Application**, au choix :
   - **Docker** : `docker build -t ze-loyer .` puis `docker run -p 3000:3000 -e DATABASE_URL=… -e APP_URL=… -e CRON_SECRET=… -v zl-uploads:/data/uploads ze-loyer`. Placez-la derrière un proxy **HTTPS** (Caddy, Traefik, Nginx + Let's Encrypt).
   - **Plateforme Node** (Render, Railway, Fly.io…) : build `npm ci && npm run build`, démarrage `npm start`. Prévoir un disque persistant pour `UPLOAD_DIR`, ou brancher un stockage objet.
3. **Migrations** à chaque déploiement : `npm run db:migrate` (commande de release).
4. **Rappels** : appeler chaque jour à 7 h `curl -H "Authorization: Bearer $CRON_SECRET" https://votre-domaine/api/cron/rappels` (cron du serveur, GitHub Actions planifiée, ou cron de la plateforme).
5. HTTPS obligatoire : le cookie de session est `Secure` en production et l'en-tête HSTS est envoyé.

## Sécurité (résumé)

Mots de passe argon2id · sessions aléatoires stockées hachées, cookie `httpOnly` · limitation des tentatives de connexion · validation Zod de toutes les entrées · permissions et périmètre vérifiés **côté serveur** à chaque action · fichiers servis uniquement après contrôle d'accès · paiements jamais supprimés et journal d'audit en ajout seul (triggers PostgreSQL) · en-têtes de sécurité (HSTS, X-Frame-Options, nosniff).

## Hors périmètre V1

Marketplace, annonces, IA, scoring, assurance, comptabilité complète, maintenance avancée, intégrations bancaires ou Mobile Money réelles, application iOS.
