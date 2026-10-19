# G&K Cuisine

Application web de caisse et de cuisine (PWA, JavaScript vanilla, sans build). Les commandes, le menu, les réglages et les livreurs proviennent de l'Edge Function Supabase. Chaque compte caisse/cuisine est lié à un restaurant ; les données et actions restent isolées à ce restaurant. Aucune donnée de démonstration n'est créée dans le navigateur.

## Lancer en local

Suivez d'abord les étapes Supabase de [`../api/README.md`](../api/README.md). Démarrez la pile Supabase :

```powershell
supabase start
```

Dans un autre terminal, depuis la racine du dépôt, servez les fichiers des applications :

```powershell
python -m http.server 8800
```

Ouvrez `http://localhost:8800/GKCuisine/`. Le client API utilise l'Edge Function Supabase locale sur `localhost:54321`. Pour la production, définissez `window.GK_SUPABASE_URL` ou `window.GK_API_URL` avant le chargement de `../shared/gk-api.js`. Ne placez jamais la clé `service_role` dans le navigateur.

Les deux restaurants sont créés sans adresse ni données commerciales inventées. Aucun compte caisse/cuisine ni article de menu n'est préchargé. Créez les comptes `cashier` et `chef` pour le restaurant concerné et ajoutez ses catégories et produits dans GKAdmin. Les rôles utilisables dans GKCuisine sont `cashier` et `chef`. Si le serveur signale `mustChange`, l'accès reste bloqué jusqu'au changement du mot de passe. Le nom du restaurant associé au compte apparaît dans l'en-tête.

## Utilisation

- Les commandes sont rechargées depuis l'API pendant la session. Les actions accepter, refuser, modifier le temps, marquer prête, remettre au client, affecter/relancer un livreur et modifier les disponibilités sont exécutées côté serveur ; les transitions et permissions ne sont pas simulées localement.
- Les rôles `cashier` et `chef` sont affichés comme « Caissier » et « Cuisinier ». Les actions caisse sont réservées au caissier ; les deux rôles peuvent passer une commande en état « Prête » lorsque le serveur l'autorise.
- Les préférences sonores, largeur du papier, impression navigateur et nom de la dernière imprimante restent enregistrés localement. La session d'accès est gérée séparément par `GKApi`.
- Les erreurs API et états de chargement/absence de commandes sont affichés dans l'interface.

## Impression

Réglages → Imprimante. Impression **Web Bluetooth (BLE uniquement)** en ESC/POS : connectez l'imprimante, puis imprimez un ticket de test. Le ticket de commande est envoyé après acceptation. Largeur 58 mm (32 colonnes) ou 80 mm (48 colonnes).

- Les imprimantes **Bluetooth classique (SPP)** ne fonctionnent pas avec Web Bluetooth ; il faut un pont (application native ou service local).
- Web Bluetooth exige Chrome/Edge et **HTTPS ou localhost**.
- Si Bluetooth est indisponible, aucune imprimante n'est connectée, ou l'envoi BLE échoue, un aperçu du ticket avec impression navigateur est proposé. Une erreur d'impression ne défait pas l'acceptation de la commande.
- Les accents sont translittérés en ASCII. La reconnexion via `navigator.bluetooth.getDevices()` n'est possible que si le navigateur l'autorise.

## Limites

L'application exige l'API et une connexion réseau pour consulter les commandes et exécuter les actions ; elle n'offre ni commandes hors ligne ni mode démo. Le worker local ne fournit aucun compte staff, article ou commande tant que ceux-ci n'ont pas été créés. Le navigateur garde uniquement les préférences d'impression/son et ne remplace pas la persistance serveur.

## Fichiers

`index.html`, `styles.css`, `data.js` (icônes et libellés), `store.js` (session API et préférences locales), `escpos.js` (ticket + imprimante), `app.js`, `sw.js`, `manifest.webmanifest`.
