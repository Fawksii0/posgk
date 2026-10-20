/* G&K Admin — display definitions and icons. Business data is loaded from the API. */

const ORDER_STATUSES = [
  { id: "nouvelle", label: "Nouvelle", tone: "gold" },
  { id: "confirmee", label: "Confirmée", tone: "blue" },
  { id: "preparation", label: "En préparation", tone: "orange" },
  { id: "prete", label: "Prête", tone: "violet" },
  { id: "en_route", label: "En route", tone: "teal" },
  { id: "livree", label: "Livrée", tone: "green" },
  { id: "annulee", label: "Annulée", tone: "red" },
  { id: "refusee", label: "Refusée", tone: "red" }
];
const STATUS_FLOW = ["nouvelle", "preparation", "prete", "en_route", "livree"];
const CANCEL_REASONS = ["Client injoignable", "Demande du client", "Rupture de produit", "Adresse hors zone", "Paiement refusé", "Autre"];

const ROLES = [
  { id: "cashier", label: "Caissier" },
  { id: "chef", label: "Chef" },
  { id: "waiter", label: "Serveur" },
  { id: "manager", label: "Manager" },
  { id: "admin", label: "Administrateur" },
  { id: "owner", label: "Propriétaire" }
];
const STAFF_ROLES = ["cashier", "chef", "waiter", "manager", "admin"];

const PERMISSION_MATRIX = [
  { label: "Suivre les commandes", roles: ["cashier", "chef", "waiter", "manager", "admin", "owner"] },
  { label: "Accepter et refuser les commandes", roles: ["cashier", "manager", "admin", "owner"] },
  { label: "Marquer les commandes prêtes", roles: ["cashier", "chef", "manager", "admin", "owner"] },
  { label: "Gérer menu, zones et promotions", roles: ["manager", "admin", "owner"] },
  { label: "Gérer les clients et livreurs", roles: ["manager", "admin", "owner"] },
  { label: "Gérer les utilisateurs et réglages", roles: ["admin", "owner"] },
  { label: "Consulter le journal d'activité", roles: ["admin", "owner"] }
];

const DAYS = [
  { id: "lun", label: "Lundi" }, { id: "mar", label: "Mardi" }, { id: "mer", label: "Mercredi" },
  { id: "jeu", label: "Jeudi" }, { id: "ven", label: "Vendredi" }, { id: "sam", label: "Samedi" },
  { id: "dim", label: "Dimanche" }
];

