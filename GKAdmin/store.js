/* G&K Admin — state, persistence, domain actions and selectors.
   Every action returns { ok, ... } so it can later be swapped for API calls. */

const Store = (() => {
  const LOCK_MS = 30000;
  const MAX_FAILS = 5;
  let state = null;
  const listeners = new Set();

  const uid = (p) => p + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const now = () => Date.now();
  const dayStart = (ts) => new Date(ts).setHours(0, 0, 0, 0);
  const round2 = (n) => Math.round(n * 100) / 100;
  const clone = (v) => JSON.parse(JSON.stringify(v));
  const fail = (errors, error) => ({ ok: false, errors: errors || {}, error: error || "" });

  function load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && parsed.version === 1 && Array.isArray(parsed.orders) && parsed.settings) { state = parsed; return; }
      }
    } catch (e) { /* corrupted storage: reseed */ }
    state = createSeed();
    persist();
  }

  function persist() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch (e) { /* quota or private mode */ }
  }

  function emit() { listeners.forEach((fn) => fn()); }
  function commit(fn) { const r = fn(); persist(); emit(); return r; }
  function subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); }

  const get = () => state;
  const currentUser = () => state.auth.userId ? state.users.find((u) => u.id === state.auth.userId) || null : null;
  const can = (perm) => { const u = currentUser(); return !!u && (ROLE_PERMISSIONS[u.role] || []).includes(perm); };

  function log(action, detail) {
    const u = currentUser();
    state.audit.unshift({ id: uid("a"), at: now(), user: u ? u.name : "Système", role: u ? u.role : "systeme", action, detail });
    if (state.audit.length > 200) state.audit.length = 200;
  }

  /* ---------- Auth ---------- */
  function lockRemaining() { return Math.max(0, Math.ceil((state.auth.lockUntil - now()) / 1000)); }

  function login(email, password) {
    if (lockRemaining() > 0) return { ok: false, locked: true, remaining: lockRemaining() };
    const e = String(email || "").trim().toLowerCase();
    const user = state.users.find((u) => u.email.toLowerCase() === e);
    if (!user || user.pass !== hashPassword(String(password || ""))) {
      state.auth.fails += 1;
      if (state.auth.fails >= MAX_FAILS) {
        state.auth.fails = 0;
        state.auth.lockUntil = now() + LOCK_MS;
        persist();
        return { ok: false, locked: true, remaining: lockRemaining() };
      }
      persist();
      return { ok: false, error: "E-mail ou mot de passe incorrect.", left: MAX_FAILS - state.auth.fails };
    }
    if (!user.active) return { ok: false, error: "Ce compte est désactivé. Contactez un administrateur." };
    if (!["admin", "manager"].includes(user.role)) return { ok: false, error: "Ce rôle n'a pas accès au back-office." };
    state.auth.fails = 0;
    state.auth.userId = user.id;
    log("Connexion", "Session ouverte");
    persist(); emit();
    return { ok: true, user };
  }

  function logout() {
    commit(() => { log("Déconnexion", "Session fermée"); state.auth.userId = null; });
  }

  /* ---------- Orders ---------- */
  const flowFor = (o) => o.mode === "emporter" ? STATUS_FLOW.filter((s) => s !== "en_route") : STATUS_FLOW;
  const nextStatus = (o) => { const f = flowFor(o); const i = f.indexOf(o.status); return i >= 0 && i < f.length - 1 ? f[i + 1] : null; };
  const statusLabel = (id) => (ORDER_STATUSES.find((s) => s.id === id) || {}).label || id;

  function advanceOrder(id) {
    const o = state.orders.find((x) => x.id === id);
    if (!o) return fail({}, "Commande introuvable.");
    const next = nextStatus(o);
    if (!next) return fail({}, "Cette commande ne peut plus avancer.");
    if (next === "en_route" && !o.courierId) return fail({ courier: "Assignez un livreur avant de passer en route." }, "Assignez un livreur avant de passer en route.");
    return commit(() => {
      o.status = next;
      o.history.push({ status: next, at: now() });
      if (next === "livree") {
        const c = state.couriers.find((x) => x.id === o.courierId);
        if (c && o.payment === "cash") c.cashHeld = round2(c.cashHeld + o.total);
        const cust = state.customers.find((x) => x.id === o.customerId);
        if (cust) cust.points += Math.floor(o.total / 10);
      }
      log("Commande", `${o.id} → ${statusLabel(next)}`);
      return { ok: true };
    });
  }

  function assignCourier(id, courierId) {
    const o = state.orders.find((x) => x.id === id);
    const c = state.couriers.find((x) => x.id === courierId);
    if (!o || !c) return fail({ courier: "Sélectionnez un livreur." }, "Sélectionnez un livreur.");
    if (!c.active) return fail({ courier: "Ce livreur est désactivé." }, "Ce livreur est désactivé.");
    if (["livree", "annulee"].includes(o.status)) return fail({}, "Commande clôturée.");
    return commit(() => { o.courierId = c.id; log("Commande", `${o.id} assignée à ${c.name}`); return { ok: true }; });
  }

  function cancelOrder(id, reason, note) {
    const o = state.orders.find((x) => x.id === id);
    if (!o || ["livree", "annulee"].includes(o.status)) return fail({}, "Commande non annulable.");
    if (!reason) return fail({ reason: "Choisissez un motif." });
    return commit(() => {
      o.status = "annulee";
      o.cancelReason = note ? `${reason} — ${note}` : reason;
      o.history.push({ status: "annulee", at: now() });
      log("Commande", `${o.id} annulée (${reason})`);
      return { ok: true };
    });
  }

  function simulateOrder() {
    const s = state.settings;
    if (!s.acceptingOrders) return null;
    const avail = state.products.filter((p) => p.available && p.visible);
    const zones = state.zones.filter((z) => z.enabled);
    if (!avail.length || !state.customers.length) return null;
    const pick = (a) => a[Math.floor(Math.random() * a.length)];
    const mode = !s.deliveryOn || !zones.length || Math.random() < 0.25 ? "emporter" : "livraison";
    const zone = mode === "livraison" ? pick(zones) : null;
    const customer = pick(state.customers.filter((c) => !c.blocked)) || state.customers[0];
    const items = [];
    for (let i = 0, n = 1 + Math.floor(Math.random() * 3); i < n; i++) {
      const p = pick(avail);
      const size = p.sizes.length ? pick(p.sizes) : null;
      items.push({ productId: p.id, name: p.name, size: size ? size.name : "", extras: [], qty: 1 + Math.floor(Math.random() * 2), unit: itemUnit(p, size, []) });
    }
    const subtotal = round2(items.reduce((a, l) => a + l.unit * l.qty, 0));
    const fee = zone ? (subtotal >= zone.freeFrom ? 0 : zone.fee) : 0;
    const order = {
      id: "GK-" + state.seq, createdAt: now(), customerId: customer.id, customerName: customer.name, phone: customer.phone,
      mode, zoneId: zone ? zone.id : "", address: zone ? pick(ADDRESSES[zone.id] || ["Adresse client"]) : "",
      items, subtotal, fee, promo: "", discount: 0, total: round2(subtotal + fee),
      payment: Math.random() < 0.5 ? "cash" : "card", status: "nouvelle", courierId: null, cancelReason: "",
      history: [{ status: "nouvelle", at: now() }]
    };
    return commit(() => { state.seq += 1; state.orders.push(order); return order; });
  }

  /* ---------- Menu ---------- */
  function validateProduct(d) {
    const errors = {};
    if (!d.name.trim()) errors.name = "Le nom est obligatoire.";
    if (!state.categories.some((c) => c.id === d.category)) errors.category = "Choisissez une catégorie.";
    if (!Number.isFinite(d.price) || d.price <= 0) errors.price = "Prix invalide (supérieur à 0).";
    if (!Number.isFinite(d.discount) || d.discount < 0 || d.discount > 90) errors.discount = "Remise entre 0 et 90 %.";
    if (d.image && !/^(https?:\/\/|assets\/|data:image\/)/i.test(d.image)) errors.image = "URL d'image invalide (http/https).";
    if (d.sizes.some((s) => !s.name || !Number.isFinite(s.delta))) errors.sizes = "Chaque taille nécessite un nom et un supplément valide.";
    else if (new Set(d.sizes.map((s) => s.name.toLowerCase())).size !== d.sizes.length) errors.sizes = "Noms de tailles en double.";
    if (d.extras.some((s) => !s.name || !Number.isFinite(s.price) || s.price < 0)) errors.extras = "Chaque supplément nécessite un nom et un prix valide.";
    return errors;
  }

  function saveProduct(id, d) {
    const errors = validateProduct(d);
    if (Object.keys(errors).length) return fail(errors);
    return commit(() => {
      const data = { name: d.name.trim(), category: d.category, price: round2(d.price), description: d.description.trim(), image: d.image.trim(), sizes: d.sizes, extras: d.extras, discount: d.discount, visible: d.visible, available: d.available };
      if (id) {
        Object.assign(state.products.find((p) => p.id === id), data);
        log("Menu", `Produit « ${data.name} » modifié`);
      } else {
        state.products.unshift({ id: uid("pr"), ...data });
        log("Menu", `Produit « ${data.name} » créé`);
      }
      return { ok: true };
    });
  }

  function toggleAvailability(id) {
    const p = state.products.find((x) => x.id === id);
    if (!p) return fail();
    return commit(() => { p.available = !p.available; log("Menu", `« ${p.name} » ${p.available ? "disponible" : "épuisé"}`); return { ok: true }; });
  }

  function deleteProduct(id) {
    if (!can("deleteProduct")) return fail({}, "Action réservée aux administrateurs.");
    const p = state.products.find((x) => x.id === id);
    if (!p) return fail();
    return commit(() => { state.products = state.products.filter((x) => x.id !== id); log("Menu", `Produit « ${p.name} » supprimé`); return { ok: true }; });
  }

  function saveCategory(id, name) {
    name = name.trim();
    if (!name) return fail({ name: "Le nom est obligatoire." });
    if (state.categories.some((c) => c.id !== id && c.name.toLowerCase() === name.toLowerCase())) return fail({ name: "Cette catégorie existe déjà." });
    return commit(() => {
      if (id) state.categories.find((c) => c.id === id).name = name;
      else state.categories.push({ id: uid("cat"), name, icon: "utensils" });
      log("Menu", `Catégorie « ${name} » ${id ? "renommée" : "créée"}`);
      return { ok: true };
    });
  }

  function deleteCategory(id) {
    const c = state.categories.find((x) => x.id === id);
    if (!c) return fail();
    const used = state.products.filter((p) => p.category === id).length;
    if (used) return fail({}, `Impossible : ${used} produit(s) utilisent cette catégorie.`);
    return commit(() => { state.categories = state.categories.filter((x) => x.id !== id); log("Menu", `Catégorie « ${c.name} » supprimée`); return { ok: true }; });
  }

  /* ---------- Couriers ---------- */
  const validPhone = (v) => /^[0-9+\s().-]{8,18}$/.test(v);
  const randomPin = () => String(Math.floor(1000 + Math.random() * 9000));

  function addCourier(d) {
    const errors = {};
    if (!d.name.trim()) errors.name = "Le nom est obligatoire.";
    if (!validPhone(d.phone.trim())) errors.phone = "Numéro de téléphone invalide.";
    if (!d.vehicle.trim()) errors.vehicle = "Le véhicule est obligatoire.";
    if (!/^\d{4}$/.test(d.pin)) errors.pin = "Le PIN doit contenir 4 chiffres.";
    if (Object.keys(errors).length) return fail(errors);
    return commit(() => {
      const c = { id: uid("c"), name: d.name.trim(), phone: d.phone.trim(), vehicle: d.vehicle.trim(), pin: d.pin, pinTemp: true, active: true, online: false, rating: 5, cashHeld: 0 };
      state.couriers.push(c);
      log("Livreurs", `Livreur « ${c.name} » créé`);
      return { ok: true, courier: c };
    });
  }

  function setCourierActive(id, active) {
    const c = state.couriers.find((x) => x.id === id);
    if (!c) return fail();
    return commit(() => {
      c.active = active;
      if (!active) c.online = false;
      log("Livreurs", `« ${c.name} » ${active ? "activé" : "désactivé"}`);
      return { ok: true };
    });
  }

  function resetCourierPin(id) {
    const c = state.couriers.find((x) => x.id === id);
    if (!c) return fail();
    return commit(() => { c.pin = randomPin(); c.pinTemp = true; log("Livreurs", `PIN de « ${c.name} » réinitialisé`); return { ok: true, pin: c.pin }; });
  }

  function settleCash(id) {
    const c = state.couriers.find((x) => x.id === id);
    if (!c || c.cashHeld <= 0) return fail();
    return commit(() => { log("Livreurs", `Caisse de « ${c.name} » remise (${c.cashHeld} MAD)`); c.cashHeld = 0; return { ok: true }; });
  }

  /* ---------- Customers, zones, promos ---------- */
  function toggleBlocked(id) {
    const c = state.customers.find((x) => x.id === id);
    if (!c) return fail();
    return commit(() => { c.blocked = !c.blocked; log("Clients", `« ${c.name} » ${c.blocked ? "bloqué" : "débloqué"}`); return { ok: true }; });
  }

  function saveZone(id, d) {
    const errors = {};
    if (!Number.isFinite(d.fee) || d.fee < 0) errors.fee = "Frais invalides.";
    if (!Number.isFinite(d.min) || d.min < 0) errors.min = "Minimum invalide.";
    if (!Number.isInteger(d.etaMin) || d.etaMin < 1) errors.etaMin = "ETA min invalide.";
    if (!Number.isInteger(d.etaMax) || d.etaMax < d.etaMin) errors.etaMax = "ETA max ≥ ETA min.";
    if (!Number.isFinite(d.freeFrom) || d.freeFrom < 0) errors.freeFrom = "Seuil invalide.";
    if (Object.keys(errors).length) return fail(errors);
    const z = state.zones.find((x) => x.id === id);
    if (!z) return fail();
    return commit(() => { Object.assign(z, d); log("Zones", `Zone « ${z.name} » mise à jour`); return { ok: true }; });
  }

  function toggleZone(id) {
    const z = state.zones.find((x) => x.id === id);
    if (!z) return fail();
    return commit(() => { z.enabled = !z.enabled; log("Zones", `Zone « ${z.name} » ${z.enabled ? "activée" : "désactivée"}`); return { ok: true }; });
  }

  function savePromo(id, d) {
    const errors = {};
    const code = d.code.trim().toUpperCase();
    if (!/^[A-Z0-9_-]{3,20}$/.test(code)) errors.code = "3 à 20 caractères (lettres, chiffres, - _).";
    else if (state.promos.some((p) => p.id !== id && p.code === code)) errors.code = "Ce code existe déjà.";
    if (!Number.isFinite(d.value) || d.value <= 0) errors.value = "Valeur invalide.";
    else if (d.type === "pct" && d.value > 100) errors.value = "Maximum 100 %.";
    if (!Number.isFinite(d.min) || d.min < 0) errors.min = "Minimum invalide.";
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d.expiry)) errors.expiry = "Date d'expiration requise.";
    if (Object.keys(errors).length) return fail(errors);
    return commit(() => {
      const data = { code, type: d.type, value: d.value, min: d.min, expiry: d.expiry, active: d.active };
      if (id) Object.assign(state.promos.find((p) => p.id === id), data);
      else state.promos.unshift({ id: uid("p"), uses: 0, ...data });
      log("Promotions", `Code ${code} ${id ? "modifié" : "créé"}`);
      return { ok: true };
    });
  }

  function togglePromo(id) {
    const p = state.promos.find((x) => x.id === id);
    if (!p) return fail();
    return commit(() => { p.active = !p.active; log("Promotions", `Code ${p.code} ${p.active ? "activé" : "désactivé"}`); return { ok: true }; });
  }

  /* ---------- Staff users & settings ---------- */
  function saveUser(id, d) {
    if (!can("users")) return fail({}, "Action réservée aux administrateurs.");
    const errors = {};
    const email = d.email.trim().toLowerCase();
    if (!d.name.trim()) errors.name = "Le nom est obligatoire.";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errors.email = "E-mail invalide.";
    else if (state.users.some((u) => u.id !== id && u.email.toLowerCase() === email)) errors.email = "Cet e-mail est déjà utilisé.";
    if (!STAFF_ROLES.includes(d.role)) errors.role = "Rôle invalide.";
    if ((!id || d.password) && d.password.length < 6) errors.password = "6 caractères minimum.";
    const me = currentUser();
    if (id && me && me.id === id && (d.role !== me.role || !d.active)) errors.role = "Vous ne pouvez pas modifier votre propre rôle ou statut.";
    if (Object.keys(errors).length) return fail(errors);
    return commit(() => {
      if (id) {
        const u = state.users.find((x) => x.id === id);
        Object.assign(u, { name: d.name.trim(), email, role: d.role, active: d.active });
        if (d.password) u.pass = hashPassword(d.password);
      } else {
        state.users.push({ id: uid("u"), name: d.name.trim(), email, role: d.role, active: d.active, pass: hashPassword(d.password) });
      }
      log("Utilisateurs", `Compte ${email} ${id ? "modifié" : "créé"}`);
      return { ok: true };
    });
  }

  function toggleUserActive(id) {
    if (!can("users")) return fail({}, "Action réservée aux administrateurs.");
    const u = state.users.find((x) => x.id === id);
    if (!u) return fail();
    if (u.id === (currentUser() || {}).id) return fail({}, "Vous ne pouvez pas désactiver votre propre compte.");
    return commit(() => { u.active = !u.active; log("Utilisateurs", `Compte ${u.email} ${u.active ? "activé" : "désactivé"}`); return { ok: true }; });
  }

  function saveSettings(patch, label) {
    if (!can("settings")) return fail({}, "Action réservée aux administrateurs.");
    return commit(() => { patch(state.settings); log("Réglages", label); return { ok: true }; });
  }

  function saveRestaurant(d) {
    const errors = {};
    if (!d.name.trim()) errors.name = "Le nom est obligatoire.";
    if (!validPhone(d.phone.trim())) errors.phone = "Téléphone invalide.";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(d.email.trim())) errors.email = "E-mail invalide.";
    if (!d.address.trim()) errors.address = "L'adresse est obligatoire.";
    if (Object.keys(errors).length) return fail(errors);
    return saveSettings((s) => { s.restaurant = { name: d.name.trim(), phone: d.phone.trim(), email: d.email.trim(), address: d.address.trim() }; }, "Informations du restaurant mises à jour");
  }

  function saveHours(hours) {
    const errors = {};
    DAYS.forEach((day) => { const h = hours[day.id]; if (!h.closed && (!h.open || !h.close)) errors[day.id] = "Horaires requis."; });
    if (Object.keys(errors).length) return fail(errors);
    return saveSettings((s) => { s.hours = hours; }, "Horaires d'ouverture mis à jour");
  }

  function resetDemo() {
    if (!can("settings")) return fail({}, "Action réservée aux administrateurs.");
    const keep = clone(state.auth);
    state = createSeed();
    state.auth = keep;
    log("Réglages", "Données de démo réinitialisées");
    persist(); emit();
    return { ok: true };
  }

  /* ---------- Selectors ---------- */
  const byId = (list, id) => list.find((x) => x.id === id) || null;
  const live = (o) => o.status !== "annulee";

  function dayStats(offset) {
    const start = dayStart(now()) - offset * 86400000;
    const list = state.orders.filter((o) => live(o) && o.createdAt >= start && o.createdAt < start + 86400000);
    const revenue = list.reduce((s, o) => s + o.total, 0);
    return { start, count: list.length, revenue, avg: list.length ? revenue / list.length : 0 };
  }

  const revenueSeries = (days = 7) => Array.from({ length: days }, (_, i) => dayStats(days - 1 - i));

  function statusCounts() {
    const start = dayStart(now());
    const todays = state.orders.filter((o) => o.createdAt >= start);
    return ORDER_STATUSES.map((s) => ({ ...s, count: todays.filter((o) => o.status === s.id).length }));
  }

  function topProducts(limit = 5) {
    const since = dayStart(now()) - 6 * 86400000;
    const map = new Map();
    state.orders.filter((o) => live(o) && o.createdAt >= since).forEach((o) => o.items.forEach((l) => {
      const e = map.get(l.productId) || { name: l.name, qty: 0, revenue: 0 };
      e.qty += l.qty; e.revenue += l.qty * l.unit;
      map.set(l.productId, e);
    }));
    return [...map.values()].sort((a, b) => b.qty - a.qty).slice(0, limit);
  }

  const courierStatus = (c) => {
    if (!c.active) return "inactif";
    if (state.orders.some((o) => o.courierId === c.id && o.status === "en_route")) return "mission";
    return c.online ? "online" : "offline";
  };
  const courierToday = (c) => {
    const start = dayStart(now());
    return state.orders.filter((o) => o.courierId === c.id && o.status === "livree" && o.createdAt >= start).length;
  };
  const customerStats = (c) => {
    const orders = state.orders.filter((o) => o.customerId === c.id);
    const paid = orders.filter(live);
    return { orders, count: orders.length, spent: paid.reduce((s, o) => s + o.total, 0), last: orders.reduce((m, o) => Math.max(m, o.createdAt), 0) };
  };

  function alerts() {
    const list = [];
    const waiting = state.orders.filter((o) => o.mode === "livraison" && !o.courierId && ["nouvelle", "confirmee", "preparation", "prete"].includes(o.status) && now() - o.createdAt > 5 * MIN);
    if (waiting.length) list.push({ tone: "red", icon: "alert", text: `${waiting.length} commande(s) sans livreur depuis plus de 5 min`, ids: waiting.map((o) => o.id), link: "#/commandes" });
    const fresh = state.orders.filter((o) => o.status === "nouvelle").length;
    if (fresh) list.push({ tone: "gold", icon: "bell", text: `${fresh} nouvelle(s) commande(s) à confirmer`, link: "#/commandes" });
    const out = state.products.filter((p) => !p.available).length;
    if (out) list.push({ tone: "orange", icon: "box", text: `${out} produit(s) épuisé(s) au menu`, link: "#/menu" });
    if (!state.settings.acceptingOrders) list.push({ tone: "red", icon: "ban", text: "Les commandes sont en pause", link: "#/reglages" });
    const noCash = state.couriers.filter((c) => c.cashHeld >= 300).length;
    if (noCash) list.push({ tone: "blue", icon: "cash", text: `${noCash} livreur(s) détiennent plus de 300 MAD en espèces`, link: "#/livreurs" });
    return list;
  }

  return {
    load, get, subscribe, currentUser, can, login, logout, lockRemaining,
    advanceOrder, assignCourier, cancelOrder, simulateOrder, nextStatus, flowFor, statusLabel,
    saveProduct, toggleAvailability, deleteProduct, saveCategory, deleteCategory,
    addCourier, setCourierActive, resetCourierPin, settleCash,
    toggleBlocked, saveZone, toggleZone, savePromo, togglePromo,
    saveUser, toggleUserActive, saveSettings, saveRestaurant, saveHours, resetDemo,
    byId, dayStats, revenueSeries, statusCounts, topProducts, courierStatus, courierToday, customerStats, alerts, dayStart
  };
})();
