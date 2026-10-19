const STORE_KEY = "gk-mobile-v1";
const STAGE_MS = 25000;
const FREE_DELIVERY = 150;
const LOYALTY_BASE = 320;
const REWARDS = [
  { points: 500, label: "Gelato offert" },
  { points: 1000, label: "Burger offert" },
  { points: 2000, label: "Menu duo offert" }
];

const stageTemplates = {
  delivery: [
    { title: "Commande confirmée", detail: "Votre commande est bien reçue", icon: "check", next: "Lancer la préparation" },
    { title: "Préparation en cuisine", detail: "Le chef prépare vos plats avec soin", icon: "utensils", next: "Récupérer la commande" },
    { title: "En route vers vous", detail: "Votre livreur prend la route", icon: "bike", next: "Confirmer la livraison" },
    { title: "Livrée, bon appétit !", detail: "On vous souhaite un bon moment G&K", icon: "heart", next: "" }
  ],
  pickup: [
    { title: "Commande confirmée", detail: "Votre commande est bien reçue", icon: "check", next: "" },
    { title: "Préparation en cuisine", detail: "Le chef prépare vos plats avec soin", icon: "utensils", next: "" },
    { title: "Prête à retirer", detail: "Présentez-vous au comptoir G&K", icon: "store", next: "" },
    { title: "Retirée, bon appétit !", detail: "On vous souhaite un bon moment G&K", icon: "heart", next: "" }
  ]
};
// Orders linked to the kitchen through GKBus follow the real status instead of the demo timer.
const busStageTemplates = {
  delivery: [
    { title: "En attente de confirmation", detail: "La cuisine va valider votre commande", icon: "clock" },
    { title: "Acceptée · en préparation", detail: "Le chef prépare vos plats avec soin", icon: "utensils" },
    { title: "Prête", detail: "Votre commande attend le livreur", icon: "check" },
    { title: "En route vers vous", detail: "Le livreur a récupéré votre commande", icon: "bike" },
    { title: "Livrée, bon appétit !", detail: "On vous souhaite un bon moment G&K", icon: "heart" }
  ],
  pickup: [
    { title: "En attente de confirmation", detail: "La cuisine va valider votre commande", icon: "clock" },
    { title: "Acceptée · en préparation", detail: "Le chef prépare vos plats avec soin", icon: "utensils" },
    { title: "Prête à retirer", detail: "Présentez-vous au comptoir G&K", icon: "store" },
    { title: "Retirée, bon appétit !", detail: "On vous souhaite un bon moment G&K", icon: "heart" }
  ]
};
const stagesFor = order => (order.bus ? busStageTemplates : stageTemplates)[order.mode];

const busLive = () => !!window.GKBus && GKBus.linked && GKBus.isAlive("cuisine", 90000);
const busSettings = () => (window.GKBus && GKBus.linked ? GKBus.get().settings : {});
const isPaused = () => !!busSettings().paused;
const isSoldOut = productId => !!window.GKBus && GKBus.linked && GKBus.get().menuAvailability[productId] === false;

const PAUSE_MESSAGE = "Les commandes sont momentanément en pause. Revenez dans quelques instants.";

const defaultData = () => ({
  onboarded: false,
  user: null,
  addresses: [{ id: "a1", label: "Maison", street: "Boulevard Mohammed V", zone: "centre" }],
  addressId: "a1",
  payments: [{ id: "cash", type: "cash", label: "Espèces à la livraison" }],
  payId: "cash",
  favorites: [],
  cart: [],
  delivery: "delivery",
  promo: false,
  cartNote: "",
  busNoteSeen: 0,
  ordersTab: "active",
  orderSeq: 2841,
  notifications: [{ id: "n0", title: "Bienvenue chez G&K", text: "Utilisez le code GKBONJOUR pour -10 MAD sur votre commande.", time: Date.now(), read: false }],
  orders: [{
    id: "GK-2790", status: "completed", stage: 3, mode: "delivery", createdAt: Date.now() - 3 * 86400000, nextAt: 0, demo: true,
    address: "Boulevard Mohammed V · Centre-ville", etaMin: [25, 35], total: 83, payment: "Espèces à la livraison",
    items: [
      { name: "Pizza G&K", quantity: 1, image: img("photo-1513104890138-7c749659a591", 300), detail: "Moyenne 10″" },
      { name: "Citronnade fraîche", quantity: 1, image: img("photo-1513558161293-cdaf765ed2fd", 300), detail: "33 cl" }
    ]
  }]
});

const state = {
  ...defaultData(),
  favorites: new Set(),
  cart: [],
  view: "home",
  category: "All",
  query: "",
  trackingId: null,
  detail: null,
  panel: null,
  slide: 0,
  authMode: "login",
  authStep: "form",
  pendingUser: null,
  afterAuth: "home"
};

