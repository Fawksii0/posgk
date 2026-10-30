(() => {
  "use strict";

  const api = window.GKApi;
  const app = document.getElementById("app");
  const sheetRoot = document.getElementById("sheet-root");
  const printArea = document.getElementById("print-area");
  const toastEl = document.getElementById("toast");
  const ui = {
    view: "salle",
    col: "new",
    filter: "all",
    sheet: null,
    category: "all",
    till: emptyTill(),
    holdRender: false,
    busy: false,
    loginEmail: false
  };
  const data = {
    orders: [], menu: [], categories: [], zones: [], calls: [], couriers: [],
    settings: { paused: false, dispatchMode: "rotation", defaultPrep: 20, tableCount: 17 },
    loading: false, loaded: false, error: "", actionError: ""
  };
  const VIEWS = [
    { key: "salle", label: "Salle", icon: "utensils" },
    { key: "till", label: "Ticket", icon: "receipt" },
    { key: "board", label: "Commandes", icon: "list" },
    { key: "history", label: "Historique", icon: "history" },
    { key: "settings", label: "Réglages", icon: "settings" }
  ];
  const COLUMNS = [
    { key: "new", label: "Nouvelles", icon: "bell" },
    { key: "prep", label: "En préparation", icon: "flame" },
    { key: "ready", label: "Prêtes", icon: "check" },
    { key: "out", label: "Terminées", icon: "bike" }
  ];
  const baseTitle = "G&K Caisse";
  let knownPending = new Set();
  let toastTimer = 0;
  let refreshRunning = false;
  let lastSignature = "";
  let bootRefresh = true;
  let lastAnnouncedRev = "";
  let watchAbort = null;

  function emptyTill(partial = {}) {
    return {
      mode: "dinein", table: 0, items: [], note: "", name: "", phone: "",
      zone: "", street: "", payment: "cash", ...partial
    };
  }

  const findOrder = id => data.orders.find(order => order.id === id);
  const defaultPrep = () => Number(data.settings.defaultPrep) || 20;
  const labeled = (name, category) => (typeof GKItemName !== "undefined" ? GKItemName.labeledName(name, category) : name);

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
      const menuItem = (data.menu || []).find(entry => entry.id === item.id);
      const category = item.category || item.categoryName || menuItem?.category || (typeof GKItemName !== "undefined" ? GKItemName.categoryFromId(item.id) : "");
      return {
        id: item.id, qty, name: labeled(item.name, category), category,
        size: item.size || "", extras: item.extras || [], price: unit
      };
    }) : [];
    const dispatchState = row.dispatch_state === "unassigned" ? "failed" : row.dispatch_state === "offered" ? "offering" : row.dispatch_state;
    return {
      id: row.id, seq: row.seq, status: row.status, mode: row.mode, items,
      customer: { name: row.customer_name || "", phone: row.customer_phone || "" },
      tableNo: Number(row.table_no) || 0,
      address: { street: row.address || "", zone: row.zone_name || row.zone_id || "", label: row.address_label || "" },
      note: row.note || "", subtotal: Number(row.subtotal) || 0, fee: Number(row.fee) || 0,
      discount: Number(row.discount) || 0, total: Number(row.total) || 0,
      payment: row.payment === "cash" ? "Espèces" : "Carte",
      paymentType: row.payment === "cash" ? "cash" : "card",
      cashierName: [...(Array.isArray(row.history) ? row.history : [])].reverse().find(entry => entry.cashier)?.cashier || "",
      deliveryCode: row.delivery_code || "",
      cashSettled: row.cash_settled === true || row.cash_settled === 1 || row.cash_settled === "1",
      createdAt: numberTime(row.created_at), acceptedAt: numberTime(row.accepted_at),
      promisedAt: numberTime(row.promised_at), deliveredAt: numberTime(row.delivered_at),
      prepMin: Number(row.prep_minutes) || 20, refusedReason: row.refused_reason || "",
      courierStep: Number(row.courier_step) || 0,
      dispatch: {
        state: dispatchState, courierId: row.offered_to || row.courier_id || "",
        expiresAt: numberTime(row.offer_expires), km: row.dispatch_km == null ? null : Number(row.dispatch_km),
        manual: !!row.dispatch_manual
      }
    };
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
      if (column === "ready") groups.out.push(order);
    });
    ["new", "prep", "ready"].forEach(key => groups[key].sort((a, b) => a.createdAt - b.createdAt));
    groups.out.sort((a, b) => b.createdAt - a.createdAt);
    return groups;
  }

  function unitPrice(product) {
    if (ui.till.mode === "dinein") return Number(product.dinePrice ?? product.price) || 0;
    return Number(product.price) || 0;
  }

  function tillTotal() {
    return ui.till.items.reduce((sum, line) => sum + line.price * line.qty, 0);
  }

  function openOrders(n) {
    return data.orders.filter(order => order.mode === "dinein" && order.tableNo === n && (
      ["pending", "preparing", "ready"].includes(order.status)
      || (order.status === "delivered" && !order.cashSettled)
    )).sort((a, b) => a.createdAt - b.createdAt);
  }

  function tableTotal(n) {
    return openOrders(n).reduce((sum, order) => sum + (Number(order.total) || 0), 0);
  }

  function tableState(n) {
    const call = data.calls.find(item => Number(item.table) === n);
    const open = openOrders(n);
    const pending = open.find(order => order.status === "pending");
    const ready = open.find(order => order.status === "ready");
    const prep = open.find(order => order.status === "preparing");
    const served = open.find(order => order.status === "delivered");
    if (call) return { kind: "call", label: "Appel", call, order: pending || ready || prep || served || null };
    if (pending) return { kind: "pending", label: "Nouvelle", order: pending };
    if (ready) return { kind: "ready", label: "Prête", order: ready };
    if (prep) return { kind: "prep", label: "En cours", order: prep };
    if (served) return { kind: "served", label: "À encaisser", order: served };
    return { kind: "free", label: "Libre", order: null };
  }

  function tableNumbers() {
    return window.GKTables?.list(state.session?.branchId || "gk-food", data.settings.tableCount) || [];
  }

  async function refreshData() {
    if (!state.session || state.session.mustChange || refreshRunning) return;
    refreshRunning = true;
    if (!data.loaded) { data.loading = true; render(); }
    try {
      const [ordersRes, settingsRes, menuRes, zonesRes, callsRes, couriersRes] = await Promise.all([
        api.get("/api/orders", API_SCOPE),
        api.get("/api/admin/settings", API_SCOPE),
        api.get("/api/admin/menu", API_SCOPE),
        api.get("/api/admin/zones", API_SCOPE).catch(() => ({ zones: [] })),
        api.get("/api/dinein/calls", API_SCOPE).catch(() => ({ calls: [] })),
        api.get("/api/admin/couriers", API_SCOPE).catch(() => ({ couriers: [] }))
      ]);
      const oldPending = knownPending;
      data.settings = { ...data.settings, ...settingsRes };
      data.categories = [{ id: "all", name: "Tout" }, ...(menuRes.categories || [])];
      const names = new Map(data.categories.map(category => [category.id, category.name]));
      data.menu = (menuRes.items || []).filter(item => item.visible !== false).map(item => ({
        ...item, category: names.get(item.categoryId) || "", categoryName: names.get(item.categoryId) || ""
      }));
      data.zones = (zonesRes.zones || []).filter(zone => zone.enabled !== false);
      if (!ui.till.zone && data.zones[0]) ui.till.zone = data.zones[0].id;
      data.calls = (callsRes.calls || []).filter(call => call.status === "open");
      data.couriers = couriersRes.couriers || [];
      data.orders = (ordersRes.orders || []).map(normalizeOrder);
      knownPending = new Set(data.orders.filter(order => order.status === "pending").map(order => order.id));
      if (!bootRefresh) {
        const fresh = [...knownPending].filter(id => !oldPending.has(id));
        if (fresh.length) {
          beep();
          toast(fresh.length === 1 ? "Nouvelle commande." : `${fresh.length} nouvelles commandes.`);
        }
      }
      bootRefresh = false;
      data.error = "";
      data.loaded = true;
      data.loading = false;
    } catch (error) {
      data.loading = false;
      data.error = error.message || "Impossible de charger les données.";
    } finally {
      refreshRunning = false;
      const signature = JSON.stringify([data.orders, data.calls, data.settings, data.menu, data.error, ui.view, ui.till]);
      if (signature !== lastSignature) {
        lastSignature = signature;
        if (!ui.holdRender) render();
      }
    }
  }

  function applySnap(snap) {
    const pendingIds = snap.pendingIds || [];
    if (bootRefresh || snap.rev === lastAnnouncedRev) return snap.rev || "";
    lastAnnouncedRev = snap.rev;
    if (pendingIds.some(id => !knownPending.has(id)) || pendingIds.length !== knownPending.size) void refreshData();
    return snap.rev || "";
  }

  function stopWatch() {
    watchAbort?.abort();
    watchAbort = null;
  }

  function startWatch() {
    stopWatch();
    if (!state.session || state.session.mustChange) return;
    const abort = new AbortController();
    watchAbort = abort;
    void (async () => {
      let rev = "";
      while (!abort.signal.aborted && state.session && !state.session.mustChange) {
        try {
          const snap = await api.get(`/api/live/wait?kind=kitchen&rev=${encodeURIComponent(rev)}`, API_SCOPE, { signal: abort.signal });
          if (abort.signal.aborted) return;
          rev = applySnap(snap) || rev;
        } catch (error) {
          if (abort.signal.aborted || error?.name === "AbortError") return;
          await new Promise(resolve => setTimeout(resolve, 500));
        }
      }
    })();
  }

  function beep() {
    if (!state.prefs.sound) return;
    window.GKSound?.unlock();
    window.GKSound?.play("order");
  }

  function closeSheet() {
    ui.sheet = null;
    sheetRoot.innerHTML = "";
    printArea.innerHTML = "";
  }

  function openSheet(html, { wide = false } = {}) {
    sheetRoot.innerHTML = `<div class="sheet-backdrop" data-action="close-sheet"><div class="sheet${wide ? " sheet-wide" : ""}" role="dialog" aria-modal="true">${html}</div></div>`;
  }

  const KB_LOWER = [
    ["1", "2", "3", "4", "5", "6", "7", "8", "9", "0"],
    ["a", "z", "e", "r", "t", "y", "u", "i", "o", "p"],
    ["q", "s", "d", "f", "g", "h", "j", "k", "l", "m"],
    ["w", "x", "c", "v", "b", "n", "'", "-", "."]
  ];
  const KB_UPPER = [
    ["1", "2", "3", "4", "5", "6", "7", "8", "9", "0"],
    ["A", "Z", "E", "R", "T", "Y", "U", "I", "O", "P"],
    ["Q", "S", "D", "F", "G", "H", "J", "K", "L", "M"],
    ["W", "X", "C", "V", "B", "N", "É", "È", "À"]
  ];

  function paintKitchenNoteKb() {
    const sheet = ui.sheet;
    if (!sheet || sheet.type !== "kitchen-note") return;
    const rows = sheet.shift ? KB_UPPER : KB_LOWER;
    const keys = rows.map(row => `<div class="kb-row">${row.map(ch =>
      `<button class="kb-key" type="button" data-action="kb-key" data-ch="${esc(ch)}">${esc(ch)}</button>`
    ).join("")}</div>`).join("");
    const empty = !sheet.text;
    sheetRoot.innerHTML = `<div class="sheet-backdrop kb-backdrop" data-action="close-sheet"><div class="sheet kb-sheet" role="dialog" aria-modal="true" aria-label="Note cuisine">
      <p class="kb-label">Note cuisine</p>
      <div class="kb-buffer${empty ? " is-empty" : ""}" data-kb-buffer>${empty ? "Écrire la note…" : esc(sheet.text)}</div>
      <div class="kb-rows">${keys}
        <div class="kb-row">
          <button class="kb-key ghost${sheet.shift ? " on" : ""}" type="button" data-action="kb-shift">⇧</button>
          <button class="kb-key wide" type="button" data-action="kb-space">espace</button>
          <button class="kb-key ghost" type="button" data-action="kb-back">⌫</button>
        </div>
        <div class="kb-row">
          <button class="kb-key ghost" type="button" data-action="close-sheet">Annuler</button>
          <button class="kb-key ok" type="button" data-action="kitchen-note-print">OK</button>
        </div>
      </div>
    </div></div>`;
  }

  function syncKitchenNoteBuffer() {
    const el = sheetRoot.querySelector("[data-kb-buffer]");
    if (!el || !ui.sheet || ui.sheet.type !== "kitchen-note") return;
    const text = ui.sheet.text;
    el.classList.toggle("is-empty", !text);
    el.textContent = text || "Écrire la note…";
  }

  async function printKitchenNote(note) {
    const text = String(note || "").trim();
    if (!text) {
      toast("Écrivez une note.");
      return false;
    }
    if (typeof GKPrinter === "undefined" || !GKPrinter.connected()) {
      toast("Connectez l'imprimante cuisine.");
      return false;
    }
    await ensureTicketArt();
    await GKPrinter.write(buildTicket({
      id: "NOTE",
      createdAt: Date.now(),
      mode: "pickup",
      note: text,
      items: [],
      cashierName: state.session?.name || "",
      customer: { name: "", phone: "" },
      address: { street: "", zone: "" }
    }, { paper: state.prefs.paper, kind: "kitchen-note" }));
    toast("Note envoyée en cuisine.");
    return true;
  }

  function renderLogin() {
    if (ui.loginEmail) {
      return `<main class="login">
      <form class="login-card" data-form="login" novalidate>
        <div class="brand"><img src="assets/emblem-reference.png" alt="G&amp;K Food" width="56" height="56"><span class="pill-black">CAISSE</span></div>
        <h1>Point de vente</h1>
        <p class="muted">Connexion manager / admin.</p>
        <label>E-mail<input name="email" type="email" autocomplete="username" required></label>
        <label>Mot de passe<input name="password" type="password" autocomplete="current-password" required></label>
        <p class="form-error" data-login-error></p>
        <button class="btn primary block" type="submit">Se connecter</button>
        <button class="btn block ghost" type="button" data-action="login-code">Code caissier</button>
      </form>
    </main>`;
    }
    return `<main class="login">
      <form class="login-card" data-form="login" novalidate>
        <div class="brand"><img src="assets/emblem-reference.png" alt="G&amp;K Food" width="56" height="56"><span class="pill-black">CAISSE</span></div>
        <h1>Point de vente</h1>
        <p class="muted">Entrez votre code personnel à 4 chiffres.</p>
        <label>Code<input class="pin-input" name="code" type="password" inputmode="numeric" maxlength="4" autocomplete="one-time-code" required></label>
        <p class="form-error" data-login-error></p>
        <button class="btn primary block" type="submit">Se connecter</button>
        <button class="btn block ghost" type="button" data-action="login-email">Connexion e-mail</button>
      </form>
    </main>`;
  }

  function renderChangeSecret() {
    return `<main class="login">
      <form class="login-card" data-form="change-secret" novalidate>
        <div class="brand"><img src="assets/emblem-reference.png" alt="" width="56" height="56"><span class="pill-black">CAISSE</span></div>
        <h1>Nouveau mot de passe</h1>
        <label>Mot de passe actuel<input name="current" type="password" required></label>
        <label>Nouveau mot de passe<input name="next" type="password" minlength="8" required></label>
        <p class="form-error" data-secret-error></p>
        <button class="btn primary block" type="submit">Enregistrer</button>
        <button class="btn block ghost" type="button" data-action="logout">Se déconnecter</button>
      </form>
    </main>`;
  }

  function renderHeader() {
    const connected = typeof GKPrinter !== "undefined" && GKPrinter.connected();
    return `<header class="top">
      <div class="brand"><img src="assets/emblem-reference.png" alt="G&amp;K Food" width="40" height="40"><span class="pill-black">CAISSE</span></div>
      <div class="chips">
        <span class="chip branch-chip">${icon("store")}<span>${esc(state.session.branchName || "Restaurant G&K")}</span></span>
        <span class="chip ${data.settings.paused ? "warn" : "ok"}">${icon(data.settings.paused ? "pause" : "store")}<span>${data.settings.paused ? "En pause" : "Ouvert"}</span></span>
        <button class="chip ${connected ? "ok" : "off"}" data-action="view" data-view="settings">${icon("printer")}<span>${connected ? "Imprimante" : "Imprimante"}</span></button>
        <span class="chip ${data.error ? "off" : "ok"}">${icon("wifi")}<span>${data.error ? "API hors ligne" : "API connectée"}</span></span>
      </div>
      <div class="who"><span class="who-name">${icon("user")}<span>${esc(`${state.session.name} · ${state.session.label}`)}</span></span>
        <button class="icon-btn" data-action="toggle-sound" aria-label="Son">${icon(state.prefs.sound ? "volume" : "volumeOff")}</button>
        <button class="icon-btn" data-action="logout" aria-label="Déconnexion">${icon("logout")}</button></div>
    </header>
    <nav class="tabs">${VIEWS.map(v => `<button class="tab ${ui.view === v.key ? "active" : ""}" data-action="view" data-view="${v.key}">${icon(v.icon)}<span>${v.label}</span></button>`).join("")}</nav>`;
  }

  function renderFloor() {
    const rows = window.GKTables?.groups(state.session?.branchId || "gk-food", data.settings.tableCount) || [];
    const numbers = tableNumbers();
    const seats = rows.map(row => `<div class="floor-row n${row.length}">${row.map(n => {
      const seat = tableState(n);
      const total = tableTotal(n);
      return `<button class="seat ${seat.kind}" type="button" data-action="open-table" data-table="${n}">
        <b>${n}</b><small>${esc(total ? money(total) : seat.label)}</small>
      </button>`;
    }).join("")}</div>`).join("");
    const busy = numbers.filter(n => tableState(n).kind !== "free").length;
    const floorTotal = numbers.reduce((sum, n) => sum + tableTotal(n), 0);
    const calls = data.calls || [];
    return `<div class="floor-legend"><span class="dot call"></span>Appel<span class="dot pending"></span>Nouvelle<span class="dot prep"></span>Cuisine<span class="dot ready"></span>Prête<span class="dot served"></span>À encaisser<span class="dot free"></span>Libre · ${busy} occupée${busy > 1 ? "s" : ""}</div>
      <div class="floor">${seats}</div>
      <div class="floor-dock">
        <button class="btn dock-mini" type="button" data-action="open-cash-drawer">${icon("cash")} Ouvrir tiroir</button>
        <button class="btn dock-mini dock-note" type="button" data-action="kitchen-note">${icon("note")} Note cuisine</button>
        <span class="dock-stat">${busy} table${busy > 1 ? "s" : ""} · ${money(floorTotal)}</span>
        ${calls.length ? `<button class="btn dock-call" type="button" data-action="ack-call" data-id="${esc(calls[0].id)}">${icon("bell")} Appel T${esc(calls[0].table)}</button>` : ""}
        <button class="btn" type="button" data-action="till-jump" data-mode="pickup">Emporter</button>
        <button class="btn" type="button" data-action="till-jump" data-mode="delivery">Livraison</button>
      </div>`;
  }

  function renderTill() {
    const till = ui.till;
    const products = ui.category === "all" ? data.menu.filter(item => item.available !== false)
      : data.menu.filter(item => item.available !== false && item.categoryId === ui.category);
    const lines = till.items.map((item, index) => `<li>
      <div><b>${esc(item.name)}</b>${item.size ? `<div class="small muted">${esc(item.size)}</div>` : ""}<div class="small">${money(item.price * item.qty)}</div></div>
      <div class="qty-mini"><button type="button" data-action="till-qty" data-index="${index}" data-delta="-1">${icon("minus")}</button><span>${item.qty}</span><button type="button" data-action="till-qty" data-index="${index}" data-delta="1">${icon("plus")}</button></div>
    </li>`).join("");
    const tables = tableNumbers();
    return `<div class="pos-layout">
      <section class="pos-catalog">
        <div class="mode-row">
          ${[["dinein", "Sur place"], ["pickup", "Emporter"], ["delivery", "Livraison"]].map(([mode, label]) =>
            `<button class="btn ${till.mode === mode ? "primary" : ""}" data-action="till-mode" data-mode="${mode}">${label}</button>`).join("")}
        </div>
        ${till.mode === "dinein" ? `<div class="table-pick">${tables.map(n => `<button type="button" class="${till.table === n ? "active" : ""}" data-action="till-table" data-table="${n}">${n}</button>`).join("")}</div>` : ""}
        <div class="cat-strip">${data.categories.map(category => `<button class="cat-chip ${ui.category === category.id ? "active" : ""}" data-action="till-cat" data-cat="${esc(category.id)}">${esc(category.name)}</button>`).join("")}</div>
        <div class="product-grid">${products.map(product => {
          const name = labeled(product.name, product.categoryName);
          return `<button class="product-tile" type="button" data-action="till-add" data-id="${esc(product.id)}"><b>${esc(name)}</b><span>${money(unitPrice(product))}</span></button>`;
        }).join("") || `<p class="empty">Aucun plat.</p>`}</div>
      </section>
      <aside class="pos-ticket">
        <h2>Ticket</h2>
        <p class="muted small">${till.mode === "dinein" ? (till.table ? `Table ${till.table}` : "Choisissez une table") : till.mode === "delivery" ? "Livraison" : "À emporter"}</p>
        <ul class="ticket-lines">${lines || `<li class="muted">Ajoutez des plats.</li>`}</ul>
        <div class="pos-fields">
          ${till.mode === "delivery" ? `<input data-till="name" placeholder="Nom du client" value="${esc(till.name)}">
            <input data-till="phone" placeholder="Téléphone" value="${esc(till.phone)}" inputmode="tel">
            <select data-till="zone">${data.zones.map(zone => `<option value="${esc(zone.id)}" ${till.zone === zone.id ? "selected" : ""}>${esc(zone.name)} · ${zone.fee} MAD</option>`).join("")}</select>
            <input data-till="street" placeholder="Adresse de livraison" value="${esc(till.street)}">` : ""}
          <textarea data-till="note" placeholder="Note cuisine">${esc(till.note)}</textarea>
        </div>
        <div class="card-total"><span>Total</span><b>${money(tillTotal())}</b></div>
        <div class="btn-row wrap" style="margin-top:12px">
          <button class="btn" data-action="till-clear">Vider</button>
          <button class="btn primary" data-action="till-send" ${ui.busy || !till.items.length ? "disabled" : ""}>${icon("check")} Envoyer en cuisine</button>
        </div>
      </aside>
    </div>`;
  }

  function orderCard(order) {
    const lines = (order.items || []).map(item => {
      const label = typeof GKItemName !== "undefined" ? GKItemName.ticketName(item) : item.name;
      return `<li><span class="qty">${item.qty}×</span><span class="item-main"><b>${esc(label)}</b></span><span class="price">${money(item.price * item.qty)}</span></li>`;
    }).join("");
    let actions = `<div class="kds-print-bar">
      <button class="icon-btn" data-action="print-original" data-id="${esc(order.id)}">${icon("printer")}</button>
      <button class="icon-btn" data-action="print-kitchen" data-id="${esc(order.id)}">${icon("utensils")}</button>
      <button class="icon-btn" data-action="print-duplicata" data-id="${esc(order.id)}">D</button>
    </div>`;
    if (order.status === "pending") {
      actions += `<div class="btn-row wrap"><button class="btn danger" data-action="refuse" data-id="${esc(order.id)}">Refuser</button><button class="btn primary" data-action="accept" data-id="${esc(order.id)}">Accepter</button></div>`;
    } else if (order.status === "ready" && order.mode === "pickup") {
      actions += `<div class="btn-row wrap"><button class="btn primary" data-action="handover" data-id="${esc(order.id)}">Remise</button></div>`;
    } else if (order.status === "ready" && order.mode === "dinein") {
      actions += `<div class="btn-row wrap"><button class="btn primary" data-action="handover" data-id="${esc(order.id)}">Servie</button></div>`;
    } else if (order.status === "delivered" && order.mode === "dinein" && !order.cashSettled) {
      actions += `<div class="btn-row wrap"><button class="btn primary" data-action="settle-table" data-table="${esc(order.tableNo)}">Encaisser table ${esc(order.tableNo)}</button></div>`;
    }
    return `<article class="card ${order.status === "pending" ? "is-new" : ""} mode-${order.mode}">
      <header class="card-head"><span class="order-no">${esc(order.seq || order.id)}</span><span class="kds-place">${esc(modeLabel(order))}</span><span class="elapsed">${clock(order.createdAt)}</span></header>
      <ul class="lines">${lines}</ul>
      ${order.note ? `<p class="note">${icon("alert")}<span>${esc(order.note)}</span></p>` : ""}
      <div class="card-total"><span class="pay">${esc(order.payment)}</span><b>${money(order.total)}</b></div>
      ${actions}
    </article>`;
  }

  function renderBoard() {
    const groups = groupOrders(data.orders);
    const tabs = `<div class="col-tabs">${COLUMNS.map(c => `<button class="col-tab ${ui.col === c.key ? "active" : ""}" data-action="col" data-col="${c.key}">${c.label}<b>${groups[c.key].length}</b></button>`).join("")}</div>`;
    const cols = COLUMNS.map(c => `<section class="col col-${c.key} ${ui.col === c.key ? "is-current" : ""}"><h2>${c.label}<b>${groups[c.key].length}</b></h2>
      <div class="col-body">${groups[c.key].length ? groups[c.key].map(orderCard).join("") : (window.GKLottie ? GKLottie.empty("Aucune commande", "", "compact") : `<p class="empty">Aucune commande</p>`)}</div></section>`).join("");
    return `${tabs}<div class="board">${cols}</div>`;
  }

  function renderHistory() {
    const today = data.orders.filter(order => isToday(order.createdAt));
    const revenue = today.filter(order => order.status === "delivered").reduce((sum, order) => sum + order.total, 0);
    const rows = today.map(order => `<article class="h-row s-${order.status}">
      <div class="h-main"><b class="h-no">${esc(order.seq || order.id)}</b><span class="pill s-${order.status}">${esc(STATUS_LABELS[order.status] || order.status)}</span></div>
      <div class="h-info"><span>${clock(order.createdAt)}</span><span>${esc(modeLabel(order))}</span></div>
      <div class="h-end"><b>${money(order.total)}</b></div></article>`).join("");
    return `<section class="panel wide"><div class="panel-head"><div><h2>Historique du jour</h2><p class="muted">Toutes les commandes du restaurant, tous modes.</p></div></div>
      <div class="kpis"><div class="kpi"><span>Commandes</span><b>${today.length}</b></div><div class="kpi gold"><span>Total</span><b>${money(revenue)}</b></div></div>
      ${rows ? `<div class="h-list">${rows}</div>` : `<p class="empty">Aucune commande aujourd'hui.</p>`}</section>`;
  }

  function switchRow(label, hint, on, action) {
    return `<div class="setting"><div><b>${label}</b><div class="small muted">${hint}</div></div>
      <button class="switch ${on ? "on" : ""}" data-action="${action}"><span class="switch-label">${on ? "Oui" : "Non"}</span><i></i></button></div>`;
  }

  function renderSettings() {
    const connected = typeof GKPrinter !== "undefined" && GKPrinter.connected();
    const bleOk = typeof GKPrinter !== "undefined" && GKPrinter.bleSupported();
    const serialOk = typeof GKPrinter !== "undefined" && GKPrinter.serialSupported();
    return `<section class="panel settings"><h2>Réglages</h2>
      <div class="group"><h3>Imprimante</h3>
        <p class="small ${connected ? "ok-text" : "muted"}">${connected ? `Connectée : ${esc(GKPrinter.name())}` : "Non connectée"}</p>
        <div class="btn-row wrap">
          ${bleOk ? `<button class="btn primary" data-action="printer-connect">${icon("bluetooth")}Bluetooth</button>` : ""}
          ${serialOk ? `<button class="btn" data-action="printer-serial">${icon("printer")}Port série</button>` : ""}
          ${connected ? `<button class="btn" data-action="printer-disconnect">Déconnecter</button>` : ""}
          <button class="btn" data-action="printer-test">Ticket de test</button>
        </div>
        <div class="setting"><div><b>Papier</b></div><div class="seg">${[58, 80].map(w => `<button class="${state.prefs.paper === w ? "active" : ""}" data-action="paper" data-paper="${w}">${w} mm</button>`).join("")}</div></div>
        ${switchRow("Alerte sonore", "Bip à chaque nouvelle commande.", state.prefs.sound, "toggle-sound")}
        ${switchRow("Pause des commandes", "Bloque les commandes clients.", !!data.settings.paused, "toggle-pause")}
      </div>
    </section>`;
  }

  function renderTableSheet(n) {
    const orders = openOrders(n);
    const total = tableTotal(n);
    const cooking = orders.some(order => ["pending", "preparing", "ready"].includes(order.status));
    const canSettle = !cooking && orders.some(order => order.status === "delivered" && !order.cashSettled);
    openSheet(`<div class="sheet-body">
        <h2>Table ${esc(n)}</h2>
        <p class="muted">${orders.length} ticket${orders.length > 1 ? "s" : ""} · ${money(total)}</p>
        ${orders.map(orderCard).join("") || `<p class="empty">Table libre.</p>`}
      </div>
      <div class="sheet-foot">
        <button class="btn" data-action="close-sheet">Fermer</button>
        <button class="btn" data-action="till-from-table" data-table="${n}">${icon("plus")} Ajouter</button>
        ${canSettle ? `<button class="btn primary" data-action="settle-table" data-table="${n}">Encaisser · ${money(total)}</button>` : ""}
      </div>`, { wide: true });
  }

  function render() {
    if (ui.holdRender) return;
    if (!state.session) { app.innerHTML = renderLogin(); document.title = baseTitle; return; }
    if (state.session.mustChange) { app.innerHTML = renderChangeSecret(); return; }
    let body;
    if (!data.loaded && data.loading) body = `<section class="panel">${window.GKLottie ? GKLottie.loading("Chargement…") : `<p class="empty">Chargement…</p>`}</section>`;
    else if (!data.loaded && data.error) body = `<section class="panel"><p class="form-error">${esc(data.error)}</p><button class="btn primary" data-action="refresh">Réessayer</button></section>`;
    else body = { salle: renderFloor, till: renderTill, board: renderBoard, history: renderHistory, settings: renderSettings }[ui.view]();
    const banners = `${data.error && data.loaded ? `<p class="banner">Sync : ${esc(data.error)} <button class="btn small-btn" data-action="refresh">Réessayer</button></p>` : ""}`;
    app.innerHTML = `${renderHeader()}<main class="main view-${ui.view}">${banners}${body}</main>`;
    const pending = data.orders.filter(o => o.status === "pending").length;
    document.title = pending ? `(${pending}) ${baseTitle}` : baseTitle;
  }

  async function printOrder(order, options = {}) {
    const kind = options.kind || "original";
    const paper = state.prefs.paper;
    order = { ...order, cashierName: order.cashierName || state.session?.name || "" };
    await ensureTicketArt();
    if (typeof GKPrinter !== "undefined" && GKPrinter.connected()) {
      try {
        await GKPrinter.write(buildTicket(order, { paper, kind }));
        if (options.withKitchen) await GKPrinter.write(buildTicket(order, { paper, kind: "kitchen" }));
        toast(`Ticket #${order.seq || order.id} envoyé.`);
        return;
      } catch (error) {
        toast(`Impression : ${error.message || "échec"}`);
      }
    }
    openSheet(`<h2>Ticket #${esc(order.seq || order.id)}</h2>${ticketMarkup(order, { paper, kind })}
      <div class="btn-row"><button class="btn" data-action="close-sheet">Fermer</button><button class="btn primary" data-action="browser-print" data-id="${esc(order.id)}" data-kind="${esc(kind)}">Imprimer</button></div>`);
  }

  async function runAction(operation, after) {
    try {
      const result = await operation();
      data.actionError = "";
      if (after) await after(result);
      await refreshData();
      return result;
    } catch (error) {
      data.actionError = error.message || "Échec.";
      toast(data.actionError);
      render();
      return null;
    }
  }

  function addProduct(id) {
    const product = data.menu.find(item => item.id === id);
    if (!product || product.available === false) return toast("Produit indisponible.");
    const size = (product.sizes && product.sizes[0]?.name) || "";
    const price = unitPrice(product) + Number(product.sizes?.[0]?.delta || 0);
    const name = labeled(product.name, product.categoryName);
    const existing = ui.till.items.find(item => item.id === product.id && item.size === size);
    if (existing) existing.qty += 1;
    else ui.till.items.push({ id: product.id, name, category: product.categoryName || "", qty: 1, size, extras: [], price });
    render();
  }

  async function sendTill() {
    const till = ui.till;
    if (!till.items.length) return toast("Ajoutez des plats.");
    if (till.mode === "dinein" && !till.table) return toast("Choisissez une table.");
    if (till.mode === "delivery" && String(till.street || "").trim().length < 5) return toast("Saisissez une adresse de livraison.");
    if (ui.busy) return;
    ui.busy = true;
    render();
    const payload = {
      mode: till.mode,
      items: till.items.map(item => ({ id: item.id, qty: item.qty, size: item.size || "", extras: item.extras || [] })),
      note: till.note,
      payment: till.payment,
      accept: true
    };
    if (till.mode === "dinein") payload.table = till.table;
    if (till.mode === "delivery") payload.customer = { name: till.name || "Caisse", phone: till.phone || undefined };
    if (till.mode === "delivery") payload.address = { zone: till.zone, street: till.street, label: "Caisse" };
    try {
      const result = await api.post("/api/pos/orders", payload, API_SCOPE);
      const order = normalizeOrder(result.order);
      toast(`Ticket #${order.seq} envoyé en cuisine.`);
      ui.till = emptyTill({ mode: till.mode, table: till.mode === "dinein" ? 0 : till.table, zone: till.zone });
      closeSheet();
      ui.view = "board";
      ui.col = "prep";
      await refreshData();
      try { await printOrder(order, { kind: "original", withKitchen: true }); } catch { /* print optional */ }
    } catch (error) {
      toast(error.message || "Impossible d'envoyer le ticket.");
    } finally {
      ui.busy = false;
      render();
    }
  }

  const actions = {
    logout() { stopWatch(); logout(); closeSheet(); data.loaded = false; data.orders = []; render(); },
    "login-email"() { ui.loginEmail = true; render(); },
    "login-code"() { ui.loginEmail = false; render(); },
    view(el) { ui.view = el.dataset.view; render(); },
    col(el) { ui.col = el.dataset.col; render(); },
    refresh() { data.error = ""; void refreshData(); },
    "toggle-sound"() { state.prefs.sound = !state.prefs.sound; save(); render(); },
    "toggle-pause"() { runAction(() => api.patch("/api/admin/settings/operations", { paused: !data.settings.paused }, API_SCOPE)); },
    paper(el) { state.prefs.paper = Number(el.dataset.paper); save(); render(); },
    "till-mode"(el) { ui.till.mode = el.dataset.mode; if (el.dataset.mode !== "dinein") ui.till.table = 0; render(); },
    "till-jump"(el) {
      ui.till = emptyTill({ mode: el.dataset.mode, zone: ui.till.zone });
      ui.view = "till";
      render();
    },
    async "open-cash-drawer"() {
      try {
        if (typeof GKPrinter === "undefined" || !GKPrinter.connected()) {
          toast("Connectez l'imprimante pour ouvrir le tiroir.");
          return;
        }
        await GKPrinter.openDrawer();
        toast("Tiroir ouvert.");
      } catch (error) {
        toast(error.message || "Tiroir indisponible.");
      }
    },
    "kitchen-note"() {
      ui.sheet = { type: "kitchen-note", text: "", shift: false };
      paintKitchenNoteKb();
    },
    "kb-key"(el) {
      if (!ui.sheet || ui.sheet.type !== "kitchen-note") return;
      ui.sheet.text += el.dataset.ch || "";
      if (ui.sheet.shift) { ui.sheet.shift = false; paintKitchenNoteKb(); }
      else syncKitchenNoteBuffer();
    },
    "kb-space"() {
      if (!ui.sheet || ui.sheet.type !== "kitchen-note") return;
      ui.sheet.text += " ";
      syncKitchenNoteBuffer();
    },
    "kb-back"() {
      if (!ui.sheet || ui.sheet.type !== "kitchen-note") return;
      ui.sheet.text = ui.sheet.text.slice(0, -1);
      syncKitchenNoteBuffer();
    },
    "kb-shift"() {
      if (!ui.sheet || ui.sheet.type !== "kitchen-note") return;
      ui.sheet.shift = !ui.sheet.shift;
      paintKitchenNoteKb();
    },
    async "kitchen-note-print"() {
      if (!ui.sheet || ui.sheet.type !== "kitchen-note") return;
      try {
        if (await printKitchenNote(ui.sheet.text)) closeSheet();
      } catch (error) {
        toast(error.message || "Impression note impossible.");
      }
    },
    "ack-call"(el) {
      runAction(() => api.post(`/api/dinein/calls/${encodeURIComponent(el.dataset.id)}/ack`, {}, API_SCOPE));
    },
    "till-table"(el) { ui.till.table = Number(el.dataset.table); render(); },
    "till-cat"(el) { ui.category = el.dataset.cat; render(); },
    "till-add"(el) { addProduct(el.dataset.id); },
    "till-qty"(el) {
      const index = Number(el.dataset.index);
      const line = ui.till.items[index];
      if (!line) return;
      line.qty = Math.max(0, line.qty + Number(el.dataset.delta));
      if (line.qty === 0) ui.till.items.splice(index, 1);
      render();
    },
    "till-clear"() { ui.till = emptyTill({ mode: ui.till.mode, zone: ui.till.zone }); render(); },
    "till-send"() { void sendTill(); },
    "till-from-table"(el) {
      closeSheet();
      ui.till = emptyTill({ mode: "dinein", table: Number(el.dataset.table), zone: ui.till.zone });
      ui.view = "till";
      render();
    },
    "open-table"(el) {
      const n = Number(el.dataset.table);
      const seat = tableState(n);
      if (seat.kind === "call" && seat.call) {
        return runAction(() => api.post(`/api/dinein/calls/${encodeURIComponent(seat.call.id)}/ack`, {}, API_SCOPE), () => {
          ui.sheet = { type: "table", n };
          renderTableSheet(n);
        });
      }
      if (seat.kind === "free") {
        ui.till = emptyTill({ mode: "dinein", table: n, zone: ui.till.zone });
        ui.view = "till";
        return render();
      }
      ui.sheet = { type: "table", n };
      renderTableSheet(n);
    },
    accept(el) {
      const order = findOrder(el.dataset.id);
      if (!order) return;
      runAction(() => api.post(`/api/orders/${encodeURIComponent(order.id)}/accept`, { prepMinutes: order.prepMin || 20 }, API_SCOPE), async result => {
        const accepted = result?.order ? normalizeOrder(result.order) : order;
        try { await printOrder(accepted, { kind: "original", withKitchen: true }); } catch { /* optional */ }
      });
    },
    refuse(el) {
      openSheet(`<div class="refuse-head"><span class="refuse-ico">${icon("close")}</span><div><h2>Refuser #${esc(el.dataset.id)}</h2></div></div>
        <div class="reasons">${REFUSE_REASONS.map(reason => `<button class="reason-btn" data-action="refuse-reason" data-id="${esc(el.dataset.id)}" data-reason="${esc(reason)}">${esc(reason)}</button>`).join("")}</div>
        <button class="btn block ghost" data-action="close-sheet">Annuler</button>`);
    },
    "refuse-reason"(el) {
      runAction(() => api.post(`/api/orders/${encodeURIComponent(el.dataset.id)}/refuse`, { reason: el.dataset.reason }, API_SCOPE), () => closeSheet());
    },
    handover(el) { runAction(() => api.post(`/api/orders/${encodeURIComponent(el.dataset.id)}/handover`, {}, API_SCOPE)); },
    "settle-table"(el) {
      const table = Number(el.dataset.table);
      runAction(() => api.post(`/api/dinein/tables/${encodeURIComponent(table)}/settle`, {}, API_SCOPE), () => {
        closeSheet();
        toast(`Table ${table} encaissée.`);
      });
    },
    "print-original"(el) { const o = findOrder(el.dataset.id); if (o) printOrder(o, { kind: "original" }); },
    "print-kitchen"(el) { const o = findOrder(el.dataset.id); if (o) printOrder(o, { kind: "kitchen" }); },
    "print-duplicata"(el) { const o = findOrder(el.dataset.id); if (o) printOrder(o, { kind: "duplicata" }); },
    "browser-print"(el) {
      const order = findOrder(el.dataset.id);
      if (order) printEscposHtml(order, { paper: state.prefs.paper, kind: el.dataset.kind || "original" });
    },
    async "printer-connect"() {
      ui.holdRender = true;
      try {
        const name = await GKPrinter.connect();
        state.prefs.lastPrinter = name; save(); toast(`Imprimante : ${name}`);
      } catch (error) { toast(error.message || "Bluetooth indisponible."); }
      finally { ui.holdRender = false; render(); }
    },
    async "printer-serial"() {
      ui.holdRender = true;
      try {
        const name = await GKPrinter.connectSerial(state.prefs.baud || 9600);
        state.prefs.lastPrinter = name; save(); toast(`Imprimante : ${name}`);
      } catch (error) { toast(error.message || "Port série indisponible."); }
      finally { ui.holdRender = false; render(); }
    },
    "printer-disconnect"() { GKPrinter.disconnect(); render(); },
    "printer-test"() {
      printOrder({
        id: "TEST", seq: "TEST", createdAt: Date.now(), mode: "pickup", customer: { name: "Test caisse" },
        items: [{ qty: 1, name: "Impression OK", size: "", extras: [], price: 0 }],
        subtotal: 0, fee: 0, total: 0, payment: "Espèces", paymentType: "cash"
      }, { kind: "original" });
    },
    "close-sheet"() { closeSheet(); }
  };

  document.addEventListener("click", event => {
    window.GKSound?.unlock();
    const el = event.target.closest("[data-action]");
    if (!el || el.disabled) return;
    if (el.dataset.action === "close-sheet" && event.target !== el && el.classList.contains("sheet-backdrop")) return;
    const action = actions[el.dataset.action];
    if (action) action(el);
  });

  document.addEventListener("input", event => {
    const field = event.target.dataset.till;
    if (!field) return;
    ui.till[field] = event.target.value;
  });

  document.addEventListener("keydown", event => {
    if (event.key === "Escape" && ui.sheet) closeSheet();
  });

  document.addEventListener("submit", async event => {
    const secretForm = event.target.closest("[data-form='change-secret']");
    if (secretForm) {
      event.preventDefault();
      const errorEl = secretForm.querySelector("[data-secret-error]");
      const body = Object.fromEntries(new FormData(secretForm).entries());
      try {
        setSession(await api.post("/api/auth/change-secret", { current: body.current, next: body.next }, API_SCOPE));
        render();
        if (!state.session.mustChange) { await refreshData(); startWatch(); }
      } catch (error) { errorEl.textContent = error.message || "Impossible de changer le mot de passe."; }
      return;
    }
    const form = event.target.closest("[data-form='login']");
    if (!form) return;
    event.preventDefault();
    const errorEl = form.querySelector("[data-login-error]");
    const button = form.querySelector("[type=submit]");
    button.disabled = true;
    errorEl.textContent = "";
    try {
      const formData = new FormData(form);
      const code = String(formData.get("code") || "").replace(/\D/g, "");
      const result = await api.post("/api/auth/staff", code
        ? { code }
        : { email: formData.get("email"), password: formData.get("password") });
      if (!CAISSE_ROLES.includes(result.user?.role)) throw new Error("Cette application est réservée à la caisse.");
      setSession(result);
      render();
      if (!state.session.mustChange) { await refreshData(); startWatch(); }
    } catch (error) {
      errorEl.textContent = error.message || "Connexion impossible.";
      button.disabled = false;
    }
  });

  document.addEventListener("gk-api-session-expired", event => {
    if (event.detail?.scope !== API_SCOPE) return;
    stopWatch(); logout(); toast("Session expirée."); render();
  });

  try { GKPrinter.onChange(() => { if (!ui.holdRender) render(); }); } catch { /* optional */ }
  try { GKPrinter.reconnect(state.prefs.lastPrinter); } catch { /* ignore */ }
  try { ensureTicketArt(); } catch { /* optional */ }
  render();
  if (state.session && !state.session.mustChange) {
    void refreshData();
    startWatch();
  }
  setInterval(() => { if (state.session && !state.session.mustChange && !document.hidden) void refreshData(); }, 15000);
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden && state.session && !state.session.mustChange) startWatch();
  });
  if ("serviceWorker" in navigator && location.protocol !== "file:") {
    navigator.serviceWorker.register("./sw.js", { updateViaCache: "none" })
      .then(() => { if (state.session && !state.session.mustChange) enablePhonePush(true); })
      .catch(() => {});
  }
})();
