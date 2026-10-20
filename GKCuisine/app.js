(() => {
  "use strict";

  const api = window.GKApi;
  const app = document.getElementById("app");
  const sheetRoot = document.getElementById("sheet-root");
  const printArea = document.getElementById("print-area");
  const toastEl = document.getElementById("toast");
  const ui = { view: "board", col: "new", filter: "all", prep: {}, sheet: null, dirty: false };
  const data = {
    orders: [], menu: [], categories: [], couriers: [], settings: { paused: false, dispatchMode: "rotation", defaultPrep: 20 },
    loading: false, loaded: false, error: "", actionError: ""
  };
  const baseTitle = "G&K Cuisine";
  let knownPending = new Set();
  let renderQueued = false;
  let toastTimer = 0;
  let refreshRunning = false;
  let bootRefresh = true;

  const COLUMNS = [
    { key: "new", label: "Nouvelles", icon: "bell" },
    { key: "prep", label: "En préparation", icon: "flame" },
    { key: "ready", label: "Prêtes", icon: "check" },
    { key: "out", label: "En livraison / Terminées", icon: "bike" }
  ];
  const VIEWS = [
    { key: "board", label: "Commandes", icon: "list" },
    { key: "history", label: "Historique", icon: "history" },
    { key: "stock", label: "Stock", icon: "box" },
    { key: "settings", label: "Réglages", icon: "settings" }
  ];

  const defaultPrep = () => Number(data.settings.defaultPrep) || 20;
  const findOrder = id => data.orders.find(order => order.id === id);
  const statusPill = order => `<span class="pill s-${order.status}">${esc(STATUS_LABELS[order.status] || order.status)}</span>`;

  function toast(message) {
    toastEl.textContent = message;
    toastEl.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastEl.classList.remove("show"), 4200);
  }

  function numberTime(value) {
    const numeric = Number(value);
    if (Number.isFinite(numeric) && numeric > 0) return numeric;
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  function normalizeOrder(row) {
    const items = Array.isArray(row.items) ? row.items.map(item => {
      const qty = Number(item.qty) || 1;
      const unit = item.unit === undefined ? Number(item.price || 0) / qty : Number(item.unit);
      return { qty, name: item.name || "", size: item.size || "", extras: item.extras || [], price: unit };
    }) : [];
    const dispatchState = row.dispatch_state === "unassigned" ? "failed" : row.dispatch_state === "offered" ? "offering" : row.dispatch_state;
    const paymentType = row.payment === "cash" ? "cash" : "card";
    return {
      id: row.id,
      seq: row.seq,
      status: row.status,
      mode: row.mode,
      items,
      customer: { name: row.customer_name || "", phone: row.customer_phone || "" },
      address: { street: row.address || "", zone: row.zone_name || row.zone_id || "", label: row.address_label || "" },
      note: row.note || "",
      subtotal: Number(row.subtotal) || 0,
      fee: Number(row.fee) || 0,
      discount: Number(row.discount) || 0,
      total: Number(row.total) || 0,
      payment: paymentType === "cash" ? "Espèces" : "Carte",
      paymentType,
      createdAt: numberTime(row.created_at),
      acceptedAt: numberTime(row.accepted_at),
      promisedAt: numberTime(row.promised_at),
      deliveredAt: numberTime(row.delivered_at),
      prepMin: Number(row.prep_minutes) || 20,
      refusedReason: row.refused_reason || "",
      courierStep: Number(row.courier_step) || 0,
      dispatch: {
        state: dispatchState,
        courierId: row.offered_to || row.courier_id || "",
        expiresAt: numberTime(row.offer_expires),
        km: row.dispatch_km == null ? null : Number(row.dispatch_km),
        manual: !!row.dispatch_manual
      }
    };
  }

  function distanceKm(lat, lng) {
    if (lat == null || lng == null) return null;
    const radians = value => value * Math.PI / 180;
    const dLat = radians(Number(lat) - 33.7895);
    const dLng = radians(Number(lng) - -7.1597);
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(radians(33.7895)) * Math.cos(radians(Number(lat))) * Math.sin(dLng / 2) ** 2;
    return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  function courierMap() {
    const map = {};
    data.couriers.forEach(courier => {
      map[courier.id] = {
        courier: { id: courier.id, name: courier.name || "Livreur" },
        active: courier.active !== false,
        online: courier.active !== false && !!courier.online,
        busy: !!courier.busy,
        km: distanceKm(courier.lat, courier.lng)
      };
    });
    return map;
  }

  async function refreshData() {
    if (!state.session || state.session.mustChange || refreshRunning) return;
    refreshRunning = true;
    if (!data.loaded) {
      data.loading = true;
      render();
    }
    try {
      const requests = [
        api.get("/api/orders", API_SCOPE),
        api.get("/api/admin/settings", API_SCOPE)
      ];
      if (isCashier()) {
        requests.push(api.get("/api/admin/menu", API_SCOPE));
        requests.push(api.get("/api/admin/couriers", API_SCOPE));
      }
      const results = await Promise.all(requests);
      const orders = results[0].orders || [];
      const oldPending = knownPending;
      data.orders = orders.map(normalizeOrder);
      data.settings = { ...data.settings, ...results[1] };
      if (isCashier()) {
        data.categories = results[2].categories || [];
        const names = new Map(data.categories.map(category => [category.id, category.name]));
        data.menu = (results[2].items || []).filter(item => item.visible).map(item => ({
          ...item, category: names.get(item.categoryId) || ""
        }));
        data.couriers = results[3].couriers || [];
      } else {
        data.menu = [];
        data.couriers = [];
      }
      knownPending = new Set(data.orders.filter(order => order.status === "pending").map(order => order.id));
      data.error = "";
      data.loaded = true;
      data.loading = false;
      if (!bootRefresh) {
        const fresh = [...knownPending].filter(id => !oldPending.has(id));
        if (fresh.length) {
          beep();
          toast(`Nouvelle commande ${fresh.join(", ")}`);
        }
      }
      bootRefresh = false;
    } catch (error) {
      data.loading = false;
      data.error = error.message || "Impossible de charger les données du serveur.";
    } finally {
      refreshRunning = false;
      render();
    }
  }

  /* ---------- rendering ---------- */

  function renderLogin() {
    return `<main class="login">
      <form class="login-card" data-form="login" novalidate>
        <div class="brand"><img src="assets/emblem-reference.png" alt="G&amp;K Food" width="56" height="56"><span class="pill-black">CUISINE</span></div>
        <h1>Connexion</h1>
        <p class="muted">Espace caisse et cuisine G&amp;K Food.</p>
        <label>E-mail<input name="email" type="email" autocomplete="username" inputmode="email" required></label>
        <label>Mot de passe<input name="password" type="password" autocomplete="current-password" required></label>
        <p class="form-error" role="alert" data-login-error></p>
        <button class="btn primary block" type="submit">Se connecter</button>
        <p class="hint">Connectez-vous avec le compte personnel créé par un administrateur G&amp;K.</p>
      </form>
    </main>`;
  }

  function renderChangeSecret() {
    return `<main class="login">
      <form class="login-card" data-form="change-secret" novalidate>
        <div class="brand"><img src="assets/emblem-reference.png" alt="G&amp;K Food" width="56" height="56"><span class="pill-black">CUISINE</span></div>
        <h1>Changer le mot de passe</h1>
        <p class="muted">Un nouveau mot de passe est requis avant d'accéder à Cuisine.</p>
        <label>Mot de passe actuel<input name="current" type="password" autocomplete="current-password" required></label>
        <label>Nouveau mot de passe<input name="next" type="password" autocomplete="new-password" minlength="8" required></label>
        <p class="form-error" role="alert" data-secret-error></p>
        <button class="btn primary block" type="submit">Enregistrer et continuer</button>
        <button class="btn block ghost" type="button" data-action="logout">Se déconnecter</button>
      </form>
    </main>`;
  }

  function renderHeader() {
    const connected = GKPrinter.connected();
    const printerChip = isCashier()
      ? `<button class="chip ${connected ? "ok" : "off"}" data-action="view" data-view="settings" aria-label="Imprimante : ${connected ? "connectée" : "déconnectée"}">${icon("printer")}<span>${connected ? `Connectée · ${esc(GKPrinter.name())}` : "Déconnectée"}</span></button>`
      : "";
    return `<header class="top">
      <div class="brand"><img src="assets/emblem-reference.png" alt="G&amp;K Food" width="40" height="40"><span class="pill-black">CUISINE</span></div>
      <div class="chips">
        <span class="chip branch-chip">${icon("store")}<span>${esc(state.session.branchName || "Restaurant G&K")}</span></span>
        <span class="chip ${data.settings.paused ? "warn" : "ok"}">${icon(data.settings.paused ? "pause" : "store")}<span>${data.settings.paused ? "Commandes en pause" : "Ouvert"}</span></span>
        ${printerChip}
        <span class="chip ${data.error ? "off" : "ok"}" title="${data.error ? "Connexion API indisponible" : "Connecté au serveur G&K"}">${icon("wifi")}<span>${data.error ? "API hors ligne" : "API connectée"}</span></span>
      </div>
      <div class="who"><span class="who-name">${icon("user")}<span>${esc(`${state.session.name} · ${state.session.label}`)}</span></span>
        <button class="icon-btn" data-action="toggle-sound" aria-label="${state.prefs.sound ? "Couper le son" : "Activer le son"}" aria-pressed="${state.prefs.sound}">${icon(state.prefs.sound ? "volume" : "volumeOff")}</button>
        <button class="icon-btn" data-action="logout" aria-label="Se déconnecter">${icon("logout")}</button></div>
    </header>
    <nav class="tabs" aria-label="Navigation">${VIEWS.filter(v => (v.key !== "settings" && v.key !== "stock") || isCashier()).map(v => `<button class="tab ${ui.view === v.key ? "active" : ""}" data-action="view" data-view="${v.key}" aria-current="${ui.view === v.key}">${icon(v.icon)}<span>${v.label}</span></button>`).join("")}</nav>`;
  }

  function stepper(orderId, minutes, scope) {
    return `<div class="stepper" role="group" aria-label="Temps de préparation">
      <button class="icon-btn" data-action="prep" data-id="${esc(orderId)}" data-scope="${scope}" data-delta="-5" aria-label="Moins 5 minutes" ${minutes <= 5 ? "disabled" : ""}>${icon("minus")}</button>
      <span class="stepper-value"><b>${minutes}</b> min</span>
      <button class="icon-btn" data-action="prep" data-id="${esc(orderId)}" data-scope="${scope}" data-delta="5" aria-label="Plus 5 minutes" ${minutes >= 90 ? "disabled" : ""}>${icon("plus")}</button>
    </div>`;
  }

  function dispatchBlock(order, couriers) {
    if (order.mode !== "delivery" || !["preparing", "ready", "enroute", "delivered"].includes(order.status)) return "";
    const dispatch = order.dispatch || {};
    const info = dispatch.courierId ? couriers[dispatch.courierId] : null;
    const distance = info?.km == null ? "" : ` · ${info.km.toFixed(1)} km`;
    const courierChip = info ? `<span class="muted small">${info.online ? "En ligne" : "Hors ligne"}${distance}</span>` : "";
    if (dispatch.state === "offering" && info) {
      return `<div class="dispatch offering">${icon("bike")}<div><b>Offre envoyée à ${esc(info.courier.name)}</b> ${courierChip}<div class="small">Réponse sous <b data-until="${dispatch.expiresAt}">${countdown(dispatch.expiresAt - Date.now())}</b></div></div></div>`;
    }
    if (dispatch.state === "assigned" && info) {
      const stepNames = ["", "Accepté", "Au restaurant", "Récupérée", "En route", "Livrée"];
      return `<div class="dispatch assigned">${icon("bike")}<div><b>${esc(info.courier.name)}</b> ${courierChip}<div class="small">${esc(stepNames[order.courierStep] || "Assigné")}${dispatch.manual ? " · assigné manuellement" : ""}</div>${order.status === "delivered" ? "" : `<button class="btn small-btn track-btn" data-action="track" data-id="${esc(order.id)}">${icon("pin")}Suivre sur la carte</button>`}</div></div>`;
    }
    if (dispatch.state === "failed" && ["preparing", "ready"].includes(order.status)) {
      const options = Object.values(couriers).filter(c => c.active).map(c => `<option value="${esc(c.courier.id)}">${esc(c.courier.name)} — ${c.online ? (c.busy ? "en mission" : "en ligne") : "hors ligne"}${c.km == null ? "" : `, ${c.km.toFixed(1)} km`}</option>`).join("");
      const controls = isCashier() ? `<div class="assign-row"><select data-assign="${esc(order.id)}" aria-label="Livreur à assigner" ${options ? "" : "disabled"}>${options || "<option value=\"\">Aucun livreur disponible</option>"}</select>
        <button class="btn small-btn primary" data-action="assign" data-id="${esc(order.id)}" ${options ? "" : "disabled"}>Assigner</button>
        <button class="btn small-btn" data-action="retry" data-id="${esc(order.id)}">Relancer</button></div>` : "";
      return `<div class="dispatch failed">${icon("alert")}<div><b>Aucun livreur — assigner manuellement</b>${controls}</div></div>`;
    }
    return "";
  }

  function orderCard(order, couriers) {
    const cashier = isCashier();
    const isNew = order.status === "pending";
    const lines = order.items.map(item => `<li><span class="qty">${item.qty}×</span><span class="item-main"><b>${esc(item.name)}</b>${item.size ? ` <span class="muted">${esc(item.size)}</span>` : ""}${(item.extras || []).length ? `<span class="extras">+ ${item.extras.map(esc).join(", ")}</span>` : ""}</span><span class="price">${money(item.price * item.qty)}</span></li>`).join("");
    const draft = ui.prep[order.id] ?? defaultPrep();
    const timing = order.promisedAt && ["preparing", "ready"].includes(order.status) ? `<div class="timing" data-late-for="${order.promisedAt}">${icon("clock")}<span>Promise ${clock(order.promisedAt)} · <b data-until="${order.promisedAt}">${countdown(order.promisedAt - Date.now())}</b></span></div>` : "";
    let actions = "";
    if (isNew) {
      actions = cashier
        ? `<div class="prep-row"><span class="small muted">Préparation</span>${stepper(order.id, draft, "draft")}</div>
           <div class="btn-row"><button class="btn danger" data-action="refuse" data-id="${esc(order.id)}">${icon("close")}Refuser</button><button class="btn primary" data-action="accept" data-id="${esc(order.id)}">${icon("check")}Accepter</button></div>`
        : `<p class="small muted">En attente d'acceptation par la caisse.</p>`;
    } else if (order.status === "preparing") {
      actions = `${cashier ? `<div class="prep-row"><span class="small muted">Temps total</span>${stepper(order.id, order.prepMin, "live")}</div>` : ""}
        <div class="btn-row">${cashier ? `<button class="btn" data-action="reprint" data-id="${esc(order.id)}">${icon("printer")}Réimprimer</button>` : ""}<button class="btn primary" data-action="ready" data-id="${esc(order.id)}">${icon("check")}Prête</button></div>`;
    } else if (order.status === "ready") {
      const pickup = order.mode === "pickup";
      actions = `${cashier ? `<div class="prep-row"><span class="small muted">Temps total</span>${stepper(order.id, order.prepMin, "live")}</div>` : ""}
        <div class="btn-row">${cashier ? `<button class="btn" data-action="reprint" data-id="${esc(order.id)}">${icon("printer")}Réimprimer</button>` : ""}
        ${pickup ? (cashier ? `<button class="btn primary" data-action="handover" data-id="${esc(order.id)}">${icon("check")}Remise au client</button>` : `<span class="small muted">À remettre au client</span>`) : `<span class="small muted">En attente du livreur</span>`}</div>`;
    } else if (cashier) {
      actions = `<div class="btn-row"><button class="btn" data-action="reprint" data-id="${esc(order.id)}">${icon("printer")}Réimprimer</button></div>`;
    }
    return `<article class="card ${isNew ? "is-new" : ""} mode-${order.mode}" data-order="${esc(order.id)}">
      <header class="card-head"><div><span class="order-no">${esc(order.id)}</span> ${statusPill(order)}</div><span class="elapsed" data-since="${order.createdAt}">${minutesSince(order.createdAt)} min</span></header>
      <div class="card-meta"><span class="who-first">${icon("user")}${esc(firstName(order))}</span><span class="mode-chip ${order.mode}">${icon(order.mode === "delivery" ? "bike" : "store")}${order.mode === "delivery" ? "Livraison" : "À emporter"}</span></div>
      <ul class="lines">${lines}</ul>
      ${order.note ? `<p class="note">${icon("alert")}<span>${esc(order.note)}</span></p>` : ""}
      <div class="card-total"><span class="pay">${icon(order.paymentType === "cash" ? "cash" : "card")}${esc(order.payment)}</span><b>${money(order.total)}</b></div>
      ${timing}${dispatchBlock(order, couriers)}${actions}
    </article>`;
  }

  const EMPTY_HINTS = { new: "Les nouvelles commandes apparaîtront ici.", prep: "Acceptez une commande pour la préparer.", ready: "Les commandes prêtes seront listées ici.", out: "Aucune commande en livraison." };

  function renderBoard() {
    const groups = groupOrders(data.orders);
    const couriers = courierMap();
    const strip = `<div class="courier-strip" aria-label="Livreurs">${Object.values(couriers).map(c => `<span class="chip ${c.online ? (c.busy ? "warn" : "ok") : "off"}">${icon("bike")}<span>${esc(c.courier.name.split(" ")[0])} · ${c.online ? (c.busy ? "en mission" : "libre") : "hors ligne"}${c.km == null ? "" : ` · ${c.km.toFixed(1)} km`}</span></span>`).join("")}</div>`;
    const tabs = `<div class="col-tabs" role="tablist">${COLUMNS.map(c => `<button role="tab" class="col-tab ${ui.col === c.key ? "active" : ""}" data-action="col" data-col="${c.key}" aria-selected="${ui.col === c.key}">${c.label}<b>${groups[c.key].length}</b></button>`).join("")}</div>`;
    const cols = COLUMNS.map(c => `<section class="col col-${c.key} ${ui.col === c.key ? "is-current" : ""}" aria-label="${c.label}">
      <h2>${icon(c.icon)}${c.label}<b>${groups[c.key].length}</b></h2>
      <div class="col-body">${groups[c.key].length ? groups[c.key].map(order => orderCard(order, couriers)).join("") : `<div class="empty-state"><span class="empty-ico">${icon(c.icon)}</span><strong>Aucune commande</strong><small>${EMPTY_HINTS[c.key] || ""}</small></div>`}</div></section>`).join("");
    return `${strip}${tabs}<div class="board">${cols}</div>`;
  }

  function renderHistory() {
    const filters = [["all", "Toutes"], ["active", "En cours"], ["delivered", "Terminées"], ["refused", "Refusées"], ["cancelled", "Annulées"], ["delivery", "Livraison"], ["pickup", "À emporter"]];
    const today = data.orders.filter(order => isToday(order.createdAt));
    const match = order => ({
      all: true, active: ["pending", "preparing", "ready", "enroute"].includes(order.status), delivered: order.status === "delivered",
      refused: order.status === "refused", cancelled: order.status === "cancelled", delivery: order.mode === "delivery", pickup: order.mode === "pickup"
    })[ui.filter];
    const rows = today.filter(match).map(order => `<article class="h-row s-${order.status}">
      <div class="h-main"><b class="h-no">${esc(order.id)}</b>${statusPill(order)}</div>
      <div class="h-info"><span>${icon("clock")}${clock(order.createdAt)}</span><span>${icon("user")}${esc(firstName(order))}</span><span class="mode-chip ${order.mode === "pickup" ? "pickup" : ""}">${order.mode === "delivery" ? "Livraison" : "À emporter"}</span></div>
      ${order.refusedReason ? `<div class="small muted h-reason">${esc(order.refusedReason)}</div>` : ""}
      <div class="h-end"><b>${money(order.total)}</b>${isCashier() && order.acceptedAt ? `<button class="icon-btn" data-action="reprint" data-id="${esc(order.id)}" aria-label="Réimprimer ${esc(order.id)}">${icon("printer")}</button>` : ""}</div></article>`).join("");
    const revenue = today.filter(order => order.status === "delivered").reduce((sum, order) => sum + order.total, 0);
    const done = today.filter(order => order.status === "delivered").length;
    const lost = today.filter(order => ["refused", "cancelled"].includes(order.status)).length;
    return `<section class="panel wide"><div class="panel-head"><div><h2>Historique du jour</h2><p class="muted">Commandes reçues aujourd'hui</p></div></div>
      <div class="kpis"><div class="kpi"><span>Commandes</span><b>${today.length}</b></div><div class="kpi ok"><span>Terminées</span><b>${done}</b></div><div class="kpi bad"><span>Refusées / annulées</span><b>${lost}</b></div><div class="kpi gold"><span>Encaissé</span><b>${money(revenue)}</b></div></div>
      <div class="filters" role="group" aria-label="Filtres">${filters.map(([key, label]) => `<button class="chip-btn ${ui.filter === key ? "active" : ""}" data-action="filter" data-filter="${key}" aria-pressed="${ui.filter === key}">${label}</button>`).join("")}</div>
      ${rows ? `<div class="h-list">${rows}</div>` : `<p class="empty">Aucune commande pour ce filtre.</p>`}</section>`;
  }

  function renderStock() {
    const groups = new Map();
    data.menu.forEach(item => { const key = item.category || "Autres"; if (!groups.has(key)) groups.set(key, []); groups.get(key).push(item); });
    const out = data.menu.filter(item => !item.available).length;
    const sections = [...groups].map(([category, items]) => `<section class="stock-group"><h3>${esc(category)}<span>${items.filter(item => item.available).length}/${items.length}</span></h3>
      <div class="stock-grid">${items.map(item => {
        const on = !!item.available;
        return `<button class="stock-tile ${on ? "on" : "off"}" role="switch" aria-checked="${on}" data-action="stock" data-id="${esc(item.id)}" aria-label="${esc(item.name)} : ${on ? "disponible" : "épuisé"}"><b>${esc(item.name)}</b><span class="stock-state"><i></i>${on ? "Disponible" : "Épuisé"}</span></button>`;
      }).join("")}</div></section>`).join("");
    return `<section class="panel wide"><div class="panel-head"><div><h2>Stock</h2><p class="muted">Touchez un article pour le marquer épuisé. Synchronisé avec le menu client.</p></div><span class="stat ${out ? "warn" : "ok"}">${out ? `${out} épuisé(s)` : "Tout disponible"}</span></div>
      ${sections || `<p class="empty">Aucun article de menu disponible.</p>`}</section>`;
  }

  function switchRow(label, hint, on, action) {
    return `<div class="setting"><div><b>${label}</b><div class="small muted">${hint}</div></div>
      <button class="switch ${on ? "on" : ""}" role="switch" aria-checked="${on}" data-action="${action}" aria-label="${esc(label)}"><span class="switch-label">${on ? "Oui" : "Non"}</span><i></i></button></div>`;
  }

  function renderSettings() {
    const settings = data.settings;
    const connected = GKPrinter.connected();
    return `<section class="panel settings"><h2>Réglages</h2>
      <div class="group"><h3>Affectation des livreurs</h3>
        <div class="seg" role="radiogroup" aria-label="Mode d'affectation">
          <button role="radio" aria-checked="${settings.dispatchMode === "rotation"}" class="${settings.dispatchMode === "rotation" ? "active" : ""}" data-action="dispatch-mode" data-mode="rotation">Rotation</button>
          <button role="radio" aria-checked="${settings.dispatchMode === "proximity"}" class="${settings.dispatchMode === "proximity" ? "active" : ""}" data-action="dispatch-mode" data-mode="proximity">Proximité</button></div>
        <p class="small muted">Le serveur affecte automatiquement un livreur selon ce mode. Les offres expirent après 60 s.</p></div>
      <div class="group"><h3>Imprimante</h3>
        <p class="small ${connected ? "ok-text" : "muted"}">${connected ? `Connectée : ${esc(GKPrinter.name())}` : GKPrinter.supported() ? "Aucune imprimante connectée." : "Bluetooth indisponible (Chrome/Edge en https ou localhost requis) : aperçu à l'écran utilisé."}</p>
        <div class="btn-row wrap"><button class="btn primary" data-action="printer-connect">${icon("bluetooth")}Connecter une imprimante Bluetooth</button>
          ${connected ? `<button class="btn" data-action="printer-disconnect">Déconnecter</button>` : ""}
          <button class="btn" data-action="printer-test">${icon("printer")}Imprimer un ticket de test</button></div>
        <div class="setting"><div><b>Largeur du papier</b></div><div class="seg" role="radiogroup" aria-label="Largeur du papier">
          ${[58, 80].map(width => `<button role="radio" aria-checked="${state.prefs.paper === width}" class="${state.prefs.paper === width ? "active" : ""}" data-action="paper" data-paper="${width}">${width} mm</button>`).join("")}</div></div>
        ${switchRow("Ouvrir la boîte d'impression du navigateur", "Lorsque l'aperçu de secours s'affiche (sans imprimante Bluetooth).", state.prefs.autoBrowserPrint, "toggle-autoprint")}</div>
      <div class="group"><h3>Commandes</h3>
        ${switchRow("Pause des commandes", "Les clients ne peuvent plus valider leur panier lorsque le service est en pause.", !!settings.paused, "toggle-pause")}
        <div class="setting"><div><b>Temps de préparation par défaut</b></div>
          <div class="stepper" role="group" aria-label="Temps par défaut"><button class="icon-btn" data-action="default-prep" data-delta="-5" aria-label="Moins 5 minutes" ${defaultPrep() <= 5 ? "disabled" : ""}>${icon("minus")}</button><span class="stepper-value"><b>${defaultPrep()}</b> min</span><button class="icon-btn" data-action="default-prep" data-delta="5" aria-label="Plus 5 minutes" ${defaultPrep() >= 90 ? "disabled" : ""}>${icon("plus")}</button></div></div>
        ${switchRow("Alerte sonore", "Bip à l'arrivée d'une nouvelle commande.", state.prefs.sound, "toggle-sound")}</div>
    </section>`;
  }

  function render() {
    renderQueued = false;
    ui.dirty = false;
    if (!state.session) {
      app.innerHTML = renderLogin();
      document.title = baseTitle;
      return;
    }
    if (state.session.mustChange) {
      app.innerHTML = renderChangeSecret();
      document.title = baseTitle;
      return;
    }
    if ((!isCashier() && ["settings", "stock"].includes(ui.view))) ui.view = "board";
    const previousScroll = [...app.querySelectorAll(".col-body")].map(element => element.scrollTop);
    let body;
    if (!data.loaded && data.loading) body = `<section class="panel"><p class="empty">Chargement des commandes et des réglages…</p></section>`;
    else if (!data.loaded && data.error) body = `<section class="panel"><h2>Connexion au serveur impossible</h2><p class="form-error">${esc(data.error)}</p><button class="btn primary" data-action="refresh">Réessayer</button></section>`;
    else body = { board: renderBoard, history: renderHistory, stock: renderStock, settings: renderSettings }[ui.view]();
    const banners = `${data.error && data.loaded ? `<p class="banner" role="alert">Erreur de synchronisation : ${esc(data.error)}. Les dernières données chargées sont affichées. <button class="btn small-btn" data-action="refresh">Réessayer</button></p>` : ""}${data.actionError ? `<p class="banner" role="alert">Action impossible : ${esc(data.actionError)}</p>` : ""}`;
    app.innerHTML = `${renderHeader()}<main class="main view-${ui.view}">${banners}${body}</main>`;
    app.querySelectorAll(".col-body").forEach((element, index) => { if (previousScroll[index]) element.scrollTop = previousScroll[index]; });
    updateBadge();
  }

  function schedule() {
    if (renderQueued) return;
    const active = document.activeElement;
    if (active && app.contains(active) && /^(SELECT|INPUT|TEXTAREA)$/.test(active.tagName) && state.session) {
      ui.dirty = true;
      return;
    }
    renderQueued = true;
    setTimeout(() => { if (renderQueued) render(); }, 250);
    requestAnimationFrame(() => { if (renderQueued) render(); });
  }

  /* ---------- sheets and printing ---------- */

  function closeSheet() {
    if (trackMap) { trackMap.destroy(); trackMap = null; }
    ui.sheet = null;
    sheetRoot.innerHTML = "";
    printArea.innerHTML = "";
  }

  let trackMap = null;
  function openTrack(order) {
    ui.sheet = { type: "track", id: order.id };
    openSheet(`<h2>Livreur · commande #${esc(order.seq || order.id)}</h2><p class="muted small">Position en direct, mise à jour toutes les 5 secondes.</p>
      <div class="map-box" id="track-slot"></div>
      <div class="btn-row"><button class="btn" data-action="close-sheet">Fermer</button></div>`);
    sheetRoot.querySelector(".sheet")?.classList.add("map-sheet");
    try {
      trackMap = GKMap.mount({ scope: API_SCOPE, orderId: order.id, logo: "assets/emblem-reference.png" });
      sheetRoot.querySelector("#track-slot").appendChild(trackMap.el);
      trackMap.invalidate();
    } catch (error) { toast(error.message); }
  }

  function openSheet(html) {
    sheetRoot.innerHTML = `<div class="sheet-backdrop" data-action="close-sheet"><div class="sheet" role="dialog" aria-modal="true">${html}</div></div>`;
    sheetRoot.querySelector("button:not([data-action='close-sheet'])")?.focus();
  }

  function openRefuse(id) {
    ui.sheet = { type: "refuse", id };
    openSheet(`<div class="refuse-head"><span class="refuse-ico">${icon("close")}</span><div><h2>Refuser la commande #${esc(id)}</h2><p class="muted">Le client sera prévenu avec le motif.</p></div></div>
      <div class="reasons">${REFUSE_REASONS.map(reason => `<button class="reason-btn" data-action="refuse-reason" data-id="${esc(id)}" data-reason="${esc(reason)}"><span>${esc(reason)}</span></button>`).join("")}</div>
      <button class="btn block ghost" data-action="close-sheet">Annuler</button>`);
  }

  function receiptDoc(order) {
    return {
      id: order.id, seq: order.seq, createdAt: order.createdAt, mode: order.mode,
      customerName: order.customer?.name || "", phone: order.customer?.phone || "",
      address: order.address?.street || "", zone: order.address?.zone || "", note: order.note,
      subtotal: order.subtotal, fee: order.fee, discount: order.discount, total: order.total,
      payment: order.paymentType === "cash" ? "cash" : "card", status: order.status,
      items: order.items.map(item => ({ qty: item.qty, name: item.name, size: item.size, extras: item.extras, unit: item.price }))
    };
  }
  const receiptOpts = reprint => ({ seller: data.settings.restaurant || {}, logo: "assets/emblem-reference.png", reprint });

  function openPreview(order, reprint, reason) {
    ui.sheet = { type: "preview" };
    printArea.innerHTML = "";
    openSheet(`<h2>Ticket #${esc(order.id)}</h2>${reason ? `<p class="muted small">${esc(reason)}</p>` : ""}
      <div class="ticket-wrap">${GKReceipt.previewTicket(receiptDoc(order), receiptOpts(reprint))}</div>
      <div class="btn-row"><button class="btn" data-action="close-sheet">Fermer</button><button class="btn primary" data-action="browser-print" data-id="${esc(order.id)}" data-reprint="${reprint ? 1 : 0}">${icon("printer")}Imprimer</button></div>`);
    if (state.prefs.autoBrowserPrint) setTimeout(() => GKReceipt.printTicket(receiptDoc(order), receiptOpts(reprint)), 300);
  }

  async function printOrder(order, reprint = false) {
    if (!isCashier()) return false;
    let reason;
    if (GKPrinter.connected()) {
      try {
        await GKPrinter.write(buildTicket(order, { paper: state.prefs.paper, reprint }));
        toast(`Ticket ${order.id} envoyé à l'imprimante.`);
        return true;
      } catch (error) {
        reason = `Échec d'impression Bluetooth (${error.message || "erreur"})`;
      }
    } else {
      reason = GKPrinter.supported() ? "Aucune imprimante connectée" : "Bluetooth indisponible";
    }
    toast(`${reason} : aperçu du ticket affiché.`);
    openPreview(order, reprint, `${reason} — impression via le navigateur.`);
    return false;
  }

  /* ---------- sound and notifications ---------- */

  function unlockAudio() {
    GKSound.unlock();
  }

  function beep() {
    if (!state.prefs.sound) return;
    GKSound.play("order");
  }

  const pendingOrders = () => data.orders.filter(order => order.status === "pending");

  function updateBadge() {
    const count = state.session && !state.session.mustChange ? pendingOrders().length : 0;
    document.title = count ? `(${count}) ${baseTitle}` : baseTitle;
  }

  const requireCashier = () => {
    if (isCashier()) return true;
    toast("Action réservée à la caisse.");
    return false;
  };

  async function runAction(operation, afterSuccess) {
    try {
      const result = await operation();
      data.actionError = "";
      if (afterSuccess) await afterSuccess(result);
      await refreshData();
      return result;
    } catch (error) {
      data.actionError = error.message || "La demande a échoué.";
      toast(data.actionError);
      render();
      return null;
    }
  }

  /* ---------- actions ---------- */

  const actions = {
    async logout() {
      let logoutError = null;
      try {
        await api.logout(API_SCOPE);
      } catch (error) {
        logoutError = error;
      } finally {
        try { logout(); } catch (error) { logoutError = logoutError || error; }
      }
      closeSheet();
      data.orders = [];
      data.menu = [];
      data.couriers = [];
      data.loaded = false;
      data.error = "";
      data.actionError = "";
      render();
      if (logoutError) toast(`Session locale effacée, mais la déconnexion serveur a échoué : ${logoutError.message || "erreur"}`);
    },
    view(el) { ui.view = el.dataset.view; render(); },
    col(el) { ui.col = el.dataset.col; render(); },
    filter(el) { ui.filter = el.dataset.filter; render(); },
    refresh() { data.error = ""; refreshData(); },
    track(el) { const order = findOrder(el.dataset.id); if (order) openTrack(order); },
    "toggle-sound"() { state.prefs.sound = !state.prefs.sound; save(); render(); },
    "toggle-autoprint"() { if (requireCashier()) { state.prefs.autoBrowserPrint = !state.prefs.autoBrowserPrint; save(); render(); } },
    paper(el) { if (requireCashier()) { state.prefs.paper = Number(el.dataset.paper); save(); render(); } },
    prep(el) {
      if (!requireCashier()) return;
      const delta = Number(el.dataset.delta);
      const order = findOrder(el.dataset.id);
      if (el.dataset.scope === "draft") {
        ui.prep[el.dataset.id] = Math.min(90, Math.max(5, (ui.prep[el.dataset.id] ?? defaultPrep()) + delta));
        render();
      } else if (order) {
        const prepMinutes = Math.min(90, Math.max(5, order.prepMin + delta));
        runAction(() => api.patch(`/api/orders/${encodeURIComponent(order.id)}/prep`, { prepMinutes }, API_SCOPE));
      }
    },
    "default-prep"(el) {
      if (!requireCashier()) return;
      const defaultPrepValue = Math.min(90, Math.max(5, defaultPrep() + Number(el.dataset.delta)));
      runAction(() => api.patch("/api/admin/settings/operations", { defaultPrep: defaultPrepValue }, API_SCOPE));
    },
    async accept(el) {
      if (!requireCashier()) return;
      const order = findOrder(el.dataset.id);
      if (!order) return;
      const prepMinutes = ui.prep[order.id] ?? defaultPrep();
      await runAction(() => api.post(`/api/orders/${encodeURIComponent(order.id)}/accept`, { prepMinutes }, API_SCOPE), async result => {
        delete ui.prep[order.id];
        ui.col = "prep";
        const accepted = result?.order ? normalizeOrder(result.order) : order;
        render();
        try { await printOrder(accepted, false); } catch { toast("Impression impossible : la commande est bien acceptée."); }
      });
    },
    refuse(el) { if (requireCashier()) openRefuse(el.dataset.id); },
    async "refuse-reason"(el) {
      if (!requireCashier()) return;
      await runAction(() => api.post(`/api/orders/${encodeURIComponent(el.dataset.id)}/refuse`, { reason: el.dataset.reason }, API_SCOPE), () => closeSheet());
    },
    async ready(el) {
      await runAction(() => api.post(`/api/orders/${encodeURIComponent(el.dataset.id)}/ready`, {}, API_SCOPE), () => { ui.col = "ready"; });
    },
    handover(el) {
      if (requireCashier()) runAction(() => api.post(`/api/orders/${encodeURIComponent(el.dataset.id)}/handover`, {}, API_SCOPE));
    },
    reprint(el) { const order = findOrder(el.dataset.id); if (order) printOrder(order, true); },
    assign(el) {
      if (!requireCashier()) return;
      const select = app.querySelector(`select[data-assign="${CSS.escape(el.dataset.id)}"]`);
      if (select?.value) runAction(() => api.post(`/api/orders/${encodeURIComponent(el.dataset.id)}/assign`, { courierId: select.value }, API_SCOPE));
    },
    retry(el) {
      if (requireCashier()) runAction(() => api.post(`/api/orders/${encodeURIComponent(el.dataset.id)}/dispatch/retry`, {}, API_SCOPE));
    },
    stock(el) {
      if (!requireCashier()) return;
      const item = data.menu.find(entry => entry.id === el.dataset.id);
      if (item) runAction(() => api.patch(`/api/admin/menu/${encodeURIComponent(item.id)}/availability`, { available: !item.available }, API_SCOPE));
    },
    "dispatch-mode"(el) {
      if (requireCashier()) runAction(() => api.patch("/api/admin/settings/operations", { dispatchMode: el.dataset.mode }, API_SCOPE));
    },
    "toggle-pause"() {
      if (requireCashier()) runAction(() => api.patch("/api/admin/settings/operations", { paused: !data.settings.paused }, API_SCOPE));
    },
    async "printer-connect"() {
      if (!requireCashier()) return;
      try {
        const name = await GKPrinter.connect();
        state.prefs.lastPrinter = name;
        save();
        toast(`Imprimante connectée : ${name}`);
      } catch (error) {
        toast(error?.name === "NotFoundError" ? "Aucune imprimante sélectionnée." : `Connexion impossible : ${error.message || "erreur"}`);
      }
      render();
    },
    "printer-disconnect"() { GKPrinter.disconnect(); },
    "printer-test"() {
      if (!requireCashier()) return;
      const order = {
        id: "TEST", createdAt: Date.now(), mode: "pickup", customer: { name: "Ticket de test" },
        items: [{ qty: 1, name: "Impression OK", size: "Éàç œ 123", extras: [], price: 0 }],
        subtotal: 0, fee: 0, total: 0, payment: "-", paymentType: "card"
      };
      printOrder(order, false);
    },
    "browser-print"(el) {
      const order = data.orders.find(item => item.id === el.dataset.id);
      if (order) GKReceipt.printTicket(receiptDoc(order), receiptOpts(el.dataset.reprint === "1"));
    },
    "close-sheet"() { closeSheet(); }
  };

  document.addEventListener("click", event => {
    unlockAudio();
    const element = event.target.closest("[data-action]");
    if (!element) return;
    if (state.session?.mustChange && element.dataset.action !== "logout") return;
    if (element.dataset.action === "close-sheet" && event.target !== element && element.classList.contains("sheet-backdrop")) return;
    if (element.disabled) return;
    const action = actions[element.dataset.action];
    if (action) action(element);
  });

  document.addEventListener("keydown", event => {
    unlockAudio();
    if (event.key === "Escape" && ui.sheet) closeSheet();
  });

  document.addEventListener("submit", async event => {
    const changeForm = event.target.closest("[data-form='change-secret']");
    if (changeForm) {
      event.preventDefault();
      if (!state.session?.mustChange) return;
      const button = changeForm.querySelector("[type='submit']");
      const errorEl = changeForm.querySelector("[data-secret-error]");
      const formData = new FormData(changeForm);
      const current = String(formData.get("current") || "");
      const next = String(formData.get("next") || "");
      if (!current || next.length < 8 || current === next) {
        errorEl.textContent = !current
          ? "Saisissez votre mot de passe actuel."
          : next.length < 8
            ? "Le nouveau mot de passe doit contenir au moins 8 caractères."
            : "Le nouveau mot de passe doit être différent de l'actuel.";
        return;
      }
      button.disabled = true;
      errorEl.textContent = "";
      try {
        const result = await api.post("/api/auth/change-secret", { current, next }, API_SCOPE);
        setSession(result);
        ui.view = "board";
        bootRefresh = true;
        data.loaded = false;
        data.error = "";
        data.actionError = "";
        render();
        await refreshData();
      } catch (error) {
        errorEl.textContent = error.message || "Impossible de modifier le mot de passe.";
        button.disabled = false;
      }
      return;
    }
    const form = event.target.closest("[data-form='login']");
    if (!form) return;
    event.preventDefault();
    const button = form.querySelector("[type='submit']");
    const errorEl = form.querySelector("[data-login-error]");
    button.disabled = true;
    errorEl.textContent = "";
    try {
      const formData = new FormData(form);
      const result = await api.post("/api/auth/staff", {
        email: formData.get("email"),
        password: formData.get("password")
      });
      if (!["cashier", "chef"].includes(result.user?.role)) {
        throw new Error("Cette application est réservée aux comptes caisse et cuisine.");
      }
      setSession(result);
      ui.view = "board";
      bootRefresh = true;
      data.loaded = false;
      data.error = "";
      data.actionError = "";
      render();
      if (state.session.mustChange) return;
      await refreshData();
    } catch (error) {
      errorEl.textContent = error.message || "Connexion impossible.";
      button.disabled = false;
    }
  });

  document.addEventListener("focusout", () => {
    setTimeout(() => { if (ui.dirty && !/^(SELECT|INPUT|TEXTAREA)$/.test(document.activeElement?.tagName || "")) schedule(); }, 0);
  });

  document.addEventListener("gk-api-session-expired", event => {
    if (event.detail?.scope !== API_SCOPE) return;
    state.session = null;
    data.orders = [];
    data.loaded = false;
    data.error = "";
    toast("Votre session a expiré. Veuillez vous reconnecter.");
    render();
  });

  function tickDom() {
    const now = Date.now();
    app.querySelectorAll("[data-until]").forEach(element => {
      const left = Number(element.dataset.until) - now;
      element.textContent = countdown(left);
      element.classList.toggle("late", left < 0);
    });
    app.querySelectorAll("[data-since]").forEach(element => { element.textContent = `${minutesSince(Number(element.dataset.since))} min`; });
  }

  GKPrinter.onChange(() => schedule());

  setInterval(() => {
    tickDom();
    if (state.session && !state.session.mustChange && !refreshRunning) refreshData();
  }, 8000);
  // The ring (about 1.7s) loops without pause until every new order is accepted or refused.
  setInterval(() => {
    if (state.session && !state.session.mustChange && pendingOrders().length) beep();
  }, 2200);
  window.addEventListener("storage", event => {
    if (event.key === STORAGE_KEY) {
      const saved = load();
      state.prefs = saved.prefs;
      render();
    }
  });

  render();
  if (state.session && !state.session.mustChange) refreshData();
  GKPrinter.reconnect(state.prefs.lastPrinter);
  if ("serviceWorker" in navigator && location.protocol !== "file:") {
    navigator.serviceWorker.register("sw.js").catch(() => {});
  }
})();
