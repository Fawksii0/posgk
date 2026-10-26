const STORAGE_KEY = "gk-serveur-v1";
const API_SCOPE = "serveur";
const WAITER_ROLES = ["waiter", "manager", "admin", "owner"];

const defaultState = () => ({
  session: null,
  prefs: { sound: true }
});

function sessionUser(session) {
  const user = session?.user;
  if (!user || !WAITER_ROLES.includes(user.role)) return null;
  const labels = { waiter: "Serveur", manager: "Manager", admin: "Admin", owner: "Owner" };
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    branchId: user.branchId || "",
    branchName: user.branchName || "",
    label: labels[user.role] || "Serveur",
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
  return base;
}

let state = load();

function save() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify({ prefs: state.prefs })); } catch { /* ignore */ }
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

const money = amount => `${Math.round(Number(amount) || 0)} MAD`;
const clock = ts => new Date(Number(ts) || Date.now()).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
const isToday = ts => {
  const date = new Date(ts);
  const now = new Date();
  return date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth() && date.getDate() === now.getDate();
};
