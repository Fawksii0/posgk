# G&K Admin

Prototype front-end du back-office G&K Food (interface en français, devise MAD). Aucun build, aucun paquet : ouvrez `index.html` ou servez le dossier (`python -m http.server 8080`).

## Fichiers
- `data.js` — définitions (statuts, rôles, permissions), jeu d'icônes SVG, données de démo.
- `store.js` — état, persistance `localStorage` (`gk-admin-v1`), actions métier (renvoient `{ ok, errors }`, prêtes à être remplacées par des appels API), sélecteurs, journal d'activité.
- `app.js` — vues, tiroirs/modales, délégation d'événements.
- `styles.css` — thème clair G&K (or `#e3a81f`, DM Sans), responsive (barre latérale → tiroir sous 900 px, tableaux en cartes sous 700 px).

## Comptes de démo
| E-mail | Mot de passe | Rôle |
|---|---|---|
| admin@gk.com | admin123 | Administrateur (accès complet) |
| manager@gk.com | manager123 | Manager (pas d'accès à Utilisateurs/Réglages, suppression de produit interdite) |

Verrouillage de 30 s après 5 échecs. Les mots de passe sont seulement obfusqués (démo) ; une vraie authentification passera par une API.

Les comptes livreurs et personnel sont créés ici ; les clients s'inscrivent dans l'application.

## Notes
- Une « nouvelle commande » simulée arrive toutes les 60 s (toast + badge dans la barre latérale).
- Les données de démo sont générées relativement à la date du premier chargement ; « Réinitialiser les données de démo » (Réglages) les régénère à la date courante.
- Images produits : URLs Unsplash (repli sur l'emblème hors ligne).
