/* G&K Admin — in-memory API cache and Supabase-backed API operations. */
const Store = (() => {
  "use strict";

  const datasets = {
    stats: { path: "/api/admin/stats", key: "stats", map: (v) => v },
    orders: { path: "/api/orders", key: "orders", map: (v) => (v.orders || []).map(orderOut) },
    menu: { path: "/api/admin/menu", key: "menu", map: (v) => ({ categories: v.categories || [], products: (v.items || []).map((p) => ({ ...p, category: p.categoryId || "" })) }) },
    zones: { path: "/api/admin/zones", key: "zones", map: (v) => v.zones || [] },
    promos: { path: "/api/admin/promos", key: "promos", map: (v) => v.promos || [] },
    users: { path: "/api/admin/users", key: "users", map: (v) => (v.users || []).map((u) => ({ ...u, active: !!u.active })) },
    couriers: { path: "/api/admin/couriers", key: "couriers", map: (v) => (v.couriers || []).map(courierOut) },
    clients: { path: "/api/admin/clients", key: "customers", map: (v) => (v.clients || []).map((c) => ({ ...c, email: c.email || "", points: c.points || 0 })) },
    audit: { path: "/api/admin/audit", key: "audit", map: (v) => (v.audit || []).map((a) => ({ ...a, at: Number(a.at) })) },
    settings: { path: "/api/admin/settings", key: "settings", map: settingsOut },
    cloture: { path: () => `/api/admin/cloture?dayStart=${state.clotureDayStart}`, key: "cloture", map: (v) => v }
  };
  const deleteUser = (id) => mutate("delete", `/api/admin/users/${encodeURIComponent(id)}`, undefined, ["users"]);
  const routeDatasets = {
    dashboard: ["stats", "orders", "couriers", "audit", "menu", "settings", "cloture"],
    commandes: ["orders", "couriers", "zones"],
    factures: ["orders", "settings", "zones"],
    menu: ["menu"],
    livreurs: ["couriers", "orders"],
    carte: [],
    clients: ["clients", "orders"],
    zones: ["zones"],
    promotions: ["promos"],
    activite: ["audit"],
    utilisateurs: ["users"],
    reglages: ["settings"]
  };
  const permissions = {
    stats: ["manager", "admin", "owner"],
    invoices: ["manager", "admin", "owner"],
    users: ["admin", "owner"],
    settings: ["admin", "owner"],
    deleteProduct: ["admin", "owner"],
    couriers: ["cashier", "manager", "admin", "owner"],
    couriersWrite: ["manager", "admin", "owner"],
    clients: ["manager", "admin", "owner"],
    zones: ["manager", "admin", "owner"],
    promos: ["manager", "admin", "owner"],
    audit: ["admin", "owner"],
    menuWrite: ["manager", "admin", "owner"],
    menuStock: ["cashier", "manager", "admin", "owner"],
    orderAct: ["cashier", "manager", "admin", "owner"],
    orderReady: ["cashier", "chef", "manager", "admin", "owner"],
    orderHandover: ["cashier", "waiter", "manager", "admin", "owner"],
    settingsOps: ["cashier", "manager", "admin", "owner"]
  };
  const emptySettings = () => ({
    restaurant: { name: "", phone: "", email: "", address: "" },
    hours: Object.fromEntries(DAYS.map((d) => [d.id, { closed: false, open: "11:00", close: "23:00" }])),
    notif: { newOrder: true, unassigned: true, lowStock: true, dailyReport: false },
    deliveryOn: false, acceptingOrders: true, dispatchMode: "rotation", defaultPrep: 20, freeDelivery: 0
  });
  let state = {
    user: null, scope: "admin", mustChange: false, orders: [], products: [], categories: [], zones: [], promos: [],
    users: [], couriers: [], customers: [], audit: [], settings: emptySettings(), stats: null, cloture: null, clotureDayStart: 0,
    loading: {}, errors: {}, loaded: {}, branches: [], branchId: ""
  };
  const listeners = new Set();
  const emit = () => listeners.forEach((fn) => fn());
  const clone = (value) => JSON.parse(JSON.stringify(value));
  const currentUser = () => state.mustChange ? null : state.user;
  const changeRequired = () => state.mustChange;
  const subscribe = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };
  const get = () => state;
  const dayStart = (ts) => new Date(ts).setHours(0, 0, 0, 0);
  const defaultClotureDay = () => {
    const start = dayStart(Date.now());
    return new Date().getHours() < 8 ? start - 86400000 : start;
  };
  state.clotureDayStart = defaultClotureDay();
  const byId = (list, id) => (list || []).find((item) => item.id === id) || null;
  const PRINTER_KEY = "gk-admin-printer";
  function printerPrefs() {
    try {
      const saved = JSON.parse(localStorage.getItem(PRINTER_KEY) || "{}");
      return {
        paper: Number(saved.paper) === 58 ? 58 : 80,
        baud: [9600, 19200, 115200].includes(Number(saved.baud)) ? Number(saved.baud) : 9600,
        lastPrinter: String(saved.lastPrinter || "")
      };
    } catch {
      return { paper: 80, baud: 9600, lastPrinter: "" };
    }
  }
  function setPrinterPrefs(patch) {
    const next = { ...printerPrefs(), ...patch };
    try { localStorage.setItem(PRINTER_KEY, JSON.stringify(next)); } catch { /* ignore */ }
    emit();
    return next;
  }

  function can(permission) {
    const map = { users: "users", settings: "settings", zones: "zones", promos: "promos", audit: "audit", clients: "clients", couriers: "couriers", stats: "stats", deleteProduct: "deleteProduct" };
    const key = map[permission] || permission;
    return !state.mustChange && !!state.user && (permissions[key] || []).includes(state.user.role);
  }

  const statusFromApi = { pending: "nouvelle", preparing: "preparation", ready: "prete", enroute: "en_route", delivered: "livree", cancelled: "annulee", refused: "refusee" };
  const statusToApi = Object.fromEntries(Object.entries(statusFromApi).map(([api, ui]) => [ui, api]));
  function orderOut(o) {
    const items = Array.isArray(o.items) ? o.items : [];
    return {
      ...o, seq: o.seq, createdAt: Number(o.created_at || o.createdAt || 0),
      customerId: o.client_id || o.customerId, customerName: o.customer_name || o.customerName || "",
      phone: o.customer_phone || o.phone || "", mode: o.mode === "delivery" ? "livraison" : "emporter",
      zoneId: o.zone_id || o.zoneId || "", zoneName: o.zone_name || "",
      status: statusFromApi[o.status] || o.status, courierId: o.courier_id || o.courierId || null,
      payment: o.payment || "cash", promo: o.promo || "", cancelReason: o.cancel_reason || o.refused_reason || "",
      prepMinutes: Number(o.prep_minutes || 20),
      subtotal: Number(o.subtotal || 0), fee: Number(o.fee || 0), discount: Number(o.discount || 0), total: Number(o.total || 0),
      items: items.map((line) => ({ ...line, productId: line.id, unit: Number(line.unit || 0), qty: Number(line.qty || 0), extras: Array.isArray(line.extras) ? line.extras : [] })),
      history: (Array.isArray(o.history) ? o.history : []).map((h) => ({ ...h, status: statusFromApi[h.status] || h.status, at: Number(h.at || 0) }))
    };
  }
  function courierOut(c) {
    return {
      ...c, phone: c.phone || "", active: !!c.active, online: !!c.online,
      cashHeld: Number(c.cashHeld || 0), pinTemp: !!c.mustChange,
      status: !c.active ? "inactif" : c.busy ? "mission" : c.online ? "online" : "offline"
    };
  }
  function settingsOut(raw = {}) {
    const def = emptySettings();
    return {
      ...def, restaurant: { ...def.restaurant, ...(raw.restaurant || {}) },
      hours: { ...def.hours, ...(raw.hours || {}) }, notif: { ...def.notif, ...(raw.notif || {}) },
      deliveryOn: !!raw.deliveryOn, acceptingOrders: !raw.paused,
      dispatchMode: raw.dispatchMode || def.dispatchMode,
      defaultPrep: Number(raw.defaultPrep || def.defaultPrep), freeDelivery: Number(raw.freeDelivery || 0)
    };
  }
  function sessionScope() {
    return new URLSearchParams(location.search).has("owner") || location.hash.replace(/^#\/?/, "").split("/")[0] === "owner" ? "owner" : "admin";
  }
  function api() {
    if (!window.GKApi) throw new Error("Le client API partagé n'a pas été chargé.");
    return window.GKApi;
  }
  const request = (method, path, body) => {
    if (state.mustChange && path !== "/api/auth/change-secret") {
      return Promise.reject(new Error("Vous devez modifier votre mot de passe avant de continuer."));
    }
    return body === undefined ? api()[method](path, state.scope) : api()[method](path, body, state.scope);
  };

  async function load() {
    state.scope = sessionScope();
    let stored;
    try { stored = api().session(state.scope); } catch (error) { state.errors.auth = error.message; emit(); return; }
    state.user = stored?.user || null;
    state.mustChange = !!stored?.mustChange || !!stored?.user?.mustChange;
    state.clotureDayStart = defaultClotureDay();
    emit();
    if (state.user && !state.mustChange) {
      if (await loadBranches()) await refreshAll();
    }
  }

  async function loadBranches() {
    if (!state.user) return false;
    delete state.errors.branches;
    if (state.user.branchId) {
      state.branchId = state.user.branchId;
      api().setBranch(state.branchId);
      emit();
      return true;
    }
    if (!["admin", "owner"].includes(state.user.role)) return false;
    try {
      const response = await request("get", "/api/branches");
      state.branches = Array.isArray(response.branches) ? response.branches.filter(branch => branch.active !== false) : [];
      const stored = api().getBranch();
      state.branchId = state.branches.some(branch => branch.id === stored)
        ? stored
        : state.branches[0]?.id || "";
      if (state.branchId) api().setBranch(state.branchId);
      else {
        api().clearBranch();
        state.errors.branches = "Aucun restaurant actif n'est configuré.";
      }
    } catch (error) {
      state.branches = [];
      state.branchId = "";
      state.errors.branches = error?.message || "Impossible de charger les restaurants.";
      api().clearBranch();
    }
    emit();
    return !!state.branchId;
  }

  async function setBranch(branchId) {
    if (!state.branches.some(branch => branch.id === branchId)) throw new Error("Restaurant indisponible.");
    api().setBranch(branchId);
    state.branchId = branchId;
    state.orders = []; state.products = []; state.categories = []; state.zones = []; state.promos = [];
    state.users = []; state.couriers = []; state.customers = []; state.audit = []; state.stats = null; state.cloture = null;
    state.settings = emptySettings(); state.loading = {}; state.errors = {}; state.loaded = {};
    emit();
    await refreshAll();
  }

  async function refreshOne(name) {
    const spec = datasets[name];
    if (!spec || state.loading[name]) return;
    state.loading[name] = true;
    delete state.errors[name];
    emit();
    try {
      const response = await request("get", typeof spec.path === "function" ? spec.path() : spec.path);
      const result = spec.map(response || {});
      if (name === "menu") { state.categories = result.categories; state.products = result.products; }
      else if (name === "settings") state.settings = result;
      else if (name === "stats") state.stats = result;
      else if (name === "cloture") state.cloture = result;
      else state[spec.key] = result;
      state.loaded[name] = true;
    } catch (error) {
      state.errors[name] = error?.message || "Impossible de charger les données.";
      if (name === "menu") { state.categories = []; state.products = []; }
      else if (name === "settings") state.settings = emptySettings();
      else if (name === "stats") state.stats = null;
      else if (name === "cloture") state.cloture = null;
      else state[spec.key] = [];
      state.loaded[name] = false;
    } finally {
      state.loading[name] = false;
      emit();
    }
  }
  async function refreshAll() {
    const names = Object.keys(datasets).filter((name) => {
      if (name === "stats" || name === "cloture") return can("stats");
      if (name === "users") return can("users");
      if (name === "settings") return !!state.user;
      if (name === "couriers") return can("couriers");
      if (name === "clients") return can("clients");
      if (name === "promos") return can("promos");
      if (name === "audit") return can("audit");
      if (name === "zones") return ["cashier", "chef", "waiter", "manager", "admin", "owner"].includes(state.user?.role);
      return !!state.user;
    });
    await Promise.all(names.map(refreshOne));
  }
  async function refreshForRoute(route) {
    const names = routeDatasets[route] || [];
    await Promise.all(names.filter((name) => !state.loaded[name] && !state.errors[name]).map(refreshOne));
  }
  function routeStatus(route) {
    const names = routeDatasets[route] || [];
    const loading = names.some((n) => state.loading[n]);
    const errors = names.filter((n) => state.errors[n]).map((n) => state.errors[n]);
    return { loading, error: errors.length ? errors.join(" ") : "", retry: () => Promise.all(names.map(refreshOne)) };
  }
  function asFailure(error) { return { ok: false, error: error?.message || "Erreur API.", errors: {} }; }
  async function mutate(method, path, body, refresh = []) {
    try {
      const response = await request(method, path, body);
      await Promise.all(refresh.map((name) => refreshOne(name)));
      emit();
      return { ok: true, data: response };
    } catch (error) { return asFailure(error); }
  }

  async function login(email, password, door = "", owner = false) {
    try {
      state.scope = owner ? "owner" : "admin";
      const response = await api().post(owner ? "/api/auth/owner" : "/api/auth/staff",
        owner ? { email, password, door } : { email, password });
      api().setSession(state.scope, response);
      state.user = response.user;
      state.mustChange = !!response.mustChange || !!response.user?.mustChange;
      state.errors = {}; state.loaded = {}; state.loading = {};
      state.clotureDayStart = defaultClotureDay();
      if (!state.mustChange) {
        if (await loadBranches()) await refreshAll();
      }
      emit();
      return { ok: true, user: response.user, mustChange: state.mustChange };
    } catch (error) {
      state.user = null;
      state.mustChange = false;
      return asFailure(error);
    }
  }
  async function changeSecret(current, next) {
    try {
      const response = await request("post", "/api/auth/change-secret", { current, next });
      api().setSession(state.scope, response);
      state.user = response.user;
      state.mustChange = false;
      await refreshAll();
      emit();
      return { ok: true };
    } catch (error) { return asFailure(error); }
  }
  async function logout() {
    const oldScope = state.scope;
    state.user = null;
    state.mustChange = false;
    state.orders = []; state.products = []; state.categories = []; state.zones = []; state.promos = [];
    state.users = []; state.couriers = []; state.customers = []; state.audit = []; state.stats = null; state.cloture = null;
    state.clotureDayStart = defaultClotureDay();
    state.settings = emptySettings(); state.loading = {}; state.errors = {}; state.loaded = {};
    state.branches = []; state.branchId = "";
    emit();
    try {
      if (typeof api().logout === "function") await api().logout(oldScope);
      else api().clearSession(oldScope);
      api().clearBranch();
      return { ok: true };
    } catch (error) {
      return asFailure(error);
    }
  }

  function statsToday(offset) {
    const stat = state.stats;
    if (!stat) return { start: dayStart(Date.now()) - offset * 86400000, count: 0, revenue: 0, avg: 0 };
    const value = offset ? stat.yesterday : stat.today;
    return { start: dayStart(Date.now()) - offset * 86400000, count: Number(value?.count || 0), revenue: Number(value?.revenue || 0), avg: Number(value?.avg || 0) };
  }
  const dayStats = (offset) => statsToday(offset);
  const revenueSeries = (days = 7) => (state.stats?.series || []).slice(-days).map((d) => ({ ...d, start: Number(d.start), revenue: Number(d.revenue || 0) }));
  function statusCounts() {
    const raw = state.stats?.statusToday || {};
    return ORDER_STATUSES.map((status) => ({ ...status, count: Number(raw[statusToApi[status.id] || status.id] || 0) }));
  }
  const topProducts = (limit = 5) => (state.stats?.topProducts || []).slice(0, limit).map((p) => ({ ...p, qty: Number(p.qty || 0) }));
  const courierStatus = (c) => !c.active ? "inactif" : c.status || (c.busy ? "mission" : c.online ? "online" : "offline");
  const courierToday = (c) => Number(c.todayDeliveries || 0);
  function customerStats(c) {
    const orders = state.orders.filter((o) => o.customerId === c.id);
    return { orders, count: Number(c.orderCount ?? orders.length), spent: Number(c.spent || 0), last: Number(c.lastOrder || orders.reduce((m, o) => Math.max(m, o.createdAt), 0)) };
  }
  function alerts() {
    const out = [];
    const waiting = state.orders.filter((o) => o.mode === "livraison" && !o.courierId && ["nouvelle", "preparation", "prete"].includes(o.status) && Date.now() - o.createdAt > 300000);
    if (waiting.length) out.push({ tone: "red", icon: "alert", text: `${waiting.length} commande(s) sans livreur depuis plus de 5 min`, link: "#/commandes" });
    const fresh = state.orders.filter((o) => o.status === "nouvelle").length;
    if (fresh) out.push({ tone: "gold", icon: "bell", text: `${fresh} nouvelle(s) commande(s) à confirmer`, link: "#/commandes" });
    const outOfStock = state.products.filter((p) => !p.available).length;
    if (outOfStock) out.push({ tone: "orange", icon: "box", text: `${outOfStock} produit(s) épuisé(s) au menu`, link: "#/menu" });
    if (!state.settings.acceptingOrders) out.push({ tone: "red", icon: "ban", text: "Les commandes sont en pause", link: "#/reglages" });
    const noCash = state.couriers.filter((c) => c.cashHeld >= 300).length;
    if (noCash) out.push({ tone: "blue", icon: "cash", text: `${noCash} livreur(s) détiennent plus de 300 MAD en espèces`, link: "#/livreurs" });
    return out;
  }
  const statusLabel = (id) => (ORDER_STATUSES.find((s) => s.id === id) || {}).label || id;
  const flowFor = (o) => o.mode === "emporter" ? STATUS_FLOW.filter((s) => s !== "en_route") : STATUS_FLOW;
  const nextStatus = (o) => {
    if (o.status === "nouvelle") return "preparation";
    if (o.status === "preparation") return "prete";
    if (o.status === "prete" && o.mode === "emporter") return "livree";
    return null;
  };

  function advanceOrder(id) {
    const order = byId(state.orders, id);
    if (!order) return Promise.resolve({ ok: false, error: "Commande introuvable." });
    if (order.status === "nouvelle") return mutate("post", `/api/orders/${encodeURIComponent(id)}/accept`, { prepMinutes: order.prepMinutes || state.settings.defaultPrep || 20 }, ["orders", "stats"]);
    if (order.status === "preparation") return mutate("post", `/api/orders/${encodeURIComponent(id)}/ready`, {}, ["orders", "stats", "couriers"]);
    if (order.status === "prete" && order.mode === "emporter") return mutate("post", `/api/orders/${encodeURIComponent(id)}/handover`, {}, ["orders", "stats"]);
    return Promise.resolve({ ok: false, error: "Aucune action de progression disponible pour cette commande." });
  }
  const refuseOrder = (id, reason) => mutate("post", `/api/orders/${encodeURIComponent(id)}/refuse`, { reason }, ["orders", "stats", "audit"]);
  const adjustPrep = (id, prepMinutes) => mutate("patch", `/api/orders/${encodeURIComponent(id)}/prep`, { prepMinutes }, ["orders"]);
  const assignCourier = (id, courierId) => mutate("post", `/api/orders/${encodeURIComponent(id)}/assign`, { courierId }, ["orders", "couriers"]);
  const cancelOrder = (id, reason, note) => mutate("post", `/api/orders/${encodeURIComponent(id)}/cancel`, { reason: note ? `${reason} — ${note}` : reason }, ["orders", "stats", "audit"]);

  const productBody = (d) => ({
    categoryId: d.categoryId || d.category || null, name: d.name, description: d.description || "", price: d.price, dinePrice: d.dinePrice,
    discount: d.discount || 0, sizes: d.sizes || [], extras: d.extras || [], image: d.image || "",
    available: !!d.available, visible: !!d.visible
  });
  const saveProduct = (id, d) => mutate(id ? "put" : "post", id ? `/api/admin/menu/${encodeURIComponent(id)}` : "/api/admin/menu", productBody(d), ["menu"]);
  const toggleAvailability = (id) => {
    const p = byId(state.products, id);
    return p ? mutate("patch", `/api/admin/menu/${encodeURIComponent(id)}/availability`, { available: !p.available }, ["menu", "stats"]) : Promise.resolve({ ok: false, error: "Produit introuvable." });
  };
  const deleteProduct = (id) => mutate("delete", `/api/admin/menu/${encodeURIComponent(id)}`, undefined, ["menu"]);
  const saveCategory = (id, name) => mutate(id ? "put" : "post", id ? `/api/admin/categories/${encodeURIComponent(id)}` : "/api/admin/categories", { name }, ["menu"]);
  const deleteCategory = (id) => mutate("delete", `/api/admin/categories/${encodeURIComponent(id)}`, undefined, ["menu"]);
  const saveZone = (id, patch) => {
    const z = byId(state.zones, id);
    return mutate("put", `/api/admin/zones/${encodeURIComponent(id)}`, { name: z?.name || "", ...patch, enabled: z?.enabled ?? true }, ["zones"]);
  };
  const toggleZone = (id) => {
    const z = byId(state.zones, id);
    return z ? mutate("put", `/api/admin/zones/${encodeURIComponent(id)}`, { ...z, enabled: !z.enabled }, ["zones"]) : Promise.resolve({ ok: false, error: "Zone introuvable." });
  };
  const deleteZone = (id) => mutate("delete", `/api/admin/zones/${encodeURIComponent(id)}`, undefined, ["zones"]);
  const savePromo = (id, d) => mutate(id ? "put" : "post", id ? `/api/admin/promos/${encodeURIComponent(id)}` : "/api/admin/promos", d, ["promos"]);
  const togglePromo = (id) => {
    const p = byId(state.promos, id);
    return p ? mutate("put", `/api/admin/promos/${encodeURIComponent(id)}`, { ...p, active: !p.active }, ["promos"]) : Promise.resolve({ ok: false, error: "Code promo introuvable." });
  };
  const deletePromo = (id) => mutate("delete", `/api/admin/promos/${encodeURIComponent(id)}`, undefined, ["promos"]);
  const saveUser = (id, d) => mutate(id ? "put" : "post", id ? `/api/admin/users/${encodeURIComponent(id)}` : "/api/admin/users", {
    name: d.name, email: d.email, role: d.role, active: d.active, ...(d.password ? { password: d.password } : {})
  }, ["users"]);
  const toggleUserActive = (id) => {
    const u = byId(state.users, id);
    return u ? mutate("put", `/api/admin/users/${encodeURIComponent(id)}`, { active: !u.active }, ["users"]) : Promise.resolve({ ok: false, error: "Utilisateur introuvable." });
  };
  const addCourier = (d) => mutate("post", "/api/admin/couriers", d, ["couriers"]);
  const setCourierActive = (id, active) => mutate("put", `/api/admin/couriers/${encodeURIComponent(id)}`, { active }, ["couriers"]);
  const saveCourier = (id, d) => mutate("put", `/api/admin/couriers/${encodeURIComponent(id)}`, d, ["couriers"]);
  const deleteCourier = (id) => mutate("delete", `/api/admin/couriers/${encodeURIComponent(id)}`, undefined, ["couriers"]);
  const resetCourierPin = async (id) => {
    const r = await mutate("post", `/api/admin/couriers/${encodeURIComponent(id)}/reset-pin`, {}, ["couriers"]);
    return r.ok ? { ...r.data, ok: true } : r;
  };
  const resetStaffCode = async (id) => {
    const r = await mutate("post", `/api/admin/users/${encodeURIComponent(id)}/reset-code`, {}, ["users"]);
    return r.ok ? { ...r.data, ok: true } : r;
  };
  const settleCash = (id) => mutate("post", `/api/admin/couriers/${encodeURIComponent(id)}/settle`, {}, ["couriers"]);
  const toggleBlocked = (id) => {
    const c = byId(state.customers, id);
    return c ? mutate("patch", `/api/admin/clients/${encodeURIComponent(id)}/block`, { blocked: !c.blocked }, ["clients"]) : Promise.resolve({ ok: false, error: "Client introuvable." });
  };

  async function saveSettings(update, label) {
    try {
      const next = clone(state.settings);
      update(next);
      const body = {};
      if (next.acceptingOrders !== state.settings.acceptingOrders) body.paused = !next.acceptingOrders;
      for (const key of ["deliveryOn", "dispatchMode", "defaultPrep", "freeDelivery", "restaurant", "hours", "notif"]) {
        if (JSON.stringify(next[key]) !== JSON.stringify(state.settings[key])) body[key] = next[key];
      }
      const opsKeys = ["paused", "dispatchMode", "defaultPrep"];
      const onlyOps = Object.keys(body).every((key) => opsKeys.includes(key));
      const response = await request(onlyOps && can("settingsOps") ? "patch" : "put",
        onlyOps && can("settingsOps") ? "/api/admin/settings/operations" : "/api/admin/settings", body);
      await refreshOne("settings");
      return { ok: true, data: response };
    } catch (error) { return asFailure(error); }
  }
  async function getCloture() {
    try {
      const data = await request("get", `/api/admin/cloture?dayStart=${state.clotureDayStart}`);
      return { ok: true, data };
    } catch (error) { return asFailure(error); }
  }
  async function setClotureDay(ts) {
    const start = dayStart(ts);
    const today = dayStart(Date.now());
    const min = today - 400 * 86400000;
    state.clotureDayStart = Math.min(today, Math.max(min, start));
    state.cloture = null;
    await refreshOne("cloture");
    return { ok: true, data: state.cloture };
  }
  const saveRestaurant = (d) => saveSettings((s) => { s.restaurant = d; }, "Informations du restaurant mises à jour");
  const saveHours = (hours) => saveSettings((s) => { s.hours = hours; }, "Horaires d'ouverture mis à jour");

  async function ownerView(target) {
    if (state.user?.role !== "owner") throw new Error("Réservé au propriétaire.");
    return api().post("/api/owner/switch", { target }, state.scope);
  }

  return {
    load, get, subscribe, currentUser, changeRequired, can, login, changeSecret, logout, loadBranches, refreshForRoute, refreshAll, routeStatus,
    ownerView,
    setBranch,
    advanceOrder, refuseOrder, adjustPrep, assignCourier, cancelOrder, nextStatus, flowFor, statusLabel,
    saveProduct, toggleAvailability, deleteProduct, saveCategory, deleteCategory, saveZone, toggleZone, deleteZone,
    savePromo, togglePromo, deletePromo, saveUser, toggleUserActive, deleteUser, addCourier, setCourierActive, saveCourier, deleteCourier, resetCourierPin, resetStaffCode,
    settleCash, toggleBlocked, saveSettings, saveRestaurant, saveHours, getCloture, setClotureDay,
    byId, dayStats, revenueSeries, statusCounts, topProducts, courierStatus, courierToday, customerStats,
    alerts, dayStart, printerPrefs, setPrinterPrefs
  };
})();