function hydrateCart(raw) {
  return (raw || []).map(line => {
    const product = products.find(item => item.id === line.productId);
    if (!product) return null;
    return {
      product,
      size: product.sizes.find(size => size.name === line.size) ?? product.sizes[0],
      extras: product.extras.filter(extra => (line.extras || []).includes(extra.name)),
      quantity: Math.max(1, Number(line.quantity) || 1)
    };
  }).filter(Boolean);
}

function loadState() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORE_KEY));
    if (!saved || typeof saved !== "object") return;
    const base = defaultData();
    for (const key of Object.keys(base)) if (saved[key] !== undefined) state[key] = saved[key];
    state.favorites = new Set(saved.favorites || []);
    state.cart = hydrateCart(saved.cart);
  } catch {
    // corrupted or unavailable storage: start from defaults
  }
}

function saveState() {
  try {
    const data = {};
    for (const key of Object.keys(defaultData())) data[key] = state[key];
    data.favorites = [...state.favorites];
    data.cart = state.cart.map(line => ({ productId: line.product.id, size: line.size.name, extras: line.extras.map(extra => extra.name), quantity: line.quantity }));
    localStorage.setItem(STORE_KEY, JSON.stringify(data));
  } catch {
    // storage full or blocked: the prototype keeps working in memory
  }
}

function resetState() {
  try { localStorage.removeItem(STORE_KEY); } catch { /* ignore */ }
  location.reload();
}

const formatPrice = amount => `${amount.toFixed(0)} MAD`;
const pad = value => String(value).padStart(2, "0");
const hhmm = ts => { const date = new Date(ts); return `${pad(date.getHours())}:${pad(date.getMinutes())}`; };
function formatDate(ts) {
  const date = new Date(ts);
  const today = new Date();
  if (date.toDateString() === today.toDateString()) return `Aujourd'hui · ${hhmm(ts)}`;
  return `${date.toLocaleDateString("fr-FR", { day: "numeric", month: "short" })} · ${hhmm(ts)}`;
}
function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
}

const lineUnit = line => line.product.price + line.size.delta + line.extras.reduce((sum, extra) => sum + extra.price, 0);
const cartCount = () => state.cart.reduce((total, line) => total + line.quantity, 0);
const cartSubtotal = () => state.cart.reduce((total, line) => total + lineUnit(line) * line.quantity, 0);
const currentAddress = () => state.addresses.find(address => address.id === state.addressId) ?? state.addresses[0] ?? null;
const zoneOf = address => zones.find(zone => zone.id === address?.zone) ?? zones[0];
const currentPayment = () => state.payments.find(payment => payment.id === state.payId) ?? state.payments[0];

function deliveryFee() {
  if (!state.cart.length || state.delivery !== "delivery" || !currentAddress()) return 0;
  return cartSubtotal() >= FREE_DELIVERY ? 0 : zoneOf(currentAddress()).fee;
}
const cartTotal = () => Math.max(0, cartSubtotal() + deliveryFee() - (state.promo ? 10 : 0));

function checkoutIssue() {
  if (!state.cart.length) return "Votre panier est vide.";
  if (isPaused()) return PAUSE_MESSAGE;
  const soldOut = state.cart.find(line => isSoldOut(line.product.id));
  if (soldOut) return `${soldOut.product.name} est épuisé : retirez-le de votre panier.`;
  if (state.delivery === "delivery") {
    const address = currentAddress();
    if (!address) return "Ajoutez une adresse de livraison.";
    const zone = zoneOf(address);
    if (cartSubtotal() < zone.min) return `Commande minimum de ${zone.min} MAD pour la zone ${zone.name}.`;
  }
  return "";
}

function loyaltyPoints() {
  return LOYALTY_BASE + state.orders.filter(order => order.status === "completed" && !order.demo).reduce((sum, order) => sum + Math.floor(order.total / 10), 0);
}

function pushNotification(title, text) {
  state.notifications.unshift({ id: `n${Date.now()}${Math.random().toString(36).slice(2, 6)}`, title, text, time: Date.now(), read: false });
  state.notifications = state.notifications.slice(0, 30);
}

function advanceOrder(order) {
  if (order.bus || order.status !== "active" || order.stage >= 3) return;
  order.stage += 1;
  order.nextAt = Date.now() + STAGE_MS;
  const step = stagesFor(order)[order.stage];
  if (order.stage >= 3) order.status = "completed";
  pushNotification(`Commande #${order.id}`, `${step.title}. ${step.detail}`);
  return step;
}

function courierProgress(order) {
  if (order.bus) {
    if (order.status === "completed") return 1;
    if (order.stage < 3) return 0;
    const travel = (order.travelMin || 10) * 60000;
    return Math.min(0.95, Math.max(0.05, (Date.now() - (order.enrouteAt || Date.now())) / travel));
  }
  if (order.stage < 2) return 0;
  if (order.stage >= 3) return 1;
  return Math.min(1, Math.max(0, 1 - (order.nextAt - Date.now()) / STAGE_MS));
}
