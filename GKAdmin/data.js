/* G&K Admin — static definitions, icons and demo seed data. */

const STORAGE_KEY = "gk-admin-v1";

const ORDER_STATUSES = [
  { id: "nouvelle", label: "Nouvelle", tone: "gold" },
  { id: "confirmee", label: "Confirmée", tone: "blue" },
  { id: "preparation", label: "En préparation", tone: "orange" },
  { id: "prete", label: "Prête", tone: "violet" },
  { id: "en_route", label: "En route", tone: "teal" },
  { id: "livree", label: "Livrée", tone: "green" },
  { id: "annulee", label: "Annulée", tone: "red" }
];
const STATUS_FLOW = ["nouvelle", "confirmee", "preparation", "prete", "en_route", "livree"];
const CANCEL_REASONS = ["Client injoignable", "Demande du client", "Rupture de produit", "Adresse hors zone", "Paiement refusé", "Autre"];

const ROLES = [
  { id: "client", label: "Client" },
  { id: "livreur", label: "Livreur" },
  { id: "caissier", label: "Caissier" },
  { id: "serveur", label: "Serveur" },
  { id: "manager", label: "Manager" },
  { id: "admin", label: "Administrateur" }
];
const STAFF_ROLES = ["admin", "manager", "caissier", "serveur"];

// Back-office permissions per role (only admin/manager can sign in to this console).
const ROLE_PERMISSIONS = {
  admin: ["users", "settings", "deleteProduct"],
  manager: [],
  caissier: [],
  serveur: []
};

const PERMISSION_MATRIX = [
  { label: "Commander via l'application", roles: ["client"] },
  { label: "Prendre des commandes en salle / caisse", roles: ["caissier", "serveur", "manager", "admin"] },
  { label: "Encaisser les paiements", roles: ["caissier", "manager", "admin"] },
  { label: "Livrer et encaisser en espèces", roles: ["livreur"] },
  { label: "Suivre et traiter les commandes", roles: ["manager", "admin"] },
  { label: "Gérer menu, clients, zones et promotions", roles: ["manager", "admin"] },
  { label: "Consulter l'activité", roles: ["manager", "admin"] },
  { label: "Supprimer un produit", roles: ["admin"] },
  { label: "Gérer utilisateurs et réglages", roles: ["admin"] }
];

const DAYS = [
  { id: "lun", label: "Lundi" }, { id: "mar", label: "Mardi" }, { id: "mer", label: "Mercredi" },
  { id: "jeu", label: "Jeudi" }, { id: "ven", label: "Vendredi" }, { id: "sam", label: "Samedi" },
  { id: "dim", label: "Dimanche" }
];

const img = (id, w = 400) => `https://images.unsplash.com/${id}?auto=format&fit=crop&w=${w}&q=80`;

