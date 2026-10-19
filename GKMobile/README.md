# G&K Food Mobile

A standalone, front-end ordering-app prototype for G&K Food (in French). The layout follows the supplied Food Delivery UI kit, with the kit's orange replaced by G&K gold. No build step is needed.

## Preview

- Quickest: open `index.html` in a browser (everything works except the service worker / install).
- Full PWA (offline cache, install prompt): serve the folder over http, e.g. `python -m http.server 8765` from `GKMobile/`, then open `http://localhost:8765`.

## Features

- **Onboarding and account**: 3 intro slides, sign up or log in with a Moroccan phone number, demo OTP code `1234`, guest browsing (login is required at checkout).
- **Browsing**: home feed, Explorer, search, categories, favorites, dish sheet with size, supplements and quantity.
- **Cart and checkout**: delivery or pickup, saved addresses with zones (fee, minimum order and ETA per zone, free delivery from 150 MAD), payment methods (cash or card with Luhn, expiry and CVC validation; only brand and last 4 digits are kept), promo `GKBONJOUR`.
- **Orders**: live tracking (map with moving courier, ETA, timeline), cancel while the order is still being confirmed or prepared, reorder with the same options. Demo speed: one stage every 25 seconds.
- **Notifications**, **loyalty** (1 point per 10 MAD, rewards at 500 / 1000 / 2000), **support** (call, WhatsApp).
- Courier and admin accounts live in separate apps (`../GKCourier`, `../GKAdmin`); clients only ever see this one.
- **PWA**: web manifest, icons, offline shell cache, install item in Profile when the browser offers it.
- **Persistence**: everything is stored in `localStorage` (`gk-mobile-v1`). Profile → "Réinitialiser les données de démo" clears it.

Still to come: POS synchronisation (orders are not sent anywhere yet), real payments and SMS, dark mode.

## Project structure

- `index.html` — app shell
- `styles.css` — light layout with the G&K gold accent
- `data.js` — menu, delivery zones, categories, SVG icon set
- `store.js` — state, persistence, pricing and order helpers
- `app.js` — views, interactions and the order simulation
- `manifest.webmanifest`, `sw.js`, `icons/` — PWA files
- `assets/` — supplied emblem and monogram references
- `references/` — supplied mobile app design concept board

## Liaison Client → Cuisine → Livreur

La commande est publiée sur le bus partagé `../shared/gk-bus.js` (clé `gk-bus-v1`) avec le statut `pending`. Le suivi reflète ensuite les statuts réels envoyés par **G&K Cuisine** et **GKCourier** : En attente → En préparation → Prête → En route → Livrée, plus Refusée (avec motif) et Annulée (possible uniquement en attente). L'heure estimée suit le temps de préparation ajusté en cuisine. Les plats marqués « Épuisé » sont grisés et la « Pause des commandes » bloque la validation du panier.

Pour que les trois applications partagent leur état, servez la **racine du dépôt** depuis une seule origine :

```
python -m http.server 8800
```

puis ouvrez `/GKMobile/`, `/GKCuisine/` et `/GKCourier/` sur `http://localhost:8800`. En `file://` (ou si la cuisine n'est pas détectée), l'application revient au minuteur de démonstration de 25 s (note « Mode démo hors liaison »).

## Inspiration

- [Food Delivery Mobile App Figma UI Kit Design](https://insightlancer.gumroad.com/l/food-delivery-mobile-app-ui-kit-figma-design)
- [Food Delivery App UIUX Design on Behance](https://www.behance.net/gallery/246669901/Food-Delivery-App-UIUX-Design-Food-Ordering-App-UI)
