const STORAGE_KEY = "gk-cuisine-v1";
const MAX_FAILS = 5;
const LOCK_MS = 30000;
const USERS = [
  { email: "caissier@gk.com", password: "caisse123", role: "cashier", name: "Caissier", label: "Caissier" },
  { email: "chef@gk.com", password: "chef123", role: "cook", name: "Chef", label: "Cuisinier" }
];

const defaultState = () => ({
  session: null,
  auth: { fails: 0, until: 0 },
  prefs: { sound: true, paper: 80, autoBrowserPrint: false, lastPrinter: "" }
});

let state = load();

function load() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (saved && typeof saved === "object") {
      const base = defaultState();
      return { ...base, ...saved, prefs: { ...base.prefs, ...saved.prefs }, auth: { ...base.auth, ...saved.auth } };
    }
  } catch { /* corrupted storage: start clean */ }
  return defaultState();
}

function save() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch { /* storage unavailable */ }
}

const lockRemaining = () => Math.max(0, Math.ceil((state.auth.until - Date.now()) / 1000));

function login(email, password) {
  if (lockRemaining() > 0) return `Trop de tentatives. Réessayez dans ${lockRemaining()} s.`;
  if (state.auth.until) state.auth = { fails: 0, until: 0 };
  const user = USERS.find(item => item.email === String(email).trim().toLowerCase() && item.password === password);
  if (!user) {
    state.auth.fails++;
    if (state.auth.fails >= MAX_FAILS) {
      state.auth.until = Date.now() + LOCK_MS;
      save();
      return `Trop de tentatives. Réessayez dans ${lockRemaining()} s.`;
    }
    save();
    return `Identifiants incorrects. ${MAX_FAILS - state.auth.fails} essai(s) restant(s).`;
  }
  state.auth = { fails: 0, until: 0 };
  state.session = { email: user.email, name: user.name, role: user.role, label: user.label };
  save();
  return "";
}

function logout() {
  state.session = null;
  save();
}

const isCashier = () => state.session?.role === "cashier";

/* ---------- selectors ---------- */

const startOfDay = ts => { const date = new Date(ts); date.setHours(0, 0, 0, 0); return date.getTime(); };
const isToday = ts => ts >= startOfDay(Date.now());
const firstName = order => String(order.customer?.name || "Client").split(" ")[0];
const money = amount => `${Math.round(amount)} MAD`;
const clock = ts => new Date(ts).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });

function minutesSince(ts) {
  return Math.max(0, Math.floor((Date.now() - ts) / 60000));
}

function countdown(ms) {
  const abs = Math.abs(Math.round(ms / 1000));
  const text = `${Math.floor(abs / 60)}:${String(abs % 60).padStart(2, "0")}`;
  return ms < 0 ? `+${text}` : text;
}

function columnOf(order) {
  if (order.status === "pending") return "new";
  if (order.status === "preparing") return "prep";
  if (order.status === "ready") return "ready";
  if (order.status === "enroute" || order.status === "delivered") return isToday(order.deliveredAt || order.createdAt) ? "out" : null;
  return null;
}

function groupOrders(bus) {
  const groups = { new: [], prep: [], ready: [], out: [] };
  bus.orders.forEach(order => {
    const column = columnOf(order);
    if (column) groups[column].push(order);
  });
  // Oldest first so nothing waits behind newer tickets; finished tickets newest first.
  ["new", "prep", "ready"].forEach(key => groups[key].sort((a, b) => a.createdAt - b.createdAt));
  groups.out.sort((a, b) => b.createdAt - a.createdAt);
  return groups;
}

function orderLines(order) {
  return order.items.map(item => ({
    qty: item.qty, name: item.name, size: item.size || "", extras: item.extras || [],
    total: item.price * item.qty
  }));
}

function makeDemoOrder() {
  const pick = list => list[Math.floor(Math.random() * list.length)];
  const names = ["Yassine Bakkali", "Salma Idrissi", "Omar Tazi", "Imane Berrada", "Hamza Fassi"];
  const items = [...MENU].sort(() => Math.random() - 0.5).slice(0, 1 + Math.floor(Math.random() * 3)).map(dish => ({
    productId: dish.id, name: dish.name, qty: 1 + Math.floor(Math.random() * 2), size: dish.size, extras: dish.id === "classic" ? ["Cheddar"] : [],
    price: dish.price, image: ""
  }));
  const subtotal = items.reduce((sum, item) => sum + item.price * item.qty, 0);
  const delivery = Math.random() < 0.7;
  const zone = pick(Object.keys(ZONE_NAMES));
  const fee = delivery ? 10 : 0;
  const cash = Math.random() < 0.6;
  return {
    items, subtotal, fee, total: subtotal + fee, mode: delivery ? "delivery" : "pickup",
    payment: cash ? "Espèces à la livraison" : "Visa •••• 4242", paymentType: cash ? "cash" : "card",
    customer: { name: pick(names), phone: `06${Math.floor(10000000 + Math.random() * 89999999)}` },
    address: delivery ? { street: `${pick(["Av. Hassan II", "Rue Al Massira", "Bd de la Corniche"])} ${1 + Math.floor(Math.random() * 60)}`, zone, label: "Maison" } : { street: "Retrait au restaurant", zone: "centre", label: "Comptoir" },
    etaMin: delivery ? [25, 35] : [20, 30], note: Math.random() < 0.3 ? "Sans oignons, merci" : ""
  };
}
