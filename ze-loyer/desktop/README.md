# ZE LOYER — logiciel Windows

Un vrai logiciel Windows (installateur `.exe`, icône sur le bureau) qui contient **tout ZE LOYER** :
le site, sa base de données PostgreSQL et le serveur. Il fonctionne **sans internet et sans serveur** : les données
restent sur l'ordinateur.

| | |
|---|---|
| Premier lancement | propose de **charger les données de démonstration** (agence ZE IMMOBILIER) ou de commencer vide |
| Quittances PDF, contrats | enregistrés dans « Téléchargements » puis ouverts avec le lecteur PDF de Windows |
| WhatsApp, appel, SMS, liens externes | s'ouvrent dans l'application ou le navigateur de Windows |
| Rappels J-7 … J+7 | calculés au démarrage puis toutes les 6 heures (notifications dans le logiciel) |
| Navigation | Alt+← / Alt+→ ou boutons latéraux de la souris : page précédente / suivante ; F5 : actualiser |

Compatible Windows 10 et 11 (64 bits).

> Les données sont **propres à cet ordinateur** : un locataire ou un propriétaire ne peut pas s'y connecter depuis son
> téléphone. Pour partager le carnet locatif, utilisez le site en ligne (`docs/MISE-EN-LIGNE.md`) et l'application Android.

## Obtenir l'installateur

GitHub → onglet **Actions** → **ZE LOYER Windows** → **Run workflow** → attendez la coche verte (environ 15 minutes) →
cliquez sur l'exécution → en bas, **Artifacts** → **ZE-LOYER-Windows** : un fichier zip contenant
`ZE-LOYER-Installation-1.0.0.exe`.

## Installer

1. Double-cliquez sur `ZE-LOYER-Installation-1.0.0.exe`.
2. Windows affiche « Windows a protégé votre ordinateur » (le logiciel n'est pas encore signé par un certificat payant) :
   cliquez sur **Informations complémentaires** puis **Exécuter quand même**.
3. Suivez l'installation. L'icône **ZE LOYER** apparaît sur le bureau.

Données et journal : `%APPDATA%\ZE LOYER` (base dans `pgdata`, journal dans `logs\app.log`). La désinstallation
**garde** les données ; supprimez ce dossier pour repartir de zéro.

## Développeurs

```bash
cd ze-loyer && npm ci
cd desktop && npm ci
node build/prepare.mjs --target=linux          # build Next.js autonome + seed.cjs dans desktop/app
ZE_PG_BIN=/usr/lib/postgresql/16/bin ZE_CHROME=/chemin/chromium node build/smoke-test.cjs   # test sans interface
ZE_PG_BIN=/usr/lib/postgresql/16/bin npx electron .                                          # fenêtre du logiciel
```

- `services.cjs` : PostgreSQL intégré (`initdb` au premier lancement, mots de passe aléatoires dans `config.json`),
  migrations, compte `zl_app` sans droits d'administration (journal d'audit en ajout seul, paiements jamais supprimés),
  données de démo, serveur Next.js sur `http://localhost:<port>`.
- `main.cjs` : fenêtre Electron, écran de démarrage, téléchargements, liens externes, rappels.
- `build/prepare.mjs` : assemble le serveur autonome, les migrations, PostgreSQL 16 pour Windows et le module argon2 Windows.
- Workflow `.github/workflows/ze-loyer-windows.yml` : construit l'installateur sur une machine Windows et le teste deux
  fois (fichiers assemblés, puis fichiers empaquetés) avec un parcours dans Chrome : connexion, paiement, quittance PDF.
