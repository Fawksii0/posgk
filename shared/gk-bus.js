/* G&K shared front-end bus: Client (GKMobile) <-> Cuisine (GKCuisine) <-> Courier (GKCourier).
   One localStorage key holds the whole state. Apps share it only when served from one origin
   (e.g. `python -m http.server 8800` at the repo root). Under file:// `GKBus.linked` is false. */
(function () {
  "use strict";

  const KEY = "gk-bus-v1";
  const PRESENCE_KEY = "gk-bus-presence-v1";
  const OFFER_MS = 60000;
  const STORE = { name: "G&K Food Bouznika", lat: 33.7895, lng: -7.1597 };
  const LIVE = ["preparing", "ready", "enroute"];
  const hasChannel = typeof BroadcastChannel === "function";

  const linked = (() => {
    if (location.protocol === "file:") return false;
    try {
      localStorage.setItem(`${KEY}-probe`, "1");
      localStorage.removeItem(`${KEY}-probe`);
      return true;
    } catch {
      return false;
    }
  })();

  const seed = () => ({
    v: 1, rev: 0, seq: 2841, nid: 1, orders: [],
    couriers: [
      { id: "c1", name: "Youssef Amrani", phone: "0612345678", pin: "1234", online: false, lat: 33.796, lng: -7.17, phase: 0.4 },
      { id: "c2", name: "Karim Alaoui", phone: "0623456789", pin: "1234", online: false, lat: 33.786, lng: -7.156, phase: 2.1 },
      { id: "c3", name: "Salma Idrissi", phone: "0634567890", pin: "1234", online: false, lat: 33.81, lng: -7.18, phase: 4.2 }
    ],
    menuAvailability: {},
    settings: { paused: false, dispatchMode: "rotation", defaultPrep: 20, rotationPointer: -1 },
    notifications: { client: [], courier: [] }
  });

  /* ---------- storage ---------- */

  let memory = null;
  let cache = { raw: null, state: null };
  const listeners = new Set();
  let lastRev = -1;
  const channel = hasChannel ? new BroadcastChannel("gk-bus") : null;

  function readRaw() {
    try { return localStorage.getItem(KEY); } catch { return memory; }
  }

  function get() {
    const raw = readRaw();
    if (raw && raw === cache.raw) return cache.state;
    let state = null;
    try { state = raw ? JSON.parse(raw) : null; } catch { state = null; }
    if (!state || state.v !== 1 || !Array.isArray(state.orders)) state = seed();
    cache = { raw, state };
    return state;
  }

  function emit() {
    const state = get();
    if (state.rev === lastRev) return;
    lastRev = state.rev;
    listeners.forEach(cb => { try { cb(state); } catch (error) { console.error(error); } });
  }

  // Atomic read-modify-write; returns whatever `fn` returns.
  function update(fn) {
    const draft = JSON.parse(JSON.stringify(get()));
    const result = fn(draft);
    draft.rev += 1;
    const raw = JSON.stringify(draft);
    try { localStorage.setItem(KEY, raw); } catch { memory = raw; }
    cache = { raw, state: draft };
    emit();
    if (channel) channel.postMessage(draft.rev);
    return result;
  }

  function subscribe(cb) {
    listeners.add(cb);
    return () => listeners.delete(cb);
  }

  window.addEventListener("storage", event => { if (event.key === KEY) emit(); });
  if (channel) channel.onmessage = () => emit();
  lastRev = get().rev;

  /* ---------- presence (kept out of the main key so it never triggers re-renders) ---------- */

  function heartbeat(role) {
    try {
      const presence = JSON.parse(localStorage.getItem(PRESENCE_KEY) || "{}");
      presence[role] = Date.now();
      localStorage.setItem(PRESENCE_KEY, JSON.stringify(presence));
    } catch { /* presence is best-effort */ }
  }

  function isAlive(role, ttl = 30000) {
    try { return Date.now() - (JSON.parse(localStorage.getItem(PRESENCE_KEY) || "{}")[role] || 0) < ttl; } catch { return false; }
  }

  /* ---------- helpers ---------- */

  const now = () => Date.now();
  const first = name => String(name || "").split(" ")[0];
  const hhmm = ts => new Date(ts).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
  const findOrder = (state, id) => state.orders.find(order => order.id === id);
  const clampPrep = value => Math.min(90, Math.max(5, Math.round(Number(value) || 20)));

  function haversine(a, b) {
    const rad = deg => deg * Math.PI / 180;
    const h = Math.sin(rad(b.lat - a.lat) / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(rad(b.lng - a.lng) / 2) ** 2;
    return 12742 * Math.asin(Math.sqrt(h));
  }

  // Simulated slow drift around each courier's base position (deterministic, so every app agrees).
  function courierPos(courier, at = now()) {
    return {
      lat: courier.lat + 0.002 * Math.sin(at / 90000 + courier.phase),
      lng: courier.lng + 0.002 * Math.cos(at / 110000 + courier.phase)
    };
  }

  function log(order, status, by, note) {
    order.history.push({ status, at: now(), by, ...(note ? { note } : {}) });
  }

  function notify(state, who, entry) {
    state.notifications[who].unshift({ id: state.nid++, at: now(), ...entry });
    state.notifications[who].length = Math.min(state.notifications[who].length, 60);
  }
  const toClient = (state, order, title, text) => notify(state, "client", { orderId: order.id, title, text });
  const toCourier = (state, courierId, order, title, text) => notify(state, "courier", { courierId, orderId: order.id, title, text });

  /* ---------- dispatch ---------- */

  function courierBusy(state, courierId, exceptId) {
    return state.orders.some(order => order.id !== exceptId && order.mode === "delivery" && LIVE.includes(order.status)
      && order.dispatch.courierId === courierId && ["offering", "assigned"].includes(order.dispatch.state));
  }

  function courierInfo(state, at = now()) {
    return state.couriers.map(courier => ({
      courier, online: courier.online, busy: courierBusy(state, courier.id),
      km: haversine(STORE, courierPos(courier, at))
    }));
  }

  // Eligible couriers, best first: rotation order after the pointer, or nearest to the store.
  function candidates(state, order) {
    const count = state.couriers.length;
    const list = courierInfo(state).filter(info => info.online && !info.busy && !order.dispatch.tried.includes(info.courier.id));
    if (state.settings.dispatchMode === "proximity") return list.sort((a, b) => a.km - b.km);
    const rank = info => (state.couriers.indexOf(info.courier) - state.settings.rotationPointer - 1 + count * 2) % count;
    return list.sort((a, b) => rank(a) - rank(b));
  }

  function offerNext(state, order) {
    const next = candidates(state, order)[0];
    if (!next) {
      order.dispatch = { ...order.dispatch, state: "failed", courierId: null };
      log(order, "dispatch", "systeme", "Aucun livreur disponible");
      return;
    }
    const at = now();
    order.dispatch = { ...order.dispatch, state: "offering", courierId: next.courier.id, offeredAt: at, expiresAt: at + OFFER_MS, km: Math.round(next.km * 10) / 10 };
    state.settings.rotationPointer = state.couriers.indexOf(next.courier);
    log(order, "dispatch", "systeme", `Offre envoyée à ${first(next.courier.name)} (${order.dispatch.km} km)`);
    toCourier(state, next.courier.id, order, "Nouvelle offre de livraison", `Commande ${order.id} acceptée par la cuisine. Répondez sous ${OFFER_MS / 1000} s.`);
  }

  function assign(state, order, courier, manual) {
    order.dispatch = { ...order.dispatch, state: "assigned", courierId: courier.id, manual: !!manual, expiresAt: 0 };
    order.courier = { id: courier.id, name: courier.name, phone: courier.phone };
    order.courierStep = 1;
    log(order, "dispatch", manual ? "caisse" : courier.id, manual ? `Assignée à ${first(courier.name)}` : `${first(courier.name)} a accepté`);
    toClient(state, order, "Livreur assigné", `${first(courier.name)} s'occupe de votre livraison.`);
  }

  const freshDispatch = () => ({ state: "none", courierId: null, tried: [] });

  /* ---------- orders ---------- */

  // Returns { order } or { error }.
  function publishOrder(input) {
    return update(state => {
      if (state.settings.paused) return { error: "Les commandes sont momentanément en pause." };
      const soldOut = (input.items || []).find(item => state.menuAvailability[item.productId] === false);
      if (soldOut) return { error: `${soldOut.name} n'est plus disponible.` };
      const at = input.createdAt || now();
      const order = {
        ...input, id: `GK-${state.seq++}`, status: "pending", createdAt: at, prepMin: null, promisedAt: null,
        history: [{ status: "pending", at, by: "client" }], dispatch: freshDispatch(), courierStep: 0, courier: null
      };
      state.orders.unshift(order);
      return { order: JSON.parse(JSON.stringify(order)) };
    });
  }

  function mutate(id, fn) {
    return update(state => {
      const order = findOrder(state, id);
      if (!order) return "Commande introuvable.";
      return fn(state, order) || "";
    });
  }

  function acceptOrder(id, prepMin, by = "caisse") {
    return mutate(id, (state, order) => {
      if (order.status !== "pending") return "Cette commande n'est plus en attente.";
      const prep = clampPrep(prepMin ?? state.settings.defaultPrep);
      const at = now();
      Object.assign(order, { status: "preparing", acceptedAt: at, prepMin: prep, promisedAt: at + prep * 60000 });
      log(order, "preparing", by);
      toClient(state, order, "Commande acceptée", `Votre commande est en préparation, prête vers ${hhmm(order.promisedAt)}.`);
      if (order.mode === "delivery") offerNext(state, order);
    });
  }

  function refuseOrder(id, reason, by = "caisse") {
    return mutate(id, (state, order) => {
      if (order.status !== "pending") return "Cette commande n'est plus en attente.";
      order.status = "refused";
      order.refusedReason = reason || "Autre";
      log(order, "refused", by, order.refusedReason);
      toClient(state, order, "Commande refusée", `Motif : ${order.refusedReason}.`);
    });
  }

  function cancelOrder(id, by = "client") {
    return mutate(id, (state, order) => {
      if (order.status !== "pending") return "La cuisine a déjà traité votre commande : elle ne peut plus être annulée.";
      order.status = "cancelled";
      log(order, "cancelled", by);
    });
  }

  function setPrep(id, prepMin, by = "caisse") {
    return mutate(id, (state, order) => {
      if (!["preparing", "ready"].includes(order.status)) return "Temps non modifiable.";
      const prep = clampPrep(prepMin);
      if (prep === order.prepMin) return;
      order.prepMin = prep;
      order.promisedAt = order.acceptedAt + prep * 60000;
      log(order, "prep", by, `${prep} min`);
      toClient(state, order, "Temps de préparation ajusté", `${prep} min au total · prête vers ${hhmm(order.promisedAt)}.`);
      if (order.dispatch.courierId && ["offering", "assigned"].includes(order.dispatch.state)) {
        toCourier(state, order.dispatch.courierId, order, "Temps de préparation ajusté", `Commande ${order.id} : prête vers ${hhmm(order.promisedAt)}.`);
      }
    });
  }

  function markReady(id, by = "cuisine") {
    return mutate(id, (state, order) => {
      if (order.status !== "preparing") return "Cette commande n'est pas en préparation.";
      order.status = "ready";
      order.readyAt = now();
      log(order, "ready", by);
      if (order.mode === "pickup") toClient(state, order, "Commande prête", "Votre commande est prête à retirer au comptoir G&K.");
      else {
        toClient(state, order, "Commande prête", "Votre commande est prête, le livreur va la récupérer.");
        if (order.dispatch.state === "assigned") toCourier(state, order.dispatch.courierId, order, "Commande prête", `Commande ${order.id} prête : récupérez-la au comptoir.`);
      }
    });
  }

  function handOver(id, by = "caisse") {
    return mutate(id, (state, order) => {
      if (order.mode !== "pickup" || order.status !== "ready") return "Remise impossible.";
      order.status = "delivered";
      order.deliveredAt = now();
      log(order, "delivered", by);
      toClient(state, order, "Commande retirée", "Bon appétit !");
    });
  }

  function assignManual(id, courierId, by = "caisse") {
    return mutate(id, (state, order) => {
      const courier = state.couriers.find(item => item.id === courierId);
      if (!courier || order.mode !== "delivery" || !["preparing", "ready"].includes(order.status)) return "Assignation impossible.";
      assign(state, order, courier, true);
      toCourier(state, courier.id, order, "Mission assignée", `La caisse vous a assigné la commande ${order.id}.`);
      if (order.status === "ready") toCourier(state, courier.id, order, "Commande prête", `Commande ${order.id} prête : récupérez-la au comptoir.`);
    });
  }

  function retryDispatch(id) {
    return mutate(id, (state, order) => {
      if (order.mode !== "delivery" || !["preparing", "ready"].includes(order.status) || order.dispatch.state === "assigned") return "Relance impossible.";
      order.dispatch.tried = [];
      offerNext(state, order);
    });
  }

  /* ---------- courier side ---------- */

  const mine = (order, courierId, states) => order.dispatch.courierId === courierId && states.includes(order.dispatch.state);

  function courierRespond(id, courierId, accept) {
    return mutate(id, (state, order) => {
      if (!mine(order, courierId, ["offering"])) return "Offre expirée ou déjà attribuée.";
      const courier = state.couriers.find(item => item.id === courierId);
      if (accept) return assign(state, order, courier, false);
      order.dispatch.tried.push(courierId);
      log(order, "dispatch", courierId, `${first(courier.name)} a refusé`);
      offerNext(state, order);
    });
  }

  // `to` is the courier-app step: 2 arrived, 3 picked up, 4 on the way.
  function courierStep(id, courierId, to) {
    return mutate(id, (state, order) => {
      if (!mine(order, courierId, ["assigned"])) return "Mission non assignée.";
      if (to !== order.courierStep + 1) return;
      if (to === 3) {
        if (order.status !== "ready") return "La cuisine n'a pas encore marqué la commande prête.";
        order.status = "enroute";
        order.pickedUpAt = now();
        log(order, "enroute", courierId);
        toClient(state, order, "Commande en route", `${first(order.courier.name)} est en route vers vous.`);
      }
      order.courierStep = to;
    });
  }

  function courierDeliver(id, courierId) {
    return mutate(id, (state, order) => {
      if (!mine(order, courierId, ["assigned"]) || order.status !== "enroute") return "Livraison impossible.";
      order.status = "delivered";
      order.courierStep = 5;
      order.deliveredAt = now();
      log(order, "delivered", courierId);
      toClient(state, order, "Commande livrée", "Bon appétit !");
    });
  }

  // Courier gives the mission back (problem or going offline): next candidate, or manual assignment.
  function courierRelease(id, courierId, note) {
    return mutate(id, (state, order) => {
      if (!mine(order, courierId, ["offering", "assigned"])) return;
      const courier = state.couriers.find(item => item.id === courierId);
      order.dispatch.tried.push(courierId);
      order.courier = null;
      order.courierStep = 0;
      log(order, "dispatch", courierId, `${first(courier.name)} abandonne${note ? ` : ${note}` : ""}`);
      if (order.status === "enroute") order.dispatch = { ...order.dispatch, state: "failed", courierId: null };
      else offerNext(state, order);
    });
  }

  function setCourierOnline(courierId, online) {
    return update(state => {
      const courier = state.couriers.find(item => item.id === courierId);
      if (!courier) return;
      courier.online = !!online;
      if (online) return;
      state.orders.forEach(order => {
        if (order.mode === "delivery" && order.status !== "enroute" && mine(order, courierId, ["offering"])) {
          order.dispatch.tried.push(courierId);
          log(order, "dispatch", courierId, `${first(courier.name)} est hors ligne`);
          offerNext(state, order);
        }
      });
    });
  }

  // Expires stale offers. Cheap to call every second from any app: it only writes when needed.
  function tick() {
    const at = now();
    if (!get().orders.some(order => order.dispatch.state === "offering" && order.dispatch.expiresAt <= at)) return;
    update(state => {
      state.orders.forEach(order => {
        if (order.dispatch.state !== "offering" || order.dispatch.expiresAt > at) return;
        const courier = state.couriers.find(item => item.id === order.dispatch.courierId);
        order.dispatch.tried.push(order.dispatch.courierId);
        log(order, "dispatch", "systeme", `${first(courier && courier.name)} n'a pas répondu`);
        offerNext(state, order);
      });
    });
  }

  /* ---------- settings & menu ---------- */

  const setAvailability = (productId, available) => update(state => { state.menuAvailability[productId] = !!available; });
  const setSettings = patch => update(state => { Object.assign(state.settings, patch); });
  const reset = () => update(state => { Object.assign(state, seed(), { rev: state.rev }); });

  window.GKBus = {
    KEY, STORE, OFFER_MS, linked,
    get, update, subscribe, reset, heartbeat, isAlive, tick,
    haversine, courierPos, courierInfo, courierBusy, candidates,
    publishOrder, acceptOrder, refuseOrder, cancelOrder, setPrep, markReady, handOver, assignManual, retryDispatch,
    courierRespond, courierStep, courierDeliver, courierRelease, setCourierOnline,
    setAvailability, setSettings
  };
})();
