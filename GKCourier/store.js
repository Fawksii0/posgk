const DAY = 86400000;
const SCOPE = "courier";
const API = window.GKApi;
const apiSession = API.session(SCOPE);

const state = {
  session: apiSession?.user || null,
  mustChange: !!apiSession?.mustChange,
  profile: null,
  online: false,
  missions: [],
  active: null,
  history: [],
  historyLoaded: false,
  notifications: [],
  offersLoading: false,
  historyLoading: false,
  profileLoading: false,
  profileLoaded: false,
  offersError: "",
  historyError: "",
  profileError: "",
  locationError: "",
  actionBusy: false,
  actionError: ""
};

const startOfDay = ts => {
  const date = new Date(ts);
  date.setHours(0, 0, 0, 0);
  return date.getTime();
};
const asTime = value => {
  const parsed = typeof value === "number" ? value : Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
};
const sumEarnings = list => list.reduce((total, item) => total + (Number(item.earning) || 0), 0);
const delivered = () => state.history.filter(item => item.status === "delivered");

function formatItems(items) {
  if (typeof items === "string") return items;
  if (!Array.isArray(items)) return "";
  return items.map(item => {
    const quantity = Number(item.qty) || 1;
    const size = item.size ? ` (${item.size})` : "";
    const extras = Array.isArray(item.extras) && item.extras.length ? ` + ${item.extras.join(", ")}` : "";
    return `${quantity > 1 ? `${quantity}× ` : ""}${item.name || ""}${size}${extras}`.trim();
  }).filter(Boolean).join(", ");
}

function missionFromOrder(order) {
  const status = order.status;
  const apiStep = Number(order.courier_step) || 0;
  const step = status === "enroute" || apiStep >= 2 ? 4 : apiStep === 1 ? 2 : 1;
  return {
    id: order.id,
    customer: order.customer_name || "",
    phone: order.customer_phone || "",
    zone: order.zone_name || "",
    address: [order.address_label, order.address].filter(Boolean).join(" · "),
    km: Number.isFinite(Number(order.dispatch_km)) && order.dispatch_km !== null ? Number(order.dispatch_km) : null,
    items: formatItems(order.items),
    total: Number(order.total) || 0,
    payment: String(order.payment || "").toLowerCase() === "cash" ? "cash" : "online",
    earning: order.courier_earning === null || order.courier_earning === undefined
      ? null : Number(order.courier_earning),
    createdAt: asTime(order.created_at),
    orderStatus: status,
    step,
    offer: !!order.offered,
    expiresAt: asTime(order.offer_expires)
  };
}

function historyFromRecord(record) {
  return {
    id: record.id,
    customer: record.customer || "",
    zone: record.zone || "",
    address: record.address || "",
    payment: String(record.payment || "").toLowerCase() === "cash" ? "cash" : "online",
    items: record.items || "",
    total: Number(record.total) || 0,
    earning: Number(record.earning) || 0,
    status: "delivered",
    settled: !!record.settled,
    at: asTime(record.deliveredAt)
  };
}

async function refreshOffers() {
  if (!state.session) return;
  state.offersLoading = true;
  state.offersError = "";
  try {
    const response = await API.get("/api/courier/offers", SCOPE);
    const orders = Array.isArray(response.orders) ? response.orders : [];
    state.missions = orders.filter(order => order.offered).map(missionFromOrder);
    const active = orders.find(order => order.courier_id && ["preparing", "ready", "enroute"].includes(order.status));
    state.active = active ? missionFromOrder(active) : null;
  } catch (error) {
    state.offersError = error.message || "Impossible de charger les missions.";
    throw error;
  } finally {
    state.offersLoading = false;
  }
}

async function refreshHistory() {
  if (!state.session) return;
  state.historyLoading = true;
  state.historyError = "";
  try {
    const response = await API.get("/api/courier/history", SCOPE);
    state.history = (Array.isArray(response.history) ? response.history : []).map(historyFromRecord);
    state.historyLoaded = true;
  } catch (error) {
    state.historyError = error.message || "Impossible de charger l’historique.";
    throw error;
  } finally {
    state.historyLoading = false;
  }
}

let onlineEpoch = 0;
let togglePending = false;

async function refreshProfile() {
  if (!state.session) return;
  state.profileLoading = true;
  state.profileError = "";
  const epoch = onlineEpoch;
  try {
    const response = await API.get("/api/courier/me", SCOPE);
    state.profile = response;
    state.profileLoaded = true;
    state.session = response.user || state.session;
    // A toggle made while this request was in flight wins over the stale server value.
    if (epoch === onlineEpoch && !togglePending) state.online = !!response.online;
  } catch (error) {
    state.profileError = error.message || "Impossible de charger le profil.";
    throw error;
  } finally {
    state.profileLoading = false;
  }
}

async function refreshNotifications() {
  if (!state.session) return;
  const response = await API.get("/api/notifications", SCOPE);
  state.notifications = Array.isArray(response.notifications) ? response.notifications : [];
}

