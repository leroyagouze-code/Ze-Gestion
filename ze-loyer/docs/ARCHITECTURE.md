# ZE LOYER — Architecture

> La gestion locative, simplement. Carnet locatif numérique partagé entre agence / propriétaire et locataire.

## A. Architecture technique

| Couche | Choix | Pourquoi |
|---|---|---|
| Application | **Next.js 15 (App Router) + TypeScript strict** | Une seule application : pages rendues côté serveur (rapides sur petits téléphones / 3G), Server Actions pour les formulaires, routes API pour PDF, fichiers et tâches planifiées. |
| Interface | **Tailwind CSS 4**, composants maison (`src/components`) | Mobile-first (375 px), gros boutons (48 px), statuts toujours écrits en texte. |
| Base de données | **PostgreSQL 16** | Relationnel, transactions, contraintes (un seul bail actif par logement, numéros de quittance uniques…). |
| ORM | **Drizzle ORM** + migrations SQL versionnées (`drizzle/`) | Déjà utilisé dans ce dépôt, SQL lisible, pas de binaire à télécharger (contrairement à Prisma). |
| Authentification | Maison, simple et sûre : **argon2id** (paramètres OWASP), jeton de session aléatoire 256 bits stocké **haché** (SHA-256) en base, cookie `httpOnly` + `SameSite=Lax` + `Secure` en production, expiration glissante 30 j, **limitation des tentatives** (5 / 15 min par identifiant et par IP). | Connexion par **numéro de téléphone** (usage local), sans dépendance externe. |
| PDF | `@react-pdf/renderer` | Quittances A5 générées à la volée depuis un **instantané figé**. |
| PWA | `app/manifest.ts`, icônes générées (`app/icon.tsx`, `apple-icon.tsx`), `public/sw.js` | Installation sur l'écran d'accueil, page hors ligne. Les données financières ne sont jamais mises en cache. |
| i18n | `src/i18n` (dictionnaire FR, repli automatique) | Éwé, Kabyè, Anglais déclarés « bientôt » : ajouter un dictionnaire suffit. |

```
src/
  app/
    page.tsx                 page publique (marketing)
    (public)/                connexion, inscription + actions d'authentification
    invitation/[token]/      accepter une invitation
    (staff)/                 espace agence / propriétaire (layout = requireStaff)
    mon-espace/              espace locataire (layout = requireTenant)
    api/                     quittances PDF, documents, cron rappels, santé
  modules/                   logique métier, SANS dépendance à l'interface
    finance/ledger.ts        ★ règles financières pures (testées)
    finance/service.ts       loyers appelés, paiements, répartition, quittances, cautions
    access.ts                ★ périmètre des données (organisation / propriétaire / locataire)
    auth/ properties/ tenants/ invitations/ disputes/ requests/ documents/
    notifications/ reminders/ dashboard/ portal/ audit/ plans.ts
  lib/                       permissions (RBAC), sessions, validation, argent, téléphone, stockage
  components/                design system (ui.tsx, carnet.tsx, nav, shell…)
  pdf/receipt.tsx            gabarit de quittance
drizzle/                     migrations SQL
scripts/                     migrate, seed (démo), reminders (cron)
tests/unit                   règles financières
tests/integration            isolation, permissions, paiements, audit, invitations (PostgreSQL)
```

### Logique financière (section 28 du brief)

Le solde **n'est jamais stocké**. Il est recalculé à partir des opérations :

- `rent_charges` : un loyer appelé par période commencée (matérialisé automatiquement, idempotent) → **dette**.
- `payments` : toute opération d'argent, typée (`LOYER`, `AVANCE`, `CAUTION`, `CHARGE`, `FRAIS`, `REMBOURSEMENT`, `AJUSTEMENT`, `AUTRE`).
  - `LOYER`, `AVANCE`, `AJUSTEMENT` positif → **crédit** du locataire.
  - `REMBOURSEMENT`, `AJUSTEMENT` négatif → consomment le crédit.
  - `CAUTION`, `CHARGE`, `FRAIS`, `AUTRE` → **hors loyer** (la caution vit dans `deposits`).
- Répartition **FIFO** : chaque crédit éteint les loyers les plus anciens d'abord ; le crédit restant est **projeté** sur les périodes futures → « À jour jusqu'au 31 mars 2027 ». Le résultat est enregistré dans `payment_allocations` (recalculé à chaque changement).
- Statut : `EN_RETARD` si un reste dû a dépassé son échéance, sinon `EN_AVANCE` s'il reste du crédit, sinon `A_JOUR`.
- Un paiement n'est **jamais supprimé** (trigger SQL) : il est **annulé** avec une raison, et reste visible barré.
- Loyer 1ʳᵉ période : entier (pas de prorata en V1) ; la 1ʳᵉ échéance n'est jamais avant la date d'entrée.

