# G&K Admin

Interface d'administration des deux restaurants G&K, en français et en MAD. Le back-office utilise l'Edge Function Supabase ; chaque restaurant a son propre menu, ses commandes, ses livreurs, ses zones et ses réglages. Les administrateurs de plateforme et le propriétaire peuvent changer de restaurant depuis la barre supérieure ; les autres employés restent limités à leur restaurant.

## Démarrage local

Suivez les instructions Supabase dans [`api/README.md`](../api/README.md), puis depuis la racine du dépôt, servez les applications avec `python -m http.server 8800` et ouvrez `http://localhost:8800/GKAdmin/`.

La base ne contient aucun compte employé, menu, commande, livreur, client ou promotion de démonstration. Les deux fiches restaurants sont créées par la migration G&K, sans adresses ni données commerciales inventées. Configurez les détails de chaque restaurant, puis créez ses catégories, produits et zones de livraison. Les comptes du personnel utilisent Supabase Auth ; si un compte temporaire doit changer son mot de passe, GKAdmin bloque l'accès jusqu'à la modification réussie.

## API et sessions

Le client partagé `../shared/gk-api.js` est chargé avant les scripts de l'application. Sur `localhost` et `127.0.0.1`, il utilise l'Edge Function Supabase locale. Pour le déploiement, définissez `window.GK_SUPABASE_URL` ou `window.GK_API_URL` avec l'URL publique de l'Edge Function. La clé `service_role` ne doit jamais être placée dans le navigateur. Le sélecteur de restaurant est réservé aux comptes `admin` et `owner` globaux ; le serveur ignore toute tentative d'un employé lié à un restaurant de changer son périmètre.

Les écrans signalent explicitement le chargement, les erreurs API et les listes vides. Une erreur réseau ou d'autorisation n'est pas remplacée par des données locales.

## Propriétaire

L'accès propriétaire n'est pas lié dans la navigation. Créez le compte via la procédure d'amorçage Supabase documentée dans `api/README.md`, après avoir créé un administrateur et un manager. Configurez `OWNER_DOOR_KEY` comme secret d'Edge Function. Utilisez ensuite l'URL directe `http://localhost:8800/GKAdmin/?owner=1` (ou l'URL de déploiement correspondante). Le formulaire exige l'e-mail, le mot de passe et la clé d'accès. Cette clé n'est ni préremplie, ni persistée, ni conservée dans la session du navigateur. Ne la partagez pas et ne la commitez jamais.

Les comptes du personnel sont provisionnés par l'administrateur. L'API contrôle les rôles `admin`, `manager`, `cashier`, `chef`, `waiter` et `owner` sur chaque route ; l'interface adapte les écrans et actions aux permissions, mais l'autorisation effective reste côté serveur.

## Fichiers

- `data.js` — définitions statiques des statuts, rôles, permissions d'affichage et icônes.
- `store.js` — cache en mémoire et appels CRUD/actions API ; aucune persistance locale des données métier.
- `app.js` — vues, formulaires, tiroirs/modales et gestion des événements.
- `styles.css` — thème clair G&K et mise en page responsive.

Les URL des ressources de l'application incluent une version de cache `api-2`. Aucun service worker GKAdmin ni precache hors ligne n'est utilisé ; l'aide API partagée reste chargée avant les scripts de l'application pour que les opérations protégées restent connectées au serveur.
