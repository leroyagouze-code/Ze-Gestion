# Mettre ZE LOYER en ligne sur https://loyer.zegroupafrica.com

Durée : environ 30 minutes. Coût : Render « Starter » (environ 7 $ / mois) + Neon gratuit pour démarrer.
Votre site vitrine `zegroupafrica.com` ne change pas : ZE LOYER vit sur le sous-domaine `loyer.`.

## Étape 1 — La base de données (Neon, gratuit)

1. Allez sur **neon.tech** → **Sign up** (avec votre compte Google ou GitHub).
2. **Create project** : nom `ze-loyer`, région **AWS Europe (Frankfurt)**, PostgreSQL **16** ou plus.
3. Sur la page du projet, bouton **Connect** : copiez l'adresse qui commence par `postgresql://…` (elle se termine par `?sslmode=require`).
   Gardez-la pour l'étape 2. Elle contient un mot de passe : ne la partagez pas.

## Étape 2 — Le site (Render)

1. Allez sur **render.com** → **Get Started** → connectez-vous **avec GitHub** (le compte qui possède le dépôt Ze-Gestion).
2. **New** → **Blueprint** → choisissez le dépôt **Ze-Gestion** (autorisez l'accès si Render le demande).
   Render lit le fichier `render.yaml` et prépare le service **ze-loyer**.
3. Render demande **DATABASE_URL** : collez l'adresse Neon de l'étape 1.
4. **Apply** / **Deploy**. La première construction prend 5 à 10 minutes. Quand le statut passe à **Live**, le site répond sur une adresse du type `https://ze-loyer-xxxx.onrender.com`.
5. Vérifiez : ouvrez cette adresse suivie de `/api/health` → vous devez voir `{"ok":true}`.

## Étape 3 — L'adresse loyer.zegroupafrica.com

1. Sur Render → service **ze-loyer** → **Settings** → **Custom Domains** : `loyer.zegroupafrica.com` est déjà listé. Render affiche la valeur à utiliser (du type `ze-loyer-xxxx.onrender.com`).
2. Chez le fournisseur de votre nom de domaine (là où vous gérez `zegroupafrica.com`), dans la zone **DNS**, ajoutez :

   | Type | Nom / Hôte | Valeur / Cible |
   |---|---|---|
   | `CNAME` | `loyer` | `ze-loyer-xxxx.onrender.com` (la valeur donnée par Render) |

3. Revenez sur Render → **Verify**. Le certificat HTTPS est créé automatiquement (quelques minutes à quelques heures selon le fournisseur DNS).
4. Ouvrez **https://loyer.zegroupafrica.com** : la page ZE LOYER s'affiche.

## Étape 4 — Premier compte, ou données de démonstration

- **Pour de vrai** : sur https://loyer.zegroupafrica.com → **Créer mon compte** (Agence ou Propriétaire).
- **Pour une démonstration** : Render → service **ze-loyer** → **Shell**, tapez `SEED_FORCE=1 npm run db:seed`.
  ⚠️ Cette commande **efface toute la base** puis crée l'agence de démo ZE IMMOBILIER. À ne faire qu'avant le démarrage réel.

## Étape 5 — Rappels quotidiens et application Android (GitHub)

Sur GitHub → dépôt **Ze-Gestion** → **Settings** → **Secrets and variables** → **Actions** :

1. Onglet **Variables** → **New repository variable** : `ZE_LOYER_URL` = `https://loyer.zegroupafrica.com`
2. Onglet **Secrets** → **New repository secret** : `ZE_LOYER_CRON_SECRET` = la valeur de **CRON_SECRET** visible sur Render (service ze-loyer → **Environment**).

Les rappels partent alors chaque matin à 7 h. L'application Android se construit avec la bonne adresse : voir [`mobile/README.md`](../mobile/README.md) (clé de signature, puis Actions → **ZE LOYER Android** → **Run workflow**).

## Sauvegardes

- Neon garde un court historique permettant de revenir en arrière (durée selon l'offre choisie : voir « Restore » dans Neon).
- Pour une copie complète régulière, sur un ordinateur avec PostgreSQL : `pg_dump "ADRESSE_NEON" > sauvegarde-ze-loyer.sql`.
