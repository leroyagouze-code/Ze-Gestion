# Installer ZE Gestion sur Windows, sans Docker

À utiliser quand Docker Desktop ne démarre pas (par exemple « Virtualization support not detected »). ZE Gestion fonctionne alors directement sur Windows, avec deux logiciels gratuits : Node.js et PostgreSQL.

## Ce qu'il faut

- Windows 10 ou 11 (64 bits), 4 Go de mémoire vive minimum, 5 Go d'espace disque libre.
- Internet pour l'installation. Ensuite, ZE Gestion **fonctionne sans internet**.

## 1. Installer Node.js (une seule fois)

1. Allez sur https://nodejs.org et téléchargez la version **LTS** (22 ou plus récente).
2. Lancez l'installateur et cliquez sur « Next » jusqu'au bout, en gardant les choix proposés.
   Si une case « Automatically install the necessary tools » apparaît, laissez-la **décochée**.

## 2. Installer PostgreSQL (une seule fois)

1. Allez sur https://www.postgresql.org/download/windows/ puis « Download the installer » et choisissez **PostgreSQL 16** pour Windows x86-64.
2. Lancez l'installateur :
   - composants : gardez les choix proposés ;
   - **mot de passe** : choisissez-en un et **notez-le**, il sera demandé à l'étape 3 ;
   - port : laissez **5432** ;
   - à la fin, décochez « Stack Builder » (inutile) et cliquez sur « Finish ».

PostgreSQL démarre ensuite tout seul avec Windows.

## 3. Installer ZE Gestion

1. Décompressez le zip, par exemple dans `Documents\ze-gestion`.
2. Double-cliquez sur **`Installer-ZE-Gestion-sans-Docker.bat`**.
   Si Windows affiche « Windows a protégé votre ordinateur », cliquez sur « Informations complémentaires » puis « Exécuter quand même ».
3. Tapez le mot de passe PostgreSQL de l'étape 2, puis Entrée. Pour le port, appuyez simplement sur Entrée.
4. Attendez « Installation terminée » (5 à 15 minutes la première fois).

## 4. Utiliser ZE Gestion

1. Double-cliquez sur **`Demarrer-ZE-Gestion-sans-Docker.bat`**. Le navigateur s'ouvre sur **http://localhost:3000**.
2. Connectez-vous avec `demo@gestion.local` / `demo12345` (compte de démonstration, aussi super admin). Changez son mot de passe si d'autres personnes utilisent l'ordinateur, ou créez votre entreprise avec « Créer mon entreprise ».
3. **Laissez la fenêtre noire ouverte** pendant l'utilisation. La fermer arrête ZE Gestion ; vos données sont conservées.

Astuce : clic droit sur `Demarrer-ZE-Gestion-sans-Docker.bat`, « Envoyer vers », « Bureau (créer un raccourci) ».

## Mettre à jour

Décompressez le nouveau zip **dans le même dossier** (remplacez les fichiers, mais gardez le fichier `.env` et le dossier `uploads`), puis relancez `Installer-ZE-Gestion-sans-Docker.bat`. Vos données ne sont pas effacées.

## Sauvegarder

Les données sont dans PostgreSQL, sur cet ordinateur uniquement. Pour en faire une copie, ouvrez « SQL Shell (psql) » ou pgAdmin (installés avec PostgreSQL), ou tapez dans une fenêtre de commande :

```
"C:\Program Files\PostgreSQL\16\bin\pg_dump.exe" -U postgres -d zegestion -f sauvegarde.sql
```

puis copiez `sauvegarde.sql` et le dossier `uploads` sur une clé USB.

## En cas de problème

- « Node.js n'est pas installé » : refaites l'étape 1, puis redémarrez l'ordinateur.
- « connexion à PostgreSQL impossible » : vérifiez le mot de passe. S'il a été mal tapé, supprimez le fichier `.env` du dossier et relancez l'installation.
- Autre erreur : envoyez une capture de la fenêtre noire.
