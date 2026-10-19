const STORAGE_KEY = "gk-courier-v1";
const DAY = 86400000;
const MAX_AVAILABLE = 5;
const MAX_FAILS = 5;
const LOCK_MS = 30000;

const rand = (min, max) => min + Math.random() * (max - min);
const pick = list => list[Math.floor(Math.random() * list.length)];
const startOfDay = ts => { const d = new Date(ts); d.setHours(0, 0, 0, 0); return d.getTime(); };

let state = load();

function seedState() {
  const now = Date.now();
  const sales = (customer, zone, address, payment, items, total, daysAgo, minutesOffset, extra = {}) => ({
    id: `GK-${4700 + Math.floor(Math.random() * 90)}`, customer, zone, address, payment, items, total,
    earning: zones[zone].earning, status: "delivered", cash: payment === "cash" ? total : 0,
    at: startOfDay(now - daysAgo * DAY) + minutesOffset * 60000, remitted: daysAgo >= 2, ...extra
  });
  const nowMin = Math.max(30, Math.floor((now - startOfDay(now)) / 60000));
  const history = [
    sales("Yassine", "centre", "Rue Al Massira 12", "cash", "2× Le Classique G&K, Frites Maison", 140, 0, nowMin - 25),
    sales("Salma", "corniche", "Résidence Les Dunes, app. 4", "online", "Pizza G&K", 77, 0, nowMin - 80),
    sales("Omar", "peripherie", "Hay Salam, n° 33", "cash", "Crispy Chicken, Citronnade fraîche", 91, 1, 13 * 60 + 20),
    sales("Imane", "centre", "Av. Hassan II 8", "online", "Gelato Pistache ×2", 66, 1, 20 * 60 + 5),
    sales("Hamza", "corniche", "Bd de la Corniche 5", "cash", "Pizza G&K, Frites Maison", 97, 2, 19 * 60 + 40),
    { id: "GK-4733", customer: "Nadia", zone: "centre", address: "Rue Ibn Sina 3", payment: "cash", items: "Le Classique G&K", total: 65, earning: 0, status: "problem", note: "Client injoignable", cash: 0, at: startOfDay(now - 3 * DAY) + 12 * 3600000, remitted: true },
    sales("Reda", "peripherie", "Lotissement Al Wifaq 19", "online", "2× Pizza G&K", 149, 4, 21 * 60),
    sales("Khadija", "centre", "Av. des FAR 21", "cash", "Crispy Chicken", 58, 6, 14 * 60 + 15)
  ].sort((a, b) => b.at - a.at);
  return {
    session: null, online: false, missions: [], active: null, history,
    notifications: [{ id: 1, text: "Bienvenue sur G&K Livreur !", at: now, read: false }],
    payouts: [
      { id: 1, label: "Versement hebdomadaire", amount: 312, at: startOfDay(now - 7 * DAY) + 36e5 * 10 },
      { id: 2, label: "Versement hebdomadaire", amount: 275, at: startOfDay(now - 14 * DAY) + 36e5 * 10 },
      { id: 3, label: "Versement hebdomadaire", amount: 340, at: startOfDay(now - 21 * DAY) + 36e5 * 10 }
    ],
    stats: { offered: 52, accepted: 51 }, auth: { fails: 0, until: 0 }, seq: 4822, nid: 2
  };
}

function load() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (saved && Array.isArray(saved.history)) return saved;
  } catch { /* corrupted storage: reseed */ }
  return seedState();
}

function save() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch { /* storage unavailable */ }
}

function notify(text) {
  state.notifications.unshift({ id: state.nid++, text, at: Date.now(), read: false });
  state.notifications.length = Math.min(state.notifications.length, 30);
}

function makeMission(zoneId = pick(Object.keys(zones))) {
  const zone = zones[zoneId];
  const lines = [];
  const count = 1 + Math.floor(Math.random() * 3);
  let subtotal = 0;
  const chosen = new Set();
  while (chosen.size < count) chosen.add(pick(menu));
  chosen.forEach(item => {
    const qty = Math.random() < 0.3 ? 2 : 1;
    subtotal += item.price * qty;
    lines.push(qty > 1 ? `${qty}× ${item.name}` : item.name);
  });
  const phone = `06${String(Math.floor(rand(10000000, 99999999)))}`;
  return {
    id: `GK-${state.seq++}`, customer: pick(firstNames), phone, zone: zoneId,
    address: `${pick(streets[zoneId])} ${Math.floor(rand(2, 60))}`,
    km: Math.round(rand(...zone.km) * 10) / 10, items: lines.join(", "),
    total: subtotal + zone.earning, payment: Math.random() < 0.6 ? "cash" : "online",
    earning: zone.earning, createdAt: Date.now()
  };
}

