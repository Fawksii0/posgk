const REFUSE_REASONS = ["Rupture de stock", "Trop de commandes", "Table déjà partie", "Erreur de commande", "Autre"];

const STATUS_LABELS = {
  pending: "En attente", preparing: "Acceptée", ready: "Prête", delivered: "Servie",
  refused: "Refusée", cancelled: "Annulée"
};

const iconPaths = {
  close: '<path d="m6 6 12 12M18 6 6 18"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  minus: '<path d="M5 12h14"/>',
  check: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
  bell: '<path d="M6 17V11a6 6 0 0 1 12 0v6l1.5 2h-15L6 17Z"/><path d="M10 21.5h4"/>',
  utensils: '<path d="M7 3v7.5M4 3v5a3 3 0 0 0 6 0V3M7 10.5V21"/><path d="M17 21V3c-2.2 1.4-3.5 4-3.5 7v3H17"/>',
  clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 8v4.5l3 1.8"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4.5 20.5c0-3.8 3.4-6 7.5-6s7.5 2.2 7.5 6"/>',
  store: '<path d="M4 9.5 5.5 4h13L20 9.5"/><path d="M4 9.5a2.7 2.7 0 0 0 5.3 0 2.7 2.7 0 0 0 5.4 0 2.7 2.7 0 0 0 5.3 0"/><path d="M5.5 12.5V20h13v-7.5"/>',
  logout: '<path d="M10 4H5.5v16H10"/><path d="m15 8 4 4-4 4M19 12H9"/>',
  edit: '<path d="M4 20h4l10.5-10.5-4-4L4 16v4Z"/><path d="m14.5 5.5 4 4"/>',
  volume: '<path d="M4 9.5h3.5L12 6v12l-4.5-3.5H4v-5Z"/><path d="M15.5 9a4 4 0 0 1 0 6"/>',
  volumeOff: '<path d="M4 9.5h3.5L12 6v12l-4.5-3.5H4v-5Z"/><path d="m16 9.5 5 5M21 9.5l-5 5"/>',
  lock: '<rect x="5" y="10.5" width="14" height="9.5" rx="2.5"/><path d="M8 10.5V8a4 4 0 0 1 8 0v2.5"/>',
  alert: '<path d="M12 4 3 19.5h18L12 4Z"/><path d="M12 10v4.5M12 17h.01"/>'
};

function icon(name) {
  return `<svg class="ui-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${iconPaths[name] || ""}</svg>`;
}

function esc(value) {
  return String(value ?? "").replace(/[&<>"']/g, ch => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]));
}
