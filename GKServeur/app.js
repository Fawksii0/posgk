(() => {
  "use strict";

  const api = window.GKApi;
  const main = document.querySelector("#app-main");
  const header = document.querySelector("#app-header");
  const overlay = document.querySelector("#overlay");
  const sheet = document.querySelector("#sheet");
  const toastEl = document.querySelector("#toast");
  const TABS = [
    { key: "salle", label: "Salle" },
    { key: "new", label: "Nouvelles" },
    { key: "prep", label: "En cours" },
    { key: "ready", label: "Prêtes" },
    { key: "calls", label: "Appels" },
    { key: "served", label: "Servies" }
  ];
  const ui = { tab: "salle", sheet: null, draft: null, category: "all", busy: false, holdRender: false, loginEmail: false };
  const data = {
    orders: [], calls: [], notifications: [], menu: [], categories: [],
    tableCount: 17, loading: false, loaded: false, error: ""
  };
  let knownPending = new Set();
  let knownCalls = new Set();
  let toastTimer = 0;
  let lastSignature = "";
  let bootRefresh = true;
  let refreshRunning = false;
  let refreshQueued = false;
  let lastAnnouncedRev = "";
  let lastLiveRev = "";
  let watchAbort = null;

  const numberTime = value => {
    const numeric = Number(value);
    if (Number.isFinite(numeric) && numeric > 0) return numeric;
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed : 0;
  };

  function normalizeOrder(row) {
    const items = Array.isArray(row.items) ? row.items.map(item => ({
      id: item.id, qty: Number(item.qty) || 1,
      name: typeof GKItemName !== "undefined" ? GKItemName.labeledName(item.name, item.category || item.categoryName || GKItemName.categoryFromId(item.id)) : (item.name || ""),
      category: item.category || item.categoryName || (typeof GKItemName !== "undefined" ? GKItemName.categoryFromId(item.id) : ""),
      size: item.size || "",
      extras: item.extras || [], unit: item.unit ?? Number(item.price || 0), price: Number(item.price || 0)
    })) : [];
    return {
      id: row.id, seq: row.seq, status: row.status, mode: row.mode, items,
      tableNo: Number(row.table_no) || 0, note: row.note || "", total: Number(row.total) || 0,
      subtotal: Number(row.subtotal) || Number(row.total) || 0, fee: Number(row.fee) || 0,
      customer: { name: row.customer_name || "", phone: row.customer_phone || "" },
      payment: row.payment === "cash" ? "Espèces" : "Carte", paymentType: row.payment === "cash" ? "cash" : "card",
      cashierName: [...(Array.isArray(row.history) ? row.history : [])].reverse().find(entry => entry.cashier)?.cashier || "",
      deliveryCode: row.delivery_code || "",
      address: { street: "", zone: "" },
      createdAt: numberTime(row.created_at), acceptedAt: numberTime(row.accepted_at),
      promisedAt: numberTime(row.promised_at), deliveredAt: numberTime(row.delivered_at),
      cashSettled: row.cash_settled === true || row.cash_settled === 1 || row.cash_settled === "1",
      prepMin: Number(row.prep_minutes) || 20, history: Array.isArray(row.history) ? row.history : []
    };
  }

  function showToast(message) {
    toastEl.textContent = message;
    toastEl.hidden = false;
    window.gkMotion?.toastIn(toastEl);
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { toastEl.hidden = true; }, 3200);
  }

  function pendingOrders() {
    return data.orders.filter(order => order.status === "pending");
  }

  function openCalls() {
    return data.calls.filter(call => call.status === "open");
  }

  function beep(kind = "order") {
    if (!state.prefs.sound) return;
    window.GKSound?.unlock();
    window.GKSound?.play(kind);
  }

  function ringAlerts() {
    if (!state.session || state.session.mustChange || !state.prefs.sound) return;
    if (pendingOrders().length) beep("order");
    else if (openCalls().length) beep("call");
  }

  function announce(pendingIds, callIds, rev) {
    if (bootRefresh || !rev || rev === lastAnnouncedRev) return false;
    const freshOrders = pendingIds.filter(id => !knownPending.has(id));
    const freshCalls = callIds.filter(id => !knownCalls.has(id));
    lastAnnouncedRev = rev;
    if (freshOrders.length) {
      beep("order");
      showToast(freshOrders.length === 1 ? "Nouvelle commande sur place." : `${freshOrders.length} nouvelles commandes.`);
      ui.tab = "new";
      return true;
    }
    if (freshCalls.length) {
      beep("call");
      showToast(freshCalls.length === 1 ? "Un client demande un serveur." : `${freshCalls.length} appels serveur.`);
      ui.tab = "calls";
      return true;
    }
    return false;
  }

  function closeSheet() {
    overlay.hidden = true;
    ui.sheet = null;
    ui.draft = null;
    document.body.style.overflow = "";
  }

  function openSheet() {
    overlay.hidden = false;
    document.body.style.overflow = "hidden";
    window.gkMotion?.overlayIn(overlay, sheet);
  }

  function grouped() {
    const today = data.orders.filter(order => isToday(order.createdAt) || ["pending", "preparing", "ready"].includes(order.status));
    return {
      new: today.filter(order => order.status === "pending"),
      prep: today.filter(order => order.status === "preparing"),
      ready: today.filter(order => order.status === "ready"),
      served: today.filter(order => order.status === "delivered" && !order.cashSettled)
    };
  }

  async function refresh() {
    if (!state.session || state.session.mustChange) return;
    if (refreshRunning) {
      refreshQueued = true;
      return;
    }
    refreshRunning = true;
    try {
      const [ordersRes, callsRes, notifRes, menuRes, settingsRes] = await Promise.all([
        api.get("/api/orders?mode=dinein", API_SCOPE),
        api.get("/api/dinein/calls", API_SCOPE),
        api.get("/api/notifications", API_SCOPE),
        data.menu.length ? Promise.resolve(null) : api.get("/api/admin/menu", API_SCOPE),
        api.get("/api/admin/settings", API_SCOPE).catch(() => null)
      ]);
      data.orders = (ordersRes.orders || []).map(normalizeOrder);
      data.calls = (callsRes.calls || []).filter(call => call.status === "open");
      data.notifications = notifRes.notifications || [];
      if (settingsRes?.tableCount) data.tableCount = Math.max(1, Math.min(80, Number(settingsRes.tableCount) || 17));
      if (menuRes) {
        data.categories = [{ id: "all", name: "Tout" }, ...(menuRes.categories || [])];
        const names = new Map(data.categories.map(category => [category.id, category.name]));
        data.menu = (menuRes.items || []).filter(item => item.visible !== false && item.available !== false).map(item => ({
          ...item, categoryName: names.get(item.categoryId) || "", price: Number(item.dinePrice ?? item.price) || 0
        }));
      }
      const pendingIds = pendingOrders().map(order => order.id);
      const callIds = openCalls().map(call => call.id);
      announce(pendingIds, callIds, `${pendingIds.join(",")}|${callIds.join(",")}`);
      knownPending = new Set(pendingIds);
      knownCalls = new Set(callIds);
      bootRefresh = false;
      data.error = "";
      data.loaded = true;
    } catch (error) {
      data.error = error.message || "Connexion impossible.";
    }
    const signature = JSON.stringify([data.orders, data.calls, data.notifications, data.error, ui.tab, ui.sheet, data.tableCount]);
    if (signature !== lastSignature) {
      lastSignature = signature;
      render();
    }
    refreshRunning = false;
    if (refreshQueued) {
      refreshQueued = false;
      void refresh();
    }
  }

  function applySnap(snap) {
    const pendingIds = snap.pendingIds || [];
    const callIds = snap.callIds || [];
    const changed = announce(pendingIds, callIds, snap.rev);
    const boardChanged = (snap.rev || "") !== lastLiveRev;
    lastLiveRev = snap.rev || lastLiveRev;
    const missing = pendingIds.some(id => !data.orders.some(order => order.id === id && order.status === "pending"))
      || callIds.some(id => !data.calls.some(call => call.id === id));
    if (changed || boardChanged || missing || pendingIds.length !== knownPending.size || callIds.length !== knownCalls.size
      || pendingIds.some(id => !knownPending.has(id)) || callIds.some(id => !knownCalls.has(id))) {
      void refresh();
    }
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
          const snap = await api.get(`/api/live/wait?kind=dinein&rev=${encodeURIComponent(rev)}`, API_SCOPE, { signal: abort.signal });
          if (abort.signal.aborted) return;
          rev = applySnap(snap) || rev;
        } catch (error) {
          if (abort.signal.aborted || error?.name === "AbortError") return;
          await new Promise((resolve) => setTimeout(resolve, 500));
        }
      }
    })();
  }

  function renderHeader() {
    if (!state.session) {
      header.innerHTML = `<img class="brand-mark" src="./assets/emblem-reference.png" alt="" width="44" height="44"><div class="header-copy"><small>G&amp;K Food</small><strong>Serveur</strong></div>`;
      return;
    }
    const unread = data.notifications.filter(item => !item.read).length;
    header.innerHTML = `<img class="brand-mark" src="./assets/emblem-reference.png" alt="" width="44" height="44">
      <div class="header-copy"><small>${esc(state.session.label)} · ${esc(state.session.branchName || "G&K Food")}</small><strong>${esc(state.session.name)}</strong></div>
      <div class="header-actions">
        <a class="icon-button" href="https://menu.gkfood.store/print.html" target="_blank" rel="noopener" aria-label="QR tables">QR</a>
        <button class="icon-button ${unread ? "warn" : ""}" type="button" data-action="notifs" aria-label="Notifications">${icon("bell")}${unread ? ` ${unread}` : ""}</button>
        <button class="icon-button ${typeof GKPrinter !== "undefined" && GKPrinter.connected() ? "ok" : ""}" type="button" data-action="printer-connect" aria-label="Imprimante">${icon("printer")}</button>
        <button class="icon-button" type="button" data-action="sound" aria-label="Son">${icon(state.prefs.sound ? "volume" : "volumeOff")}</button>
        <button class="icon-button" type="button" data-action="logout" aria-label="Déconnexion">${icon("logout")}</button>
      </div>`;
  }

  function renderLogin() {
    if (ui.loginEmail) {
      return `<form class="login-card" data-form="login">
      <img class="brand-mark" src="./assets/emblem-reference.png" alt="" width="56" height="56">
      <h1>Service en salle</h1>
      <p>Connexion manager / admin.</p>
      <label>E-mail<input name="email" type="email" autocomplete="username" required></label>
      <label>Mot de passe<input name="password" type="password" autocomplete="current-password" required></label>
      <p class="form-error" data-login-error></p>
      <button class="gold-button" type="submit" style="width:100%;margin-top:12px">Se connecter</button>
      <button class="outline-button" type="button" data-action="login-code" style="width:100%;margin-top:8px">Code serveur</button>
    </form>`;
    }
    return `<form class="login-card" data-form="login">
      <img class="brand-mark" src="./assets/emblem-reference.png" alt="" width="56" height="56">
      <h1>Service en salle</h1>
      <p>Entrez votre code personnel à 4 chiffres.</p>
      <label>Code<input class="pin-input" name="code" type="password" inputmode="numeric" maxlength="4" autocomplete="one-time-code" required></label>
      <p class="form-error" data-login-error></p>
      <button class="gold-button" type="submit" style="width:100%;margin-top:12px">Se connecter</button>
      <button class="outline-button" type="button" data-action="login-email" style="width:100%;margin-top:8px">Connexion e-mail</button>
    </form>`;
  }

  function renderSecret() {
    return `<form class="login-card" data-form="secret">
      ${icon("lock")}
      <h1>Nouveau mot de passe</h1>
      <p>Requis avant d'ouvrir le service.</p>
      <label>Actuel<input name="current" type="password" required></label>
      <label>Nouveau<input name="next" type="password" minlength="8" required></label>
      <p class="form-error" data-secret-error></p>
      <button class="gold-button" type="submit" style="width:100%;margin-top:12px">Enregistrer</button>
    </form>`;
  }

  function ticketCard(order, { sheet = false } = {}) {
    const lines = order.items.map(item => `<li><span><span class="qty">${item.qty}×</span>${esc(item.name)}${item.size ? ` · ${esc(item.size)}` : ""}</span><span>${money(item.price || item.unit * item.qty)}</span></li>`).join("");
    let actions = "";
    if (order.status === "pending") {
      actions = `<div class="btn-row"><button class="danger-button" data-action="refuse" data-id="${esc(order.id)}">${icon("close")}Refuser</button><button class="outline-button" data-action="edit" data-id="${esc(order.id)}">${icon("edit")}Modifier</button></div>
        <div class="btn-row one"><button class="gold-button" data-action="accept" data-id="${esc(order.id)}">${icon("check")}En cuisine</button></div>`;
    } else if (order.status === "preparing") {
      actions = `<div class="btn-row"><button class="outline-button" data-action="edit" data-id="${esc(order.id)}">${icon("edit")}Modifier</button><button class="gold-button" data-action="ready" data-id="${esc(order.id)}">${icon("check")}Prête</button></div>`;
    } else if (order.status === "ready") {
      actions = `<div class="btn-row"><button class="outline-button" data-action="edit" data-id="${esc(order.id)}">${icon("edit")}Modifier</button><button class="gold-button" data-action="serve" data-id="${esc(order.id)}">${icon("utensils")}Servie</button></div>`;
    }
    return `<article class="ticket ${order.status === "pending" ? "is-new" : ""}">
      <div class="ticket-head"><strong>Table ${esc(order.tableNo)}</strong>
        <span class="ticket-head-end">${sheet ? `<span class="ticket-print">
          <button class="icon-button" type="button" data-action="print-original" data-id="${esc(order.id)}" aria-label="Ticket">${icon("printer")}</button>
          <button class="icon-button" type="button" data-action="print-duplicata" data-id="${esc(order.id)}" aria-label="Duplicata">D</button>
        </span>` : ""}<span class="pill ${order.status}">${esc(STATUS_LABELS[order.status] || order.status)}</span></span></div>
      <div class="meta"><span>#${esc(order.seq || order.id)}</span><span>${icon("clock")} ${clock(order.createdAt)}</span>${order.acceptedAt ? `<span>Acceptée ${clock(order.acceptedAt)}</span>` : ""}</div>
      <ul class="lines">${lines}</ul>
      ${order.note ? `<p class="note">${icon("alert")}${esc(order.note)}</p>` : ""}
      ${sheet ? "" : `<div class="btn-row"><button class="outline-button" data-action="print-original" data-id="${esc(order.id)}">${icon("printer")}Ticket</button><button class="outline-button" data-action="print-duplicata" data-id="${esc(order.id)}">Duplicata</button></div>`}
      <div class="ticket-total"><span>Total</span><span>${money(order.total)}</span></div>
      ${actions}
    </article>`;
  }

  function openOrders(n) {
    return data.orders.filter(order => order.tableNo === n && (
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
    if (served) return { kind: "served", label: "Servie", order: served };
    return { kind: "free", label: "Libre", order: null };
  }

  function tableNumbers() {
    return window.GKTables?.list(state.session?.branchId || "gk-food", data.tableCount) || [];
  }

  function renderFloor() {
    const rows = window.GKTables?.groups(state.session?.branchId || "gk-food", data.tableCount) || [];
    const numbers = tableNumbers();
    const seats = rows.map(row => `<div class="floor-row n${row.length}">${row.map(n => {
      const seat = tableState(n);
      const total = tableTotal(n);
      const sub = total ? money(total) : seat.label;
      return `<button class="seat ${seat.kind}" type="button" data-table="${n}" aria-label="Table ${n}, ${seat.label}">
        <b>${n}</b><small>${esc(sub)}</small>
      </button>`;
    }).join("")}</div>`).join("");
    const busy = numbers.filter(n => tableState(n).kind !== "free").length;
    return `<div class="floor-legend"><span class="dot call"></span>Appel<span class="dot pending"></span>Nouvelle<span class="dot prep"></span>En cours<span class="dot ready"></span>Prête<span class="dot served"></span>Servie<span class="dot free"></span>Libre · ${busy} occupée${busy > 1 ? "s" : ""}</div>
      <div class="floor">${seats}</div>`;
  }

  function renderBoard() {
    const groups = grouped();
    const busy = tableNumbers().filter(n => tableState(n).kind !== "free").length;
    const counts = { salle: busy, new: groups.new.length, prep: groups.prep.length, ready: groups.ready.length, calls: data.calls.length, served: groups.served.length };
    const tabs = `<div class="tabs">${TABS.map(tab => `<button class="tab ${ui.tab === tab.key ? "active" : ""}" data-tab="${tab.key}">${tab.label}<b>${counts[tab.key]}</b></button>`).join("")}</div>`;
    if (ui.tab === "salle") {
      return `${data.error ? `<p class="form-error">${esc(data.error)}</p>` : ""}${tabs}${renderFloor()}`;
    }
    if (ui.tab === "calls") {
      const cards = data.calls.map(call => `<article class="ticket call-card">
        <div class="ticket-head"><strong>Table ${esc(call.table)}</strong><span class="pill pending">Appel</span></div>
        <p class="note">${icon("bell")} Un client demande un serveur.</p>
        <div class="btn-row one"><button class="gold-button" data-action="ack" data-id="${esc(call.id)}">${icon("check")}J'y vais</button></div>
      </article>`).join("");
      return `${tabs}${cards || `<p class="empty-state">Aucun appel en attente.</p>`}`;
    }
    const list = groups[ui.tab] || [];
    return `${data.error ? `<p class="form-error">${esc(data.error)}</p>` : ""}${tabs}${list.length ? list.map(ticketCard).join("") : `<p class="empty-state">Rien dans cette liste.</p>`}`;
  }

  function renderRefuseSheet(order) {
    sheet.innerHTML = `<div class="sheet-scroll">
      <h2 id="sheet-title">Refuser table ${esc(order.tableNo)}</h2>
      <p class="meta">Commande #${esc(order.seq)}</p>
      <div class="reason-list">${REFUSE_REASONS.map(reason => `<button type="button" data-reason="${esc(reason)}">${esc(reason)}</button>`).join("")}</div>
    </div>
    <div class="sheet-actions one"><button class="outline-button" data-action="close-sheet">Annuler</button></div>`;
  }

  function renderEditSheet() {
    const draft = ui.draft;
    if (!draft) return;
    const creating = !draft.id;
    const order = draft.id ? data.orders.find(item => item.id === draft.id) : null;
    const table = draft.table || order?.tableNo || ui.table || "";
    const products = ui.category === "all" ? data.menu : data.menu.filter(item => item.categoryId === ui.category);
    const total = draft.items.reduce((sum, item) => sum + (Number(item.price) || Number(item.unit) || 0) * item.qty, 0);
    const lines = draft.items.map((item, index) => `<div class="draft-line">
      <div><strong>${esc(item.name)}</strong><div class="meta">${item.size ? esc(item.size) : ""} ${money((item.price || item.unit) * item.qty)}</div></div>
      <div class="qty-control">
        <button type="button" data-qty="${index}" data-delta="-1">${icon("minus")}</button>
        <span>${item.qty}</span>
        <button type="button" data-qty="${index}" data-delta="1">${icon("plus")}</button>
      </div>
    </div>`).join("");
    sheet.innerHTML = `<div class="sheet-scroll">
      <h2 id="sheet-title">${creating ? "Commander" : "Modifier"} table ${esc(table)}</h2>
      <p class="meta">${creating ? "Sans scan QR · envoyé en cuisine" : `Commande #${esc(order?.seq || "")}`}${draft.items.length ? ` · ${money(total)}` : ""}</p>
      ${lines || `<p class="empty-state">Ajoutez des plats.</p>`}
      <label class="meta" for="edit-note">Note cuisine</label>
      <textarea class="note-field" id="edit-note">${esc(draft.note)}</textarea>
      <div class="category-strip">${data.categories.map(category => `<button class="category-chip ${ui.category === category.id ? "active" : ""}" data-cat="${esc(category.id)}">${esc(category.name)}</button>`).join("")}</div>
      ${products.map(product => {
        const name = typeof GKItemName !== "undefined" ? GKItemName.labeledName(product.name, product.categoryName) : product.name;
        const size = product.sizes?.[0];
        const price = Number(product.price) + Number(size?.delta || 0);
        return `<div class="add-row"><span>${esc(name)}${size?.name ? ` · ${esc(size.name)}` : ""} · ${money(price)}</span><button class="outline-button" data-add="${esc(product.id)}" style="min-height:36px;padding:0 10px">Ajouter</button></div>`;
      }).join("") || `<p class="empty-state">Menu indisponible.</p>`}
    </div>
    <div class="sheet-actions">
      <button class="outline-button" data-action="close-sheet">Fermer</button>
      <button class="gold-button" data-action="save-edit" ${ui.busy || !draft.items.length ? "disabled" : ""}>${creating ? "Envoyer en cuisine" : "Enregistrer"}</button>
    </div>`;
  }

  function openCompose(n, order = null) {
    ui.sheet = "edit";
    ui.table = n;
    ui.category = "all";
    ui.draft = order
      ? { id: order.id, table: n, note: order.note || "", items: order.items.map(item => ({ ...item })) }
      : { id: null, table: n, note: "", items: [] };
    renderEditSheet();
    openSheet();
  }

  function renderTableSheet(n) {
    const orders = openOrders(n);
    const total = tableTotal(n);
    const cooking = orders.some(order => ["pending", "preparing", "ready"].includes(order.status));
    const canSettle = !cooking && orders.some(order => order.status === "delivered");
    sheet.innerHTML = `<div class="sheet-scroll">
      <div class="sheet-title-row">
        <div>
          <h2 id="sheet-title">Table ${esc(n)}</h2>
          <p class="meta">${orders.length} commande${orders.length > 1 ? "s" : ""} · ${money(total)}</p>
        </div>
        <button class="gold-button" data-action="compose" data-table="${esc(n)}">${icon("plus")} Commander</button>
      </div>
      ${orders.length ? orders.map(order => ticketCard(order, { sheet: true })).join("") : `<p class="empty-state">Table libre.</p>`}
    </div>
    <div class="sheet-actions ${canSettle ? "" : "one"}">
      <button class="outline-button" data-action="close-sheet">Fermer</button>
      ${canSettle ? `<button class="gold-button" data-action="settle-table" data-table="${esc(n)}">${icon("check")}Encaisser · ${money(total)}</button>` : ""}
    </div>`;
  }

  function renderNotifs() {
    const rows = data.notifications.slice(0, 20).map(item => `<article class="ticket"><strong>${esc(item.title)}</strong><p class="meta">${esc(item.text || "")} · ${clock(item.at)}</p></article>`).join("");
    sheet.innerHTML = `<div class="sheet-scroll"><h2 id="sheet-title">Notifications</h2>${rows || `<p class="empty-state">Aucune notification.</p>`}</div>
      <div class="sheet-actions one"><button class="gold-button" data-action="close-sheet">Fermer</button></div>`;
  }

  async function printWaiterTicket(order, kind) {
    if (!order || typeof GKPrinter === "undefined") return showToast("Imprimante indisponible.");
    const paper = state.prefs.paper || 80;
    const payload = { ...order, cashierName: order.cashierName || state.session?.name || "" };
    try { await ensureTicketArt(); } catch { /* logo optional */ }
    if (!GKPrinter.connected()) return showToast("Connectez l'imprimante (icône imprimante).");
    try {
      await GKPrinter.write(buildTicket(payload, { paper, kind }));
      showToast(`${kind === "duplicata" ? "Duplicata" : "Ticket"} #${order.seq || order.id} envoyé.`);
    } catch (error) {
      showToast(`Impression : ${error.message || "échec"}`);
    }
  }

  function render() {
    if (ui.holdRender) return;
    renderHeader();
    if (!state.session) main.innerHTML = renderLogin();
    else if (state.session.mustChange) main.innerHTML = renderSecret();
    else main.innerHTML = renderBoard();
    if (ui.sheet === "edit" && ui.draft) renderEditSheet();
    if (ui.sheet === "table" && ui.table) renderTableSheet(ui.table);
    window.gkMotion?.enterView(main, ui.tab);
  }

  async function run(action, okMessage) {
    if (ui.busy) return;
    ui.busy = true;
    try {
      await action();
      if (okMessage) showToast(okMessage);
      await refresh();
    } catch (error) {
      showToast(error.message || "Action impossible.");
    } finally {
      ui.busy = false;
      render();
    }
  }

  document.addEventListener("submit", event => {
    const form = event.target;
    if (form.dataset.form === "login") {
      event.preventDefault();
      const errorEl = form.querySelector("[data-login-error]");
      const button = form.querySelector("button[type=submit]");
      button.disabled = true;
      errorEl.textContent = "";
      const body = Object.fromEntries(new FormData(form).entries());
      window.GKSound?.unlock();
      const code = String(body.code || "").replace(/\D/g, "");
      api.post("/api/auth/staff", code ? { code } : { email: body.email, password: body.password }).then(result => {
        if (!WAITER_ROLES.includes(result.user?.role)) throw new Error("Cette application est réservée au service en salle.");
        setSession(result);
        render();
        if (!state.session.mustChange) {
          void refresh();
          startWatch();
        }
      }).catch(error => {
        errorEl.textContent = error.message || "Connexion impossible.";
        button.disabled = false;
      });
    }
    if (form.dataset.form === "secret") {
      event.preventDefault();
      const errorEl = form.querySelector("[data-secret-error]");
      const body = Object.fromEntries(new FormData(form).entries());
      api.post("/api/auth/change-secret", { current: body.current, next: body.next }, API_SCOPE).then(result => {
        setSession(result);
        render();
        if (!state.session.mustChange) {
          void refresh();
          startWatch();
        }
      }).catch(error => { errorEl.textContent = error.message || "Impossible de changer le mot de passe."; });
    }
  });

  document.addEventListener("click", event => {
    const el = event.target.closest("[data-action],[data-tab],[data-reason],[data-qty],[data-add],[data-cat],[data-table]");
    if (!el) {
      if (event.target === overlay) closeSheet();
      return;
    }
    if (el.dataset.tab) { ui.tab = el.dataset.tab; return render(); }
    if (el.dataset.table && !el.dataset.action) {
      const n = Number(el.dataset.table);
      const seat = tableState(n);
      const openTable = () => {
        ui.sheet = "table";
        ui.table = n;
        renderTableSheet(n);
        openSheet();
      };
      if (seat.kind === "call" && seat.call) {
        return run(async () => {
          await api.post(`/api/dinein/calls/${encodeURIComponent(seat.call.id)}/ack`, {}, API_SCOPE);
          openTable();
        }, `Table ${n} : j'y vais.`);
      }
      if (seat.kind === "free") {
        openCompose(n);
        return;
      }
      openTable();
      return;
    }
    if (el.dataset.action === "logout") { stopWatch(); logout(); closeSheet(); data.loaded = false; return render(); }
    if (el.dataset.action === "login-email") { ui.loginEmail = true; return render(); }
    if (el.dataset.action === "login-code") { ui.loginEmail = false; return render(); }
    if (el.dataset.action === "printer-connect") {
      if (typeof GKPrinter === "undefined" || !GKPrinter.supported()) {
        showToast("Bluetooth indisponible. Utilisez Chrome Android ou le port série sur PC.");
        return;
      }
      ui.holdRender = true;
      const runConnect = async () => {
        try {
          const name = GKPrinter.bleSupported()
            ? await GKPrinter.connect()
            : await GKPrinter.connectSerial(9600);
          state.prefs.lastPrinter = name;
          save();
          showToast(`Imprimante : ${name}`);
        } catch (error) {
          if (error?.name === "NotFoundError") showToast("Aucune imprimante choisie.");
          else showToast(error.message || "Bluetooth indisponible.");
        } finally {
          ui.holdRender = false;
          render();
        }
      };
      void runConnect();
      return;
    }
    if (el.dataset.action === "print-original" || el.dataset.action === "print-duplicata") {
      const ticket = data.orders.find(item => item.id === el.dataset.id);
      void printWaiterTicket(ticket, el.dataset.action === "print-duplicata" ? "duplicata" : "original");
      return;
    }
    if (el.dataset.action === "sound") {
      state.prefs.sound = !state.prefs.sound;
      save();
      window.GKSound?.unlock();
      if (state.prefs.sound) ringAlerts();
      renderHeader();
      return;
    }
    if (el.dataset.action === "close-sheet") { closeSheet(); return render(); }
    if (el.dataset.action === "notifs") {
      ui.sheet = "notifs";
      renderNotifs();
      openSheet();
      api.post("/api/notifications/read", {}, API_SCOPE).then(() => { data.notifications.forEach(item => { item.read = true; }); }).catch(() => {});
      return;
    }
    const order = data.orders.find(item => item.id === el.dataset.id);
    if (el.dataset.action === "accept" && order) return run(() => api.post(`/api/orders/${encodeURIComponent(order.id)}/accept`, { prepMinutes: order.prepMin || 20 }, API_SCOPE), `Table ${order.tableNo} acceptée.`);
    if (el.dataset.action === "ready" && order) return run(() => api.post(`/api/orders/${encodeURIComponent(order.id)}/ready`, {}, API_SCOPE), "Commande prête.");
    if (el.dataset.action === "serve" && order) return run(() => api.post(`/api/orders/${encodeURIComponent(order.id)}/handover`, {}, API_SCOPE), "Commande servie.");
    if (el.dataset.action === "settle-table") {
      const table = Number(el.dataset.table);
      if (!table) return;
      return run(async () => {
        const result = await api.post(`/api/dinein/tables/${encodeURIComponent(table)}/settle`, {}, API_SCOPE);
        closeSheet();
        showToast(`Table ${table} encaissée · ${money(result.total || tableTotal(table))}`);
      });
    }
    if (el.dataset.action === "ack") return run(() => api.post(`/api/dinein/calls/${encodeURIComponent(el.dataset.id)}/ack`, {}, API_SCOPE), "Appel pris en charge.");
    if (el.dataset.action === "refuse" && order) {
      ui.sheet = "refuse";
      ui.draft = { id: order.id };
      renderRefuseSheet(order);
      return openSheet();
    }
    if (el.dataset.reason && ui.draft) {
      const current = data.orders.find(item => item.id === ui.draft.id);
      closeSheet();
      return run(() => api.post(`/api/orders/${encodeURIComponent(ui.draft.id)}/refuse`, { reason: el.dataset.reason }, API_SCOPE), current ? `Table ${current.tableNo} refusée.` : "Commande refusée.");
    }
    if (el.dataset.action === "compose") {
      openCompose(Number(el.dataset.table));
      return;
    }
    if (el.dataset.action === "edit" && order) {
      openCompose(order.tableNo, order);
      return;
    }
    if (el.dataset.cat) { ui.category = el.dataset.cat; return renderEditSheet(); }
    if (el.dataset.qty) {
      if (!ui.draft) return;
      const index = Number(el.dataset.qty);
      const line = ui.draft.items[index];
      line.qty = Math.max(0, line.qty + Number(el.dataset.delta));
      if (line.qty === 0) ui.draft.items.splice(index, 1);
      return renderEditSheet();
    }
    if (el.dataset.add) {
      if (!ui.draft) return;
      const product = data.menu.find(item => item.id === el.dataset.add);
      if (!product) return;
      const size = product.sizes?.[0]?.name || "";
      const unit = Number(product.price) + Number(product.sizes?.[0]?.delta || 0);
      const existing = ui.draft.items.find(item => item.id === product.id && item.size === size);
      if (existing) existing.qty += 1;
      else ui.draft.items.push({
        id: product.id,
        name: typeof GKItemName !== "undefined" ? GKItemName.labeledName(product.name, product.categoryName) : product.name,
        category: product.categoryName || "",
        qty: 1, size, extras: [], unit, price: unit
      });
      return renderEditSheet();
    }
    if (el.dataset.action === "save-edit" && ui.draft) {
      if (!ui.draft.items.length) return showToast("Ajoutez au moins un plat.");
      const payload = { note: ui.draft.note, items: ui.draft.items.map(item => ({ id: item.id, qty: item.qty, size: item.size || "", extras: item.extras || [] })) };
      const table = ui.draft.table;
      const id = ui.draft.id;
      return run(async () => {
        if (id) await api.post(`/api/orders/${encodeURIComponent(id)}/revise`, payload, API_SCOPE);
        else await api.post("/api/pos/orders", { mode: "dinein", table, items: payload.items, note: payload.note, accept: true }, API_SCOPE);
        closeSheet();
      }, id ? "Commande mise à jour." : `Table ${table} envoyée en cuisine.`);
    }
  });

  sheet.addEventListener("input", event => {
    if (event.target.id === "edit-note" && ui.draft) ui.draft.note = event.target.value;
  });

  document.addEventListener("gk-api-session-expired", event => {
    if (event.detail?.scope !== API_SCOPE) return;
    stopWatch();
    logout();
    showToast("Session expirée.");
    render();
  });

  try { GKPrinter.onChange(() => { if (!ui.holdRender) renderHeader(); }); } catch { /* optional */ }
  try { GKPrinter.reconnect(state.prefs.lastPrinter); } catch { /* ignore */ }
  render();
  if (state.session && !state.session.mustChange) {
    void refresh();
    startWatch();
  }
  setInterval(() => { if (state.session && !state.session.mustChange && !document.hidden) void refresh(); }, 15000);
  setInterval(ringAlerts, 2200);
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden && state.session && !state.session.mustChange) startWatch();
  });
  if ("serviceWorker" in navigator && location.protocol !== "file:") {
    navigator.serviceWorker.register("./sw.js")
      .then(() => { if (state.session && !state.session.mustChange) enablePhonePush(true); })
      .catch(() => {});
  }
})();