## B. Schéma de base de données

```
users ─┬─< sessions
       ├─< memberships >── organizations (AGENCY | OWNER, plan FREE/STARTER/PRO/AGENCE)
       │        └── owner_id → owners (rôle OWNER : restreint à cette fiche)
       ├── owners.user_id        (propriétaire invité)
       └── tenants.user_id       (locataire invité)

organizations ─< owners ─< properties ─< units ─< leases >── tenants
                                                    │
                     rent_charges >─────────────────┤
                     payments >─────────────────────┤──< receipts (instantané JSON figé)
                     payment_allocations (payment × charge)
                     deposits (caution : montant, date, statut, remboursé, retenu, commentaire)
                     documents (contrat, preuve) · disputes (contestations) · requests (demandes)

invitations (TENANT | OWNER | MEMBER, jeton haché, expiration 14 j, usage unique)
notifications (canal WEB | EMAIL | SMS | WHATSAPP, statut SENT | SKIPPED, clé anti-doublon)
audit_logs (ajout seul : trigger qui interdit UPDATE / DELETE)
login_attempts · receipt_sequences (ZL-AAAA-000001 par organisation)
```

Contraintes notables : un seul bail `ACTIVE` par logement (index unique partiel), un loyer par (bail, période), numéro de quittance unique par organisation, montants en entiers FCFA.