const iconPaths = {
  home: '<path d="M3 11.5 12 4l9 7.5"/><path d="M5.5 10v10h13V10"/><path d="M10 20v-5.5h4V20"/>',
  receipt: '<path d="M6 3.5h12v17l-3-2-3 2-3-2-3 2v-17Z"/><path d="M9 8.5h6M9 12.5h6"/>',
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
  card: '<rect x="3" y="5" width="18" height="14" rx="3"/><path d="M3 10h18M7 15h3"/>',
  cash: '<rect x="3" y="6.5" width="18" height="11" rx="2.5"/><circle cx="12" cy="12" r="2.5"/><path d="M6.5 12h.01M17.5 12h.01"/>',
  gift: '<rect x="3.5" y="8.5" width="17" height="4" rx="1"/><path d="M5 12.5v8h14v-8M12 8.5v12"/><path d="M12 8.5C9.5 8.5 8.5 4.5 11 4.5c1.6 0 1 4 1 4Zm0 0c2.5 0 3.5-4 1-4-1.6 0-1 4-1 4Z"/>',
  phone: '<path d="M5 4.5h4l1.5 4-2.2 1.4a11 11 0 0 0 5.8 5.8l1.4-2.2 4 1.5v4a2 2 0 0 1-2 2A15.5 15.5 0 0 1 3 6.5a2 2 0 0 1 2-2Z"/>',
  tag: '<path d="M3.5 12.5V4h8.5l8.5 8.5-8.5 8.5-8.5-8.5Z"/><circle cx="8" cy="8.5" r="1.2"/>',
  store: '<path d="M4 9.5 5.5 4h13L20 9.5"/><path d="M4 9.5a2.7 2.7 0 0 0 5.3 0 2.7 2.7 0 0 0 5.4 0 2.7 2.7 0 0 0 5.3 0"/><path d="M5.5 12.5V20h13v-7.5"/>',
  logout: '<path d="M10 4H5.5v16H10"/><path d="m15 8 4 4-4 4M19 12H9"/>',
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

/* ---------- Seed data ---------- */

function mulberry32(seed) {
  return function () {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Not secure: demo-only obfuscation so passwords are not stored as plain text.
function hashPassword(value) {
  let h = 5381;
  for (let i = 0; i < value.length; i++) h = ((h << 5) + h + value.charCodeAt(i)) | 0;
  return "h" + (h >>> 0).toString(16);
}

const MIN = 60000;

function seedCategories() {
  return [
    { id: "burgers", name: "Burgers", icon: "utensils" },
    { id: "plats", name: "Plats", icon: "utensils" },
    { id: "accompagnements", name: "Accompagnements", icon: "box" },
    { id: "gelato", name: "Gelato", icon: "gift" },
    { id: "boissons", name: "Boissons", icon: "store" }
  ];
}

function seedProducts() {
  const burgerSizes = [{ name: "Simple", delta: 0 }, { name: "Double", delta: 18 }, { name: "XL", delta: 26 }];
  return [
    { id: "classic", name: "Le Classique G&K", category: "burgers", price: 55, discount: 20, available: true, visible: true, image: img("photo-1568901346375-23c9450c58cd"), description: "Burger smash de bœuf, cheddar fondant, salade croquante et sauce maison.", sizes: burgerSizes, extras: [{ name: "Cheddar", price: 6 }, { name: "Bacon croustillant", price: 8 }, { name: "Sauce maison", price: 4 }] },
    { id: "chicken", name: "Crispy Chicken", category: "burgers", price: 48, discount: 10, available: true, visible: true, image: img("photo-1606755962773-d324e0a13086"), description: "Poulet croustillant, coleslaw et sauce légèrement épicée.", sizes: [{ name: "Simple", delta: 0 }, { name: "Double", delta: 16 }], extras: [{ name: "Cheddar", price: 6 }, { name: "Sauce épicée", price: 4 }] },
    { id: "bbq", name: "Smoky BBQ", category: "burgers", price: 58, discount: 0, available: true, visible: true, image: img("photo-1572802419224-296b0aeee0d9"), description: "Bœuf fumé, oignons caramélisés, sauce barbecue.", sizes: burgerSizes, extras: [{ name: "Bacon croustillant", price: 8 }] },
    { id: "pizza", name: "Pizza G&K", category: "plats", price: 62, discount: 20, available: true, visible: true, image: img("photo-1513104890138-7c749659a591"), description: "Pâte fine, mozzarella, tomates confites et basilic.", sizes: [{ name: "Petite 8″", delta: 0 }, { name: "Moyenne 10″", delta: 14 }, { name: "Grande 12″", delta: 26 }], extras: [{ name: "Extra mozzarella", price: 8 }, { name: "Olives", price: 5 }] },
    { id: "pizza-4f", name: "Pizza 4 fromages", category: "plats", price: 68, discount: 0, available: true, visible: true, image: img("photo-1565299624946-b28f40a0ae38"), description: "Mozzarella, chèvre, bleu et parmesan.", sizes: [{ name: "Moyenne 10″", delta: 0 }, { name: "Grande 12″", delta: 14 }], extras: [{ name: "Miel", price: 4 }] },
    { id: "bowl", name: "Bowl Healthy", category: "plats", price: 52, discount: 0, available: false, visible: true, image: img("photo-1546069901-ba9599a7e63c"), description: "Quinoa, avocat, poulet grillé et légumes de saison.", sizes: [], extras: [{ name: "Avocat", price: 7 }] },
    { id: "fries", name: "Frites Maison", category: "accompagnements", price: 20, discount: 0, available: true, visible: true, image: img("photo-1573080496219-bb080dd4f877"), description: "Pommes de terre dorées, persil frais et fleur de sel.", sizes: [{ name: "Petite", delta: 0 }, { name: "Moyenne", delta: 5 }, { name: "Grande", delta: 10 }], extras: [{ name: "Sauce cheddar", price: 6 }, { name: "Sauce maison", price: 4 }] },
    { id: "nuggets", name: "Nuggets x8", category: "accompagnements", price: 32, discount: 0, available: true, visible: true, image: img("photo-1562967914-608f82629710"), description: "Huit nuggets de poulet croustillants et deux sauces.", sizes: [], extras: [{ name: "Sauce miel-moutarde", price: 3 }] },
    { id: "gelato", name: "Gelato Pistache", category: "gelato", price: 28, discount: 0, available: true, visible: true, image: img("photo-1563805042-7684c019e1cb"), description: "Glace artisanale à la pistache, préparée chaque jour.", sizes: [{ name: "1 boule", delta: 0 }, { name: "2 boules", delta: 10 }, { name: "3 boules", delta: 20 }], extras: [{ name: "Éclats de pistache", price: 5 }, { name: "Chantilly", price: 4 }] },
    { id: "gelato-ch", name: "Gelato Chocolat", category: "gelato", price: 26, discount: 0, available: true, visible: true, image: img("photo-1501443762994-82bd5dace89a"), description: "Chocolat noir intense, texture crémeuse.", sizes: [{ name: "1 boule", delta: 0 }, { name: "2 boules", delta: 10 }], extras: [{ name: "Chantilly", price: 4 }] },
    { id: "lemonade", name: "Citronnade fraîche", category: "boissons", price: 18, discount: 0, available: true, visible: true, image: img("photo-1513558161293-cdaf765ed2fd"), description: "Citrons frais pressés, menthe et juste ce qu'il faut de sucre.", sizes: [{ name: "33 cl", delta: 0 }, { name: "50 cl", delta: 5 }], extras: [{ name: "Extra menthe", price: 3 }] },
    { id: "icedtea", name: "Thé glacé pêche", category: "boissons", price: 16, discount: 0, available: true, visible: false, image: img("photo-1499638673689-79a0b5115d87"), description: "Thé noir infusé à froid, pêche blanche.", sizes: [], extras: [] }
  ];
}

function seedZones() {
  return [
    { id: "centre", name: "Centre-ville", fee: 10, min: 0, etaMin: 25, etaMax: 35, freeFrom: 150, enabled: true },
    { id: "corniche", name: "Corniche & Plage", fee: 15, min: 40, etaMin: 30, etaMax: 40, freeFrom: 150, enabled: true },
    { id: "peripherie", name: "Périphérie", fee: 25, min: 80, etaMin: 40, etaMax: 55, freeFrom: 150, enabled: true }
  ];
}

function seedPromos(now) {
  const day = 86400000;
  const date = (offset) => new Date(now + offset * day).toISOString().slice(0, 10);
  return [
    { id: "p1", code: "GKBONJOUR", type: "mad", value: 10, min: 0, expiry: date(90), uses: 128, active: true },
    { id: "p2", code: "BURGER20", type: "pct", value: 20, min: 60, expiry: date(21), uses: 46, active: true },
    { id: "p3", code: "RAMADAN15", type: "pct", value: 15, min: 100, expiry: date(-30), uses: 212, active: false }
  ];
}

function seedUsers() {
  return [
    { id: "u1", name: "Salma Berrada", email: "admin@gk.com", role: "admin", pass: hashPassword("admin123"), active: true },
    { id: "u2", name: "Omar Fassi", email: "manager@gk.com", role: "manager", pass: hashPassword("manager123"), active: true },
    { id: "u3", name: "Nadia Chraibi", email: "caisse@gk.com", role: "caissier", pass: hashPassword("caisse123"), active: true },
    { id: "u4", name: "Reda Lahlou", email: "salle@gk.com", role: "serveur", pass: hashPassword("salle123"), active: false }
  ];
}

function seedCouriers() {
  return [
    { id: "c1", name: "Youssef El Idrissi", phone: "0661 22 34 51", vehicle: "Moto Yamaha", pin: "4821", pinTemp: false, active: true, online: true, rating: 4.9, cashHeld: 0 },
    { id: "c2", name: "Karim Benali", phone: "0662 41 08 77", vehicle: "Scooter Piaggio", pin: "1937", pinTemp: false, active: true, online: true, rating: 4.7, cashHeld: 0 },
    { id: "c3", name: "Hamza Ouazzani", phone: "0670 55 19 02", vehicle: "Vélo électrique", pin: "7305", pinTemp: false, active: true, online: false, rating: 4.6, cashHeld: 0 },
    { id: "c4", name: "Anas Tahiri", phone: "0668 90 13 46", vehicle: "Moto Honda", pin: "5562", pinTemp: false, active: true, online: true, rating: 4.8, cashHeld: 0 },
    { id: "c5", name: "Mehdi Rachidi", phone: "0655 07 82 19", vehicle: "Scooter", pin: "0914", pinTemp: false, active: false, online: false, rating: 4.2, cashHeld: 0 }
  ];
}

function seedCustomers() {
  const names = [
    ["Imane Alaoui", "0661 10 20 30"], ["Mehdi Tazi", "0662 11 22 33"], ["Sara Benjelloun", "0663 44 55 66"],
    ["Yassine Amrani", "0664 77 88 99"], ["Lina Kettani", "0665 12 34 56"], ["Othmane Berrada", "0666 65 43 21"],
    ["Hajar Ziani", "0667 98 76 54"], ["Reda Cherkaoui", "0668 13 57 24"], ["Salma Idrissi", "0669 24 68 13"],
    ["Adam Bennani", "0670 31 41 59"], ["Meryem Sebti", "0671 27 18 28"], ["Zakaria Naciri", "0672 16 18 03"],
    ["Kenza Alami", "0673 14 14 21"], ["Walid Mansouri", "0674 17 32 05"]
  ];
  return names.map(([name, phone], i) => ({
    id: "cl" + (i + 1), name, phone,
    email: name.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, ".") + "@mail.com",
    points: 0, blocked: false, createdAt: 0
  }));
}

const ADDRESSES = {
  centre: ["12 rue Mohammed V, apt 4", "5 avenue Hassan II", "27 boulevard Zerktouni", "9 rue de la Liberté", "3 place des Nations"],
  corniche: ["Résidence Les Dunes, bât B", "48 boulevard de la Corniche", "Villa 17, route de la Plage"],
  peripherie: ["Lotissement Al Massira, n°112", "Quartier Industriel, rue 8", "Cité Al Wifaq, immeuble 21"]
};

function itemUnit(product, size, extras) {
  const sizeDelta = size ? size.delta : 0;
  const extrasSum = extras.reduce((s, e) => s + e.price, 0);
  return Math.round((product.price * (1 - (product.discount || 0) / 100) + sizeDelta + extrasSum) * 100) / 100;
}

function buildHistory(status, createdAt, mode, now) {
  const flow = mode === "emporter" ? STATUS_FLOW.filter((s) => s !== "en_route") : STATUS_FLOW;
  const offsets = { nouvelle: 0, confirmee: 2, preparation: 6, prete: 16, en_route: 22, livree: mode === "emporter" ? 22 : 40 };
  const history = [];
  const stop = status === "annulee" ? "preparation" : status;
  for (const s of flow) {
    history.push({ status: s, at: Math.min(createdAt + offsets[s] * MIN, now) });
    if (s === stop) break;
  }
  if (status === "annulee") history.push({ status: "annulee", at: Math.min(createdAt + 9 * MIN, now) });
  return history;
}

function seedOrders(now, products, zones, customers, couriers) {
  const rand = mulberry32(20260101);
  const pick = (arr) => arr[Math.floor(rand() * arr.length)];
  const dayStart = new Date(now).setHours(0, 0, 0, 0);
  const activeCouriers = couriers.filter((c) => c.active);
  const sellable = products.filter((p) => p.available);
  const orders = [];

  const make = (createdAt, forced = {}) => {
    const mode = forced.mode || (rand() < 0.22 ? "emporter" : "livraison");
    const zone = mode === "livraison" ? pick(zones) : null;
    const customer = pick(customers);
    const lines = [];
    const n = 1 + Math.floor(rand() * 3);
    for (let i = 0; i < n; i++) {
      const p = pick(sellable);
      const size = p.sizes.length ? pick(p.sizes) : null;
      const extras = p.extras.length && rand() < 0.35 ? [pick(p.extras)] : [];
      lines.push({ productId: p.id, name: p.name, size: size ? size.name : "", extras: extras.map((e) => e.name), qty: 1 + Math.floor(rand() * 2), unit: itemUnit(p, size, extras) });
    }
    const subtotal = lines.reduce((s, l) => s + l.unit * l.qty, 0);
    const fee = zone ? (subtotal >= zone.freeFrom ? 0 : zone.fee) : 0;
    const promo = rand() < 0.12 ? "GKBONJOUR" : "";
    const discount = promo ? 10 : 0;
    const age = (now - createdAt) / MIN;
    let status = forced.status;
    if (!status) {
      if (createdAt < dayStart || age > 70) status = rand() < 0.05 ? "annulee" : "livree";
      else if (age > 40) status = mode === "emporter" ? "livree" : "en_route";
      else if (age > 25) status = "prete";
      else if (age > 12) status = "preparation";
      else if (age > 5) status = "confirmee";
      else status = "nouvelle";
    }
    let courierId = null;
    if (mode === "livraison" && (forced.courierId !== undefined ? forced.courierId : ["prete", "en_route", "livree"].includes(status) || (status === "annulee" && rand() < 0.3))) {
      courierId = forced.courierId || pick(activeCouriers).id;
    }
    orders.push({
      id: "", createdAt, customerId: customer.id, customerName: customer.name, phone: customer.phone,
      mode, zoneId: zone ? zone.id : "", address: zone ? pick(ADDRESSES[zone.id]) : "",
      items: lines, subtotal, fee, promo, discount, total: Math.max(0, subtotal + fee - discount),
      payment: rand() < 0.55 ? "cash" : "card", status, courierId,
      cancelReason: status === "annulee" ? pick(CANCEL_REASONS) : "",
      history: buildHistory(status, createdAt, mode, now)
    });
  };

  for (let d = 6; d >= 1; d--) {
    const count = d === 1 ? 15 : 9 + Math.floor(rand() * 7);
    for (let i = 0; i < count; i++) make(dayStart - d * 86400000 + (11 * 60 + rand() * 11.5 * 60) * MIN);
  }
  const lo = dayStart + Math.min(10 * 60 * MIN, (now - dayStart) / 2);
  const hi = Math.max(lo + MIN, now - 80 * MIN);
  for (let i = 0; i < 9; i++) make(lo + rand() * (hi - lo));
  // Guaranteed live scenarios for the dashboard.
  make(now - 52 * MIN, { mode: "livraison", status: "en_route", courierId: "c1" });
  make(now - 28 * MIN, { mode: "livraison", status: "preparation" });
  make(now - 9 * MIN, { mode: "livraison", status: "confirmee", courierId: null });
  make(now - 3 * MIN, { status: "nouvelle", courierId: null });

  orders.sort((a, b) => a.createdAt - b.createdAt);
  orders.forEach((o, i) => { o.id = "GK-" + (1001 + i); });
  return orders;
}

function createSeed(now = Date.now()) {
  const products = seedProducts();
  const zones = seedZones();
  const customers = seedCustomers();
  const couriers = seedCouriers();
  const orders = seedOrders(now, products, zones, customers, couriers);
  const spent = {};
  orders.forEach((o) => {
    customers.find((c) => c.id === o.customerId).createdAt = customers.find((c) => c.id === o.customerId).createdAt || o.createdAt - 20 * 86400000;
    if (o.status !== "annulee") spent[o.customerId] = (spent[o.customerId] || 0) + o.total;
  });
  customers.forEach((c) => { c.points = Math.floor((spent[c.id] || 0) / 10) * 5; });
  customers[11].blocked = true;
  const dayStart = new Date(now).setHours(0, 0, 0, 0);
  orders.forEach((o) => {
    const c = couriers.find((x) => x.id === o.courierId);
    if (c && o.status === "livree" && o.payment === "cash" && o.createdAt >= dayStart) c.cashHeld += o.total;
  });
  const hours = {};
  DAYS.forEach((d) => { hours[d.id] = { closed: d.id === "dim" ? false : false, open: "11:00", close: d.id === "ven" || d.id === "sam" ? "00:00" : "23:00" }; });
  return {
    version: 1,
    seq: 1001 + orders.length,
    auth: { userId: null, fails: 0, lockUntil: 0 },
    users: seedUsers(),
    categories: seedCategories(),
    products, zones, couriers, customers, orders,
    promos: seedPromos(now),
    settings: {
      restaurant: { name: "G&K Food", phone: "0539 12 34 56", email: "contact@gkfood.ma", address: "14 avenue Mohammed VI, Tanger" },
      hours, deliveryOn: true, acceptingOrders: true,
      notif: { newOrder: true, unassigned: true, dailyReport: false, lowStock: true }
    },
    audit: [
      { id: "a1", at: now - 3 * 3600000, user: "Omar Fassi", role: "manager", action: "Commande", detail: "GK-" + (1001 + orders.length - 12) + " confirmée" },
      { id: "a2", at: now - 5 * 3600000, user: "Salma Berrada", role: "admin", action: "Menu", detail: "Produit « Bowl Healthy » marqué épuisé" }
    ]
  };
}