/* ---------- Shared bus (linked mode) ---------- */

const linked = () => !!(window.GKBus && GKBus.linked);
const myCourier = () => linked() && state.session && state.session.courierId
  ? GKBus.get().couriers.find(c => c.id === state.session.courierId) : null;

function missionFromOrder(order) {
  const zoneId = zones[order.address.zone] ? order.address.zone : "centre";
  const zone = zones[zoneId];
  return {
    id: order.id, customer: String(order.customer.name || "").split(" ")[0], phone: order.customer.phone || "",
    zone: zoneId, address: order.address.street, km: Math.round((zone.km[0] + zone.km[1]) / 2 * 10) / 10,
    items: order.items.map(i => `${i.qty > 1 ? `${i.qty}× ` : ""}${i.name}${i.size ? ` (${i.size})` : ""}`).join(", "),
    total: order.total, payment: order.paymentType === "cash" || order.payment === "cash" ? "cash" : "online",
    earning: zone.earning, createdAt: order.createdAt, orderStatus: order.status
  };
}

// Mirrors the bus into missions/active for the logged-in courier. Returns {changed, notes}.
function syncBus() {
  const courier = myCourier();
  if (!courier) return { changed: false, notes: [] };
  const before = JSON.stringify([state.online, state.missions, state.active]);
  const orders = GKBus.get().orders.filter(o => o.mode === "delivery");
  state.online = courier.online;
  state.missions = orders
    .filter(o => o.dispatch.state === "offering" && o.dispatch.courierId === courier.id)
    .map(o => ({ ...missionFromOrder(o), offer: true, expiresAt: o.dispatch.expiresAt }));
  const mine = orders.find(o => o.dispatch.state === "assigned" && o.dispatch.courierId === courier.id && ["preparing", "ready", "enroute"].includes(o.status));
  state.active = mine ? { ...missionFromOrder(mine), step: Math.min(4, Math.max(1, mine.courierStep || 1)) } : null;
  const mineNotes = GKBus.get().notifications.courier.filter(n => n.courierId === courier.id);
  const maxId = mineNotes.reduce((max, n) => Math.max(max, n.id), 0);
  if (state.busNoteSeen === undefined || maxId < state.busNoteSeen) state.busNoteSeen = state.busNoteSeen === undefined ? maxId : 0;
  const notes = mineNotes.filter(n => n.id > state.busNoteSeen).sort((a, b) => a.id - b.id);
  if (notes.length) {
    state.busNoteSeen = notes[notes.length - 1].id;
    notes.forEach(n => notify(`${n.title} — ${n.text}`));
  }
  const changed = before !== JSON.stringify([state.online, state.missions, state.active]);
  if (changed || notes.length) save();
  return { changed, notes };
}

function goOnline(online) {
  if (linked() && state.session && state.session.courierId) {
    GKBus.setCourierOnline(state.session.courierId, online);
    syncBus();
    return;
  }
  state.online = online;
  if (!online) state.missions = [];
  else if (!state.missions.length && !state.active) {
    ["centre", "corniche", "peripherie"].forEach(z => state.missions.push(makeMission(z)));
    state.stats.offered += 3;
  }
  save();
}

// Returns the new mission or null when nothing was added.
function spawnMission() {
  if (!state.online || state.missions.length >= MAX_AVAILABLE) return null;
  const mission = makeMission();
  state.missions.push(mission);
  state.stats.offered++;
  notify(`Nouvelle mission ${mission.id} · ${zones[mission.zone].name}`);
  save();
  return mission;
}

function acceptMission(id) {
  if (state.active) return "busy";
  if (linked() && state.session.courierId) {
    const error = GKBus.courierRespond(id, state.session.courierId, true);
    syncBus();
    if (error) return "gone";
    state.stats.accepted++;
    save();
    return "ok";
  }
  const index = state.missions.findIndex(m => m.id === id);
  if (index < 0) return "gone";
  const [mission] = state.missions.splice(index, 1);
  state.active = { ...mission, step: 1, acceptedAt: Date.now() };
  state.stats.accepted++;
  save();
  return "ok";
}

function refuseMission(id) {
  GKBus.courierRespond(id, state.session.courierId, false);
  syncBus();
}

