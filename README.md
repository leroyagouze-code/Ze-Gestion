# Ze-Gestion

Plateforme SaaS de gestion commerciale pour les commerces d'Afrique de l'Ouest : caisse (POS), stock, factures, clients, fournisseurs, dépenses et rapports. Chaque entreprise a son propre espace, strictement isolé.

Architecture, schéma de base de données, permissions et stratégie de déploiement : [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).

## Installer sur un ordinateur (sans être développeur)

Double-cliquez sur `Demarrer-ZE-Gestion.bat` (Windows) ou `demarrer-ze-gestion.sh` (Mac, Linux) après avoir installé Docker Desktop. Guide pas à pas : [`docs/INSTALLATION-ORDINATEUR.md`](docs/INSTALLATION-ORDINATEUR.md). Si Docker ne démarre pas (virtualisation désactivée), installez sans Docker : [`docs/INSTALLATION-SANS-DOCKER.md`](docs/INSTALLATION-SANS-DOCKER.md).

## Démarrage local (développeurs)

Prérequis : Node.js 22, Docker (ou PostgreSQL 16 installé).

```bash
cp .env.example .env
docker compose up -d          # PostgreSQL
npm install
npm run db:migrate            # crée le rôle app_user, les tables et la sécurité RLS
npm run db:seed               # données de démo (facultatif)
npm run dev                   # http://localhost:3000
```

Compte de démo : `demo@gestion.local` / `demo12345` (aussi super admin de la plateforme).

## Commandes

| Commande | Rôle |
|---|---|
| `npm run dev` | Serveur de développement |
| `npm run build && npm start` | Build et serveur de production |
| `npm run typecheck` | Vérification TypeScript |
| `npm test` | Tests (nécessite PostgreSQL migré) |
| `npm run db:generate` | Génère une migration après modification de `src/db/schema.ts` |
| `npm run db:migrate` | Applique les migrations |

## Organisation

```
src/
  app/            pages (App Router), Server Actions, routes API (PDF, exports, recherche caisse)
  modules/        logique métier par module (auth, products, stock, sales, invoices, …)
  db/             schéma Drizzle, connexion, withTenant() (contexte RLS)
  lib/            auth, permissions, argent, stockage, validation
  pdf/            gabarits de factures et tickets
  components/     composants d'interface
drizzle/          migrations SQL (dont 0002_rls.sql : isolation des entreprises)
tests/            tests d'intégration contre PostgreSQL
```

## Sécurité multi-entreprise

Chaque table métier porte `company_id` et une policy PostgreSQL Row Level Security. L'application se connecte avec le rôle `app_user` (sans `BYPASSRLS`) et `withTenant()` fixe l'entreprise courante pour chaque transaction : une requête qui oublierait son filtre ne peut pas lire les données d'une autre entreprise. Les tests `tests/core.test.ts` le vérifient.

## Production

Guide pas à pas (serveur, domaine, HTTPS, sauvegardes, mises à jour) : [`docs/DEPLOIEMENT.md`](docs/DEPLOIEMENT.md). En résumé :

```bash
cp deploy/.env.example deploy/.env   # domaine et mots de passe
docker compose -f deploy/docker-compose.prod.yml --env-file deploy/.env up -d --build
```