// Polls skip the history, which only changes after a delivery.
async function refreshAll({ light = false } = {}) {
  if (!state.session || state.mustChange) return [];
  const results = await Promise.allSettled([
    refreshProfile(),
    refreshOffers(),
    light && state.historyLoaded ? Promise.resolve() : refreshHistory(),
    refreshNotifications()
  ]);
  return results.filter(result => result.status === "rejected").map(result => result.reason);
}

function normalizePhone(raw) {
  const clean = String(raw).replace(/[\s.\-]/g, "");
  if (!/^(\+212|0)[5-7]\d{8}$/.test(clean)) return null;
  return clean.startsWith("+212") ? `0${clean.slice(4)}` : clean;
}

async function login(rawPhone, pin) {
  const phone = normalizePhone(rawPhone);
  if (!phone) throw new Error("Numéro de téléphone invalide (ex. 0612345678).");
  if (!/^\d{4}$/.test(pin)) throw new Error("Le code PIN comporte 4 chiffres.");
  const result = await API.post("/api/auth/courier", { phone, pin });
  const currentSession = API.setSession(SCOPE, result);
  state.session = currentSession.user;
  state.mustChange = currentSession.mustChange;
  state.profile = null;
  state.online = false;
  state.missions = [];
  state.active = null;
  state.history = [];
  state.historyLoaded = false;
  state.profileLoaded = false;
  state.notifications = [];
  if (!state.mustChange) await refreshAll();
}

async function changeSecret(current, next) {
  if (!state.mustChange) return;
  if (!current) throw new Error("Saisissez votre PIN actuel.");
  if (!/^\d{4}$/.test(next)) throw new Error("Le nouveau PIN doit contenir exactement 4 chiffres.");
  const response = await API.post("/api/auth/change-secret", { current, next }, SCOPE);
  const currentSession = API.setSession(SCOPE, response);
  state.session = currentSession.user;
  state.mustChange = currentSession.mustChange;
  state.profile = null;
  state.profileLoaded = false;
  state.historyLoaded = false;
  await refreshAll();
}

async function logout() {
  let failure = null;
  if (state.online) {
    try { await API.patch("/api/courier/online", { online: false }, SCOPE); }
    catch (error) { failure = error; }
  }
  try {
    await API.logout(SCOPE);
  } catch (error) {
    failure ||= error;
  } finally {
    state.session = null;
    state.mustChange = false;
    state.profile = null;
    state.online = false;
    state.missions = [];
    state.active = null;
    state.history = [];
    state.historyLoaded = false;
    state.profileLoaded = false;
    state.notifications = [];
  }
  if (failure) throw failure;
}

async function goOnline(online) {
  onlineEpoch += 1;
  togglePending = true;
  try {
    const response = await API.patch("/api/courier/online", { online }, SCOPE);
    state.online = !!response.online;
  } finally {
    togglePending = false;
    onlineEpoch += 1;
  }
  if (!online) state.missions = [];
  return state.online;
}

async function acceptMission(id) {
  if (state.active) throw new Error("Terminez d’abord votre mission en cours.");
  await API.post(`/api/courier/orders/${encodeURIComponent(id)}/accept`, {}, SCOPE);
  await refreshOffers();
}

async function refuseMission(id, reason = "Refus du livreur") {
  await API.post(`/api/courier/orders/${encodeURIComponent(id)}/refuse`, { reason }, SCOPE);
  await refreshOffers();
}

async function advanceMission() {
  if (!state.active) throw new Error("Mission introuvable.");
  if (state.active.step === 1) {
    await API.post(`/api/courier/orders/${encodeURIComponent(state.active.id)}/arrived`, {}, SCOPE);
  } else if (state.active.step === 2) {
    await API.post(`/api/courier/orders/${encodeURIComponent(state.active.id)}/picked-up`, {}, SCOPE);
  }
  await refreshOffers();
}

async function completeMission(code, cashCollected) {
  const mission = state.active;
  if (!mission || mission.step !== 4) throw new Error("Mission introuvable.");
  if (!/^\d{4,6}$/.test(code)) throw new Error("Saisissez le code de livraison du client.");
  if (mission.payment === "cash" && !cashCollected) throw new Error("Confirmez l’encaissement des espèces.");
  await API.post(`/api/courier/orders/${encodeURIComponent(mission.id)}/delivered`, { code }, SCOPE);
  await refreshOffers();
  await refreshHistory();
  await refreshProfile();
}

function filterHistory(filter) {
  const now = Date.now();
  const from = filter === "today" ? startOfDay(now) : filter === "week" ? startOfDay(now - 6 * DAY) : 0;
  return state.history.filter(item => item.at >= from).sort((a, b) => b.at - a.at);
}

function dailyEarnings() {
  const today = startOfDay(Date.now());
  return Array.from({ length: 7 }, (_, i) => {
    const day = today - (6 - i) * DAY;
    return { day, total: sumEarnings(delivered().filter(item => startOfDay(item.at) === day)) };
  });
}

async function markNotificationsRead() {
  await API.post("/api/notifications/read", {}, SCOPE);
  state.notifications = state.notifications.map(notification => ({ ...notification, read: true }));
}