Les migrations : `drizzle/0000_init.sql` (tables) et `drizzle/0001_audit_append_only.sql` (triggers d'intégrité).

## C. Pages

| Public | |
|---|---|
| `/` | Page publique : « La gestion locative, simplement. » + Créer mon compte / Se connecter |
| `/connexion`, `/inscription` | Téléphone + mot de passe ; type de compte Agence / Propriétaire / Locataire |
| `/invitation/[token]` | « Bonjour Kossi 👋 Votre espace ZE LOYER est prêt » → création du mot de passe |
| `/espaces` | Choisir un espace (si plusieurs : agence, propriétaire, locataire) |

| Agence / propriétaire | Navigation mobile : 🏠 Accueil · 🏢 Biens · 👥 Locataires · 💰 Paiements · 📊 Rapports · ⚙️ Paramètres |
|---|---|
| `/tableau-de-bord` | « Qui me doit de l'argent ? », patrimoine / vue globale, revenus du mois, actions, échéances proches, filtres (propriétaire, immeuble, période) |
| `/biens`, `/biens/nouveau`, `/biens/[id]`, `/biens/[id]/modifier` | Biens et leurs logements (🟢 Occupé · 🔴 Vacant · 🟠 Réservé) |
| `/logements/[id]` | Logement : loyer, échéance, caution, réserver, mettre un locataire, historique |
| `/locataires`, `/locataires/nouveau`, `/locataires/[id]` | Liste filtrable par statut ; ajout + installation dans un logement ; invitation |
| `/locations/[id]` | **Carnet côté gestionnaire** : situation, historique, paiements, caution, documents, relance, fin de location, journal |
| `/paiements`, `/paiements/nouveau`, `/paiements/[id]` | Encaissements filtrables ; saisie avec aperçu (« solde réglé + 3 mois d'avance ») ; quittance ; annulation motivée |
| `/impayes` | 🔴 Impayés : Voir · Relancer · Enregistrer un paiement |
| `/rapports` | Attendu / encaissé sur 6 mois, par bien, par type et mode de paiement |
| `/contestations`, `/demandes` | Traitement des signalements des locataires |
| `/proprietaires` | (Agence) fiches propriétaires + accès consultation |
| `/parametres`, `/parametres/equipe`, `/journal`, `/notifications` | Compte, formule, langue, équipe (rôles), journal d'audit |

| Locataire | Navigation : 🏠 Accueil · 📒 Mon carnet · 🧾 Quittances · 📄 Documents · 🔧 Demandes · 👤 Mon profil |
|---|---|
| `/mon-espace` | Bonjour Kossi 👋 · 💰 Ma situation (à jour / solde / en avance) · Mon logement · derniers paiements |
| `/mon-espace/carnet` | Situation, historique mois par mois, paiements, caution, « Signaler une erreur » |
| `/mon-espace/quittances` · `/documents` · `/demandes` · `/signaler` · `/profil` · `/notifications` | |

## D. API

Les formulaires utilisent des **Server Actions** (requêtes POST protégées contre le CSRF par Next.js). Chaque action appelle `requireStaff(permission)` ou `requireTenant()`, puis un service qui revérifie la permission et le périmètre.

| Route | Méthode | Accès | Rôle |
|---|---|---|---|
| `/api/quittances/[id]/pdf` | GET | personnel du périmètre (`payment.read`) ou locataire titulaire | Quittance PDF |
| `/api/documents/[id]` | GET | personnel du périmètre ou locataire titulaire | Contrat / preuve (jamais servi directement depuis le disque) |
| `/api/cron/rappels` | GET | `Authorization: Bearer $CRON_SECRET` | Rappels J-7, J-3, J-1, J, J+3, J+7 |
| `/api/health` | GET | public | Santé (base joignable) |

Server Actions principales : `signupAction`, `loginAction`, `logoutAction`, `switchSpaceAction`, `acceptAction` (invitation), `createPropertyAction`, `updatePropertyAction`, `createUnitAction`, `updateUnitAction`, `toggleReservedAction`, `createTenantAction`, `updateTenantAction`, `createLeaseAction`, `endLeaseAction`, `inviteTenantAction`, `inviteOwnerAction`, `inviteMemberAction`, `recordPaymentAction`, `cancelPaymentAction`, `closeDepositAction`, `uploadDocumentAction`, `remindAction`, `resolveDisputeAction`, `updateRequestAction`, `createRequestAction`, `createDisputeAction`, `markAllReadAction`.

## E. Rôles et permissions (RBAC)

Défini dans `src/lib/permissions.ts`, vérifié **côté serveur** (actions, services, routes API). Le périmètre des données est appliqué dans `src/modules/access.ts`.

| Permission | Admin | Gestionnaire | Comptable | Agent terrain | Propriétaire (suivi par agence) |
|---|:-:|:-:|:-:|:-:|:-:|
| Voir tableau de bord, biens, locataires, paiements, rapports, contestations | ✅ | ✅ | ✅ | ✅ | ✅ *ses biens seulement* |
| Créer / modifier biens et logements | ✅ | ✅ | | | |
| Ajouter locataires, créer / terminer locations | ✅ | ✅ | | | |
| Enregistrer un paiement, relancer | ✅ | ✅ | ✅ | ✅ | |
| Annuler un paiement, ajustement, remboursement | ✅ | ✅ | ✅ | | |
| Cautions (rembourser / retenir) | ✅ | ✅ | ✅ | | |
| Traiter les contestations | ✅ | ✅ | ✅ | | |
| Demandes des locataires, documents | ✅ | ✅ | | ✅ | |
| Inviter locataires | ✅ | ✅ | | | |
| Propriétaires (fiches, accès) | ✅ | ✅ | | | |
| Journal d'audit | ✅ | ✅ | ✅ | | |
| Équipe, paramètres | ✅ | | | | |

- Un **propriétaire indépendant** (inscription « Propriétaire ») est **Admin** de son propre espace.
- Un **locataire** n'a aucun rôle d'organisation : il ne voit que les baux dont il est titulaire (`tenants.user_id`), et ne peut **pas modifier** son historique (seulement signaler).
- Un locataire n'est jamais relié à un compte par simple numéro de téléphone (non vérifié) : **uniquement via un lien d'invitation** à usage unique.

## F. Parcours utilisateurs

1. **Propriétaire** : Créer mon compte (Propriétaire) → Ajouter un bien → Ajouter ses logements (numéro, type, loyer, échéance, caution) → Ajouter un locataire (et l'installer, caution versée) → Inviter le locataire (WhatsApp / SMS depuis son téléphone) → Enregistrer les paiements → la quittance est créée → le tableau de bord montre « Qui me doit de l'argent ? ».
2. **Agence** : idem + fiches propriétaires (accès consultation pour chacun), équipe avec rôles, filtres par propriétaire / immeuble / période.
3. **Locataire** : reçoit le lien → « Bonjour Kossi 👋 » → crée son mot de passe → voit immédiatement : À jour / Solde / En avance, prochaine échéance, historique, quittances PDF, contrat → « Signaler une erreur » (avec preuve) ou « Signaler un problème ».
4. **Retard** : rappels automatiques J-7 → J+7 (notifications dans l'application) ; dans Impayés, « Relancer » notifie le locataire et ouvre WhatsApp / SMS sur le téléphone du gestionnaire.
5. **Erreur de saisie** : Paiement → Annuler (raison obligatoire, reste visible barré) → Enregistrer le bon montant. Tout est dans le journal.

## Intégrations : ce qui est réel et ce qui ne l'est pas

- **Mobile Money** : aucune API connectée. TMoney / Flooz sont des **modes de paiement saisis manuellement** (avec référence). Le champ `payments.provider_ref` est réservé à une future intégration.
- **SMS / WhatsApp / Email** : **non configurés**. Aucun message n'est envoyé automatiquement. Les liens WhatsApp/SMS ouvrent l'application du téléphone de l'utilisateur, qui envoie lui-même. Les canaux sont prévus dans `src/modules/notifications/channels.ts` (une notification sur un canal non configuré serait marquée `SKIPPED`).
- **Abonnements** : formules FREE / STARTER / PRO / AGENCE modélisées (`organizations.plan`, `src/modules/plans.ts`), aucun paiement d'abonnement codé.
