# Installer ZE Gestion sur un ordinateur

Pour essayer ZE Gestion ou l'utiliser dans une boutique, sur **un seul ordinateur**. Pour que plusieurs boutiques et téléphones y accèdent par internet, il faut l'installer sur un serveur : voir `DEPLOIEMENT.md`.

## Ce qu'il faut

- Windows 10 ou 11 (64 bits), un Mac, ou Linux.
- 8 Go de mémoire vive conseillés et 10 Go d'espace disque libre.
- Internet pour la première installation. Ensuite, l'application tourne sur l'ordinateur et **fonctionne sans internet**.

## 1. Installer Docker Desktop (une seule fois)

1. Téléchargez Docker Desktop sur https://www.docker.com/products/docker-desktop/ et installez-le.
   Sous Windows, acceptez l'option « WSL 2 » si elle est proposée, puis redémarrez l'ordinateur si l'installation le demande.
2. Ouvrez Docker Desktop. Vous pouvez passer la création de compte (« Skip »).
3. Attendez que Docker Desktop indique qu'il est prêt (« Engine running »).

## 2. Démarrer ZE Gestion

1. Décompressez le zip, par exemple dans `Documents\ze-gestion`.
2. Ouvrez le dossier `ze-gestion` et double-cliquez sur :
   - **Windows** : `Demarrer-ZE-Gestion.bat`
   - **Mac / Linux** : `demarrer-ze-gestion.sh` (sur Mac : clic droit, Ouvrir avec, Terminal)
3. La première fois, la préparation prend **5 à 10 minutes**. Ne fermez pas la fenêtre noire.
4. Le navigateur s'ouvre sur **http://localhost:3000**.

Si Windows affiche « Windows a protégé votre ordinateur », cliquez sur « Informations complémentaires » puis « Exécuter quand même ».

## 3. Se connecter

Une boutique de démonstration est déjà chargée :

- E-mail : `demo@gestion.local`
- Mot de passe : `demo12345`

Ce compte est aussi **super admin** (menu « Super admin » pour les abonnements). Changez son mot de passe (lien « Mot de passe » en bas du menu) si d'autres personnes utilisent l'ordinateur. Vous pouvez aussi créer votre vraie entreprise avec « Créer mon entreprise ».

## Au quotidien

- Docker Desktop doit être ouvert. ZE Gestion redémarre alors tout seul avec l'ordinateur.
- Adresse à mettre en favori : **http://localhost:3000**
- Pour arrêter : double-cliquez sur `Arreter-ZE-Gestion.bat`. **Vos données sont conservées.**
- Pour relancer : `Demarrer-ZE-Gestion.bat`.

## Mettre à jour

Remplacez le dossier par celui du nouveau zip, puis double-cliquez sur `Demarrer-ZE-Gestion.bat`. Les données restent dans Docker et ne sont pas effacées.

## Important

- Les données sont **sur cet ordinateur uniquement**. S'il tombe en panne, elles sont perdues. Pour une sauvegarde, ouvrez une fenêtre de commande dans le dossier et tapez :
  `docker compose -f deploy/docker-compose.local.yml exec db pg_dump -U app_owner gestion > sauvegarde.sql`
  puis copiez `sauvegarde.sql` sur une clé USB.
- Cette installation n'est accessible que depuis cet ordinateur (pas depuis un téléphone ni par internet).
- Ne supprimez pas les « volumes » dans Docker Desktop : ils contiennent vos données.