// Returns an error message when the kitchen has not released the order yet.
function advanceMission() {
  if (!state.active || state.active.step >= 4) return "";
  if (linked() && state.session.courierId) {
    const error = GKBus.courierStep(state.active.id, state.session.courierId, state.active.step + 1);
    syncBus();
    return error;
  }
  state.active.step++;
  save();
  return "";
}

function completeMission(code, cashCollected) {
  const m = state.active;
  if (!m || m.step !== 4) return "Mission introuvable.";
  if (!/^\d{4}$/.test(code)) return "Saisissez le code à 4 chiffres du client.";
  if (code !== DELIVERY_CODE) return "Code de livraison incorrect.";
  if (m.payment === "cash" && !cashCollected) return "Confirmez l'encaissement des espèces.";
  if (linked() && state.session.courierId) {
    const error = GKBus.courierDeliver(m.id, state.session.courierId);
    if (error) return error;
  }
  state.history.unshift({
    id: m.id, customer: m.customer, zone: m.zone, address: m.address, payment: m.payment, items: m.items,
    total: m.total, earning: m.earning, status: "delivered", cash: m.payment === "cash" ? m.total : 0,
    at: Date.now(), remitted: false
  });
  notify(`Livraison ${m.id} terminée · +${m.earning} MAD`);
  state.active = null;
  save();
  return "";
}

function reportProblem(reason, note) {
  const m = state.active;
  if (!m) return;
  if (linked() && state.session.courierId) GKBus.courierRelease(m.id, state.session.courierId, reason);
  state.history.unshift({
    id: m.id, customer: m.customer, zone: m.zone, address: m.address, payment: m.payment, items: m.items,
    total: m.total, earning: 0, status: "problem", note: note ? `${reason} — ${note}` : reason,
    cash: 0, at: Date.now(), remitted: true
  });
  notify(`Mission ${m.id} signalée : ${reason}`);
  state.active = null;
  save();
}

function normalizePhone(raw) {
  const clean = String(raw).replace(/[\s.\-]/g, "");
  if (!/^(\+212|0)[5-7]\d{8}$/.test(clean)) return null;
  return clean.startsWith("+212") ? `0${clean.slice(4)}` : clean;
}

function lockRemaining() {
  return Math.max(0, Math.ceil((state.auth.until - Date.now()) / 1000));
}

function login(rawPhone, pin) {
  if (lockRemaining() > 0) return `Trop de tentatives. Réessayez dans ${lockRemaining()} s.`;
  if (state.auth.until) state.auth = { fails: 0, until: 0 };
  const phone = normalizePhone(rawPhone);
  if (!phone) return "Numéro de téléphone invalide (ex. 0612345678).";
  if (!/^\d{4}$/.test(pin)) return "Le code PIN comporte 4 chiffres.";
  const busCourier = linked() ? GKBus.get().couriers.find(c => c.phone === phone && c.pin === pin) : null;
  const ok = busCourier || (!linked() && phone === DEMO_PHONE && pin === DEMO_PIN);
  if (!ok) {
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
  state.session = busCourier ? { phone, name: busCourier.name, courierId: busCourier.id } : { phone, name: "Youssef Amrani" };
  if (busCourier) { state.busNoteSeen = undefined; syncBus(); }
  save();
  return "";
}

function logout() {
  if (linked() && state.session && state.session.courierId) GKBus.setCourierOnline(state.session.courierId, false);
  state.session = null;
  state.online = false;
  state.missions = [];
  state.active = null;
  save();
}

function resetDemo() {
  const { session } = state;
  state = seedState();
  state.session = session;
  save();
}

const delivered = () => state.history.filter(h => h.status === "delivered");
const sumEarnings = list => list.reduce((total, h) => total + h.earning, 0);

function filterHistory(filter) {
  const now = Date.now();
  const from = filter === "today" ? startOfDay(now) : filter === "week" ? startOfDay(now - 6 * DAY) : 0;
  return state.history.filter(h => h.at >= from).sort((a, b) => b.at - a.at);
}

function dailyEarnings() {
  const today = startOfDay(Date.now());
  return Array.from({ length: 7 }, (_, i) => {
    const day = today - (6 - i) * DAY;
    return { day, total: sumEarnings(delivered().filter(h => startOfDay(h.at) === day)) };
  });
}

const cashToRemit = () => delivered().filter(h => !h.remitted).reduce((total, h) => total + h.cash, 0);

function remitCash() {
  delivered().forEach(h => { h.remitted = true; });
  notify("Espèces reversées au restaurant.");
  save();
}

function pendingPayout() {
  const last = Math.max(...state.payouts.map(p => p.at));
  return sumEarnings(delivered().filter(h => h.at > last));
}
