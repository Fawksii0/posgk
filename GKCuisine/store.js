const STORAGE_KEY = "gk-cuisine-v1";
const API_SCOPE = "cuisine";

const defaultState = () => ({
  session: null,
  prefs: { sound: true, paper: 80, autoBrowserPrint: false, lastPrinter: "" }
});

function sessionUser(session) {
  const user = session?.user;
  if (!user || !["cashier", "chef"].includes(user.role)) return null;
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    branchId: user.branchId || "",
    branchName: user.branchName || "",
    label: user.role === "cashier" ? "Caissier" : "Cuisinier",
    mustChange: !!session.mustChange
  };
}

function load() {
  const base = defaultState();
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (saved && typeof saved === "object") {
      base.prefs = { ...base.prefs, ...saved.prefs };
    }
  } catch { /* corrupted storage: start with defaults */ }
  base.session = sessionUser(window.GKApi.session(API_SCOPE));
  return base;
}

let state = load();

function save() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ prefs: state.prefs }));
  } catch { /* storage unavailable */ }
}

function setSession(result) {
  const session = window.GKApi.setSession(API_SCOPE, result);
  state.session = sessionUser(session);
  return state.session;
}

function logout() {
  state.session = null;
  window.GKApi.clearSession(API_SCOPE);
}

const isCashier = () => state.session?.role === "cashier";

const startOfDay = ts => { const date = new Date(ts); date.setHours(0, 0, 0, 0); return date.getTime(); };
const isToday = ts => ts >= startOfDay(Date.now());
const firstName = order => String(order.customer?.name || "Client").split(" ")[0];
const money = amount => `${Math.round(Number(amount) || 0)} MAD`;
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

function groupOrders(orders) {
  const groups = { new: [], prep: [], ready: [], out: [] };
  orders.forEach(order => {
    const column = columnOf(order);
    if (column) groups[column].push(order);
  });
  ["new", "prep", "ready"].forEach(key => groups[key].sort((a, b) => a.createdAt - b.createdAt));
  groups.out.sort((a, b) => b.createdAt - a.createdAt);
  return groups;
}
