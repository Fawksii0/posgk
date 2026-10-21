const iconPaths = {
  home: '<path d="M3 11.5 12 4l9 7.5"/><path d="M5.5 10v10h13V10"/><path d="M10 20v-5.5h4V20"/>',
  list: '<path d="M8 6.5h12M8 12h12M8 17.5h12"/><path d="M4 6.5h.01M4 12h.01M4 17.5h.01"/>',
  receipt: '<path d="M6 3.5h12v17l-3-2-3 2-3-2-3 2v-17Z"/><path d="M9 8.5h6M9 12.5h6"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4.5 20.5c0-3.8 3.4-6 7.5-6s7.5 2.2 7.5 6"/>',
  pin: '<path d="M12 21s7-6 7-11.2a7 7 0 1 0-14 0C5 15 12 21 12 21Z"/><circle cx="12" cy="9.8" r="2.4"/>',
  chevronRight: '<path d="m9 6 6 6-6 6"/>',
  bell: '<path d="M6 17V11a6 6 0 0 1 12 0v6l1.5 2h-15L6 17Z"/><path d="M10 21.5h4"/>',
  clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
  close: '<path d="m6 6 12 12M18 6 6 18"/>',
  check: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
  arrowRight: '<path d="M5 12h14M13 6l6 6-6 6"/>',
  bike: '<circle cx="5.5" cy="16.5" r="3"/><circle cx="18.5" cy="16.5" r="3"/><path d="m5.5 16.5 3-7h5l2.5 7M8.5 9.5 7 6.5H5M13.5 9.5l-1-3H15"/>',
  cash: '<rect x="3" y="6.5" width="18" height="11" rx="2.5"/><circle cx="12" cy="12" r="2.5"/><path d="M6.5 12h.01M17.5 12h.01"/>',
  card: '<rect x="3" y="5" width="18" height="14" rx="3"/><path d="M3 10h18M7 15h3"/>',
  help: '<circle cx="12" cy="12" r="8.5"/><path d="M9.7 9.6a2.4 2.4 0 1 1 3.4 2.2c-.7.4-1.1.9-1.1 1.7M12 16.8h.01"/>',
  phone: '<path d="M5 4.5h4l1.5 4-2.2 1.4a11 11 0 0 0 5.8 5.8l1.4-2.2 4 1.5v4a2 2 0 0 1-2 2A15.5 15.5 0 0 1 3 6.5a2 2 0 0 1 2-2Z"/>',
  chat: '<path d="M4 5.5h16v11H10l-4.5 3.5v-3.5H4v-11Z"/><path d="M8 10h8M8 13h5"/>',
  store: '<path d="M4 9.5 5.5 4h13L20 9.5"/><path d="M4 9.5a2.7 2.7 0 0 0 5.3 0 2.7 2.7 0 0 0 5.4 0 2.7 2.7 0 0 0 5.3 0"/><path d="M5.5 12.5V20h13v-7.5"/>',
  navigate: '<path d="m20 4-7 16-2.5-7.5L3 10l17-6Z"/>',
  logout: '<path d="M10 4H5.5v16H10"/><path d="m15 8 4 4-4 4M19 12H9"/>',
  download: '<path d="M12 4v11M7.5 11 12 15.5 16.5 11M5 20h14"/>',
  refresh: '<path d="M19.5 12a7.5 7.5 0 1 1-2.2-5.3M19.5 4.5v4h-4"/>',
  shield: '<path d="M12 3.5 5 6v5.5c0 4.2 2.8 7.4 7 9 4.2-1.6 7-4.8 7-9V6l-7-2.5Z"/><path d="m9 12 2.2 2.2L15.5 10"/>',
  wallet: '<path d="M4 7.5A2.5 2.5 0 0 1 6.5 5H18v3"/><rect x="4" y="8" width="16" height="11.5" rx="2.5"/><path d="M16 13.8h.01"/>',
  star: '<path d="m12 3.5 2.6 5.4 5.9.8-4.3 4.2 1 5.9L12 16.9l-5.2 2.9 1-5.9-4.3-4.2 5.9-.8L12 3.5Z"/>',
  package: '<path d="m12 3.5 8 4v9l-8 4-8-4v-9l8-4Z"/><path d="m4 7.5 8 4 8-4M12 11.5v9"/>',
  lock: '<rect x="5" y="10.5" width="14" height="9.5" rx="2.5"/><path d="M8 10.5V8a4 4 0 0 1 8 0v2.5"/>',
  alert: '<path d="M12 4 3 19.5h18L12 4Z"/><path d="M12 10v4.5M12 17h.01"/>'
};

function icon(name) {
  return `<svg class="ui-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${iconPaths[name]}</svg>`;
}

function esc(value) {
  return String(value ?? "").replace(/[&<>"']/g, ch => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch]);
}