const iconPaths = {
  home: '<path d="M3 11.5 12 4l9 7.5"/><path d="M5.5 10v10h13V10"/><path d="M10 20v-5.5h4V20"/>',
  receipt: '<path d="M6 3.5h12v17l-3-2-3 2-3-2-3 2v-17Z"/><path d="M9 8.5h6M9 12.5h6"/>',
  invoice: '<path d="M7 3.5h7l4 4v13H7z"/><path d="M14 3.5v4h4M9.5 12h5M9.5 15.5h5"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4.5 20.5c0-3.8 3.4-6 7.5-6s7.5 2.2 7.5 6"/>',
  users: '<circle cx="9" cy="8.5" r="3.5"/><path d="M2.5 20c0-3.4 2.9-5.5 6.5-5.5s6.5 2.1 6.5 5.5"/><path d="M16 5.3a3.4 3.4 0 0 1 0 6.4M18 14.8c2.2.6 3.5 2.3 3.5 5.2"/>',
  pin: '<path d="M12 21s7-6 7-11.2a7 7 0 1 0-14 0C5 15 12 21 12 21Z"/><circle cx="12" cy="9.8" r="2.4"/>',
  chevronDown: '<path d="m6 9 6 6 6-6"/>',
  chevronRight: '<path d="m9 6 6 6-6 6"/>',
  chevronLeft: '<path d="m15 6-6 6 6 6"/>',
  bell: '<path d="M6 17V11a6 6 0 0 1 12 0v6l1.5 2h-15L6 17Z"/><path d="M10 21.5h4"/>',
  search: '<circle cx="11" cy="11" r="6.5"/><path d="m20 20-4.2-4.2"/>',
  clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  minus: '<path d="M5 12h14"/>',
  close: '<path d="m6 6 12 12M18 6 6 18"/>',
  check: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
  arrowRight: '<path d="M5 12h14M13 6l6 6-6 6"/>',
  star: '<path d="m12 3.5 2.6 5.4 5.9.8-4.3 4.2 1 5.9L12 16.9l-5.2 2.9 1-5.9-4.3-4.2 5.9-.8L12 3.5Z"/>',
  utensils: '<path d="M7 3v7.5M4 3v5a3 3 0 0 0 6 0V3M7 10.5V21"/><path d="M17 21V3c-2.2 1.4-3.5 4-3.5 7v3H17"/>',
  bike: '<circle cx="5.5" cy="16.5" r="3"/><circle cx="18.5" cy="16.5" r="3"/><path d="m5.5 16.5 3-7h5l2.5 7M8.5 9.5 7 6.5H5M13.5 9.5l-1-3H15"/>',
  map: '<path d="M9 4 3.5 6v14L9 18l6 2 5.5-2V4L15 6zM9 4v14M15 6v14"/>',
  card: '<rect x="3" y="5" width="18" height="14" rx="3"/><path d="M3 10h18M7 15h3"/>',
  cash: '<rect x="3" y="6.5" width="18" height="11" rx="2.5"/><circle cx="12" cy="12" r="2.5"/><path d="M6.5 12h.01M17.5 12h.01"/>',
  gift: '<rect x="3.5" y="8.5" width="17" height="4" rx="1"/><path d="M5 12.5v8h14v-8M12 8.5v12"/>',
  phone: '<path d="M5 4.5h4l1.5 4-2.2 1.4a11 11 0 0 0 5.8 5.8l1.4-2.2 4 1.5v4a2 2 0 0 1-2 2A15.5 15.5 0 0 1 3 6.5a2 2 0 0 1 2-2Z"/>',
  tag: '<path d="M3.5 12.5V4h8.5l8.5 8.5-8.5 8.5-8.5-8.5Z"/><circle cx="8" cy="8.5" r="1.2"/>',
  store: '<path d="M4 9.5 5.5 4h13L20 9.5"/><path d="M4 9.5a2.7 2.7 0 0 0 5.3 0 2.7 2.7 0 0 0 5.4 0 2.7 2.7 0 0 0 5.3 0"/><path d="M5.5 12.5V20h13v-7.5"/>',
  logout: '<path d="M10 4H5.5v16H10"/><path d="m15 8 4 4-4 4M19 12H9"/>',
  external: '<path d="M14 4h6v6M20 4l-9 9"/><path d="M18 14v5H5V6h5"/>',
  trash: '<path d="M4.5 7h15M9.5 7V4.5h5V7M6.5 7l1 13h9l1-13"/>',
  refresh: '<path d="M19.5 12a7.5 7.5 0 1 1-2.2-5.3M19.5 4.5v4h-4"/>',
  shield: '<path d="M12 3.5 5 6v5.5c0 4.2 2.8 7.4 7 9 4.2-1.6 7-4.8 7-9V6l-7-2.5Z"/><path d="m9 12 2.2 2.2L15.5 10"/>',
  grid: '<rect x="4" y="4" width="6.5" height="6.5" rx="1.5"/><rect x="13.5" y="4" width="6.5" height="6.5" rx="1.5"/><rect x="4" y="13.5" width="6.5" height="6.5" rx="1.5"/><rect x="13.5" y="13.5" width="6.5" height="6.5" rx="1.5"/>',
  menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
  edit: '<path d="M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16v4Z"/><path d="m13.5 6.5 4 4"/>',
  gear: '<circle cx="12" cy="12" r="3"/><path d="M12 3.5v2.2M12 18.3v2.2M3.5 12h2.2M18.3 12h2.2M6 6l1.6 1.6M16.4 16.4 18 18M18 6l-1.6 1.6M7.6 16.4 6 18"/>',
  printer: '<path d="M7 9V4h10v5"/><rect x="4" y="9" width="16" height="8" rx="2"/><path d="M7 14h10v6H7z"/>',
  alert: '<path d="M12 4 3 19.5h18L12 4Z"/><path d="M12 10v4.5M12 17h.01"/>',
  trend: '<path d="m4 16 5-5 4 4 7-8"/><path d="M15 7h5v5"/>',
  activity: '<path d="M3 12h4l2.5-6 4 12 2.5-6H21"/>',
  lock: '<rect x="5" y="10.5" width="14" height="10" rx="2.5"/><path d="M8 10.5V8a4 4 0 0 1 8 0v2.5"/>',
  key: '<circle cx="8" cy="15" r="3.5"/><path d="m10.5 12.5 8-8M15.5 7.5l2.5 2.5"/>',
  eye: '<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z"/><circle cx="12" cy="12" r="2.8"/>',
  ban: '<circle cx="12" cy="12" r="8.5"/><path d="m6 6 12 12"/>',
  box: '<path d="m12 3.5 8 4v9l-8 4-8-4v-9l8-4Z"/><path d="m4 7.5 8 4 8-4M12 11.5v9"/>'
};

function icon(name, { filled = false } = {}) {
  return `<svg class="ui-icon" viewBox="0 0 24 24" fill="${filled ? "currentColor" : "none"}" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${iconPaths[name] || ""}</svg>`;
}
