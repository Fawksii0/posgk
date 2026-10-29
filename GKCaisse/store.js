const STORAGE_KEY = "gk-caisse-v1";
const API_SCOPE = "caisse";
const CAISSE_ROLES = ["cashier", "manager", "admin", "owner"];

const defaultState = () => ({
  session: null,
  prefs: { sound: true, paper: 80, baud: 9600, autoBrowserPrint: false, lastPrinter: "" }
});

function sessionUser(session) {
  const user = session?.user;
  if (!user || !CAISSE_ROLES.includes(user.role)) return null;
  const labels = { cashier: "Caissier", manager: "Manager", admin: "Admin", owner: "Owner" };
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    branchId: user.branchId || "",
    branchName: user.branchName || "",
    label: labels[user.role] || "Caisse",
    mustChange: !!session.mustChange
  };
}

function load() {
  const base = defaultState();
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (saved && typeof saved === "object") base.prefs = { ...base.prefs, ...saved.prefs };
  } catch { /* ignore */ }
  base.session = sessionUser(window.GKApi.session(API_SCOPE));
  if (base.session?.branchId) {
    try { window.GKApi.setBranch(base.session.branchId); } catch { /* ignore */ }
  }
  return base;
}

let state = load();

function save() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify({ prefs: state.prefs })); } catch { /* ignore */ }
}

function enablePhonePush(prompt) {
  try { void window.GKPush?.enable({ api: window.GKApi, scope: API_SCOPE, app: "caisse", prompt }); } catch { /* optional */ }
}

function setSession(result) {
  const session = window.GKApi.setSession(API_SCOPE, result);
  state.session = sessionUser(session);
  const branchId = result?.branchId || state.session?.branchId;
  if (branchId) {
    try { window.GKApi.setBranch(branchId); } catch { /* ignore */ }
  }
  if (state.session && !state.session.mustChange) enablePhonePush(true);
  return state.session;
}

function logout() {
  state.session = null;
  window.GKApi.clearSession(API_SCOPE);
}

const startOfDay = ts => { const date = new Date(ts); date.setHours(0, 0, 0, 0); return date.getTime(); };
const isToday = ts => ts >= startOfDay(Date.now());
const money = amount => `${Math.round(Number(amount) || 0)} MAD`;
const clock = ts => new Date(ts).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
const firstName = order => String(order.customer?.name || "Client").split(" ")[0];
const modeLabel = order => order.mode === "delivery" ? "Livraison" : order.mode === "dinein" ? `Sur place${order.tableNo ? ` · Table ${order.tableNo}` : ""}` : "À emporter";
const modeIcon = order => order.mode === "delivery" ? "bike" : order.mode === "dinein" ? "utensils" : "store";
