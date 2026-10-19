# G&K Livreur (prototype)

PWA mobile pour les livreurs G&K Food. Interface 100 % française, devise MAD. Prototype front-end : aucune API, tout est stocké dans `localStorage` (clé `gk-courier-v1`) avec des données de démo.

## Lancer

Ouvrir `index.html` directement, ou (pour le service worker / l'installation PWA) :

```powershell
cd GKCourier
python -m http.server 8080
```

puis http://localhost:8080.

## Démo

- Connexion : `0612345678` / PIN `1234` (5 erreurs = blocage 30 s). Les comptes sont créés par l'administrateur.
- Passer **En ligne** → 3 missions, une nouvelle environ toutes les 45 s (max 5).
- Une seule mission active : Accepter → Arrivé au restaurant → Commande récupérée → En route → Livré (code client `4321`, case « Espèces encaissées » pour les paiements cash).
- « Signaler un problème » annule la mission avec un motif.
- Onglets : Missions, Historique (Aujourd'hui / Semaine / Tout), Gains (graphique 7 jours, espèces à reverser, versements), Profil (réinitialisation des données, installation).

## Liaison avec G&K Cuisine et le client

Lorsque le dépôt est servi depuis une seule origine (`python -m http.server 8800` à la racine, puis `/GKMobile/`, `/GKCuisine/`, `/GKCourier/`), l'application lit et écrit le bus partagé `../shared/gk-bus.js` :

- Comptes livreurs : Youssef `0612345678`, Karim `0623456789`, Salma `0634567890` (PIN `1234`). Le bouton En ligne/Hors ligne écrit dans le bus.
- Seules les missions **offertes ou assignées au livreur connecté** sont affichées. Une offre dure 60 s (Accepter / Refuser) ; un refus ou une expiration passe au livreur suivant.
- Notifications : commande acceptée par la cuisine (partir vers le restaurant), puis commande prête.
- « Commande récupérée » reste désactivé tant que la cuisine n'a pas marqué la commande prête. Chaque étape (arrivé, récupérée → « En route » côté client, livrée avec le code `4321`) est écrite dans le bus.
- En `file://`, le comportement autonome (missions simulées) est conservé, avec la note « Mode démo hors liaison ».

## Fichiers

`index.html`, `styles.css`, `data.js` (constantes, icônes), `store.js` (état + persistance), `app.js` (vues/événements), `sw.js`, `manifest.webmanifest`. Scripts classiques (`defer`), sans build ni dépendance.
