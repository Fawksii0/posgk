(() => {
  const bus = window.GKBus;
  const app = document.getElementById("app");
  const sheetRoot = document.getElementById("sheet-root");
  const printArea = document.getElementById("print-area");
  const toastEl = document.getElementById("toast");
  const ui = { view: "board", col: "new", filter: "all", prep: {}, sheet: null, dirty: false };
  const baseTitle = "G&K Cuisine";
  let audio = null;
  let knownPending = new Set();
  let renderQueued = false;
  let toastTimer = 0;

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

  const busState = () => bus.get();
  const defaultPrep = () => busState().settings.defaultPrep || 20;

  /* ---------- helpers ---------- */

  function toast(message) {
    toastEl.textContent = message;
    toastEl.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastEl.classList.remove("show"), 4200);
  }

  const findOrder = id => busState().orders.find(order => order.id === id);

  function courierMap() {
    const map = {};
    bus.courierInfo(busState()).forEach(info => { map[info.courier.id] = info; });
    return map;
  }

  const statusPill = order => `<span class="pill s-${order.status}">${esc(STATUS_LABELS[order.status] || order.status)}</span>`;

  /* ---------- rendering ---------- */

  function renderLogin() {
    const wait = lockRemaining();
    return `<main class="login">
      <form class="login-card" data-form="login" novalidate>
        <div class="brand"><img src="assets/emblem-reference.png" alt="G&amp;K Food" width="56" height="56"><span class="pill-black">CUISINE</span></div>
        <h1>Connexion</h1>
        <p class="muted">Espace caisse et cuisine G&amp;K Food.</p>
        <label>E-mail<input name="email" type="email" autocomplete="username" inputmode="email" required value="caissier@gk.com"></label>
        <label>Mot de passe<input name="password" type="password" autocomplete="current-password" required></label>
        <p class="form-error" role="alert" data-login-error>${wait ? `Trop de tentatives. Réessayez dans <b data-lock>${wait}</b> s.` : ""}</p>
        <button class="btn primary block" type="submit" ${wait ? "disabled" : ""}>Se connecter</button>
        <p class="hint">Démo — caisse : caissier@gk.com / caisse123<br>Cuisinier : chef@gk.com / chef123</p>
      </form>
    </main>`;
  }

  function renderHeader() {
    const s = busState();
    const connected = GKPrinter.connected();
    const printerChip = isCashier()
      ? `<button class="chip ${connected ? "ok" : "off"}" data-action="view" data-view="settings" aria-label="Imprimante : ${connected ? "connectée" : "déconnectée"}">${icon("printer")}<span>${connected ? `Connectée · ${esc(GKPrinter.name())}` : "Déconnectée"}</span></button>`
      : "";
    return `<header class="top">
      <div class="brand"><img src="assets/emblem-reference.png" alt="G&amp;K Food" width="40" height="40"><span class="pill-black">CUISINE</span></div>
      <div class="chips">
        <span class="chip ${s.settings.paused ? "warn" : "ok"}">${icon(s.settings.paused ? "pause" : "store")}<span>${s.settings.paused ? "Commandes en pause" : "Ouvert"}</span></span>
        ${printerChip}
        <span class="chip ${bus.linked ? "ok" : "off"}" title="${bus.linked ? "Liaison Client / Cuisine / Livreur active" : "Chaque appli a son propre stockage"}">${icon("wifi")}<span>${bus.linked ? "Liaison active" : "Mode démo hors liaison"}</span></span>
      </div>
      <div class="who"><span class="who-name">${icon("user")}<span>${esc(state.session.name === state.session.label ? state.session.name : `${state.session.name} · ${state.session.label}`)}</span></span>
        <button class="icon-btn" data-action="toggle-sound" aria-label="${state.prefs.sound ? "Couper le son" : "Activer le son"}" aria-pressed="${state.prefs.sound}">${icon(state.prefs.sound ? "volume" : "volumeOff")}</button>
        <button class="icon-btn" data-action="logout" aria-label="Se déconnecter">${icon("logout")}</button></div>
    </header>
    <nav class="tabs" aria-label="Navigation">${VIEWS.filter(v => isCashier() || v.key !== "settings").map(v => `<button class="tab ${ui.view === v.key ? "active" : ""}" data-action="view" data-view="${v.key}" aria-current="${ui.view === v.key}">${icon(v.icon)}<span>${v.label}</span></button>`).join("")}</nav>`;
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
    const d = order.dispatch || {};
    const info = d.courierId ? couriers[d.courierId] : null;
    const courierChip = info ? `<span class="muted small">${info.online ? "En ligne" : "Hors ligne"}${info.km != null ? ` · ${info.km.toFixed(1)} km` : ""}</span>` : "";
    if (d.state === "offering" && info) {
      return `<div class="dispatch offering">${icon("bike")}<div><b>Offre envoyée à ${esc(info.courier.name)}</b> ${courierChip}<div class="small">Réponse sous <b data-until="${d.expiresAt}">${countdown(d.expiresAt - Date.now())}</b></div></div></div>`;
    }
    if (d.state === "assigned" && info) {
      const stepNames = ["", "Accepté", "Au restaurant", "Récupérée", "En route", "Livrée"];
      return `<div class="dispatch assigned">${icon("bike")}<div><b>${esc(info.courier.name)}</b> ${courierChip}<div class="small">${esc(stepNames[order.courierStep] || "Assigné")}${d.manual ? " · assigné manuellement" : ""}</div></div></div>`;
    }
    if (d.state === "failed" && ["preparing", "ready"].includes(order.status)) {
      const options = Object.values(couriers).map(c => `<option value="${esc(c.courier.id)}">${esc(c.courier.name)} — ${c.online ? "en ligne" : "hors ligne"}, ${c.km.toFixed(1)} km</option>`).join("");
      const controls = isCashier() ? `<div class="assign-row"><select data-assign="${esc(order.id)}" aria-label="Livreur à assigner">${options}</select>
        <button class="btn small-btn primary" data-action="assign" data-id="${esc(order.id)}">Assigner</button>
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
    const timing = order.promisedAt && ["preparing", "ready"].includes(order.status) ? `<div class="timing" data-late-for="${order.promisedAt}">${icon("clock")}<span>Promise ${clock(order.promisedAt)} · <b data-until="${order.promisedAt}">${countdown(order.promisedAt - Date.now())}</b></span>    </div>` : "";
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
      <div class="card-total"><span class="pay">${icon(order.paymentType === "cash" ? "cash" : "card")}${esc(order.payment || "")}</span><b>${money(order.total)}</b></div>
      ${timing}${dispatchBlock(order, couriers)}${actions}
    </article>`;
  }

  function renderBoard() {
    const groups = groupOrders(busState());
    const couriers = courierMap();
    const strip = `<div class="courier-strip" aria-label="Livreurs">${Object.values(couriers).map(c => `<span class="chip ${c.online ? (c.busy ? "warn" : "ok") : "off"}">${icon("bike")}<span>${esc(c.courier.name.split(" ")[0])} · ${c.online ? (c.busy ? "en mission" : "libre") : "hors ligne"} · ${c.km.toFixed(1)} km</span></span>`).join("")}</div>`;
    const tabs = `<div class="col-tabs" role="tablist">${COLUMNS.map(c => `<button role="tab" class="col-tab ${ui.col === c.key ? "active" : ""}" data-action="col" data-col="${c.key}" aria-selected="${ui.col === c.key}">${c.label}<b>${groups[c.key].length}</b></button>`).join("")}</div>`;
    const cols = COLUMNS.map(c => `<section class="col col-${c.key} ${ui.col === c.key ? "is-current" : ""}" aria-label="${c.label}">
      <h2>${icon(c.icon)}${c.label}<b>${groups[c.key].length}</b></h2>
      <div class="col-body">${groups[c.key].length ? groups[c.key].map(o => orderCard(o, couriers)).join("") : `<p class="empty">Aucune commande</p>`}</div></section>`).join("");
    return `${strip}${tabs}<div class="board">${cols}</div>`;
  }

  function renderHistory() {
    const filters = [["all", "Toutes"], ["active", "En cours"], ["delivered", "Terminées"], ["refused", "Refusées"], ["cancelled", "Annulées"], ["delivery", "Livraison"], ["pickup", "À emporter"]];
    const today = busState().orders.filter(order => isToday(order.createdAt));
    const match = order => ({
      all: true, active: ["pending", "preparing", "ready", "enroute"].includes(order.status), delivered: order.status === "delivered",
      refused: order.status === "refused", cancelled: order.status === "cancelled", delivery: order.mode === "delivery", pickup: order.mode === "pickup"
    })[ui.filter];
    const rows = today.filter(match).map(order => `<tr>
      <td data-label="N°"><b>${esc(order.id)}</b></td><td data-label="Heure">${clock(order.createdAt)}</td><td data-label="Client">${esc(firstName(order))}</td>
      <td data-label="Mode">${order.mode === "delivery" ? "Livraison" : "À emporter"}</td><td data-label="Statut">${statusPill(order)}${order.refusedReason ? `<div class="small muted">${esc(order.refusedReason)}</div>` : ""}</td>
      <td data-label="Total"><b>${money(order.total)}</b></td>
      <td>${isCashier() && order.acceptedAt ? `<button class="btn small-btn" data-action="reprint" data-id="${esc(order.id)}" aria-label="Réimprimer ${esc(order.id)}">${icon("printer")}</button>` : ""}</td></tr>`).join("");
    const revenue = today.filter(o => o.status === "delivered").reduce((sum, o) => sum + o.total, 0);
    return `<section class="panel"><h2>Historique du jour</h2>
      <p class="muted">${today.length} commande(s) · chiffre d'affaires encaissé ${money(revenue)}</p>
      <div class="filters" role="group" aria-label="Filtres">${filters.map(([key, label]) => `<button class="chip-btn ${ui.filter === key ? "active" : ""}" data-action="filter" data-filter="${key}" aria-pressed="${ui.filter === key}">${label}</button>`).join("")}</div>
      ${rows ? `<table class="history"><thead><tr><th>N°</th><th>Heure</th><th>Client</th><th>Mode</th><th>Statut</th><th>Total</th><th></th></tr></thead><tbody>${rows}</tbody></table>` : `<p class="empty">Aucune commande pour ce filtre.</p>`}</section>`;
  }

  function renderStock() {
    const availability = busState().menuAvailability;
    return `<section class="panel"><h2>Stock / Disponibilité</h2><p class="muted">Un plat épuisé est grisé côté client et ne peut plus être ajouté au panier.</p>
      <ul class="stock">${MENU.map(dish => {
        const on = availability[dish.id] !== false;
        return `<li><div><b>${esc(dish.name)}</b><div class="small muted">${esc(dish.category)}</div></div>
          <button class="switch ${on ? "on" : ""}" role="switch" aria-checked="${on}" data-action="stock" data-id="${esc(dish.id)}" aria-label="${esc(dish.name)} : ${on ? "disponible" : "épuisé"}"><span class="switch-label">${on ? "Disponible" : "Épuisé"}</span><i></i></button></li>`;
      }).join("")}</ul></section>`;
  }

  function switchRow(label, hint, on, action, extra = "") {
    return `<div class="setting"><div><b>${label}</b><div class="small muted">${hint}</div></div>
      <button class="switch ${on ? "on" : ""}" role="switch" aria-checked="${on}" data-action="${action}" ${extra} aria-label="${esc(label)}"><span class="switch-label">${on ? "Oui" : "Non"}</span><i></i></button></div>`;
  }

  function renderSettings() {
    if (!isCashier()) return `<section class="panel"><p class="empty">Réglages réservés à la caisse.</p></section>`;
    const s = busState().settings;
    const connected = GKPrinter.connected();
    return `<section class="panel"><h2>Réglages</h2>
      <div class="group"><h3>Affectation des livreurs</h3>
        <div class="seg" role="radiogroup" aria-label="Mode d'affectation">
          <button role="radio" aria-checked="${s.dispatchMode === "rotation"}" class="${s.dispatchMode === "rotation" ? "active" : ""}" data-action="dispatch-mode" data-mode="rotation">Rotation</button>
          <button role="radio" aria-checked="${s.dispatchMode === "proximity"}" class="${s.dispatchMode === "proximity" ? "active" : ""}" data-action="dispatch-mode" data-mode="proximity">Proximité</button></div>
        <p class="small muted">Rotation : chaque commande va au livreur suivant. Proximité : livreur en ligne et libre le plus proche du restaurant. Offre de 60 s, un livreur à la fois.</p></div>
      <div class="group"><h3>Imprimante</h3>
        <p class="small ${connected ? "ok-text" : "muted"}">${connected ? `Connectée : ${esc(GKPrinter.name())}` : GKPrinter.supported() ? "Aucune imprimante connectée." : "Bluetooth indisponible (Chrome/Edge en https ou localhost requis) : aperçu à l'écran utilisé."}</p>
        <div class="btn-row wrap"><button class="btn primary" data-action="printer-connect">${icon("bluetooth")}Connecter une imprimante Bluetooth</button>
          ${connected ? `<button class="btn" data-action="printer-disconnect">Déconnecter</button>` : ""}
          <button class="btn" data-action="printer-test">${icon("printer")}Imprimer un ticket de test</button></div>
        <div class="setting"><div><b>Largeur du papier</b></div><div class="seg" role="radiogroup" aria-label="Largeur du papier">
          ${[58, 80].map(w => `<button role="radio" aria-checked="${state.prefs.paper === w}" class="${state.prefs.paper === w ? "active" : ""}" data-action="paper" data-paper="${w}">${w} mm</button>`).join("")}</div></div>
        ${switchRow("Ouvrir la boîte d'impression du navigateur", "Lorsque l'aperçu de secours s'affiche (sans imprimante Bluetooth).", state.prefs.autoBrowserPrint, "toggle-autoprint")}</div>
      <div class="group"><h3>Commandes</h3>
        ${switchRow("Pause des commandes", "Le client voit une bannière et ne peut plus valider son panier.", s.paused, "toggle-pause")}
        <div class="setting"><div><b>Temps de préparation par défaut</b></div>
          <div class="stepper" role="group" aria-label="Temps par défaut"><button class="icon-btn" data-action="default-prep" data-delta="-5" aria-label="Moins 5 minutes" ${s.defaultPrep <= 5 ? "disabled" : ""}>${icon("minus")}</button><span class="stepper-value"><b>${s.defaultPrep}</b> min</span><button class="icon-btn" data-action="default-prep" data-delta="5" aria-label="Plus 5 minutes" ${s.defaultPrep >= 90 ? "disabled" : ""}>${icon("plus")}</button></div></div>
        ${switchRow("Alerte sonore", "Bip répété tant qu'une commande attend.", state.prefs.sound, "toggle-sound")}</div>
      <div class="group"><h3>Démo</h3><div class="btn-row wrap">
        <button class="btn" data-action="demo-order">${icon("plus")}Simuler une commande</button>
        <button class="btn danger" data-action="reset">${icon("refresh")}Réinitialiser les données démo</button></div></div>
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
    if (ui.view === "settings" && !isCashier()) ui.view = "board";
    const body = { board: renderBoard, history: renderHistory, stock: renderStock, settings: renderSettings }[ui.view]();
    const scroll = app.querySelectorAll(".col-body");
    const offsets = [...scroll].map(el => el.scrollTop);
    app.innerHTML = `${renderHeader()}<main class="main view-${ui.view}">${!bus.linked ? `<p class="banner">Mode démo hors liaison : cette page n'échange pas avec le client ni le livreur. Servez le dépôt depuis une seule origine (voir README).</p>` : ""}${body}</main>`;
    app.querySelectorAll(".col-body").forEach((el, i) => { if (offsets[i]) el.scrollTop = offsets[i]; });
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
    // rAF never fires in hidden tabs; the timeout keeps the board current there.
    setTimeout(() => { if (renderQueued) render(); }, 250);
    requestAnimationFrame(() => { if (renderQueued) render(); });
  }

  /* ---------- sheets ---------- */

  function closeSheet() {
    ui.sheet = null;
    sheetRoot.innerHTML = "";
    printArea.innerHTML = "";
  }

  function openSheet(html) {
    sheetRoot.innerHTML = `<div class="sheet-backdrop" data-action="close-sheet"><div class="sheet" role="dialog" aria-modal="true">${html}</div></div>`;
    const first = sheetRoot.querySelector("button:not([data-action='close-sheet'])");
    if (first) first.focus();
  }

  function openRefuse(id) {
    ui.sheet = { type: "refuse", id };
    openSheet(`<h2>Refuser ${esc(id)}</h2><p class="muted">Le client sera prévenu avec le motif.</p>
      <div class="reasons">${REFUSE_REASONS.map(reason => `<button class="btn block" data-action="refuse-reason" data-id="${esc(id)}" data-reason="${esc(reason)}">${esc(reason)}</button>`).join("")}</div>
      <button class="btn block ghost" data-action="close-sheet">Annuler</button>`);
  }

  function openPreview(order, reprint, reason) {
    const cols = colsFor(state.prefs.paper);
    const text = ticketText(order, { cols, reprint });
    ui.sheet = { type: "preview" };
    printArea.innerHTML = `<pre class="ticket w${state.prefs.paper}">${esc(text)}</pre>`;
    openSheet(`<h2>Ticket ${esc(order.id)}</h2>${reason ? `<p class="muted small">${esc(reason)}</p>` : ""}
      <div class="ticket-wrap"><pre class="ticket w${state.prefs.paper}">${esc(text)}</pre></div>
      <div class="btn-row"><button class="btn" data-action="close-sheet">Fermer</button><button class="btn primary" data-action="browser-print">${icon("printer")}Imprimer</button></div>`);
    if (state.prefs.autoBrowserPrint) setTimeout(() => window.print(), 300);
  }

  /* ---------- printing ---------- */

  async function printOrder(order, reprint = false) {
    if (!isCashier()) return false;
    let reason = "";
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

  /* ---------- sound & title ---------- */

  function unlockAudio() {
    if (audio || !(window.AudioContext || window.webkitAudioContext)) return;
    try { audio = new (window.AudioContext || window.webkitAudioContext)(); } catch { audio = null; }
  }

  function beep() {
    if (!audio || !state.prefs.sound) return;
    if (audio.state === "suspended") audio.resume().catch(() => {});
    [880, 1175].forEach((freq, i) => {
      const osc = audio.createOscillator();
      const gain = audio.createGain();
      const start = audio.currentTime + i * 0.18;
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(0.25, start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.16);
      osc.connect(gain).connect(audio.destination);
      osc.start(start);
      osc.stop(start + 0.18);
    });
  }

  const pendingOrders = () => busState().orders.filter(order => order.status === "pending");

  function updateBadge() {
    const count = state.session ? pendingOrders().length : 0;
    document.title = count ? `(${count}) ${baseTitle}` : baseTitle;
  }

  function checkNewOrders() {
    if (!state.session) return;
    const ids = new Set(pendingOrders().map(order => order.id));
    const fresh = [...ids].filter(id => !knownPending.has(id));
    knownPending = ids;
    if (fresh.length) {
      beep();
      toast(`Nouvelle commande ${fresh.join(", ")}`);
    }
  }

  /* ---------- actions ---------- */

  const requireCashier = () => {
    if (isCashier()) return true;
    toast("Action réservée à la caisse.");
    return false;
  };

  const report = message => { if (message) toast(message); return !message; };

  const actions = {
    logout() { logout(); closeSheet(); render(); },
    view(el) { ui.view = el.dataset.view; render(); },
    col(el) { ui.col = el.dataset.col; render(); },
    filter(el) { ui.filter = el.dataset.filter; render(); },
    "toggle-sound"() { state.prefs.sound = !state.prefs.sound; save(); render(); },
    "toggle-autoprint"() { if (requireCashier()) { state.prefs.autoBrowserPrint = !state.prefs.autoBrowserPrint; save(); render(); } },
    paper(el) { if (requireCashier()) { state.prefs.paper = Number(el.dataset.paper); save(); render(); } },
    prep(el) {
      if (!requireCashier()) return;
      const delta = Number(el.dataset.delta);
      const id = el.dataset.id;
      if (el.dataset.scope === "draft") {
        ui.prep[id] = Math.min(90, Math.max(5, (ui.prep[id] ?? defaultPrep()) + delta));
        render();
      } else {
        const order = findOrder(id);
        if (order) report(bus.setPrep(id, order.prepMin + delta, "caisse"));
      }
    },
    "default-prep"(el) {
      if (requireCashier()) bus.setSettings({ defaultPrep: Math.min(90, Math.max(5, defaultPrep() + Number(el.dataset.delta))) });
    },
    async accept(el) {
      if (!requireCashier()) return;
      const id = el.dataset.id;
      const minutes = ui.prep[id] ?? defaultPrep();
      if (!report(bus.acceptOrder(id, minutes, "caisse"))) return;
      delete ui.prep[id];
      const order = findOrder(id);
      ui.col = "prep";
      render();
      try { await printOrder(order, false); } catch { toast("Impression impossible : la commande est bien acceptée."); }
    },
    refuse(el) { if (requireCashier()) openRefuse(el.dataset.id); },
    "refuse-reason"(el) {
      if (!requireCashier()) return;
      report(bus.refuseOrder(el.dataset.id, el.dataset.reason, "caisse"));
      closeSheet();
    },
    ready(el) { if (report(bus.markReady(el.dataset.id, state.session.role === "cook" ? "cuisinier" : "caisse"))) ui.col = "ready"; render(); },
    handover(el) { if (requireCashier()) report(bus.handOver(el.dataset.id, "caisse")); },
    reprint(el) { const order = findOrder(el.dataset.id); if (order) printOrder(order, true); },
    assign(el) {
      if (!requireCashier()) return;
      const select = app.querySelector(`select[data-assign="${CSS.escape(el.dataset.id)}"]`);
      if (select) report(bus.assignManual(el.dataset.id, select.value, "caisse"));
    },
    retry(el) { if (requireCashier()) report(bus.retryDispatch(el.dataset.id)); },
    stock(el) { bus.setAvailability(el.dataset.id, busState().menuAvailability[el.dataset.id] === false); },
    "dispatch-mode"(el) { if (requireCashier()) bus.setSettings({ dispatchMode: el.dataset.mode }); },
    "toggle-pause"() { if (requireCashier()) bus.setSettings({ paused: !busState().settings.paused }); },
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
        items: [{ qty: 1, name: "Impression OK", size: "Éàç œ 123", extras: [], price: 0 }], subtotal: 0, fee: 0, total: 0, payment: "-", paymentType: "card"
      };
      printOrder(order, false);
    },
    "browser-print"() { window.print(); },
    "close-sheet"() { closeSheet(); },
    "demo-order"() {
      if (!requireCashier()) return;
      const result = bus.publishOrder({ ...makeDemoOrder(), createdAt: Date.now() });
      toast(result.error || `Commande ${result.order.id} simulée.`);
    },
    reset() {
      if (!requireCashier() || !window.confirm("Réinitialiser toutes les données démo (commandes, livreurs, stock) ?")) return;
      bus.reset();
      ui.prep = {};
      toast("Données démo réinitialisées.");
    }
  };

  document.addEventListener("click", event => {
    unlockAudio();
    const el = event.target.closest("[data-action]");
    if (!el) return;
    if (el.dataset.action === "close-sheet" && event.target !== el && el.classList.contains("sheet-backdrop")) return;
    if (el.disabled) return;
    const run = actions[el.dataset.action];
    if (run) run(el);
  });

  document.addEventListener("keydown", event => {
    unlockAudio();
    if (event.key === "Escape" && ui.sheet) closeSheet();
  });

  document.addEventListener("submit", event => {
    const form = event.target.closest("[data-form='login']");
    if (!form) return;
    event.preventDefault();
    const data = new FormData(form);
    const error = login(data.get("email"), data.get("password"));
    if (error) {
      form.querySelector("[data-login-error]").textContent = error;
      if (lockRemaining()) render();
      return;
    }
    ui.view = "board";
    knownPending = new Set(pendingOrders().map(order => order.id));
    render();
  });

  document.addEventListener("focusout", () => {
    setTimeout(() => { if (ui.dirty && !/^(SELECT|INPUT|TEXTAREA)$/.test(document.activeElement?.tagName || "")) schedule(); }, 0);
  });

  /* ---------- timers & boot ---------- */

  function tickDom() {
    const now = Date.now();
    app.querySelectorAll("[data-until]").forEach(el => {
      const left = Number(el.dataset.until) - now;
      el.textContent = countdown(left);
      el.classList.toggle("late", left < 0);
    });
    app.querySelectorAll("[data-since]").forEach(el => { el.textContent = `${minutesSince(Number(el.dataset.since))} min`; });
    app.querySelectorAll("[data-lock]").forEach(el => {
      const wait = lockRemaining();
      if (wait <= 0) render();
      else el.textContent = wait;
    });
  }

  bus.subscribe(() => { checkNewOrders(); schedule(); });
  GKPrinter.onChange(() => { schedule(); });

  setInterval(() => {
    bus.tick();
    tickDom();
  }, 1000);
  setInterval(() => bus.heartbeat("cuisine"), 8000);
  setInterval(() => { if (state.session && pendingOrders().length) beep(); }, 5000);
  window.addEventListener("storage", event => { if (event.key === STORAGE_KEY) { state = load(); schedule(); } });

  bus.heartbeat("cuisine");
  knownPending = new Set(pendingOrders().map(order => order.id));
  render();
  GKPrinter.reconnect(state.prefs.lastPrinter);

  if ("serviceWorker" in navigator && location.protocol !== "file:") {
    navigator.serviceWorker.register("sw.js").catch(() => {});
  }
})();
