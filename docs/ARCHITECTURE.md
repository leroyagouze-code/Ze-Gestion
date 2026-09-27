# Architecture — Plateforme SaaS de gestion commerciale

Version 0.1 · 27/09/2026 · statut : MVP en cours

## 1. Analyse

Projet vide au démarrage : on choisit la stack. Contraintes clés tirées du cahier des charges :

- **Multi-tenant strict** : aucune fuite de données entre entreprises, des milliers d'entreprises.
- **POS rapide** utilisable sur mobile/tablette, recherche par nom/SKU/code-barres sur 100 000 produits.
- **Documents** (factures, tickets) générés en PDF avec l'identité de l'entreprise.
- **Marché ouest-africain** : FCFA (0 décimale), TMoney/Flooz, taxes configurables, connexions parfois lentes.
- **Commercialisable** : plans, abonnements, super admin, audit.

## 2. Stack retenue

| Couche | Choix | Pourquoi |
|---|---|---|
| Application | **Next.js 15 (App Router) + React 19 + TypeScript** | Un seul déploiement pour UI + API, rendu serveur rapide sur réseau lent, Server Actions protégées CSRF (vérification d'Origin) |
| Base de données | **PostgreSQL 16** | Transactions ACID (stock, numérotation), Row Level Security pour l'isolation, `pg_trgm` pour la recherche |
| ORM / migrations | **Drizzle ORM + drizzle-kit** | Typé, SQL explicite, pas de binaire natif, migrations SQL versionnées |
| Validation | **Zod** | Mêmes schémas côté formulaire et serveur |
| UI | **Tailwind CSS 4**, composants maison, **lucide-react**, **Recharts** | Léger, responsive, pas de dépendance à un CLI externe |
| Auth | Maison : **argon2id** + sessions en base (cookie httpOnly) | Contrôle total : révocation, multi-entreprise, limitation des tentatives |
| PDF | **@react-pdf/renderer** | Gabarits React, génération côté serveur |
| Import/export | **papaparse** (CSV) ; Excel via export CSV UTF-8 (XLSX natif ensuite) | |
| Tests | **Vitest** contre une vraie base PostgreSQL | Les tests d'isolation doivent passer par RLS |

## 3. Architecture applicative

```
Navigateur ──HTTPS──> Next.js (Node)
                        ├─ Pages serveur (RSC)     lecture
                        ├─ Server Actions          écriture (CSRF natif)
                        ├─ Route handlers /api     PDF, export CSV, recherche POS
                        └─ src/modules/*           logique métier (services purs, testables)
                               │ withTenant(ctx, tx => …)
                               ▼
                        PostgreSQL (rôle app_user, RLS actif)
                        Stockage fichiers (S3 compatible ; disque local en dev)
```

Principes :
- **Modules métier** (`src/modules/<module>/`) : `service.ts` (règles), `schemas.ts` (Zod), `actions.ts` (Server Actions). Les pages ne font jamais de SQL métier direct.
- Toute écriture passe par un service qui : vérifie la permission → valide (Zod) → exécute en transaction → écrit l'audit.

## 4. Stratégie multi-tenant

**Base partagée, schéma partagé, colonne `company_id` sur chaque table métier**, avec deux verrous indépendants :

1. **Applicatif** : on n'accède aux données qu'à travers `withTenant(ctx, fn)`. Le `companyId` vient toujours de la session serveur, jamais du client.
2. **Base de données (Row Level Security)** : `withTenant` ouvre une transaction et exécute `set_config('app.company_id', …, true)`. Chaque table métier a une policy `company_id = current_setting('app.company_id')::uuid`. L'application se connecte avec un rôle `app_user` sans `BYPASSRLS` : même un bug dans une requête (oubli de `where company_id`) ne peut pas lire une autre entreprise. Sans contexte, une requête ne voit **aucune** ligne.

Clés uniques composées par entreprise (`(company_id, sku)`, `(company_id, number)`…) et index commençant par `company_id`. Évolution possible : partitionnement par `company_id` des grosses tables (ventes, mouvements), ou base dédiée pour un gros client — le code reste identique.

Tables **globales** (sans RLS) : `plans`, `companies`, `users`, `sessions`, `login_attempts`. Un utilisateur peut appartenir à plusieurs entreprises via `memberships` ; la session porte l'entreprise active.

## 5. Schéma de base de données

Montants : `numeric(18,2)` ; quantités : `numeric(14,3)` (vente au kg/litre). Identifiants : UUID.

### Plateforme
- **plans** (code FREE/BASIC/PRO/BUSINESS, prix, `limits` jsonb : maxUsers, maxProducts, maxStores, features)
- **companies** (nom, responsable, téléphone, WhatsApp, email, adresse, ville, pays, devise, NIF, logo, adresse de facturation, infos complémentaires, couleur, infos bancaires, pied de facture, format facture/ticket, langue, fuseau, statut active/suspended)
- **subscriptions** (company → plan, statut trialing/active/past_due/suspended/canceled, fin d'essai, fin de période) — prêt pour paiement récurrent
- **users** (email unique, hash argon2id, nom, téléphone, `is_super_admin`)
- **sessions** (hash SHA-256 du jeton, user, entreprise active, expiration, IP, user-agent)
- **login_attempts** (clé IP+email, compteur, fenêtre)
- **audit_logs** (entreprise, utilisateur, action, type/id d'élément, métadonnées, IP, date) — append-only

### Entreprise (RLS)
- **roles** (nom, `permissions` text[], système ou personnalisé)
- **memberships** (user ↔ entreprise, rôle, boutique par défaut, actif)
- **stores** (boutique / entrepôt, adresse, par défaut)
- **taxes** (nom, taux, par défaut) — aucune règle fiscale codée en dur
- **payment_methods** (code, libellé, type cash/mobile_money/card/transfer/credit/other, activé, ordre)
- **document_sequences** (type de document, préfixe, motif `{PREFIX}-{YYYY}-{SEQ}`, compteur, remise à zéro annuelle) → `FACT-2026-000001`, verrou `FOR UPDATE`
- **categories** (arborescence via `parent_id`), **brands**
- **products** (nom, référence, SKU, code-barres, catégorie, marque, description, photo, prix d'achat, prix de vente, prix promo, taxe, stock minimum, unité, fournisseur, date d'expiration, actif)
- **stock_levels** (boutique × produit → quantité) — le stock actuel est la somme par boutique
- **stock_movements** (boutique, produit, type, quantité signée, quantité après, coût, motif, référence du document, utilisateur, date) — types : in, out, adjustment, inventory, transfer_in, transfer_out, sale, customer_return, purchase_receipt, supplier_return
- **customers** (nom, entreprise, téléphone, WhatsApp, email, adresse, NIF, notes, total dépensé, solde dû)
- **suppliers** (nom, entreprise, téléphone, email, adresse, notes, solde dû)
- **sales** + **sale_items** (numéro, boutique, client, vendeur, sous-total, remise, taxes, total, payé, reste dû, statut ; lignes avec snapshot nom/prix/taux/coût)
- **payments** (vente ou facture, client, moyen de paiement, montant, référence)
- **invoices** + **invoice_items** (numéro, vente d'origine, client + snapshot, dates, statut, totaux, conditions, notes, `public_token` pour le lien partageable)
- **expenses** (catégorie, montant, date, description, moyen de paiement, justificatif)

Phase 2 (tables déjà prévues dans le modèle, non créées dans le MVP) : `quotes`, `delivery_notes`, `purchase_orders`/`purchase_receipts`/`supplier_invoices`, `returns`, `notifications`, `saas_invoices`.

### Relations principales
```
companies 1─n memberships n─1 users          companies 1─n stores 1─n stock_levels n─1 products
memberships n─1 roles                         products n─1 categories / brands / taxes / suppliers
sales 1─n sale_items n─1 products             sales 1─n payments n─1 payment_methods
sales 1─0..1 invoices 1─n invoice_items       customers 1─n sales / invoices / payments
stock_movements n─1 products, stores, users   audit_logs n─1 companies, users
```

### Index de performance
- `products (company_id, sku)` unique, `(company_id, barcode)`, index GIN trigram sur `name` → recherche POS < 50 ms sur 100k produits
- `sales (company_id, created_at desc)`, `stock_movements (company_id, product_id, created_at desc)`, `invoices (company_id, number)` unique
- Pagination par curseur/offset limitée côté serveur ; agrégats du dashboard en SQL (`date_trunc`)

## 6. Rôles et permissions

Permissions fines (`module.action`), rôles = listes de permissions éditables par l'administrateur.

| Permission | Admin | Gérant | Caissier | Magasinier | Commercial | Comptable |
|---|---|---|---|---|---|---|
| dashboard.view | ✓ | ✓ | | ✓ | ✓ | ✓ |
| reports.view / reports.profit | ✓ | ✓ | | | | ✓ |
| products.view | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| products.edit / products.cost | ✓ | ✓ | | ✓ (sans coût) | | coût seul |
| stock.view / stock.adjust | ✓ | ✓ | | ✓ | | |
| sales.create (POS) | ✓ | ✓ | ✓ | | ✓ | |
| sales.view / sales.cancel | ✓ | ✓ / ✓ | vue | | vue | vue |
| invoices.create / invoices.cancel | ✓ | ✓ | | | ✓ / | |
| customers.view / customers.edit | ✓ | ✓ | ✓ / | | ✓ | vue |
| suppliers.view / suppliers.edit | ✓ | ✓ | | ✓ / | | vue |
| expenses.view / expenses.edit | ✓ | ✓ | | | | ✓ |
| users.manage / settings.manage | ✓ | | | | | |
| audit.view | ✓ | ✓ | | | | ✓ |

Le **super admin** plateforme est un drapeau utilisateur séparé : il accède à `/admin` (entreprises, plans, abonnements, statistiques). Il ne modifie pas les données commerciales ; toute action sur une entreprise (suspension, changement de plan) est tracée dans `audit_logs`.

## 7. Routes

### Pages
| Route | Module |
|---|---|
| `/signup`, `/login`, `/logout` | Auth + création d'entreprise |
| `/dashboard` | KPIs, graphiques, filtres de période |
| `/products`, `/products/new`, `/products/[id]`, import/export CSV | Produits |
| `/stock`, `/stock/movements` | Niveaux, alertes, mouvements, ajustements |
| `/pos` | Caisse |
| `/sales`, `/sales/[id]` | Ventes, ticket |
| `/invoices`, `/invoices/[id]` | Factures |
| `/customers`, `/customers/[id]` | Clients + historique |
| `/suppliers`, `/suppliers/[id]` | Fournisseurs |
| `/expenses` | Dépenses |
| `/reports` | Rapports simples + export CSV |
| `/settings/company`, `/settings/taxes`, `/settings/payments`, `/settings/numbering` | Configuration |
| `/users`, `/users/roles` | Utilisateurs et permissions |
| `/audit` | Journal d'activité |
| `/f/[token]` | Facture publique (lien sécurisé, jeton 256 bits) |
| `/admin/*` | Super admin |

### API (route handlers, JSON/fichiers)
- `GET /api/pos/search?q=` — recherche produit (nom, SKU, code-barres)
- `GET /api/invoices/[id]/pdf`, `GET /api/sales/[id]/receipt` — PDF
- `GET /api/f/[token]/pdf` — PDF public
- `GET /api/export/[entity]` — CSV (produits, ventes, clients, stock)

Les écritures passent par des Server Actions (formulaires) ; une API REST publique versionnée (`/api/v1`) pourra être ajoutée pour intégrations/app mobile en réutilisant les mêmes services.

## 8. Composants
- **Layout** : barre latérale repliable (mobile : tiroir), sélecteur de boutique, menu utilisateur.
- **UI** : Button, Input, Select, Card, Table paginée, Badge, Dialog, Stat, EmptyState, PeriodFilter.
- **POS** : SearchBar (focus permanent, lecteur code-barres = clavier), ProductGrid, Cart, PaymentPanel, ReceiptPreview ; scan caméra (BarcodeDetector) en phase 2.
- **Documents** : InvoicePdf, ReceiptPdf (58/80 mm), paramétrés par l'identité de l'entreprise.

## 9. Sécurité
- Mots de passe **argon2id** ; jetons de session aléatoires 256 bits, stockés **hachés**, cookie `httpOnly; Secure; SameSite=Lax`, expiration glissante 30 jours, révocation à la déconnexion/changement de mot de passe.
- **Limitation des tentatives** : 5 échecs / 15 min par IP+email.
- **Isolation** : RLS + contexte serveur (§4) ; tests automatisés d'isolation.
- **Permissions** vérifiées côté serveur dans chaque service (`requirePermission`), l'UI ne fait que masquer.
- **Validation** Zod de toutes les entrées ; requêtes paramétrées (Drizzle) → pas d'injection SQL.
- **CSRF** : Server Actions (contrôle d'Origin natif) ; route handlers en lecture seule. **XSS** : échappement React, pas de `dangerouslySetInnerHTML`, en-têtes CSP/HSTS/X-Frame-Options.
- **Uploads** : types (PNG/JPEG/WebP), taille (2 Mo) contrôlés, noms aléatoires.
- **Audit** : connexion, création/modification/suppression, vente, annulation, mouvement de stock, changement de prix, factures.
- **Sauvegardes** : `pg_dump` quotidien chiffré + WAL (PITR) chez l'hébergeur, rétention 30 jours, test de restauration mensuel.

## 10. Déploiement
- **Local** : `docker compose up -d` (PostgreSQL) → `npm run db:migrate && npm run db:seed && npm run dev`.
- **Production** recommandée : conteneur Docker Next.js (`output: standalone`) sur un VPS/Cloud (Hetzner, OVH, Scaleway, AWS…) derrière Caddy/Traefik (HTTPS Let's Encrypt automatique, domaine personnalisé) ; PostgreSQL managé (sauvegardes/PITR) ; stockage S3 compatible pour logos et justificatifs.
- **Variables d'environnement** : `DATABASE_URL` (app_user), `DATABASE_ADMIN_URL` (migrations), `APP_URL`, `SESSION_SECRET`, `STORAGE_*`.
- **CI** : lint + typecheck + tests (avec PostgreSQL de service) + build ; migrations appliquées au déploiement.
- **Monitoring / logs** : logs JSON (stdout) → collecteur, Sentry pour les erreurs, uptime check `/api/health`.

## 11. Modules du MVP (ordre d'implémentation)
1. Authentification + création d'entreprise (espace créé automatiquement : boutique principale, rôles par défaut, TVA 18 %, moyens de paiement, numérotation)
2. Configuration entreprise (identité, factures, taxes, paiements)
3. Produits (+ import/export CSV)
4. Stock (niveaux, mouvements, ajustements, alertes)
5. Clients, Fournisseurs
6. Caisse/POS → Ventes (décrément de stock transactionnel)
7. Factures PDF + lien public
8. Utilisateurs et rôles
9. Dashboard + rapports simples
10. Super admin minimal, journal d'audit

Ensuite : devis, bons de livraison, achats complets, multi-boutiques avancé (transferts UI), notifications, statistiques avancées, abonnements payants.
