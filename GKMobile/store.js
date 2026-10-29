const STORE_KEY = "gk-mobile-v2";
const STORE_COORDS = window.GKDelivery?.STORE || { lat: 33.7895, lng: -7.1597 };
const stageTemplates = {
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
const stagesFor = order => stageTemplates[order.mode];
const PAUSE_MESSAGE = "Les commandes sont momentanément en pause. Revenez dans quelques instants.";
const defaultData = () => ({
  addresses: [],
  addressId: null,
  favorites: [],
  cart: [],
  delivery: "delivery",
  promo: null,
  cartNote: "",
  ordersTab: "active",
  orders: [],
  ordersLoading: false,
  orderSubmitting: false,
  notifications: [],
  user: window.GKApi.session("client")?.user || null,
  branches: [],
  branchLoading: false,
  branchError: "",
  selectedBranchId: window.GKApi.getBranch(),
  afterBranch: "home",
  menuStatus: "loading",
  menuError: "",
  ordersError: "",
  settings: {},
  promoError: "",
  promoMessage: ""
});

const state = {
  ...defaultData(),
  favorites: new Set(),
  cart: [],
  view: "auth",
  category: "All",
  query: "",
  trackingId: null,
  detail: null,
  panel: null,
  authMode: "login",
  authStep: "form",
  pendingUser: null,
  afterAuth: "home",
  orderPhone: "",
  phoneOverride: false,
  locating: false
};

function hydrateCart(raw) {
  return (raw || []).map(line => {
    const product = products.find(item => item.id === (line.productId ?? line.product?.id));
    if (!product) return null;
    const sizeName = typeof line.size === "string" ? line.size : line.size?.name;
    const extraNames = (line.extras || []).map(extra => typeof extra === "string" ? extra : extra.name);
    return {
      product,
      size: product.sizes.find(size => size.name === sizeName) ?? product.sizes[0] ?? { name: "", delta: 0 },
      extras: product.extras.filter(extra => extraNames.includes(extra.name)),
      quantity: Math.max(1, Number(line.quantity) || 1)
    };
  }).filter(Boolean);
}

function loadState() {
  try {
    localStorage.removeItem("gk-mobile-v1");
    const saved = JSON.parse(localStorage.getItem(STORE_KEY));
    if (!saved || typeof saved !== "object") return;
    state.addresses = Array.isArray(saved.addresses) ? saved.addresses.map(row => ({
      ...row,
      lat: Number.isFinite(Number(row.lat)) ? Number(row.lat) : null,
      lng: Number.isFinite(Number(row.lng)) ? Number(row.lng) : null
    })) : [];
    state.addressId = saved.addressId || null;
    state.favorites = new Set(saved.favorites || []);
    state.delivery = saved.delivery === "pickup" ? "pickup" : "delivery";
    state.cartNote = typeof saved.cartNote === "string" ? saved.cartNote : "";
    state.cart = Array.isArray(saved.cart) ? saved.cart : [];
  } catch {
    state.addresses = [];
    state.cart = [];
    state.favorites = new Set();
  }
}

function saveState() {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify({
      addresses: state.addresses,
      addressId: state.addressId,
      favorites: [...state.favorites],
      delivery: state.delivery,
      cartNote: state.cartNote,
      cart: state.cart.map(line => ({
        productId: line.product.id,
        size: line.size.name,
        extras: line.extras.map(extra => extra.name),
        quantity: line.quantity
      }))
    }));
  } catch {
    // Keep the current in-memory session usable when browser storage is unavailable.
  }
}

function resetState() {
  localStorage.removeItem(STORE_KEY);
  location.reload();
}

const formatPrice = amount => `${Number(amount || 0).toFixed(0)} MAD`;
const pad = value => String(value).padStart(2, "0");
const hhmm = ts => { const date = new Date(ts); return `${pad(date.getHours())}:${pad(date.getMinutes())}`; };
function formatDate(ts) {
  const date = new Date(ts);
  const today = new Date();
  if (date.toDateString() === today.toDateString()) return `Aujourd'hui · ${hhmm(ts)}`;
  return `${date.toLocaleDateString("fr-FR", { day: "numeric", month: "short" })} · ${hhmm(ts)}`;
}
function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
}

const lineUnit = line => line.product.price + line.size.delta + line.extras.reduce((sum, extra) => sum + extra.price, 0);
const cartCount = () => state.cart.reduce((total, line) => total + line.quantity, 0);
const cartSubtotal = () => state.cart.reduce((total, line) => total + lineUnit(line) * line.quantity, 0);
const currentAddress = () => state.addresses.find(address => address.id === state.addressId) ?? state.addresses[0] ?? null;
const hasGps = address => Number.isFinite(Number(address?.lat)) && Number.isFinite(Number(address?.lng));
function kmFromStore(address) {
  if (!hasGps(address)) return Infinity;
  if (window.GKDelivery) return window.GKDelivery.haversineKm(STORE_COORDS, { lat: Number(address.lat), lng: Number(address.lng) });
  return Infinity;
}
const maxDeliveryKm = () => window.GKDelivery?.maxKm(state.settings, zones) || Number(state.settings.maxDeliveryKm) || 15;
const zoneOf = address => {
  if (!hasGps(address)) return null;
  return window.GKDelivery?.ringOf(zones, kmFromStore(address)) || null;
};
const currentPayment = () => ({ id: "cash", type: "cash", label: "Espèces à la réception" });
const isPaused = () => !!state.settings.paused;
const isConstruction = () => state.settings.opsMode === "construction";
const opsBanner = () => String(state.settings.opsMessage || "").trim();
const isSoldOut = productId => products.find(product => product.id === productId)?.available === false;

function deliveryFee() {
  if (!state.cart.length || state.delivery !== "delivery") return 0;
  return Number(zoneOf(currentAddress())?.fee) || 0;
}
const cartTotal = () => Math.max(0, cartSubtotal() + deliveryFee() - Number(state.promo?.discount || 0));

function checkoutIssue() {
  if (state.menuStatus !== "loaded") return "Le menu n'est pas disponible. Réessayez après le chargement.";
  if (!state.cart.length) return "Votre panier est vide.";
  if (isConstruction()) return opsBanner() || "G&K Food is temporarily unavailable for maintenance.";
  if (isPaused()) return PAUSE_MESSAGE;
  const soldOut = state.cart.find(line => isSoldOut(line.product.id));
  if (soldOut) return `${soldOut.product.name} n'est plus disponible : retirez-le de votre panier.`;
  if (state.delivery === "delivery") {
    if (state.settings.deliveryOn === false) return "La livraison est indisponible pour le moment.";
    const address = currentAddress();
    if (!address || !hasGps(address)) return "Localisez-vous sur la carte pour la livraison.";
    if (kmFromStore(address) > maxDeliveryKm()) return "Cette position est hors zone de livraison.";
    const zone = zoneOf(address);
    if (!zone) return "Cette position est hors zone de livraison.";
    if (zone.min > 0 && cartSubtotal() < zone.min) return `Commande minimum de ${zone.min} MAD pour ${zone.name}.`;
  }
  return "";
}

function pushNotification(title, text) {
  state.notifications.unshift({ id: `n${Date.now()}`, title, text, time: Date.now(), read: false });
  state.notifications = state.notifications.slice(0, 30);
}
