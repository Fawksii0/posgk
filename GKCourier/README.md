# G&K Livreur

PWA française destinée aux livreurs G&K. L'application se connecte à l'Edge Function Supabase via `window.GKApi` avec la portée de session `courier`. Chaque livreur appartient à un seul restaurant ; les offres et commandes sont limitées à ce restaurant. Aucune mission, commande, statistique ou donnée client de démonstration n'est créée localement.

## Configuration de l'API

`shared/gk-api.js` utilise automatiquement l'Edge Function Supabase locale sur le port `54321` lorsque l'application est servie depuis `localhost` ou `127.0.0.1`. Pour un autre environnement, définissez `window.GK_SUPABASE_URL` ou `window.GK_API_URL` avant le chargement de `shared/gk-api.js`. N'ajoutez jamais la clé `service_role` au front-end.

Suivez les instructions Supabase de [`api/README.md`](../api/README.md). Pour un test local, démarrez la pile Supabase puis servez le dépôt sur une origine HTTP :

```powershell
supabase start
python -m http.server 8800
```

Ouvrez ensuite `http://localhost:8800/GKCourier/`. Les permissions de géolocalisation nécessitent une origine sécurisée (HTTPS ou localhost).

## Connexion et missions

Il n'existe pas de compte livreur ni de code PIN de démonstration. Les comptes sont provisionnés par un administrateur G&K pour un restaurant précis ; le nom du restaurant est affiché dans l'en-tête. Utilisez le téléphone et le PIN fournis. Si le serveur marque le PIN comme temporaire, l'application impose son remplacement par un nouveau PIN avant d'afficher les missions. L'application récupère les offres et commandes affectées, interroge périodiquement l'API pendant la session et transmet la position uniquement après le passage en ligne et l'autorisation de géolocalisation.

Le suivi utilise les étapes serveur : arrivée au restaurant, récupération de la commande, puis livraison. La livraison est confirmée par le code réel fourni au client et vérifié par l'API. L'historique et les gains reflètent uniquement les livraisons enregistrées sur le serveur.

## Fichiers

`index.html`, `styles.css`, `data.js` (icônes), `store.js` (état et intégration API), `app.js` (vues et événements), `sw.js` et `manifest.webmanifest`. Scripts classiques, sans build ni dépendance propre à GKCourier.
