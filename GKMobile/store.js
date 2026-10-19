const STORE_KEY = "gk-mobile-v2";
const FREE_DELIVERY_DEFAULT = 150;
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
  view: "home",
  category: "All",
  query: "",
  trackingId: null,
  detail: null,
  panel: null,
  authMode: "login",
  authStep: "form",
  pendingUser: null,
  afterAuth: "home"
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
    state.addresses = Array.isArray(saved.addresses) ? saved.addresses : [];
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
const zoneOf = address => zones.find(zone => zone.id === address?.zone) ?? null;
const currentPayment = () => ({ id: "cash", type: "cash", label: "Espèces à la réception" });
const isPaused = () => !!state.settings.paused;
const isSoldOut = productId => products.find(product => product.id === productId)?.available === false;
const freeDeliveryFrom = () => Number(state.settings.freeDelivery ?? FREE_DELIVERY_DEFAULT);

function deliveryFee() {
  if (!state.cart.length || state.delivery !== "delivery") return 0;
  const address = currentAddress();
  const zone = zoneOf(address);
  if (!zone) return 0;
  return cartSubtotal() >= Number(zone.freeFrom ?? freeDeliveryFrom()) ? 0 : zone.fee;
}
const cartTotal = () => Math.max(0, cartSubtotal() + deliveryFee() - Number(state.promo?.discount || 0));

function checkoutIssue() {
  if (state.menuStatus !== "loaded") return "Le menu n'est pas disponible. Réessayez après le chargement.";
  if (!state.cart.length) return "Votre panier est vide.";
  if (isPaused()) return PAUSE_MESSAGE;
  const soldOut = state.cart.find(line => isSoldOut(line.product.id));
  if (soldOut) return `${soldOut.product.name} n'est plus disponible : retirez-le de votre panier.`;
  if (state.delivery === "delivery") {
    const address = currentAddress();
    if (!address) return "Ajoutez une adresse de livraison.";
    const zone = zoneOf(address);
    if (!zone) return "Choisissez une zone de livraison valide.";
    if (cartSubtotal() < zone.min) return `Commande minimum de ${zone.min} MAD pour la zone ${zone.name}.`;
  }
  return "";
}

function pushNotification(title, text) {
  state.notifications.unshift({ id: `n${Date.now()}`, title, text, time: Date.now(), read: false });
  state.notifications = state.notifications.slice(0, 30);
}
