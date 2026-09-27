# Vente des licences en ligne et tableau de bord général : guide de test

## Ce qui a été ajouté

- **Page d'achat** `/acheter-licence` sur le serveur en ligne. Le client choisit sa formule et sa durée, puis indique son nom, son numéro et TMoney ou Flooz. Il paie. La clé de licence est créée dès que le paiement est confirmé.
- **Suivi de l'achat** `/acheter-licence/ZL…`. La page se met à jour toute seule et affiche la clé une fois le paiement confirmé.
- **Dans le logiciel Windows**, menu Licence :
  - le bouton « Acheter une licence » ouvre la page d'achat, avec le code d'installation déjà rempli ;
  - la licence payée s'active toute seule à l'ouverture de la page Licence, ou avec le bouton « Récupérer ma licence » ;
  - elle s'active aussi toute seule au démarrage, puis toutes les 6 heures.
- **Super admin > Tableau de bord général** (`/admin`) :
  - l'argent encaissé, abonnements et licences ;
  - les entreprises en ligne et les logiciels Windows installés ;
  - les alertes, l'activité récente, les pays et les licences qui expirent.
- **Super admin > Licences** : le mode de paiement actif, la liste des achats avec un filtre par statut, les tarifs modifiables et la création manuelle de codes.
- La liste des entreprises est maintenant sur `/admin/entreprises`.

## Réglages du serveur (fichier deploy/.env)

| Variable | Rôle |
|---|---|
| `LICENSE_PRIVATE_KEY` | Clé privée des licences (fichier confidentiel). Sans elle, rien n'est vendu. |
| `PAYMENT_MODE=simulation` | Mode test : aucun argent. Sur la page de paiement, on choisit « réussi » ou « refusé ». |
| `PAYGATE_API_KEY` | Clé API PayGate Global. Remplie et `PAYMENT_MODE` vide : les vrais paiements sont actifs. |

Dans le tableau de bord PayGate, indiquez l'URL de notification : `https://VOTRE-DOMAINE/api/paiements/paygate`.

Le logiciel Windows doit connaître l'adresse du serveur. Au moment de publier l'installateur, mettez-la dans `desktop/package.json` → `zeGestion.serverUrl`. Pour tester sur un seul PC, ajoutez `"serverUrl": "https://…"` dans `%APPDATA%\ZE Gestion\config.json`, puis relancez le logiciel.

## Tests à faire (mode simulation)

1. **Achat réussi**
   - Dans le logiciel, ouvrez Licence puis « Acheter une licence ». Choisissez PRO, 1 an, puis Payer.
   - Sur la page de suivi, cliquez « Paiement réussi ». La clé s'affiche.
   - Revenez dans le logiciel : la page Licence affiche « Licence active, formule Pro ».
2. **Achat refusé**
   - Même parcours, mais cliquez « Paiement refusé ».
   - Le message « Le paiement n'a pas abouti » s'affiche, avec un bouton Réessayer.
   - Aucune clé n'est créée.
3. **Code d'un autre PC**
   - Achetez avec le code d'installation d'un autre ordinateur.
   - Collez la clé obtenue dans votre logiciel : elle est refusée.
4. **Sans internet**
   - Copiez la clé depuis la page de suivi.
   - Collez-la dans « Saisir un code de licence reçu » : elle s'active.
5. **Tarifs**
   - Dans Super admin > Licences, changez un prix et décochez « En vente » sur une durée.
   - La page d'achat affiche le nouveau prix, et la durée décochée n'y apparaît plus.
6. **Abus** : au-delà de 5 commandes en une heure pour le même PC, la commande est refusée.
7. **Tableau de bord général** : chaque vente, chaque refus et chaque nouvelle installation apparaissent dans l'activité récente et dans les compteurs.

## Passer aux vrais paiements

1. Ouvrez un compte marchand sur PayGate Global. Il faut les papiers de la société.
2. Mettez `PAYGATE_API_KEY=` avec votre clé, videz `PAYMENT_MODE`, puis redémarrez : `docker compose up -d`.
3. Faites un premier achat réel d'un petit montant. Créez par exemple un tarif temporaire à 100 FCFA, puis remettez-le.

Les adresses de l'API PayGate utilisées sont dans `src/modules/billing/paygate.ts` : `/api/v1/pay` et `/api/v2/status`. Vérifiez-les avec la documentation remise à l'ouverture du compte.
