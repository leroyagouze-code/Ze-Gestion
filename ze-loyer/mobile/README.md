# ZE LOYER — application Android

Une vraie application Android (fichier `.apk`, icône sur l'écran d'accueil) qui ouvre **le site ZE LOYER hébergé sur votre serveur**.
Tout ce qui existe sur le site existe dans l'application (agence, propriétaire, locataire) : il n'y a qu'**un seul code** à maintenir, et chaque amélioration du site arrive immédiatement dans l'application, sans la réinstaller.

L'application ajoute ce qu'un site ne fait pas bien sur Android :

| | |
|---|---|
| Icône et écran d'ouverture ZE LOYER | l'application s'ouvre directement sur la connexion, ou sur l'espace de l'utilisateur s'il est déjà connecté |
| Bouton « retour » d'Android | revient à la page précédente, puis ferme l'application |
| Pas d'internet | écran « 📶 Pas de connexion » avec un bouton « Réessayer » |
| Quittances PDF, contrats | téléchargés dans « Téléchargements », ouverts depuis la notification |
| WhatsApp, SMS, appel | s'ouvrent dans l'application correspondante du téléphone |
| Photos / PDF (preuve, contrat) | le sélecteur de fichiers du téléphone s'ouvre (galerie, Fichiers…) |

Compatible Android 7 et plus récents. Poids : environ 5 Mo.

> L'application a besoin que le site soit **en ligne en HTTPS** (par exemple `https://app.zeloyer.tg`) : c'est le serveur qui garde les données partagées entre l'agence, le propriétaire et le locataire.

## 1. Indiquer l'adresse du site (une seule fois)

Sur GitHub : dépôt **Ze-Gestion** → **Settings** → **Secrets and variables** → **Actions** → onglet **Variables** → **New repository variable** :

- Name : `ZE_LOYER_URL`
- Value : l'adresse de votre site, par exemple `https://app.zeloyer.tg` (obligatoirement `https://`)

## 2. Créer la clé de signature (une seule fois, très important)

Android n'accepte une mise à jour que si elle est signée avec **la même clé** que la version installée. Sans clé fixe, chaque nouvelle version oblige à désinstaller l'application (et l'utilisateur doit se reconnecter).

Sur un ordinateur où Java est installé :

```bash
keytool -genkeypair -v -keystore zeloyer.jks -alias zeloyer -keyalg RSA -keysize 2048 -validity 10000
```

Choisissez un mot de passe solide et notez-le. Ensuite, convertissez la clé en texte :

- Windows (PowerShell) : `[Convert]::ToBase64String([IO.File]::ReadAllBytes("zeloyer.jks")) | Set-Clipboard`
- Mac / Linux : `base64 -w0 zeloyer.jks` (Mac : `base64 -i zeloyer.jks`)

Puis, sur GitHub → **Settings** → **Secrets and variables** → **Actions** → onglet **Secrets** → **New repository secret**, créez :

| Nom | Valeur |
|---|---|
| `ZE_KEYSTORE_BASE64` | le texte obtenu ci-dessus |
| `ZE_KEYSTORE_PASSWORD` | le mot de passe de la clé |
| `ZE_KEY_ALIAS` | `zeloyer` |
| `ZE_KEY_PASSWORD` | le même mot de passe |

⚠️ **Gardez le fichier `zeloyer.jks` et son mot de passe en lieu sûr** (clé USB + copie). Si vous les perdez, aucune mise à jour de l'application ne pourra plus s'installer par-dessus l'ancienne. Ne le mettez jamais dans le dépôt.

Sans ces secrets, GitHub construit quand même une **version de test** (installable, mais chaque mise à jour demandera de désinstaller l'ancienne).

## 3. Obtenir le fichier APK

GitHub → onglet **Actions** → **ZE LOYER Android** → **Run workflow** (vous pouvez y saisir l'adresse du site si la variable n'existe pas) → attendez la coche verte (environ 5 minutes) → cliquez sur l'exécution → en bas, **Artifacts** → **ZE-LOYER-Android** : un fichier zip contenant `ZE-LOYER-1.0.X.apk`.

## 4. Installer sur un téléphone

1. Envoyez le fichier `.apk` sur le téléphone (WhatsApp, câble, Google Drive…).
2. Touchez le fichier. Android demande d'**autoriser l'installation d'applications inconnues** pour WhatsApp / Fichiers / Chrome : acceptez.
3. **Installer** → **Ouvrir**. L'icône ZE LOYER apparaît sur l'écran d'accueil.

Pour une mise à jour : même chose avec le nouvel APK, il s'installe par-dessus (si la clé de signature est configurée).

## Construire sur son ordinateur (développeurs)

Prérequis : Node.js 22, Java 21, Android SDK (`ANDROID_HOME`).

```bash
cd ze-loyer/mobile
npm ci
ZE_LOYER_URL=https://app.zeloyer.tg npm run apk:debug     # → android/app/build/outputs/apk/debug/app-debug.apk
```

Test sur émulateur avec un serveur local en mode développement (connexion non chiffrée, **à ne jamais distribuer**) :

```bash
ZE_LOYER_ALLOW_HTTP=1 ZE_LOYER_URL=http://10.0.2.2:3000 npm run apk:debug
```

Icônes et écran d'ouverture : images sources dans `assets/`, puis `npm run icons`.

## Test automatique sur émulateur

À chaque modification de l'application Android, GitHub lance un vrai émulateur Android 11 (job « emulator » du workflow
**ZE LOYER Android**) avec un site ZE LOYER de démonstration, puis le script `scripts/emulator-smoke.mjs` vérifie :
ouverture sur la connexion → connexion de Kossi (locataire démo) → son espace → ses quittances → **téléchargement du
PDF dans « Téléchargements »** → **bouton retour Android** → **écran « Pas de connexion »** quand le serveur est coupé.
Les captures d'écran de chaque étape sont dans l'artefact **ZE-LOYER-Android-captures**.

## Plus tard

- **Google Play Store** : `./gradlew bundleRelease` produit le fichier `.aab` attendu par Google (compte développeur Google, 25 $ une fois).
- **Liens d'invitation qui ouvrent directement l'application** (Android App Links) : nécessite de publier `/.well-known/assetlinks.json` sur le site avec l'empreinte de la clé de signature. Aujourd'hui, un lien d'invitation s'ouvre dans le navigateur : le locataire y crée son mot de passe, puis se connecte dans l'application.
