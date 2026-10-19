const MENU = [
  { id: "classic", name: "Le Classique G&K", category: "Burgers", price: 55, size: "Simple" },
  { id: "chicken", name: "Crispy Chicken", category: "Burgers", price: 48, size: "Simple" },
  { id: "pizza", name: "Pizza G&K", category: "Plats", price: 62, size: "Moyenne 10″" },
  { id: "fries", name: "Frites Maison", category: "Accompagnements", price: 20, size: "Moyenne" },
  { id: "gelato", name: "Gelato Pistache", category: "Gelato", price: 28, size: "2 boules" },
  { id: "lemonade", name: "Citronnade fraîche", category: "Boissons", price: 18, size: "33 cl" }
];

const REFUSE_REASONS = ["Rupture de stock", "Trop de commandes", "Restaurant fermé", "Adresse hors zone", "Autre"];

const STATUS_LABELS = {
  pending: "En attente", preparing: "En préparation", ready: "Prête", enroute: "En route",
  delivered: "Terminée", refused: "Refusée", cancelled: "Annulée"
};

const ZONE_NAMES = { centre: "Centre-ville", corniche: "Corniche & Plage", peripherie: "Périphérie" };

const iconPaths = {
  home: '<path d="M3 11.5 12 4l9 7.5"/><path d="M5.5 10v10h13V10"/><path d="M10 20v-5.5h4V20"/>',
  receipt: '<path d="M6 3.5h12v17l-3-2-3 2-3-2-3 2v-17Z"/><path d="M9 8.5h6M9 12.5h6"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4.5 20.5c0-3.8 3.4-6 7.5-6s7.5 2.2 7.5 6"/>',
  pin: '<path d="M12 21s7-6 7-11.2a7 7 0 1 0-14 0C5 15 12 21 12 21Z"/><circle cx="12" cy="9.8" r="2.4"/>',
  clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  minus: '<path d="M5 12h14"/>',
  close: '<path d="m6 6 12 12M18 6 6 18"/>',
  check: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
  arrowRight: '<path d="M5 12h14M13 6l6 6-6 6"/>',
  utensils: '<path d="M7 3v7.5M4 3v5a3 3 0 0 0 6 0V3M7 10.5V21"/><path d="M17 21V3c-2.2 1.4-3.5 4-3.5 7v3H17"/>',
  bike: '<circle cx="5.5" cy="16.5" r="3"/><circle cx="18.5" cy="16.5" r="3"/><path d="m5.5 16.5 3-7h5l2.5 7M8.5 9.5 7 6.5H5M13.5 9.5l-1-3H15"/>',
  card: '<rect x="3" y="5" width="18" height="14" rx="3"/><path d="M3 10h18M7 15h3"/>',
  cash: '<rect x="3" y="6.5" width="18" height="11" rx="2.5"/><circle cx="12" cy="12" r="2.5"/><path d="M6.5 12h.01M17.5 12h.01"/>',
  phone: '<path d="M5 4.5h4l1.5 4-2.2 1.4a11 11 0 0 0 5.8 5.8l1.4-2.2 4 1.5v4a2 2 0 0 1-2 2A15.5 15.5 0 0 1 3 6.5a2 2 0 0 1 2-2Z"/>',
  store: '<path d="M4 9.5 5.5 4h13L20 9.5"/><path d="M4 9.5a2.7 2.7 0 0 0 5.3 0 2.7 2.7 0 0 0 5.4 0 2.7 2.7 0 0 0 5.3 0"/><path d="M5.5 12.5V20h13v-7.5"/>',
  logout: '<path d="M10 4H5.5v16H10"/><path d="m15 8 4 4-4 4M19 12H9"/>',
  refresh: '<path d="M19.5 12a7.5 7.5 0 1 1-2.2-5.3M19.5 4.5v4h-4"/>',
  lock: '<rect x="5" y="10.5" width="14" height="9.5" rx="2.5"/><path d="M8 10.5V8a4 4 0 0 1 8 0v2.5"/>',
  alert: '<path d="M12 4 3 19.5h18L12 4Z"/><path d="M12 10v4.5M12 17h.01"/>',
  bell: '<path d="M6 17V11a6 6 0 0 1 12 0v6l1.5 2h-15L6 17Z"/><path d="M10 21.5h4"/>',
  printer: '<path d="M7 9V4h10v5"/><rect x="4" y="9" width="16" height="8" rx="2"/><path d="M7 14h10v6H7z"/>',
  bluetooth: '<path d="m7 7.5 10 9-5 4.5V3l5 4.5-10 9"/>',
  volume: '<path d="M4 9.5h3.5L12 6v12l-4.5-3.5H4v-5Z"/><path d="M15.5 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11"/>',
  volumeOff: '<path d="M4 9.5h3.5L12 6v12l-4.5-3.5H4v-5Z"/><path d="m16 9.5 5 5M21 9.5l-5 5"/>',
  pause: '<path d="M8 5v14M16 5v14"/>',
  history: '<path d="M4 12a8 8 0 1 0 2.5-5.8M4 4.5v4h4"/><path d="M12 8v4.5l3 1.5"/>',
  box: '<path d="m12 3.5 8 4v9l-8 4-8-4v-9l8-4Z"/><path d="m4 7.5 8 4 8-4M12 11.5v9"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M12 3.5v2.5M12 18v2.5M3.5 12H6M18 12h2.5M6 6l1.8 1.8M16.2 16.2 18 18M6 18l1.8-1.8M16.2 7.8 18 6"/>',
  flame: '<path d="M12 21c-3.9 0-6.5-2.6-6.5-6 0-3.2 2.5-4.7 3.5-8 1.7 1 2.6 2.4 3 4 1-.8 1.5-2 1.5-3.5 2.2 2 4 4.4 4 7.5 0 3.4-2.6 6-5.5 6Z"/>',
  wifi: '<path d="M3.5 9.5a12 12 0 0 1 17 0M6.5 12.8a7.7 7.7 0 0 1 11 0M9.5 16a3.4 3.4 0 0 1 5 0"/><path d="M12 19.5h.01"/>',
  list: '<path d="M8 6.5h12M8 12h12M8 17.5h12"/><path d="M4 6.5h.01M4 12h.01M4 17.5h.01"/>',
  shield: '<path d="M12 3.5 5 6v5.5c0 4.2 2.8 7.4 7 9 4.2-1.6 7-4.8 7-9V6l-7-2.5Z"/><path d="m9 12 2.2 2.2L15.5 10"/>'
};

function icon(name) {
  return `<svg class="ui-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${iconPaths[name]}</svg>`;
}

function esc(value) {
  return String(value ?? "").replace(/[&<>"']/g, ch => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch]);
}
