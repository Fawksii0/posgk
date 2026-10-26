(() => {
  "use strict";

  const api = window.GKApi;
  const main = document.querySelector("#app-main");
  const header = document.querySelector("#app-header");
  const overlay = document.querySelector("#overlay");
  const sheet = document.querySelector("#sheet");
  const toastEl = document.querySelector("#toast");
  const TABS = [
    { key: "new", label: "Nouvelles" },
    { key: "prep", label: "En cours" },
    { key: "ready", label: "Prêtes" },
    { key: "calls", label: "Appels" },
    { key: "served", label: "Servies" }
  ];
  const ui = { tab: "new", sheet: null, draft: null, category: "all", busy: false };
  const data = {
    orders: [], calls: [], notifications: [], menu: [], categories: [],
    loading: false, loaded: false, error: ""
  };
  let knownPending = new Set();
  let knownCalls = new Set();
  let toastTimer = 0;
  let lastSignature = "";
  let bootRefresh = true;
  let refreshRunning = false;
  let refreshQueued = false;
  let lastAnnouncedRev = "";
  let watchAbort = null;

  const numberTime = value => {
    const numeric = Number(value);
    if (Number.isFinite(numeric) && numeric > 0) return numeric;
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed : 0;
  };

  function normalizeOrder(row) {
    const items = Array.isArray(row.items) ? row.items.map(item => ({
      id: item.id, qty: Number(item.qty) || 1, name: item.name || "", size: item.size || "",
      extras: item.extras || [], unit: item.unit ?? Number(item.price || 0), price: Number(item.price || 0)
    })) : [];
    return {
      id: row.id, seq: row.seq, status: row.status, mode: row.mode, items,
      tableNo: Number(row.table_no) || 0, note: row.note || "", total: Number(row.total) || 0,
      createdAt: numberTime(row.created_at), acceptedAt: numberTime(row.accepted_at),
      promisedAt: numberTime(row.promised_at), deliveredAt: numberTime(row.delivered_at),
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
      served: today.filter(order => order.status === "delivered")
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
      const [ordersRes, callsRes, notifRes, menuRes] = await Promise.all([
        api.get("/api/orders?mode=dinein", API_SCOPE),
        api.get("/api/dinein/calls", API_SCOPE),
        api.get("/api/notifications", API_SCOPE),
        data.menu.length ? Promise.resolve(null) : api.get("/api/admin/menu", API_SCOPE)
      ]);
      data.orders = (ordersRes.orders || []).map(normalizeOrder);
      data.calls = (callsRes.calls || []).filter(call => call.status === "open");
      data.notifications = notifRes.notifications || [];
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
    const signature = JSON.stringify([data.orders, data.calls, data.notifications, data.error, ui.tab, ui.sheet]);
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
    const missing = pendingIds.some(id => !data.orders.some(order => order.id === id && order.status === "pending"))
      || callIds.some(id => !data.calls.some(call => call.id === id));
    if (changed || missing || pendingIds.length !== knownPending.size || callIds.length !== knownCalls.size
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
        <button class="icon-button ${unread ? "warn" : ""}" type="button" data-action="notifs" aria-label="Notifications">${icon("bell")}${unread ? ` ${unread}` : ""}</button>
        <button class="icon-button" type="button" data-action="sound" aria-label="Son">${icon(state.prefs.sound ? "volume" : "volumeOff")}</button>
        <button class="icon-button" type="button" data-action="logout" aria-label="Déconnexion">${icon("logout")}</button>
      </div>`;
  }

  function renderLogin() {
    return `<form class="login-card" data-form="login">
      <img class="brand-mark" src="./assets/emblem-reference.png" alt="" width="56" height="56">
      <h1>Service en salle</h1>
      <p>Les commandes sur place arrivent ici, pas en cuisine.</p>
      <label>E-mail<input name="email" type="email" autocomplete="username" required></label>
      <label>Mot de passe<input name="password" type="password" autocomplete="current-password" required></label>
      <p class="form-error" data-login-error></p>
      <button class="gold-button" type="submit" style="width:100%;margin-top:12px">Se connecter</button>
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

  function ticketCard(order) {
    const lines = order.items.map(item => `<li><span><span class="qty">${item.qty}×</span>${esc(item.name)}${item.size ? ` · ${esc(item.size)}` : ""}</span><span>${money(item.price || item.unit * item.qty)}</span></li>`).join("");
    let actions = "";
    if (order.status === "pending") {
      actions = `<div class="btn-row"><button class="danger-button" data-action="refuse" data-id="${esc(order.id)}">${icon("close")}Refuser</button><button class="gold-button" data-action="accept" data-id="${esc(order.id)}">${icon("check")}Accepter</button></div>
        <div class="btn-row one"><button class="outline-button" data-action="edit" data-id="${esc(order.id)}">${icon("edit")}Modifier</button></div>`;
    } else if (order.status === "preparing" || order.status === "ready") {
      actions = `<div class="btn-row"><button class="outline-button" data-action="edit" data-id="${esc(order.id)}">${icon("edit")}Modifier</button>${order.status === "preparing"
        ? `<button class="gold-button" data-action="ready" data-id="${esc(order.id)}">${icon("check")}Prête</button>`
        : `<button class="gold-button" data-action="serve" data-id="${esc(order.id)}">${icon("utensils")}Servie</button>`}</div>`;
    }
    return `<article class="ticket ${order.status === "pending" ? "is-new" : ""}">
      <div class="ticket-head"><strong>Table ${esc(order.tableNo)}</strong><span class="pill ${order.status}">${esc(STATUS_LABELS[order.status] || order.status)}</span></div>
      <div class="meta"><span>#${esc(order.seq || order.id)}</span><span>${icon("clock")} ${clock(order.createdAt)}</span>${order.acceptedAt ? `<span>Acceptée ${clock(order.acceptedAt)}</span>` : ""}</div>
      <ul class="lines">${lines}</ul>
      ${order.note ? `<p class="note">${icon("alert")}${esc(order.note)}</p>` : ""}
      <div class="ticket-total"><span>Total</span><span>${money(order.total)}</span></div>
      ${actions}
    </article>`;
  }

  function renderBoard() {
    const groups = grouped();
    const counts = { new: groups.new.length, prep: groups.prep.length, ready: groups.ready.length, calls: data.calls.length, served: groups.served.length };
    const tabs = `<div class="tabs">${TABS.map(tab => `<button class="tab ${ui.tab === tab.key ? "active" : ""}" data-tab="${tab.key}">${tab.label}<b>${counts[tab.key]}</b></button>`).join("")}</div>`;
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
    const order = data.orders.find(item => item.id === draft.id);
    const products = ui.category === "all" ? data.menu : data.menu.filter(item => item.categoryId === ui.category);
    const lines = draft.items.map((item, index) => `<div class="draft-line">
      <div><strong>${esc(item.name)}</strong><div class="meta">${item.size ? esc(item.size) : ""} ${money(item.price || item.unit * item.qty)}</div></div>
      <div class="qty-control">
        <button type="button" data-qty="${index}" data-delta="-1">${icon("minus")}</button>
        <span>${item.qty}</span>
        <button type="button" data-qty="${index}" data-delta="1">${icon("plus")}</button>
      </div>
    </div>`).join("");
    sheet.innerHTML = `<div class="sheet-scroll">
      <h2 id="sheet-title">Modifier table ${esc(order?.tableNo || "")}</h2>
      ${lines || `<p class="empty-state">Aucun plat.</p>`}
      <label class="meta" for="edit-note">Note</label>
      <textarea class="note-field" id="edit-note">${esc(draft.note)}</textarea>
      <div class="category-strip">${data.categories.map(category => `<button class="category-chip ${ui.category === category.id ? "active" : ""}" data-cat="${esc(category.id)}">${esc(category.name)}</button>`).join("")}</div>
      ${products.slice(0, 40).map(product => `<div class="add-row"><span>${esc(product.name)} · ${money(product.price)}</span><button class="outline-button" data-add="${esc(product.id)}" style="min-height:36px;padding:0 10px">Ajouter</button></div>`).join("")}
    </div>
    <div class="sheet-actions">
      <button class="outline-button" data-action="close-sheet">Fermer</button>
      <button class="gold-button" data-action="save-edit" ${ui.busy ? "disabled" : ""}>Enregistrer</button>
    </div>`;
  }

  function renderNotifs() {
    const rows = data.notifications.slice(0, 20).map(item => `<article class="ticket"><strong>${esc(item.title)}</strong><p class="meta">${esc(item.text || "")} · ${clock(item.at)}</p></article>`).join("");
    sheet.innerHTML = `<div class="sheet-scroll"><h2 id="sheet-title">Notifications</h2>${rows || `<p class="empty-state">Aucune notification.</p>`}</div>
      <div class="sheet-actions one"><button class="gold-button" data-action="close-sheet">Fermer</button></div>`;
  }

  function render() {
    renderHeader();
    if (!state.session) main.innerHTML = renderLogin();
    else if (state.session.mustChange) main.innerHTML = renderSecret();
    else main.innerHTML = renderBoard();
    if (ui.sheet === "edit" && ui.draft) renderEditSheet();
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
      api.post("/api/auth/staff", { email: body.email, password: body.password }).then(result => {
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
    const el = event.target.closest("[data-action],[data-tab],[data-reason],[data-qty],[data-add],[data-cat]");
    if (!el) {
      if (event.target === overlay) closeSheet();
      return;
    }
    if (el.dataset.tab) { ui.tab = el.dataset.tab; return render(); }
    if (el.dataset.action === "logout") { stopWatch(); logout(); closeSheet(); data.loaded = false; return render(); }
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
    if (el.dataset.action === "edit" && order) {
      ui.sheet = "edit";
      ui.draft = { id: order.id, note: order.note, items: order.items.map(item => ({ ...item })) };
      renderEditSheet();
      return openSheet();
    }
    if (el.dataset.cat) { ui.category = el.dataset.cat; return renderEditSheet(); }
    if (el.dataset.qty) {
      const index = Number(el.dataset.qty);
      const line = ui.draft.items[index];
      line.qty = Math.max(0, line.qty + Number(el.dataset.delta));
      if (line.qty === 0) ui.draft.items.splice(index, 1);
      return renderEditSheet();
    }
    if (el.dataset.add) {
      const product = data.menu.find(item => item.id === el.dataset.add);
      if (!product) return;
      const existing = ui.draft.items.find(item => item.id === product.id && !item.size);
      if (existing) existing.qty += 1;
      else ui.draft.items.push({ id: product.id, name: product.name, qty: 1, size: "", extras: [], unit: product.price, price: product.price });
      return renderEditSheet();
    }
    if (el.dataset.action === "save-edit" && ui.draft) {
      if (!ui.draft.items.length) return showToast("Ajoutez au moins un plat.");
      const payload = { note: ui.draft.note, items: ui.draft.items.map(item => ({ id: item.id, qty: item.qty, size: item.size || "", extras: item.extras || [] })) };
      const id = ui.draft.id;
      return run(async () => {
        await api.post(`/api/orders/${encodeURIComponent(id)}/revise`, payload, API_SCOPE);
        closeSheet();
      }, "Commande mise à jour.");
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
  if ("serviceWorker" in navigator && location.protocol !== "file:") navigator.serviceWorker.register("./sw.js").catch(() => {});
})();
