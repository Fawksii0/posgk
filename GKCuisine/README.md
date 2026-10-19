# G&K Cuisine

Écran cuisine / caisse de G&K Food (PWA hors-ligne, JS vanilla, sans build). Il reçoit les commandes de **GKMobile** (client) via le bus partagé `shared/gk-bus.js`, les accepte, imprime le ticket et distribue les livraisons aux livreurs de **GKCourier**.

## Lancer (liaison Client → Cuisine → Livreur)

Les trois applications partagent leur état uniquement si elles sont servies depuis **une seule origine**, avec la racine du dépôt comme racine web :

```
cd C:\Users\admin\Desktop\POSGKAPP
python -m http.server 8800
```

Puis ouvrir `http://localhost:8800/GKMobile/`, `/GKCuisine/` et `/GKCourier/` (onglets ou fenêtres du même navigateur).

En `file://` chaque page a son propre stockage : les applications retombent sur leur comportement autonome et affichent « Mode démo hors liaison ».

## Comptes démo

| Rôle | E-mail | Mot de passe | Droits |
|---|---|---|---|
| Caissier | caissier@gk.com | caisse123 | tout (accepter, refuser, imprimer, réglages, stock) |
| Cuisinier | chef@gk.com | chef123 | voir et passer en « Prête », stock, son |

5 échecs de connexion → blocage 30 s. La session est conservée (`gk-cuisine-v1`).

## Écrans

- **Commandes** : colonnes Nouvelles (alerte sonore, carte clignotante, compteur dans le titre), En préparation, Prêtes, En livraison / Terminées. Sur petit écran, une seule colonne à la fois (onglets).
- **Historique** du jour avec filtres, **Stock** (plat épuisé → grisé côté client), **Réglages**.
- Accepter : temps de préparation (− / + par 5 min, 5–90, 20 par défaut), ajustable ensuite ; ticket imprimé automatiquement ; offre au livreur (livraison).
- Refuser : motif transmis au client.

## Affectation des livreurs

Réglages → Rotation (livreur suivant, en sautant les hors-ligne/occupés) ou Proximité (en ligne et libre le plus proche, Haversine depuis Bouznika 33.7895, -7.1597). L'offre va à **un** livreur à la fois pendant 60 s ; refus ou délai → suivant ; aucun → « Aucun livreur — assigner manuellement ».

Livreurs démo (PIN 1234) : Youssef 0612345678, Karim 0623456789, Salma 0634567890.

## Impression

Réglages → Imprimante. Impression **Web Bluetooth (BLE uniquement)** en ESC/POS : « Connecter une imprimante Bluetooth », puis « Imprimer un ticket de test ». Largeur 58 mm (32 colonnes) ou 80 mm (48 colonnes).

- Les imprimantes **Bluetooth classique (SPP)** ne fonctionnent **pas** avec Web Bluetooth : il faut un pont (application native ou service local).
- Web Bluetooth exige Chrome/Edge et **https ou localhost**.
- Sans imprimante, sans Web Bluetooth ou en cas d'échec d'écriture, un aperçu du ticket (80 mm) s'affiche avec un bouton « Imprimer » (`window.print()`, CSS d'impression limité au ticket). L'acceptation d'une commande n'est jamais bloquée par l'impression.
- Les accents sont translittérés en ASCII (compatible avec toutes les pages de code).
- Reconnexion automatique via `navigator.bluetooth.getDevices()` quand le navigateur le propose.

## Fichiers

`index.html`, `styles.css`, `data.js` (icônes, menu), `store.js` (session, sélecteurs), `escpos.js` (ticket + imprimante), `app.js`, `sw.js`, `manifest.webmanifest`, `../shared/gk-bus.js`.
