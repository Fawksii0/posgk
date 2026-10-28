/* G&K Admin — views and event handling. */
(() => {
  "use strict";

  const $ = (sel, root = document) => root.querySelector(sel);
  const ESC = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
  const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ESC[c]);
  const S = () => Store.get();

  const nf = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 2 });
  const money = (n) => `${nf.format(Math.round(n * 100) / 100)} MAD`;
  const timeFmt = new Intl.DateTimeFormat("fr-FR", { hour: "2-digit", minute: "2-digit" });
  const dayFmt = new Intl.DateTimeFormat("fr-FR", { day: "2-digit", month: "short" });
  const wdFmt = new Intl.DateTimeFormat("fr-FR", { weekday: "short" });
  const fmtTime = (ts) => timeFmt.format(ts);
  const isToday = (ts) => Store.dayStart(ts) === Store.dayStart(Date.now());
  const fmtDT = (ts) => `${isToday(ts) ? "Auj." : dayFmt.format(ts)} ${fmtTime(ts)}`;
  const ago = (ts) => {
    const m = Math.max(0, Math.round((Date.now() - ts) / 60000));
    if (m < 1) return "à l'instant";
    if (m < 60) return `il y a ${m} min`;
    if (m < 1440) return `il y a ${Math.floor(m / 60)} h`;
    return `il y a ${Math.floor(m / 1440)} j`;
  };
  const initials = (name) => name.split(/\s+/).slice(0, 2).map((w) => w[0] || "").join("").toUpperCase();
  const roleLabel = (id) => (ROLES.find((r) => r.id === id) || { label: id }).label;
  const TONE_HEX = { gold: "#e3a81f", blue: "#3b6fd1", orange: "#d9741a", violet: "#7a58c9", teal: "#1b8f93", green: "#2f8f5b", red: "#c8412f" };
  const statusPill = (id) => { const s = ORDER_STATUSES.find((x) => x.id === id); return `<span class="pill ${s.tone}">${esc(s.label)}</span>`; };
  const roleBadge = (r) => `<span class="role-badge ${esc(r)}">${esc(roleLabel(r))}</span>`;
  const todayISO = () => new Date().toISOString().slice(0, 10);

  const ROUTES = {
    dashboard: { title: "Aujourd'hui", icon: "grid", perm: "stats" },
    commandes: { title: "Commandes", icon: "receipt" },
    factures: { title: "Factures", icon: "invoice", perm: "invoices" },
    menu: { title: "Menu", icon: "utensils" },
    livreurs: { title: "Livreurs", icon: "bike", perm: "couriers" },
    carte: { title: "Carte live", icon: "map", perm: "couriers" },
    clients: { title: "Clients", icon: "users", perm: "clients" },
    zones: { title: "Zones de livraison", icon: "pin" },
    promotions: { title: "Promotions", icon: "tag", perm: "promos" },
    activite: { title: "Activité", icon: "activity", perm: "audit" },
    utilisateurs: { title: "Utilisateurs", icon: "shield", perm: "users" },
    reglages: { title: "Réglages", icon: "gear" }
  };
  const NAV_GROUPS = [
    { label: "Exploitation", routes: ["dashboard", "commandes", "factures", "menu", "livreurs", "carte", "clients"] },
    { label: "Configuration", routes: ["zones", "promotions", "activite"] },
    { label: "Administration", routes: ["utilisateurs", "reglages"] }
  ];

  const ui = {
    route: "dashboard", soft: false, bell: false, user: false, drawer: null, catEdit: null, returnFocus: null, holdRender: false,
    orders: { q: "", status: "all", mode: "all", range: "all", page: 1 },
    invoices: { q: "", range: "month", payment: "all", page: 1 },
    menu: { q: "", cat: "all", view: "grid" },
    couriers: { q: "" },
    customers: { q: "", blocked: "all", page: 1 },
    activity: { user: "all" }
  };
  const PAGE_SIZE = 10;
  let ownerLogin = new URLSearchParams(location.search).has("owner") || location.hash.replace(/^#\/?/, "").split("/")[0] === "owner";
  let drawerKey = null;
  let pages = {};

  /* ---------- Generic helpers ---------- */
  const emptyState = (iconName, title, text = "") => `<div class="empty">${icon(iconName)}<b>${esc(title)}</b>${text ? `<span>${esc(text)}</span>` : ""}</div>`;
  const switchHTML = (checked, attrs, label) => `<label class="switch"><input type="checkbox" ${checked ? "checked" : ""} ${attrs} aria-label="${esc(label)}"><span></span></label>`;
  const field = (name, label, control, hint = "") => `<div class="field" data-field="${name}"><label for="f-${name}">${esc(label)}</label>${control}${hint ? `<span class="hint">${hint}</span>` : ""}</div>`;
  const input = (name, value, type = "text", extra = "") => `<input id="f-${name}" name="${name}" type="${type}" value="${esc(value)}" ${extra}>`;
  const num = (v) => { const s = String(v ?? "").trim().replace(",", "."); return s === "" ? NaN : Number(s); };

  function paginate(list, ns) {
    const pages = Math.max(1, Math.ceil(list.length / PAGE_SIZE));
    const page = Math.min(ui[ns].page, pages);
    ui[ns].page = page;
    return { slice: list.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE), page, pages, total: list.length };
  }
  const pagerHTML = (ns, p) => p.pages <= 1 ? `<div class="pager"><span>${p.total} résultat(s)</span></div>` : `<div class="pager"><span>${p.total} résultat(s) · page ${p.page}/${p.pages}</span><span class="head-actions"><button class="btn btn-sm" data-action="page" data-ns="${ns}" data-dir="-1" ${p.page <= 1 ? "disabled" : ""}>${icon("chevronLeft")} Précédent</button><button class="btn btn-sm" data-action="page" data-ns="${ns}" data-dir="1" ${p.page >= p.pages ? "disabled" : ""}>Suivant ${icon("chevronRight")}</button></span></div>`;

  const searchBox = (ns, key, placeholder, label) => `<label class="search-box"><span aria-hidden="true">${icon("search")}</span><input type="search" data-filter="${ns}.${key}" value="${esc(ui[ns][key])}" placeholder="${esc(placeholder)}" aria-label="${esc(label)}" autocomplete="off"></label>`;

  function toast(text, type = "ok") {
    const el = document.createElement("div");
    el.className = `toast ${type === "error" ? "error" : ""}`;
    el.innerHTML = `${icon(type === "error" ? "alert" : "check")}<span>${esc(text)}</span>`;
    $("#toasts").appendChild(el);
    setTimeout(() => el.remove(), 4200);
  }

  function showErrors(form, errors) {
    form.querySelectorAll(".field-error").forEach((e) => e.remove());
    form.querySelectorAll(".field.invalid").forEach((f) => f.classList.remove("invalid"));
    let first = null;
    Object.entries(errors || {}).forEach(([key, msg]) => {
      const wrap = form.querySelector(`[data-field="${key}"]`);
      if (!wrap) return;
      wrap.classList.add("invalid");
      const err = document.createElement("div");
      err.className = "field-error";
      err.setAttribute("role", "alert");
      err.textContent = msg;
      wrap.appendChild(err);
      const ctl = wrap.querySelector("input, select, textarea");
      if (ctl) { ctl.setAttribute("aria-invalid", "true"); first = first || ctl; }
    });
    if (first) first.focus();
  }

  /* ---------- Modal ---------- */
  let modalReturn = null;
  function openModal({ title, message = "", body = "", confirmLabel = "Confirmer", cancelLabel = "Annuler", danger = false, hideCancel = false, wide = false, onSubmit }) {
    modalReturn = document.activeElement;
    $("#modal-root").innerHTML = `<div class="modal-overlay"><form class="modal${wide ? " wide" : ""}"  role="dialog" aria-modal="true" aria-labelledby="modal-title" novalidate><h2 id="modal-title">${esc(title)}</h2>${message ? `<p class="msg">${esc(message)}</p>` : ""}${body}<div class="modal-actions">${hideCancel ? "" : `<button type="button" class="btn" data-action="close-modal">${esc(cancelLabel)}</button>`}<button type="submit" class="${danger ? "btn-danger" : "btn-gold"}">${esc(confirmLabel)}</button></div></form></div>`;
    const form = $("#modal-root form");
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const errors = onSubmit ? await onSubmit(form) : null;
      if (errors && Object.keys(errors).length) { showErrors(form, errors); return; }
      closeModal();
    });
    syncScrollLock();
    (form.querySelector("input, select, textarea") || form.querySelector('button[type="submit"]')).focus();
  }
  function closeModal() {
    $("#modal-root").innerHTML = "";
    syncScrollLock();
    if (modalReturn && document.contains(modalReturn)) modalReturn.focus();
    modalReturn = null;
  }
  const confirmDialog = (title, message, confirmLabel, onConfirm, danger = true) => openModal({ title, message, confirmLabel, danger, onSubmit: async () => { await onConfirm(); } });
  const syncScrollLock = () => { document.body.style.overflow = ui.drawer || $("#modal-root").firstChild ? "hidden" : ""; };

  function pinModal(title, message, pin) {
    openModal({ title, message, hideCancel: true, confirmLabel: "Compris", body: `<div class="pin-box" aria-label="PIN temporaire">${esc(pin)}</div><p class="hint">PIN temporaire : le livreur l'utilise lors de sa première connexion, puis doit le personnaliser.</p>` });
  }

  function changeSecretModal() {
    openModal({
      title: "Modifier le mot de passe",
      message: "Choisissez un nouveau mot de passe d'au moins 8 caractères.",
      confirmLabel: "Enregistrer",
      body: `${field("current", "Mot de passe actuel", input("current", "", "password", 'autocomplete="current-password"'))}${field("next", "Nouveau mot de passe", input("next", "", "password", 'autocomplete="new-password" minlength="8"'))}${field("confirm", "Confirmer le nouveau mot de passe", input("confirm", "", "password", 'autocomplete="new-password"'))}`,
      onSubmit: async (form) => {
        if (form.next.value.length < 8) return { next: "8 caractères minimum." };
        if (form.next.value !== form.confirm.value) return { confirm: "Les mots de passe ne correspondent pas." };
        const response = await Store.changeSecret(form.current.value, form.next.value);
        if (!response.ok) { toast(response.error, "error"); return { current: response.error }; }
        toast("Mot de passe modifié");
        return null;
      }
    });
  }

  /* ---------- Login ---------- */
  function renderLogin() {
    if (Store.changeRequired()) {
      $("#login-view").innerHTML = `<div class="login-card"><img class="login-logo" src="assets/emblem-reference.png" alt="G&K Food"><h1>G&amp;K Admin</h1><p class="sub">Modification obligatoire du mot de passe</p>
        <p class="login-note">${icon("shield")}<span>Pour protéger votre compte, choisissez un nouveau mot de passe avant d'accéder au back-office.</span></p>
        <form id="required-secret-form" novalidate><div id="secret-error" role="alert"></div>
          ${field("current", "Mot de passe temporaire actuel", input("current", "", "password", 'autocomplete="current-password"'))}
          ${field("next", "Nouveau mot de passe", input("next", "", "password", 'autocomplete="new-password" minlength="8" maxlength="100"'))}
          ${field("confirm", "Confirmer le nouveau mot de passe", input("confirm", "", "password", 'autocomplete="new-password" maxlength="100"'))}
          <button id="secret-submit" class="btn-gold full" type="submit">${icon("key")} Modifier le mot de passe</button>
          <button class="btn full" type="button" data-action="logout">Se déconnecter</button>
        </form></div>`;
      return;
    }
    $("#login-view").innerHTML = `<div class="login-card"><img class="login-logo" src="assets/emblem-reference.png" alt="G&K Food"><h1>G&amp;K Admin</h1><p class="sub">Back-office de la plateforme G&amp;K Food</p>
      <form id="login-form" novalidate><div id="login-error" role="alert"></div>
        ${field("email", "E-mail", input("email", "", "email", 'autocomplete="username" placeholder="vous@gk.com"'))}
        ${field("password", "Mot de passe", input("password", "", "password", 'autocomplete="current-password"'))}
        ${ownerLogin ? field("door", "Clé d'accès propriétaire", input("door", "", "password", 'autocomplete="off"')) : ""}
        <button id="login-submit" class="btn-gold full" type="submit">${icon("lock")} Se connecter</button></form>
      <p class="login-note">${icon("shield")}<span>Connexion sécurisée au serveur G&amp;K. Les comptes du personnel sont provisionnés par un administrateur.</span></p></div>`;
    const error = Store.get().errors.auth;
    if (error) $("#login-error").innerHTML = `<div class="alert-inline">${icon("alert")}<span>${esc(error)}</span></div>`;
  }

  async function submitLogin(form) {
    const email = form.email.value.trim(); const pass = form.password.value;
    const errors = {};
    if (!email) errors.email = "Saisissez votre e-mail.";
    if (!pass) errors.password = "Saisissez votre mot de passe.";
    if (ownerLogin && !form.door.value) errors.door = "Saisissez la clé d'accès propriétaire.";
    showErrors(form, errors);
    if (Object.keys(errors).length) return;
    const submit = $("#login-submit");
    const door = ownerLogin ? form.door.value : "";
    if (ownerLogin) form.door.value = "";
    submit.disabled = true;
    submit.innerHTML = `${icon("clock")} Connexion…`;
    const r = await Store.login(email, pass, door, ownerLogin);
    if (r.ok) {
      ui.route = "dashboard"; location.hash = "#/dashboard"; renderAll(); return;
    }
    submit.disabled = false;
    submit.innerHTML = `${icon("lock")} Se connecter`;
    const box = $("#login-error");
    box.innerHTML = `<div class="alert-inline">${icon("alert")}<span>${esc(r.error)}</span></div>`;
  }

  async function submitRequiredSecret(form) {
    const current = form.current.value;
    const next = form.next.value;
    const errors = {};
    if (!current) errors.current = "Saisissez votre mot de passe actuel.";
    if (next.length < 8) errors.next = "8 caractères minimum.";
    if (next.length > 100) errors.next = "100 caractères maximum.";
    if (next !== form.confirm.value) errors.confirm = "Les mots de passe ne correspondent pas.";
    showErrors(form, errors);
    if (Object.keys(errors).length) return;
    const button = $("#secret-submit");
    button.disabled = true;
    button.textContent = "Modification…";
    const result = await Store.changeSecret(current, next);
    if (!result.ok) {
      const box = $("#secret-error");
      if (box) box.innerHTML = `<div class="alert-inline">${icon("alert")}<span>${esc(result.error)}</span></div>`;
      const submit = $("#secret-submit");
      if (submit) { submit.disabled = false; submit.innerHTML = `${icon("key")} Modifier le mot de passe`; }
      return;
    }
    toast("Mot de passe modifié");
    ui.route = "dashboard";
    location.hash = "#/dashboard";
    renderAll();
  }

  /* ---------- Shell ---------- */
  function renderSidebar() {
    const user = Store.currentUser();
    const fresh = S().orders.filter((o) => o.status === "nouvelle").length;
    const items = NAV_GROUPS.map((g) => `<div class="nav-group">${g.label}</div>${g.routes.map((r) => {
      const meta = ROUTES[r]; const locked = meta.perm && !Store.can(meta.perm);
      return `<a class="nav-item ${ui.route === r ? "active" : ""} ${locked ? "locked" : ""}" href="#/${r}" ${ui.route === r ? 'aria-current="page"' : ""} ${locked ? 'title="Réservé aux administrateurs"' : ""}>${icon(meta.icon)}<span>${meta.title}</span>${locked ? icon("lock") : ""}${r === "commandes" && fresh ? `<span class="nav-badge" aria-label="${fresh} nouvelle(s) commande(s)">${fresh}</span>` : ""}</a>`;
    }).join("")}`).join("");
    $("#sidebar").innerHTML = `<div class="sb-brand"><img src="assets/emblem-reference.png" alt=""><div><strong>G&amp;K Admin</strong><span>${esc(S().settings.restaurant.name)}</span></div><button class="icon-button sb-close" type="button" data-action="close-nav" aria-label="Fermer le menu">${icon("close")}</button></div><nav>${items}</nav><div class="sb-foot">${user ? roleBadge(user.role) : ""}<p style="margin-top:8px">Données synchronisées avec l'API G&amp;K</p></div>`;
  }

  function ownerViewUrl(target) {
    const host = location.hostname;
    if (/(^|\.)gkfood\.store$/.test(host)) return `https://${{ client: "app", cuisine: "kitchen", courier: "courier" }[target]}.gkfood.store/`;
    const folder = { client: "GKMobile", cuisine: "GKCuisine", courier: "GKCourier" }[target];
    return `${location.origin}${location.pathname.replace(/\/GKAdmin\/[^/]*$/, "")}/${folder}/index.html`;
  }

  function renderTopbar() {
    const user = Store.currentUser();
    const branchPicker = $("#branch-switch-wrap");
    const canSelectBranch = ["admin", "owner"].includes(user.role) && !user.branchId;
    branchPicker.hidden = !canSelectBranch;
    if (canSelectBranch) {
      const branches = S().branches;
      $("#branch-select").innerHTML = branches.map((branch) =>
        `<option value="${esc(branch.id)}" ${branch.id === S().branchId ? "selected" : ""}>${esc(branch.name)}</option>`
      ).join("");
      $("#branch-select").disabled = !branches.length;
    }
    $("#page-title").textContent = ROUTES[ui.route].title;
    $("#search-icon").innerHTML = icon("search");
    document.querySelector(".nav-toggle").innerHTML = icon("menu");
    const alerts = Store.alerts();
    $("#bell-btn").innerHTML = `${icon("bell")}${alerts.length ? `<span class="dot">${alerts.length}</span>` : ""}`;
    $("#bell-btn").setAttribute("aria-label", `Notifications (${alerts.length})`);
    $("#bell-pop").innerHTML = `<div class="pop-title">Notifications</div>${alerts.length ? alerts.map((a) => `<button class="pop-item" data-action="goto" data-href="${esc(a.link)}">${icon(a.icon)}<span>${esc(a.text)}</span></button>`).join("") : `<p class="muted small" style="padding:10px">Rien à signaler.</p>`}`;
    $("#user-btn").innerHTML = `<span class="avatar">${esc(initials(user.name))}</span><span class="who"><b>${esc(user.name)}</b><small>${esc(roleLabel(user.role))}</small></span>${icon("chevronDown")}`;
    const mustChange = !!user.mustChange;
    const ownerViews = user.role === "owner" ? `<div class="pop-title">Voir comme</div>${[["client", "Client"], ["cuisine", "Cuisine"], ["courier", "Livreur"]].map(([id, label]) => `<button class="pop-item" data-action="owner-view" data-target="${id}">${icon("external")}<span>${label}</span></button>`).join("")}` : "";
    $("#user-pop").innerHTML = `<div style="padding:10px"><b>${esc(user.name)}</b><p class="muted small">${esc(user.email || "")}</p><p style="margin-top:6px">${roleBadge(user.role)}</p>${mustChange ? '<p class="hint">Modifiez votre mot de passe initial.</p>' : ""}</div>${ownerViews}<button class="pop-item" data-action="change-secret">${icon("key")}<span>Modifier le mot de passe</span></button><button class="pop-item" data-action="logout">${icon("logout")}<span>Se déconnecter</span></button>`;
    $("#bell-pop").hidden = !ui.bell; $("#user-pop").hidden = !ui.user;
    $("#bell-btn").setAttribute("aria-expanded", String(ui.bell)); $("#user-btn").setAttribute("aria-expanded", String(ui.user));
    const branchError = S().errors.branches;
    $("#notice-bar").innerHTML = branchError
      ? `<div class="notice" role="alert">${icon("ban")}<span>${esc(branchError)}</span><button class="btn btn-sm" data-action="retry-branches">Réessayer</button></div>`
      : S().settings.acceptingOrders ? "" : `<div class="notice" role="status">${icon("ban")}<span>Commandes en pause : les clients ne peuvent plus commander.</span>${Store.can("settingsOps") ? `<button class="btn btn-sm" data-action="resume-orders">Reprendre</button>` : ""}</div>`;
  }

  function renderView() {
    const meta = ROUTES[ui.route];
    const view = $("#view");
    if (ui.route !== "carte") dropLiveMap();
    if (meta.perm && !Store.can(meta.perm)) {
      view.innerHTML = `<div class="card">${emptyState("lock", "Accès non autorisé", "Votre rôle ne permet pas de consulter cette page.")}</div>`;
      return;
    }
    const status = Store.routeStatus(ui.route);
    if (status.loading) { view.innerHTML = `<div class="card">${emptyState("clock", "Chargement des données…", "Connexion au serveur G&K.")}</div>`; return; }
    if (status.error) { view.innerHTML = `<div class="card">${emptyState("alert", "Impossible de charger les données", status.error)}<div style="text-align:center;margin:12px"><button class="btn-gold" data-action="retry-page">Réessayer</button></div></div>`; return; }
    view.innerHTML = pages[ui.route].render();
    if (ui.route === "carte") attachLiveMap();
  }

  /* ---------- Live map ---------- */
  let liveMap = null;
  function dropLiveMap() { if (liveMap) { liveMap.destroy(); liveMap = null; } }
  function attachLiveMap() {
    const slot = $("#live-slot");
    if (!slot) return;
    if (!liveMap) {
      try { liveMap = GKMap.mount({ scope: Store.get().scope, list: true, logo: "assets/emblem-reference.png" }); }
      catch (error) { slot.innerHTML = emptyState("alert", "Carte indisponible", error.message); return; }
    }
    slot.appendChild(liveMap.el);
    liveMap.invalidate();
  }
  function mapPage() {
    return `<div class="page-head"><div><h2>Carte en direct</h2><p>Position des livreurs en ligne, mise à jour toutes les 5 secondes.</p></div></div><div id="live-slot" class="live-slot"></div>`;
  }

  function refreshResults() {
    const page = pages[ui.route]; const box = $("#view [data-results]");
    if (page && page.results && box) box.innerHTML = page.results();
  }

  function renderAll() {
    if (ui.holdRender) return;
    const user = Store.currentUser();
    $("#login-view").hidden = !!user; $("#shell").hidden = !user;
    if (!user) {
      closeAllOverlays();
      const requiredForm = Store.changeRequired() ? "#required-secret-form" : "#login-form";
      if (!$(requiredForm) || S().errors.auth) renderLogin();
      return;
    }
    $("#login-view").innerHTML = "";
    Store.refreshForRoute(ui.route);
    renderSidebar(); renderTopbar();
    if (ui.soft) {
      if (ui.route === "dashboard") renderView(); else if (ui.route === "commandes") refreshResults();
    } else renderView();
    // Timer-driven refreshes must not wipe a form the user is filling in.
    if (!(ui.soft && ui.drawer && ui.drawer.type !== "order")) renderDrawer();
  }

  function closeAllOverlays() { ui.drawer = null; ui.bell = ui.user = false; $("#drawer-root").innerHTML = ""; $("#modal-root").innerHTML = ""; drawerKey = null; syncScrollLock(); }

  function setNav(open) {
    $("#sidebar").classList.toggle("open", open);
    $("#scrim").hidden = !open;
    if (open) { const first = $("#sidebar .nav-item"); if (first) first.focus(); }
  }

  /* ---------- Dashboard ---------- */
  function deltaHTML(cur, prev) {
    if (!prev) return `<span class="delta flat">— vs hier</span>`;
    const p = Math.round(((cur - prev) / prev) * 100);
    const cls = p > 0 ? "up" : p < 0 ? "down" : "flat";
    return `<span class="delta ${cls}">${p > 0 ? "▲" : p < 0 ? "▼" : "•"} ${Math.abs(p)} % vs hier</span>`;
  }

  function revenueChart() {
    const series = Store.revenueSeries(7);
    const max = Math.max(1000, ...series.map((d) => d.revenue));
    const top = Math.ceil(max / 500) * 500;
    const W = 640, H = 240, pl = 48, pb = 30, pt = 18;
    const bw = (W - pl - 10) / 7;
    const y = (v) => pt + (H - pt - pb) * (1 - v / top);
    let g = "";
    for (let i = 0; i <= 4; i++) { const v = (top / 4) * i; g += `<line class="grid-line" x1="${pl}" x2="${W}" y1="${y(v)}" y2="${y(v)}"/><text x="${pl - 8}" y="${y(v) + 4}" text-anchor="end">${v >= 1000 ? nf.format(v / 1000) + " k" : v}</text>`; }
    const bars = series.map((d, i) => {
      const x = pl + i * bw + bw * 0.18; const w = bw * 0.64; const h = Math.max(2, H - pb - y(d.revenue));
      return `<rect class="bar ${i === 6 ? "today" : ""}" x="${x}" y="${H - pb - h}" width="${w}" height="${h}" rx="6"><title>${esc(dayFmt.format(d.start))} : ${esc(money(d.revenue))}</title></rect><text x="${x + w / 2}" y="${H - 10}" text-anchor="middle">${esc(wdFmt.format(d.start).replace(".", ""))}</text>`;
    }).join("");
    const total = series.reduce((s, d) => s + d.revenue, 0);
    return `<div class="card"><div class="card-head"><h3>Chiffre d'affaires — 7 jours</h3><small>${esc(money(total))}</small></div><svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Chiffre d'affaires des 7 derniers jours">${g}${bars}</svg></div>`;
  }

  function statusDonut() {
    const counts = Store.statusCounts(); const total = counts.reduce((s, c) => s + c.count, 0);
    const r = 54, C = 2 * Math.PI * r; let offset = 0;
    const segs = total ? counts.filter((c) => c.count).map((c) => { const len = (c.count / total) * C; const s = `<circle cx="70" cy="70" r="${r}" fill="none" stroke="${TONE_HEX[c.tone]}" stroke-width="18" stroke-dasharray="${len} ${C - len}" stroke-dashoffset="${-offset}" transform="rotate(-90 70 70)"/>`; offset += len; return s; }).join("") : "";
    return `<div class="card"><div class="card-head"><h3>Commandes par statut</h3><small>Aujourd'hui</small></div><div class="donut-wrap"><svg class="donut" viewBox="0 0 140 140" role="img" aria-label="${total} commandes aujourd'hui"><circle cx="70" cy="70" r="${r}" fill="none" stroke="#f1eee5" stroke-width="18"/>${segs}<text x="70" y="68" text-anchor="middle" style="font-size:26px;font-weight:800;fill:#1b1a17">${total}</text><text x="70" y="86" text-anchor="middle" style="font-size:11px;fill:#8a857a">commandes</text></svg><div class="legend">${counts.map((c) => `<div><i style="background:${TONE_HEX[c.tone]}"></i>${esc(c.label)}<b>${c.count}</b></div>`).join("")}</div></div></div>`;
  }

  function dashboardPage() {
    const start = Store.dayStart(Date.now());
    const todayOrders = S().orders.filter((o) => Store.dayStart(o.createdAt) === start);
    const salesOrders = todayOrders.filter((o) => !["annulee", "refusee"].includes(o.status));
    const y = Store.dayStats(1);
    const revenue = salesOrders.reduce((sum, o) => sum + Number(o.total || 0), 0);
    const average = salesOrders.length ? revenue / salesOrders.length : 0;
    const prepTimes = todayOrders.map((o) => {
      const history = [...(o.history || [])].filter((h) => Number(h.at) > 0).sort((a, b) => Number(a.at) - Number(b.at));
      const began = history.find((h) => h.status === "preparation");
      const ready = began && history.find((h) => h.status === "prete" && Number(h.at) >= Number(began.at));
      const minutes = ready ? (Number(ready.at) - Number(began.at)) / 60000 : 0;
      return minutes > 0 && minutes <= 240 ? minutes : null;
    }).filter((minutes) => minutes !== null);
    const avgPrep = prepTimes.length ? prepTimes.reduce((sum, m) => sum + m, 0) / prepTimes.length : null;
    const delivered = todayOrders.filter((o) => o.status === "livree").length;
    const couriers = S().couriers.filter((c) => c.active);
    const online = couriers.filter((c) => ["online", "mission"].includes(Store.courierStatus(c)));
    const mission = couriers.filter((c) => Store.courierStatus(c) === "mission").length;
    const hourly = Array.from({ length: 24 }, (_, hour) => ({
      hour,
      total: salesOrders.filter((o) => new Date(o.createdAt).getHours() === hour).reduce((sum, o) => sum + Number(o.total || 0), 0)
    }));
    const maxHour = Math.max(1, ...hourly.map((item) => item.total));
    const products = new Map();
    salesOrders.forEach((o) => (o.items || []).forEach((line) => {
      const name = line.name || "Article";
      const key = line.productId || name;
      const current = products.get(key) || { name, qty: 0 };
      current.qty += Number(line.qty || 0);
      products.set(key, current);
    }));
    const topToday = [...products.values()].sort((a, b) => b.qty - a.qty).slice(0, 5);
    const weekTop = Store.topProducts(5);
    const recent = [...todayOrders].sort((a, b) => b.createdAt - a.createdAt).slice(0, 6);
    const alerts = Store.alerts();
    const logs = (S().audit || []).slice(0, 5);
    const kpi = (label, value, foot = "") => `<div class="today-kpi"><span class="today-kpi-label">${label}</span><strong class="today-kpi-value">${value}</strong>${foot ? `<small>${foot}</small>` : ""}</div>`;
    const hourBars = hourly.map((item) => `<div class="hour-column"><div class="hour-bar-wrap"><div class="hour-bar ${item.total ? "has-sales" : ""}" style="height:${item.total ? Math.max(4, Math.round((item.total / maxHour) * 100)) : 0}%" title="${String(item.hour).padStart(2, "0")} h · ${nf.format(item.total)} DH" aria-label="${String(item.hour).padStart(2, "0")} heures : ${nf.format(item.total)} DH"></div></div><span>${item.hour % 3 === 0 ? `${String(item.hour).padStart(2, "0")} h` : ""}</span></div>`).join("");
    const recentRows = recent.map((o) => `<tr class="clickable" data-action="open-order" data-id="${esc(o.id)}"><td data-label="N°"><button class="link-btn" data-action="open-order" data-id="${esc(o.id)}">${esc(o.id)}</button></td><td data-label="Client">${esc(o.customerName || "—")}</td><td data-label="Type">${o.mode === "livraison" ? "Livraison" : "À emporter"}</td><td data-label="Total" class="right"><b>${esc(nf.format(Number(o.total || 0)))} DH</b></td><td data-label="Statut">${statusPill(o.status)}</td></tr>`).join("");
    const productList = (items, empty) => items.length
      ? `<ol class="today-product-list">${items.map((item, i) => `<li><span class="today-rank">${i + 1}</span><b>${esc(item.name)}</b><span>${nf.format(item.qty)} vendu(s)</span></li>`).join("")}</ol>`
      : `<p class="today-panel-empty">${empty}</p>`;
    const cloture = S().cloture;
    const clotureDay = S().clotureDayStart || Store.dayStart(Date.now());
    const isoDay = (ts) => {
      const d = new Date(ts);
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    };
    const todayIso = isoDay(Date.now());
    const minIso = isoDay(Store.dayStart(Date.now()) - 400 * 86400000);
    const clotureLabel = new Intl.DateTimeFormat("fr-FR", { weekday: "long", day: "numeric", month: "long" }).format(clotureDay);
    const emptyDay = cloture && !cloture.orders;
    const cloturePanel = Store.can("stats") ? `<section class="today-panel today-cloture"><div class="today-panel-head"><h3>Ticket de clôture</h3>
        <div class="cloture-day-row">
          <button class="btn btn-sm" type="button" data-action="cloture-shift" data-dir="-1" aria-label="Jour précédent">${icon("chevronLeft")}</button>
          <label class="cloture-day">Jour à clôturer
            <input type="date" data-action="cloture-day" value="${isoDay(clotureDay)}" min="${minIso}" max="${todayIso}">
          </label>
          <button class="btn btn-sm" type="button" data-action="cloture-shift" data-dir="1" aria-label="Jour suivant" ${isoDay(clotureDay) >= todayIso ? "disabled" : ""}>${icon("chevronRight")}</button>
          <button class="btn-gold" type="button" data-action="print-cloture" ${emptyDay ? "disabled" : ""}>${icon("printer")} Imprimer</button>
        </div>
      </div>
      <p class="today-date">${esc(clotureLabel)}</p>
      ${emptyDay ? `<p class="today-panel-empty">Aucune vente ce jour. Choisissez la veille si vous clôturez après minuit.</p>` : ""}
      ${cloture ? `<div class="receipt-preview cloture-preview">${GKReceipt.previewCloture(cloture, receiptOpts())}</div>` : `<p class="today-panel-empty">Chargement du ticket…</p>`}</section>` : "";
    return `<div class="today-dashboard">
      <div class="today-intro"><div><p class="today-eyebrow">Résumé de l'activité</p><h2>Aujourd'hui</h2></div><div class="today-intro-actions"><span class="today-date">${esc(new Intl.DateTimeFormat("fr-FR", { weekday: "long", day: "numeric", month: "long" }).format(Date.now()))}</span>${Store.can("stats") ? `<button class="btn-gold" type="button" data-action="print-cloture">${icon("printer")} Imprimer la clôture</button>` : ""}</div></div>
      ${cloturePanel}
      ${todayOrders.length ? "" : `<p class="today-empty-note" role="status">Aucune commande aujourd'hui</p>`}
      <section class="today-kpis" aria-label="Indicateurs du jour">
        ${kpi("Ventes du jour", `${nf.format(Math.round(revenue * 100) / 100)} <span>DH</span>`, deltaHTML(revenue, y.revenue))}
        ${kpi("Commandes", String(todayOrders.length), deltaHTML(todayOrders.length, y.count))}
        ${kpi("Panier moyen", `${nf.format(Math.round(average * 100) / 100)} <span>DH</span>`, `${salesOrders.length} hors annulations`)}
        ${kpi("Temps moyen de préparation", avgPrep == null ? "—" : `${nf.format(Math.round(avgPrep * 10) / 10)} min`, avgPrep == null ? "Durée inconnue pour l'instant" : `${prepTimes.length} commande(s) chronométrée(s)`)}
        ${kpi("Livrées", String(delivered), "Aujourd'hui")}
        ${kpi("Livreurs en ligne", `${online.length}<span> / ${couriers.length}</span>`, `${mission} en mission`)}
      </section>
      <section class="today-panels">
        <div class="today-panel"><div class="today-panel-head"><h3>Ventes par heure</h3><span>DH · aujourd'hui</span></div><div class="hour-chart" role="img" aria-label="Ventes par heure, en dirhams">${hourBars}</div></div>
        <div class="today-panel"><div class="today-panel-head"><h3>Les plus vendus</h3><span>Quantités du jour</span></div>${productList(topToday, "Aucun article vendu aujourd'hui")}</div>
      </section>
      <div class="grid grid-main">${revenueChart()}${statusDonut()}</div>
      <section class="today-panels">
        <div class="today-panel"><div class="today-panel-head"><h3>Alertes</h3></div>${alerts.length ? alerts.map((a) => `<button class="alert-item ${a.tone}" data-action="goto" data-href="${esc(a.link)}">${icon(a.icon)}<span>${esc(a.text)}</span></button>`).join("") : `<p class="today-panel-empty">Tout est sous contrôle.</p>`}</div>
        <div class="today-panel"><div class="today-panel-head"><h3>Top 5 produits</h3><span>7 jours</span></div>${productList(weekTop, "Pas encore de ventes sur 7 jours")}</div>
      </section>
      <section class="today-panel today-recent"><div class="today-panel-head"><h3>Commandes récentes</h3><a class="link-btn" href="#/commandes">Tout voir</a></div><div class="table-wrap"><table class="tbl today-table"><thead><tr><th>N°</th><th>Client</th><th>Type</th><th class="right">Total</th><th>Statut</th></tr></thead><tbody>${recentRows || `<tr><td class="today-table-empty" colspan="5">Aucune commande aujourd'hui</td></tr>`}</tbody></table></div></section>
      <section class="today-panel"><div class="today-panel-head"><h3>Activité récente</h3><a class="link-btn" href="#/activite">Journal complet</a></div>${logs.length ? logs.map(logItem).join("") : `<p class="today-panel-empty">Aucune activité récente.</p>`}</section>
    </div>`;
  }

  const logItem = (a) => `<div class="log-item"><time>${esc(fmtDT(a.at))}</time><div><b>${esc(a.user)}</b> · <span class="muted">${esc(a.action)}</span><div>${esc(a.detail)}</div></div></div>`;

  /* ---------- Orders ---------- */
  function filteredOrders() {
    const f = ui.orders; const q = f.q.trim().toLowerCase();
    const today = Store.dayStart(Date.now());
    return [...S().orders].filter((o) => {
      if (f.status !== "all" && o.status !== f.status) return false;
      if (f.mode !== "all" && o.mode !== f.mode) return false;
      if (f.range === "today" && o.createdAt < today) return false;
      if (f.range === "7d" && o.createdAt < today - 6 * 86400000) return false;
      if (q && !`${o.id} ${o.customerName} ${o.phone} ${o.address}`.toLowerCase().includes(q)) return false;
      return true;
    }).sort((a, b) => b.createdAt - a.createdAt);
  }

  function ordersResults() {
    const p = paginate(filteredOrders(), "orders");
    if (!p.total) return `<div class="card">${emptyState("receipt", "Aucune commande", "Modifiez vos filtres ou votre recherche.")}</div>`;
    const rows = p.slice.map((o) => {
      const c = Store.byId(S().couriers, o.courierId); const z = Store.byId(S().zones, o.zoneId);
      return `<tr class="clickable" data-action="open-order" data-id="${esc(o.id)}"><td class="cell-first" data-label="N°"><button class="link-btn" data-action="open-order" data-id="${esc(o.id)}" aria-label="Ouvrir la commande ${esc(o.id)}">${esc(o.id)}</button></td>
        <td data-label="Client"><div class="cell-main"><b>${esc(o.customerName)}</b><small>${esc(o.phone)}</small></div></td>
        <td data-label="Date" class="nowrap">${esc(fmtDT(o.createdAt))}</td>
        <td data-label="Mode"><div class="cell-main"><b>${o.mode === "livraison" ? "Livraison" : "À emporter"}</b><small>${z ? esc(z.name) : "Retrait au restaurant"}</small></div></td>
        <td data-label="Paiement">${o.payment === "cash" ? "Espèces" : "Carte"}</td>
        <td data-label="Total" class="num right"><b>${esc(money(o.total))}</b></td>
        <td data-label="Statut">${statusPill(o.status)}</td>
        <td data-label="Livreur">${c ? esc(c.name) : o.mode === "livraison" ? '<span class="muted">Non assigné</span>' : '<span class="muted">—</span>'}</td></tr>`;
    }).join("");
    return `<div class="table-wrap"><table class="tbl stack"><thead><tr><th>N°</th><th>Client</th><th>Date</th><th>Mode</th><th>Paiement</th><th class="right">Total</th><th>Statut</th><th>Livreur</th></tr></thead><tbody>${rows}</tbody></table></div>${pagerHTML("orders", p)}`;
  }

  function ordersPage() {
    const f = ui.orders;
    const opt = (v, label, cur) => `<option value="${v}" ${cur === v ? "selected" : ""}>${label}</option>`;
    return `<div class="toolbar">${searchBox("orders", "q", "N°, client, téléphone, adresse…", "Rechercher une commande")}
      <select class="select" data-filter="orders.status" aria-label="Filtrer par statut">${opt("all", "Tous les statuts", f.status)}${ORDER_STATUSES.map((s) => opt(s.id, s.label, f.status)).join("")}</select>
      <select class="select" data-filter="orders.mode" aria-label="Filtrer par mode">${opt("all", "Livraison & emporter", f.mode)}${opt("livraison", "Livraison", f.mode)}${opt("emporter", "À emporter", f.mode)}</select>
      <select class="select" data-filter="orders.range" aria-label="Filtrer par date">${opt("today", "Aujourd'hui", f.range)}${opt("7d", "7 derniers jours", f.range)}${opt("all", "Toutes les dates", f.range)}</select></div>
      <div data-results>${ordersResults()}</div>`;
  }

  function orderDrawer(d) {
    const o = Store.byId(S().orders, d.id);
    if (!o) return "";
    const z = Store.byId(S().zones, o.zoneId); const c = Store.byId(S().couriers, o.courierId);
    const closed = ["livree", "annulee", "refusee"].includes(o.status);
    const next = Store.nextStatus(o);
    const couriers = S().couriers.filter((x) => x.active);
    const statusText = { online: "en ligne", mission: "en mission", offline: "hors ligne" };
    const body = `<div class="card"><h3 class="small muted" style="margin-bottom:10px">CLIENT</h3><dl class="kv"><dt>Nom</dt><dd>${esc(o.customerName)}</dd><dt>Téléphone</dt><dd>${esc(o.phone)}</dd><dt>Mode</dt><dd>${o.mode === "livraison" ? "Livraison" : "À emporter"}</dd>${o.mode === "livraison" ? `<dt>Adresse</dt><dd>${esc(o.address)}</dd><dt>Zone</dt><dd>${z ? `${esc(z.name)} · ETA ${z.etaMin}–${z.etaMax} min` : "—"}</dd>` : ""}<dt>Paiement</dt><dd>${o.payment === "cash" ? "Espèces à la livraison" : "Carte bancaire"}</dd>${o.promo ? `<dt>Code promo</dt><dd>${esc(o.promo)}</dd>` : ""}${o.cancelReason ? `<dt>Motif</dt><dd>${esc(o.cancelReason)}</dd>` : ""}</dl></div>
      <div class="card"><h3 class="small muted" style="margin-bottom:6px">ARTICLES</h3>${o.items.map((l) => `<div class="item-line"><div>${l.qty} × ${esc(l.name)}<small>${[l.size, ...l.extras].filter(Boolean).map(esc).join(" · ")}</small></div><b class="num">${esc(money(l.qty * l.unit))}</b></div>`).join("")}
        <div style="margin-top:8px"><div class="total-line"><span>Sous-total</span><span class="num">${esc(money(o.subtotal))}</span></div><div class="total-line"><span>Livraison</span><span class="num">${o.fee ? esc(money(o.fee)) : "Offerte"}</span></div>${o.discount ? `<div class="total-line"><span>Promo</span><span class="num">− ${esc(money(o.discount))}</span></div>` : ""}<div class="total-line big"><span>Total</span><span class="num">${esc(money(o.total))}</span></div></div></div>
      ${o.mode === "livraison" ? `<div class="card"><h3 class="small muted" style="margin-bottom:10px">LIVREUR</h3>${c ? `<p style="margin-bottom:10px"><b>${esc(c.name)}</b> · ${esc(c.phone)}</p>` : `<p class="muted" style="margin-bottom:10px">Aucun livreur assigné.</p>`}
        ${closed || !Store.can("orderAct") ? "" : `<div class="field" data-field="courier" style="margin-bottom:0"><label for="assign-select">${c ? "Réassigner à" : "Assigner à"}</label><div style="display:flex;gap:8px"><select id="assign-select" class="select" style="flex:1"><option value="">Choisir un livreur…</option>${couriers.map((x) => `<option value="${esc(x.id)}" ${x.id === o.courierId ? "selected" : ""}>${esc(x.name)} — ${statusText[Store.courierStatus(x)] || ""}</option>`).join("")}</select><button class="btn btn-dark" data-action="assign-courier" data-id="${esc(o.id)}">Assigner</button></div></div>`}</div>` : ""}
      <div class="card"><h3 class="small muted" style="margin-bottom:12px">HISTORIQUE</h3><ol class="timeline">${o.history.map((h) => `<li class="${h.status === "annulee" ? "cancel" : ""}"><span>${esc(Store.statusLabel(h.status))}</span><time>${esc(fmtDT(h.at))}</time></li>`).join("")}</ol></div>`;
    const foot = `<button class="btn" data-action="show-receipt" data-id="${esc(o.id)}">${icon("printer")} Ticket</button>${o.status === "livree" && Store.can("invoices") ? `<button class="btn" data-action="open-invoice" data-id="${esc(o.id)}">${icon("invoice")} Facture</button>` : ""}${o.status === "nouvelle" && Store.can("orderAct") ? `<button class="btn btn-ghost-danger" data-action="refuse-order" data-id="${esc(o.id)}">Refuser</button>` : ""}${o.status === "nouvelle" && Store.can("orderAct") ? `<button class="btn btn-ghost-danger" data-action="cancel-order" data-id="${esc(o.id)}">Annuler</button>` : ""}${o.status === "preparation" && Store.can("orderAct") ? `<button class="btn" data-action="adjust-prep" data-id="${esc(o.id)}">Ajuster le délai</button>` : ""}${next && (o.status === "nouvelle" ? Store.can("orderAct") : o.status === "preparation" ? Store.can("orderReady") : Store.can("orderHandover")) ? `<button class="btn-gold" data-action="advance-order" data-id="${esc(o.id)}">${icon("arrowRight")} ${esc(o.status === "nouvelle" ? "Accepter" : Store.statusLabel(next))}</button>` : ""}`;
    return drawerShell({ title: `Commande ${o.id}`, sub: `${fmtDT(o.createdAt)} · ${ago(o.createdAt)}`, status: statusPill(o.status), body, foot });
  }

  /* ---------- Receipts & invoices ---------- */
  const LOGO = "assets/emblem-reference.png";
  function receiptDoc(o) {
    const z = Store.byId(S().zones, o.zoneId);
    return {
      id: o.id, seq: o.seq, createdAt: o.createdAt, mode: o.mode === "livraison" ? "delivery" : "pickup",
      customerName: o.customerName, phone: o.phone, address: o.address || "", zone: o.zoneName || (z ? z.name : ""),
      note: o.note || "", promo: o.promo, subtotal: o.subtotal, fee: o.fee, discount: o.discount, total: o.total,
      payment: o.payment === "cash" ? "cash" : "card", status: o.status,
      items: o.items.map((l) => ({ qty: l.qty, name: l.name, size: l.size, extras: l.extras, unit: l.unit }))
    };
  }
  const receiptOpts = () => ({ seller: S().settings.restaurant, logo: LOGO });

  /* ---------- Invoices ---------- */
  function filteredInvoices() {
    const f = ui.invoices; const q = f.q.trim().toLowerCase();
    const today = Store.dayStart(Date.now());
    const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).getTime();
    return S().orders.filter((o) => {
      if (o.status !== "livree") return false;
      if (f.payment !== "all" && o.payment !== f.payment) return false;
      if (f.range === "today" && o.createdAt < today) return false;
      if (f.range === "7d" && o.createdAt < today - 6 * 86400000) return false;
      if (f.range === "month" && o.createdAt < monthStart) return false;
      if (q && !`${GKReceipt.invoiceNumber(receiptDoc(o))} ${o.id} ${o.customerName} ${o.phone}`.toLowerCase().includes(q)) return false;
      return true;
    }).sort((a, b) => b.createdAt - a.createdAt);
  }

  function invoicesResults() {
    const list = filteredInvoices();
    const sum = (fn) => list.filter(fn).reduce((s, o) => s + o.total, 0);
    const kpi = (label, value, sub) => `<div class="card kpi"><div class="kpi-top"><span>${label}</span></div><div class="kpi-value">${value}</div><span class="delta flat">${sub}</span></div>`;
    const kpis = `<div class="grid grid-kpi">${kpi("Factures", String(list.length), "livrées")}${kpi("Total facturé", `${nf.format(Math.round(sum(() => true)))} <small>MAD</small>`, "toutes taxes comprises")}${kpi("Espèces", `${nf.format(Math.round(sum((o) => o.payment === "cash")))} <small>MAD</small>`, `${list.filter((o) => o.payment === "cash").length} facture(s)`)}${kpi("Carte", `${nf.format(Math.round(sum((o) => o.payment !== "cash")))} <small>MAD</small>`, `${list.filter((o) => o.payment !== "cash").length} facture(s)`)}</div>`;
    const p = paginate(list, "invoices");
    if (!p.total) return `${kpis}<div class="card">${emptyState("invoice", "Aucune facture", "Les factures sont créées automatiquement pour chaque commande livrée.")}</div>`;
    const rows = p.slice.map((o) => `<tr class="clickable" data-action="open-invoice" data-id="${esc(o.id)}"><td class="cell-first" data-label="Facture"><button class="link-btn" data-action="open-invoice" data-id="${esc(o.id)}">${esc(GKReceipt.invoiceNumber(receiptDoc(o)))}</button></td>
      <td data-label="Date" class="nowrap">${esc(fmtDT(o.createdAt))}</td>
      <td data-label="Client"><div class="cell-main"><b>${esc(o.customerName)}</b><small>${esc(o.phone)}</small></div></td>
      <td data-label="Commande">#${esc(o.id)}</td>
      <td data-label="Paiement">${o.payment === "cash" ? "Espèces" : "Carte"}</td>
      <td data-label="Total" class="num right"><b>${esc(money(o.total))}</b></td>
      <td data-label="" class="right nowrap"><button class="btn btn-sm" data-action="print-invoice" data-id="${esc(o.id)}" aria-label="Imprimer la facture ${esc(o.id)}">${icon("printer")} PDF</button></td></tr>`).join("");
    return `${kpis}<div class="table-wrap"><table class="tbl stack"><thead><tr><th>Facture</th><th>Date</th><th>Client</th><th>Commande</th><th>Paiement</th><th class="right">Total</th><th></th></tr></thead><tbody>${rows}</tbody></table></div>${pagerHTML("invoices", p)}`;
  }

  function invoicesPage() {
    const f = ui.invoices;
    const opt = (v, label, cur) => `<option value="${v}" ${cur === v ? "selected" : ""}>${label}</option>`;
    return `<div class="toolbar">${searchBox("invoices", "q", "N° de facture, client, téléphone…", "Rechercher une facture")}
      <select class="select" data-filter="invoices.range" aria-label="Période">${opt("today", "Aujourd'hui", f.range)}${opt("7d", "7 derniers jours", f.range)}${opt("month", "Ce mois-ci", f.range)}${opt("all", "Toutes les dates", f.range)}</select>
      <select class="select" data-filter="invoices.payment" aria-label="Paiement">${opt("all", "Tous les paiements", f.payment)}${opt("cash", "Espèces", f.payment)}${opt("card", "Carte", f.payment)}</select>
      <button class="btn" data-action="export-invoices">${icon("external")} Exporter CSV</button></div>
      <div data-results>${invoicesResults()}</div>`;
  }

  function exportInvoicesCsv() {
    const cell = (v) => {
      let s = String(v ?? "");
      if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
      return `"${s.replace(/"/g, '""')}"`;
    };
    const rows = [["Facture", "Date", "Client", "Téléphone", "Commande", "Mode", "Paiement", "Sous-total", "Livraison", "Remise", "Total"]];
    filteredInvoices().forEach((o) => rows.push([GKReceipt.invoiceNumber(receiptDoc(o)), new Date(o.createdAt).toISOString().slice(0, 10), o.customerName, o.phone, o.id, o.mode, o.payment, o.subtotal, o.fee, o.discount, o.total]));
    const blob = new Blob(["\ufeff" + rows.map((r) => r.map(cell).join(";")).join("\r\n")], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob); a.download = `factures-${todayISO()}.csv`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  function openInvoiceModal(o) {
    const doc = receiptDoc(o);
    openModal({
      title: GKReceipt.invoiceNumber(doc), wide: true, confirmLabel: "Imprimer / PDF", cancelLabel: "Fermer",
      body: `<div class="receipt-preview">${GKReceipt.previewInvoice(doc, receiptOpts())}</div><p class="hint" style="margin-top:8px">Astuce : choisissez « Enregistrer au format PDF » dans la fenêtre d'impression.</p><p><button type="button" class="btn btn-sm" data-action="print-ticket" data-id="${esc(o.id)}">${icon("receipt")} Imprimer le ticket</button></p>`,
      onSubmit: () => { GKReceipt.printInvoice(doc, receiptOpts()); return null; }
    });
  }

  /* ---------- Menu ---------- */
  const catName = (id) => (Store.byId(S().categories, id) || { name: "—" }).name;
  const productImg = (p, cls) => p.image ? `<img class="${cls}" src="${esc(p.image)}" alt="" loading="lazy">` : `<img class="${cls}" src="assets/emblem-reference.png" alt="">`;

  function filteredProducts() {
    const q = ui.menu.q.trim().toLowerCase();
    return S().products.filter((p) => (ui.menu.cat === "all" || p.category === ui.menu.cat) && (!q || `${p.name} ${p.description}`.toLowerCase().includes(q)));
  }

  function menuResults() {
    const list = filteredProducts();
    if (!list.length) return `<div class="card">${emptyState("utensils", "Aucun produit", "Aucun produit ne correspond à votre recherche.")}</div>`;
    const canDel = Store.can("deleteProduct");
    const canEdit = Store.can("menuWrite");
    const canStock = Store.can("menuStock");
    const del = (p) => `<button class="btn btn-sm btn-ghost-danger" data-action="delete-product" data-id="${esc(p.id)}" ${canDel ? "" : 'disabled title="Réservé aux administrateurs"'} aria-label="Supprimer ${esc(p.name)}">${icon("trash")}</button>`;
    const avail = (p) => switchHTML(p.available, `data-action="toggle-available" data-id="${esc(p.id)}" ${canStock ? "" : "disabled"}`, `${p.name} disponible`);
    const priceHTML = (p) => p.discount ? `<span class="price"><s>${esc(money(p.price))}</s>${esc(money(p.price * (1 - p.discount / 100)))}</span>` : `<span class="price">${esc(money(p.price))}</span>`;
    if (ui.menu.view === "table") {
      return `<div class="table-wrap"><table class="tbl stack"><thead><tr><th>Produit</th><th>Catégorie</th><th class="right">Prix</th><th>Visibilité</th><th>Disponible</th><th></th></tr></thead><tbody>${list.map((p) => `<tr><td class="cell-first"><div class="cell-with-thumb">${productImg(p, "thumb")}<div class="cell-main"><b>${esc(p.name)}</b><small>${p.sizes.length} taille(s) · ${p.extras.length} supplément(s)</small></div></div></td><td data-label="Catégorie">${esc(catName(p.category))}</td><td data-label="Prix" class="right num">${priceHTML(p)}</td><td data-label="Visibilité">${p.visible ? '<span class="pill green">Visible</span>' : '<span class="pill grey">Masqué</span>'}</td><td data-label="Disponible">${avail(p)}</td><td data-label=""><div class="actions">${canEdit ? `<button class="btn btn-sm" data-action="edit-product" data-id="${esc(p.id)}">${icon("edit")} Modifier</button>` : ""}${canDel ? del(p) : ""}</div></td></tr>`).join("")}</tbody></table></div>`;
    }
    return `<div class="product-grid">${list.map((p) => `<article class="product-card ${p.available ? "" : "off"}"><div class="product-img">${productImg(p, "")}${p.available ? '<span class="pill green">Disponible</span>' : '<span class="pill red">Épuisé</span>'}${p.discount ? `<span class="disc">−${p.discount} %</span>` : ""}</div><div class="product-body"><h4>${esc(p.name)}</h4><span class="muted small">${esc(catName(p.category))}${p.visible ? "" : " · masqué"}</span><p>${esc(p.description)}</p></div><div class="product-foot">${priceHTML(p)}<span style="display:flex;gap:6px;align-items:center">${avail(p)}${canEdit ? `<button class="btn btn-sm" data-action="edit-product" data-id="${esc(p.id)}" aria-label="Modifier ${esc(p.name)}">${icon("edit")}</button>` : ""}${canDel ? del(p) : ""}</span></div></article>`).join("")}</div>`;
  }

  function menuPage() {
    const chip = (id, label) => `<button class="chip ${ui.menu.cat === id ? "active" : ""}" data-action="set-filter" data-filter="menu.cat" data-value="${esc(id)}">${esc(label)}</button>`;
    const canEdit = Store.can("menuWrite");
    return `<div class="page-head"><div><h2>Carte & produits</h2><p>${S().products.length} produits · ${S().categories.length} catégories</p></div><div class="head-actions">${canEdit ? `<button class="btn" data-action="manage-categories">${icon("tag")} Catégories</button><button class="btn-gold" data-action="new-product">${icon("plus")} Nouveau produit</button>` : ""}</div></div>
      <div class="toolbar">${searchBox("menu", "q", "Rechercher un produit…", "Rechercher un produit")}<div class="chips">${chip("all", "Tout")}${S().categories.map((c) => chip(c.id, c.name)).join("")}</div>
      <div class="view-toggle" role="group" aria-label="Affichage"><button class="${ui.menu.view === "grid" ? "active" : ""}" data-action="set-filter" data-filter="menu.view" data-value="grid" aria-label="Grille" aria-pressed="${ui.menu.view === "grid"}">${icon("grid")}</button><button class="${ui.menu.view === "table" ? "active" : ""}" data-action="set-filter" data-filter="menu.view" data-value="table" aria-label="Tableau" aria-pressed="${ui.menu.view === "table"}">${icon("menu")}</button></div></div>
      <div data-results>${menuResults()}</div>`;
  }

  const sizeRow = (s = { name: "", delta: "" }) => `<div class="repeat-row" data-row="size"><input class="input" name="size-name" value="${esc(s.name)}" placeholder="Taille (ex. Double)" aria-label="Nom de la taille"><input class="input" name="size-delta" type="number" step="0.5" value="${esc(s.delta)}" placeholder="+ MAD" aria-label="Supplément de prix"><button type="button" class="icon-button" data-action="remove-row" aria-label="Retirer la taille">${icon("close")}</button></div>`;
  const extraRow = (s = { name: "", price: "" }) => `<div class="repeat-row" data-row="extra"><input class="input" name="extra-name" value="${esc(s.name)}" placeholder="Supplément (ex. Cheddar)" aria-label="Nom du supplément"><input class="input" name="extra-price" type="number" step="0.5" min="0" value="${esc(s.price)}" placeholder="MAD" aria-label="Prix du supplément"><button type="button" class="icon-button" data-action="remove-row" aria-label="Retirer le supplément">${icon("close")}</button></div>`;

  function productDrawer(d) {
    const p = d.id ? Store.byId(S().products, d.id) : { name: "", category: S().categories[0] ? S().categories[0].id : "", price: "", dinePrice: "", discount: 0, description: "", image: "", sizes: [], extras: [], visible: true, available: true };
    if (!p) return "";
    const body = `${field("name", "Nom du produit", input("name", p.name, "text", 'maxlength="60"'))}
      <div class="row2">${field("category", "Catégorie", `<select id="f-category" name="category">${S().categories.map((c) => `<option value="${esc(c.id)}" ${c.id === p.category ? "selected" : ""}>${esc(c.name)}</option>`).join("")}</select>`)}${field("price", "Prix app (MAD)", input("price", p.price, "number", 'step="0.5" min="0" inputmode="decimal"'))}</div>
      ${field("dinePrice", "Prix sur place (MAD)", input("dinePrice", p.dinePrice ?? p.price, "number", 'step="0.5" min="0" inputmode="decimal"'))}
      <div class="row2">${field("discount", "Remise (%)", input("discount", p.discount, "number", 'step="1" min="0" max="90"'))}<div class="field"><span class="label">Statut</span><label style="display:flex;gap:8px;align-items:center;min-height:42px"><input type="checkbox" name="visible" ${p.visible ? "checked" : ""}> Visible dans l'application</label></div></div>
      ${field("description", "Description", `<textarea id="f-description" name="description" maxlength="240">${esc(p.description)}</textarea>`)}
      ${field("image", "URL de l'image", input("image", p.image, "url", 'placeholder="https://…"'))}
      <div class="field" data-field="sizes"><span class="label">Tailles (supplément de prix)</span><div data-rows="size">${p.sizes.map(sizeRow).join("")}</div><button type="button" class="btn btn-sm" data-action="add-size" style="justify-self:start">${icon("plus")} Ajouter une taille</button></div>
      <div class="field" data-field="extras"><span class="label">Suppléments</span><div data-rows="extra">${p.extras.map(extraRow).join("")}</div><button type="button" class="btn btn-sm" data-action="add-extra" style="justify-self:start">${icon("plus")} Ajouter un supplément</button></div>
      <label style="display:flex;gap:8px;align-items:center"><input type="checkbox" name="available" ${p.available ? "checked" : ""}> Disponible (décocher = épuisé)</label>`;
    const foot = `<button type="button" class="btn" data-action="close-drawer">Annuler</button><button type="submit" class="btn-gold">${icon("check")} Enregistrer</button>`;
    return drawerShell({ title: d.id ? "Modifier le produit" : "Nouveau produit", sub: d.id ? p.name : "", body, foot, form: "product", id: d.id });
  }

  function categoriesDrawer() {
    const canEdit = Store.can("menuWrite");
    const canDelete = Store.can("deleteProduct");
    const body = `<div class="card"><form data-form="category-add" novalidate><div class="field" data-field="name"><label for="f-cat-new">Nouvelle catégorie</label><div style="display:flex;gap:8px"><input id="f-cat-new" class="input" name="name" maxlength="30" placeholder="Ex. Desserts"><button class="btn-gold" type="submit">${icon("plus")} Ajouter</button></div></div></form></div>
      <div class="card">${S().categories.map((c) => {
        const count = S().products.filter((p) => p.category === c.id).length;
        return ui.catEdit === c.id
          ? `<form class="cat-row" data-form="category-edit" data-id="${esc(c.id)}" novalidate><div class="field" data-field="name" style="flex:1;margin:0"><input class="input" name="name" value="${esc(c.name)}" maxlength="30" aria-label="Nom de la catégorie"></div><span style="display:flex;gap:6px"><button class="btn btn-sm btn-gold" type="submit">Enregistrer</button><button class="btn btn-sm" type="button" data-action="cat-cancel">Annuler</button></span></form>`
          : `<div class="cat-row"><span><b>${esc(c.name)}</b> <span class="muted small">· ${count} produit(s)</span></span><span style="display:flex;gap:6px">${canEdit ? `<button class="btn btn-sm" data-action="cat-edit" data-id="${esc(c.id)}">Renommer</button>` : ""}${canDelete ? `<button class="btn btn-sm btn-ghost-danger" data-action="cat-delete" data-id="${esc(c.id)}" aria-label="Supprimer ${esc(c.name)}">${icon("trash")}</button>` : ""}</span></div>`;
      }).join("")}</div>`;
    return drawerShell({ title: "Catégories", sub: "Gérer les catégories du menu", body, foot: `<button class="btn" data-action="close-drawer">Fermer</button>` });
  }

  /* ---------- Couriers ---------- */
  const courierPill = (c) => ({ online: '<span class="pill green">En ligne</span>', mission: '<span class="pill teal">En mission</span>', offline: '<span class="pill grey">Hors ligne</span>', inactif: '<span class="pill red">Désactivé</span>' }[Store.courierStatus(c)]);

  function couriersResults() {
    const q = ui.couriers.q.trim().toLowerCase();
    const canManage = Store.can("couriersWrite");
    const list = S().couriers.filter((c) => !q || `${c.name} ${c.phone} ${c.vehicle}`.toLowerCase().includes(q));
    if (!list.length) return `<div class="card">${emptyState("bike", "Aucun livreur")}</div>`;
    return `<div class="table-wrap"><table class="tbl stack"><thead><tr><th>Livreur</th><th>Téléphone</th><th>Statut</th><th class="right">Livraisons auj.</th><th class="right">Espèces détenues</th><th></th></tr></thead><tbody>${list.map((c) => `<tr><td class="cell-first"><div class="cell-with-thumb"><span class="avatar">${esc(initials(c.name))}</span><div class="cell-main"><b>${esc(c.name)}</b><small>${esc(c.vehicle)}</small></div></div></td><td data-label="Téléphone" class="nowrap">${esc(c.phone)}</td><td data-label="Statut">${courierPill(c)}</td><td data-label="Livraisons auj." class="right num">${Store.courierToday(c)}</td><td data-label="Espèces" class="right num">${esc(money(c.cashHeld))}</td><td data-label=""><div class="actions"><button class="btn btn-sm" data-action="open-courier" data-id="${esc(c.id)}">Détails</button>${canManage ? `<button class="btn btn-sm ${c.active ? "btn-ghost-danger" : ""}" data-action="toggle-courier" data-id="${esc(c.id)}">${c.active ? "Désactiver" : "Activer"}</button>` : ""}</div></td></tr>`).join("")}</tbody></table></div>`;
  }

  function couriersPage() {
    return `<div class="page-head"><div><h2>Équipe de livraison</h2><p>Les comptes livreurs et personnel sont créés ici ; les clients s'inscrivent dans l'application.</p></div><div class="head-actions">${Store.can("couriersWrite") ? `<button class="btn-gold" data-action="new-courier">${icon("plus")} Nouveau livreur</button>` : ""}</div></div>
      <div class="toolbar">${searchBox("couriers", "q", "Rechercher un livreur…", "Rechercher un livreur")}</div><div data-results>${couriersResults()}</div>`;
  }

  function courierDrawer(d) {
    const c = Store.byId(S().couriers, d.id);
    if (!c) return "";
    const recent = S().orders.filter((o) => o.courierId === c.id).sort((a, b) => b.createdAt - a.createdAt).slice(0, 8);
    const canManage = Store.can("couriersWrite");
    const canDelete = Store.can("users");
    const body = `<div class="card"><dl class="kv"><dt>Statut</dt><dd>${courierPill(c)}</dd><dt>Téléphone</dt><dd>${esc(c.phone)}</dd><dt>Véhicule</dt><dd>${esc(c.vehicle)}</dd><dt>Livraisons auj.</dt><dd>${Store.courierToday(c)}</dd><dt>Code PIN</dt><dd>${c.pinTemp ? '<span class="pill orange">PIN temporaire</span> à changer à la première connexion' : "Personnalisé (masqué)"}</dd></dl></div>
      <div class="card"><div class="stat-line"><span>Espèces détenues</span><b class="num">${esc(money(c.cashHeld))}</b></div><div style="display:flex;flex-wrap:wrap;gap:8px;margin-top:10px">${canManage ? `<button class="btn btn-sm" data-action="settle-cash" data-id="${esc(c.id)}" ${c.cashHeld > 0 ? "" : "disabled"}>${icon("cash")} Caisse remise</button><button class="btn btn-sm" data-action="reset-pin" data-id="${esc(c.id)}">${icon("key")} Réinitialiser le PIN</button><button class="btn btn-sm" data-action="edit-courier" data-id="${esc(c.id)}">${icon("edit")} Modifier</button><button class="btn btn-sm ${c.active ? "btn-ghost-danger" : ""}" data-action="toggle-courier" data-id="${esc(c.id)}">${c.active ? "Désactiver" : "Activer"}</button>` : ""}${canDelete ? `<button class="btn btn-sm btn-ghost-danger" data-action="delete-courier" data-id="${esc(c.id)}">${icon("trash")} Supprimer</button>` : ""}</div>${c.active ? "" : '<p class="hint" style="margin-top:8px">Compte désactivé : le livreur ne peut plus se connecter.</p>'}</div>
      <div class="card"><h3 class="small muted" style="margin-bottom:8px">LIVRAISONS RÉCENTES</h3>${recent.length ? `<ul class="list">${recent.map((o) => `<li class="btn-li"><button class="pop-item" data-action="open-order" data-id="${esc(o.id)}"><span style="flex:1"><b>${esc(o.id)}</b> · ${esc(o.customerName)}<small class="muted" style="display:block">${esc(fmtDT(o.createdAt))}</small></span><span class="num">${esc(money(o.total))}</span>${statusPill(o.status)}</button></li>`).join("")}</ul>` : `<p class="muted">Aucune livraison.</p>`}</div>`;
    return drawerShell({ title: c.name, sub: c.vehicle, body, foot: `<button class="btn" data-action="close-drawer">Fermer</button>` });
  }

  function newCourierDrawer() {
    const body = `<p class="hint" style="margin-bottom:14px">Le livreur utilisera ce PIN temporaire lors de sa première connexion, puis le personnalisera.</p>
      ${field("name", "Nom complet", input("name", "", "text", 'maxlength="50"'))}${field("phone", "Téléphone", input("phone", "", "tel", 'placeholder="06 00 00 00 00" inputmode="tel"'))}${field("vehicle", "Véhicule", input("vehicle", "", "text", 'placeholder="Ex. Moto Yamaha"'))}
      ${field("pin", "PIN temporaire (4 chiffres)", input("pin", String(Math.floor(1000 + Math.random() * 9000)), "text", 'inputmode="numeric" maxlength="4"'))}`;
    return drawerShell({ title: "Nouveau livreur", body, foot: `<button type="button" class="btn" data-action="close-drawer">Annuler</button><button type="submit" class="btn-gold">${icon("check")} Créer le livreur</button>`, form: "courier-new" });
  }

  function editCourierDrawer(d) {
    const c = Store.byId(S().couriers, d.id);
    if (!c) return "";
    const body = `${field("name", "Nom complet", input("name", c.name, "text", 'maxlength="50"'))}${field("phone", "Téléphone", input("phone", c.phone, "tel"))}${field("vehicle", "Véhicule", input("vehicle", c.vehicle, "text", 'maxlength="40"'))}`;
    return drawerShell({ title: "Modifier le livreur", sub: c.name, body, foot: `<button type="button" class="btn" data-action="close-drawer">Annuler</button><button type="submit" class="btn-gold">${icon("check")} Enregistrer</button>`, form: "courier-edit", id: c.id });
  }

  /* ---------- Customers ---------- */
  function customersResults() {
    const f = ui.customers; const q = f.q.trim().toLowerCase();
    const list = S().customers.filter((c) => (f.blocked === "all" || c.blocked) && (!q || `${c.name} ${c.phone} ${c.email}`.toLowerCase().includes(q)));
    const p = paginate(list, "customers");
    if (!p.total) return `<div class="card">${emptyState("users", "Aucun client")}</div>`;
    return `<div class="table-wrap"><table class="tbl stack"><thead><tr><th>Client</th><th>Téléphone</th><th class="right">Commandes</th><th class="right">Total dépensé</th><th class="right">Points</th><th>Dernière commande</th><th>Statut</th><th></th></tr></thead><tbody>${p.slice.map((c) => { const st = Store.customerStats(c); return `<tr><td class="cell-first"><div class="cell-main"><b>${esc(c.name)}</b><small>${esc(c.email)}</small></div></td><td data-label="Téléphone" class="nowrap">${esc(c.phone)}</td><td data-label="Commandes" class="right num">${st.count}</td><td data-label="Total" class="right num">${esc(money(st.spent))}</td><td data-label="Points" class="right num">${c.points}</td><td data-label="Dernière" class="nowrap">${st.last ? esc(fmtDT(st.last)) : "—"}</td><td data-label="Statut">${c.blocked ? '<span class="pill red">Bloqué</span>' : '<span class="pill green">Actif</span>'}</td><td data-label=""><div class="actions"><button class="btn btn-sm" data-action="open-customer" data-id="${esc(c.id)}">Détails</button><button class="btn btn-sm ${c.blocked ? "" : "btn-ghost-danger"}" data-action="toggle-blocked" data-id="${esc(c.id)}">${c.blocked ? "Débloquer" : "Bloquer"}</button></div></td></tr>`; }).join("")}</tbody></table></div>${pagerHTML("customers", p)}`;
  }

  function customersPage() {
    return `<div class="toolbar">${searchBox("customers", "q", "Nom, téléphone, e-mail…", "Rechercher un client")}<select class="select" data-filter="customers.blocked" aria-label="Filtrer les clients"><option value="all" ${ui.customers.blocked === "all" ? "selected" : ""}>Tous les clients</option><option value="blocked" ${ui.customers.blocked === "blocked" ? "selected" : ""}>Clients bloqués</option></select></div><div data-results>${customersResults()}</div>`;
  }

  function customerDrawer(d) {
    const c = Store.byId(S().customers, d.id);
    if (!c) return "";
    const st = Store.customerStats(c);
    const orders = st.orders.sort((a, b) => b.createdAt - a.createdAt);
    const body = `<div class="card"><dl class="kv"><dt>Statut</dt><dd>${c.blocked ? '<span class="pill red">Bloqué</span>' : '<span class="pill green">Actif</span>'}</dd><dt>Téléphone</dt><dd>${esc(c.phone)}</dd><dt>E-mail</dt><dd>${esc(c.email)}</dd><dt>Commandes</dt><dd>${st.count}</dd><dt>Total dépensé</dt><dd>${esc(money(st.spent))}</dd><dt>Points fidélité</dt><dd>${c.points}</dd></dl></div>
      <div class="card"><h3 class="small muted" style="margin-bottom:8px">COMMANDES</h3>${orders.length ? `<ul class="list">${orders.slice(0, 12).map((o) => `<li class="btn-li"><button class="pop-item" data-action="open-order" data-id="${esc(o.id)}"><span style="flex:1"><b>${esc(o.id)}</b><small class="muted" style="display:block">${esc(fmtDT(o.createdAt))}</small></span><span class="num">${esc(money(o.total))}</span>${statusPill(o.status)}</button></li>`).join("")}</ul>` : `<p class="muted">Aucune commande.</p>`}</div>`;
    const foot = `<button class="btn" data-action="close-drawer">Fermer</button><button class="btn ${c.blocked ? "" : "btn-ghost-danger"}" data-action="toggle-blocked" data-id="${esc(c.id)}">${c.blocked ? "Débloquer" : "Bloquer"} le client</button>`;
    return drawerShell({ title: c.name, sub: c.email, body, foot });
  }

  /* ---------- Zones ---------- */
  function zonesPage() {
    const canWrite = Store.can("zones");
    const canDelete = Store.can("settings");
    return `<div class="page-head"><div><h2>Zones de livraison</h2><p>Frais, minimum de commande, délais et seuil de livraison offerte.</p></div></div>
      <div class="grid grid-3">${S().zones.map((z) => `<form class="card zone-card ${z.enabled ? "" : "disabled"}" data-form="zone" data-id="${esc(z.id)}" novalidate><div class="zone-head"><h3>${esc(z.name)}</h3><span style="display:flex;align-items:center;gap:8px"><span class="small muted">${z.enabled ? "Active" : "Désactivée"}</span>${switchHTML(z.enabled, `data-action="toggle-zone" data-id="${esc(z.id)}" ${canWrite ? "" : "disabled"}`, `Zone ${z.name} active`)}</span></div>
        <div class="row2">${field("fee", "Frais (MAD)", input("fee", z.fee, "number", `min="0" step="0.5" ${canWrite ? "" : "disabled"}`))}${field("min", "Minimum (MAD)", input("min", z.min, "number", `min="0" step="1" ${canWrite ? "" : "disabled"}`))}</div>
        <div class="row2">${field("etaMin", "ETA min (min)", input("etaMin", z.etaMin, "number", `min="1" step="1" ${canWrite ? "" : "disabled"}`))}${field("etaMax", "ETA max (min)", input("etaMax", z.etaMax, "number", `min="1" step="1" ${canWrite ? "" : "disabled"}`))}</div>
        ${field("freeFrom", "Livraison offerte dès (MAD)", input("freeFrom", z.freeFrom, "number", `min="0" step="1" ${canWrite ? "" : "disabled"}`))}
        <div class="head-actions">${canWrite ? `<button class="btn-gold full" type="submit">Enregistrer</button>` : ""}${canDelete ? `<button type="button" class="btn btn-ghost-danger" data-action="delete-zone" data-id="${esc(z.id)}">Supprimer</button>` : ""}</div></form>`).join("")}</div>`;
  }

  /* ---------- Promotions ---------- */
  function promosPage() {
    const ps = S().promos;
    const rows = ps.map((p) => { const expired = p.expiry && p.expiry < todayISO(); return `<tr><td class="cell-first"><b>${esc(p.code)}</b>${expired ? ' <span class="pill grey">Expiré</span>' : ""}</td><td data-label="Remise">${p.type === "pct" ? `${p.value} %` : esc(money(p.value))}</td><td data-label="Min. commande" class="num">${esc(money(p.min))}</td><td data-label="Expiration" class="nowrap">${esc(p.expiry || "—")}</td><td data-label="Utilisations" class="num">${p.uses}</td><td data-label="Actif">${switchHTML(p.active, `data-action="toggle-promo" data-id="${esc(p.id)}"`, `Code ${p.code} actif`)}</td><td data-label=""><div class="actions"><button class="btn btn-sm" data-action="edit-promo" data-id="${esc(p.id)}">${icon("edit")} Modifier</button><button class="btn btn-sm btn-ghost-danger" data-action="delete-promo" data-id="${esc(p.id)}">${icon("trash")} Supprimer</button></div></td></tr>`; }).join("");
    return `<div class="page-head"><div><h2>Codes promo</h2><p>${ps.filter((p) => p.active).length} code(s) actif(s)</p></div><div class="head-actions"><button class="btn-gold" data-action="new-promo">${icon("plus")} Nouveau code</button></div></div>
      ${ps.length ? `<div class="table-wrap"><table class="tbl stack"><thead><tr><th>Code</th><th>Remise</th><th>Min. commande</th><th>Expiration</th><th>Utilisations</th><th>Actif</th><th></th></tr></thead><tbody>${rows}</tbody></table></div>` : `<div class="card">${emptyState("tag", "Aucun code promo")}</div>`}`;
  }

  function promoDrawer(d) {
    const p = d.id ? Store.byId(S().promos, d.id) : { code: "", type: "pct", value: "", min: 0, expiry: new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10), active: true };
    if (!p) return "";
    const body = `${field("code", "Code", input("code", p.code, "text", 'maxlength="20" style="text-transform:uppercase"'))}
      <div class="row2">${field("type", "Type", `<select id="f-type" name="type"><option value="pct" ${p.type === "pct" ? "selected" : ""}>Pourcentage (%)</option><option value="mad" ${p.type === "mad" ? "selected" : ""}>Montant fixe (MAD)</option></select>`)}${field("value", "Valeur", input("value", p.value, "number", 'min="0" step="0.5"'))}</div>
      <div class="row2">${field("min", "Commande minimum (MAD)", input("min", p.min, "number", 'min="0" step="1"'))}${field("expiry", "Date d'expiration", input("expiry", p.expiry, "date"))}</div>
      <label style="display:flex;gap:8px;align-items:center"><input type="checkbox" name="active" ${p.active ? "checked" : ""}> Code actif</label>`;
    return drawerShell({ title: d.id ? "Modifier le code" : "Nouveau code promo", sub: d.id ? `${p.uses} utilisation(s)` : "", body, foot: `<button type="button" class="btn" data-action="close-drawer">Annuler</button><button type="submit" class="btn-gold">${icon("check")} Enregistrer</button>`, form: "promo", id: d.id });
  }

  /* ---------- Users ---------- */
  function usersPage() {
    const me = Store.currentUser();
    const floor = ["cashier", "waiter", "chef"];
    const rows = S().users.map((u) => `<tr><td class="cell-first"><div class="cell-with-thumb"><span class="avatar">${esc(initials(u.name))}</span><div class="cell-main"><b>${esc(u.name)}</b><small>${esc(u.email || "")}</small></div></div></td><td data-label="Rôle">${roleBadge(u.role)}</td><td data-label="Code">${floor.includes(u.role) ? `<b class="num">${esc(u.loginCode || "—")}</b>` : '<span class="muted">—</span>'}</td><td data-label="Statut">${u.active ? '<span class="pill green">Actif</span>' : '<span class="pill grey">Désactivé</span>'}</td><td data-label=""><div class="actions">${u.role === "owner" ? '<span class="muted small">Compte propriétaire</span>' : `${floor.includes(u.role) ? `<button class="btn btn-sm" data-action="reset-staff-code" data-id="${esc(u.id)}">${icon("key")} Code</button>` : ""}<button class="btn btn-sm" data-action="edit-user" data-id="${esc(u.id)}">${icon("edit")} Modifier</button><button class="btn btn-sm ${u.active ? "btn-ghost-danger" : ""}" data-action="toggle-staff" data-id="${esc(u.id)}" ${u.id === me.id ? 'disabled title="Votre propre compte"' : ""}>${u.active ? "Désactiver" : "Activer"}</button>${u.id === me.id ? "" : `<button class="btn btn-sm btn-ghost-danger" data-action="delete-user" data-id="${esc(u.id)}">${icon("trash")} Supprimer</button>`}`}</div></td></tr>`).join("");
    const matrix = `<div class="matrix-wrap"><table class="matrix"><thead><tr><th scope="col">Capacité</th>${ROLES.map((r) => `<th scope="col">${esc(r.label)}</th>`).join("")}</tr></thead><tbody>${PERMISSION_MATRIX.map((row) => `<tr><td>${esc(row.label)}</td>${ROLES.map((r) => row.roles.includes(r.id) ? `<td class="yes" aria-label="Oui">✓</td>` : `<td class="no" aria-label="Non">–</td>`).join("")}</tr>`).join("")}</tbody></table></div>`;
    return `<div class="page-head"><div><h2>Comptes du personnel</h2><p>Les comptes livreurs et personnel sont créés ici ; les clients s'inscrivent dans l'application.</p></div><div class="head-actions"><button class="btn-gold" data-action="new-user">${icon("plus")} Nouvel utilisateur</button></div></div>
      <div class="table-wrap" style="margin-bottom:16px"><table class="tbl stack"><thead><tr><th>Utilisateur</th><th>Rôle</th><th>Code</th><th>Statut</th><th></th></tr></thead><tbody>${rows}</tbody></table></div>
      <div class="card"><div class="card-head"><h3>Rôles et permissions</h3><small>Les autorisations sont appliquées par l'API pour les rôles du personnel.</small></div>${matrix}</div>`;
  }

  function userDrawer(d) {
    const u = d.id ? Store.byId(S().users, d.id) : { name: "", email: "", role: "cashier", active: true };
    if (!u) return "";
    const self = d.id && u.id === Store.currentUser().id;
    const body = `${field("name", "Nom complet", input("name", u.name, "text", 'maxlength="50"'))}${field("email", "E-mail", input("email", u.email, "email", 'autocomplete="off"'))}
      ${field("role", "Rôle", `<select id="f-role" name="role" ${self ? "disabled" : ""}>${STAFF_ROLES.map((r) => `<option value="${r}" ${r === u.role ? "selected" : ""}>${esc(roleLabel(r))}</option>`).join("")}</select>`, self ? "Vous ne pouvez pas modifier votre propre rôle." : "")}
      ${self ? '<p class="hint">Utilisez « Modifier le mot de passe » dans votre menu de compte pour changer votre mot de passe.</p>' : field("password", d.id ? "Nouveau mot de passe" : "Mot de passe", input("password", "", "password", 'autocomplete="new-password"'), d.id ? "Laisser vide pour conserver l'actuel." : "8 caractères minimum.")}
      <label style="display:flex;gap:8px;align-items:center"><input type="checkbox" name="active" ${u.active ? "checked" : ""} ${self ? "disabled" : ""}> Compte actif</label>`;
    return drawerShell({ title: d.id ? "Modifier l'utilisateur" : "Nouvel utilisateur", sub: d.id ? u.email : "", body, foot: `<button type="button" class="btn" data-action="close-drawer">Annuler</button><button type="submit" class="btn-gold">${icon("check")} Enregistrer</button>`, form: "user", id: d.id });
  }

  /* ---------- Settings ---------- */
  function printerCard() {
    const prefs = Store.printerPrefs();
    const printer = typeof GKPrinter !== "undefined" ? GKPrinter : null;
    const connected = !!printer?.connected();
    const bleOk = !!printer?.bleSupported();
    const serialOk = !!printer?.serialSupported();
    const where = printer?.platform?.() || { iOS: false, android: false, desktop: true };
    const status = !printer
      ? "Module d'impression indisponible."
      : connected
        ? `Connectée : ${esc(printer.name())}`
        : where.iOS
          ? "iPhone / iPad : Apple n'autorise pas le Bluetooth dans le navigateur. Le ticket s'ouvre en aperçu (AirPrint). Pour une imprimante thermique G&K, utilisez Chrome sur Android ou un PC."
          : where.android
            ? "Android : ouvrez Admin dans Chrome. Allumez le Bluetooth, acceptez Localisation / Appareils à proximité, puis Bluetooth (BLE)."
            : bleOk
              ? "PC : Bluetooth (BLE) ouvre le sélecteur Chrome. Port série = imprimante déjà couplée dans Windows (COM / USB)."
              : "Bluetooth web indisponible. Chrome ou Edge, en https.";
    const seg = (action, value, label, current) => `<button type="button" class="btn btn-sm ${String(current) === String(value) ? "btn-dark" : ""}" data-action="${action}" data-${action}="${value}">${label}</button>`;
    return `<div class="card" style="margin-bottom:16px"><div class="card-head"><h3>Imprimante Bluetooth</h3></div>
      <p class="hint" style="margin-bottom:12px">${status}</p>
      <div class="head-actions" style="margin-bottom:14px">
        ${where.iOS || !printer ? "" : `<button type="button" class="btn-gold" data-action="printer-connect">${icon("bluetooth")} Bluetooth (BLE)</button>`}
        ${serialOk ? `<button type="button" class="btn" data-action="printer-serial">${icon("printer")} Port série USB / COM</button>` : ""}
        ${connected ? `<button type="button" class="btn" data-action="printer-disconnect">Déconnecter</button>` : ""}
        <button type="button" class="btn" data-action="printer-test">${icon("printer")} ${where.iOS ? "Aperçu / AirPrint" : "Ticket de test"}</button>
      </div>
      <div class="setting-row"><div><b>Largeur du papier</b><span class="hint">58 mm ou 80 mm, comme en cuisine.</span></div><div class="head-actions">${seg("paper", 58, "58 mm", prefs.paper)}${seg("paper", 80, "80 mm", prefs.paper)}</div></div>
      ${serialOk ? `<div class="setting-row"><div><b>Vitesse port série</b><span class="hint">Doit correspondre à l'imprimante.</span></div><div class="head-actions">${[9600, 19200, 115200].map((baud) => seg("baud", baud, String(baud), prefs.baud)).join("")}</div></div>` : ""}
    </div>`;
  }

  function settingsPage() {
    const s = S().settings; const r = s.restaurant;
    const canWrite = Store.can("settings");
    const canOperate = Store.can("settingsOps");
    const row = (title, hint, ctl) => `<div class="setting-row"><div><b>${title}</b><span class="hint">${hint}</span></div>${ctl}</div>`;
    return `${printerCard()}<div class="grid grid-even">
      <form class="card" data-form="restaurant" novalidate><div class="card-head"><h3>Restaurant</h3></div>${field("name", "Nom", input("name", r.name, "text", canWrite ? "" : "disabled"))}${field("phone", "Téléphone", input("phone", r.phone, "tel", canWrite ? "" : "disabled"))}${field("email", "E-mail", input("email", r.email, "email", canWrite ? "" : "disabled"))}${field("address", "Adresse", input("address", r.address, "text", canWrite ? "" : "disabled"))}${canWrite ? `<button class="btn-gold" type="submit">Enregistrer</button>` : ""}</form>
      <div class="card"><div class="card-head"><h3>Service</h3></div>
        ${row("Livraison", "Désactivée : seules les commandes à emporter sont possibles.", switchHTML(s.deliveryOn, `data-action="toggle-setting" data-key="deliveryOn" ${canWrite ? "" : "disabled"}`, "Livraison activée"))}
        ${row("Pause des commandes", "Activée : l'application n'accepte plus de nouvelles commandes.", switchHTML(!s.acceptingOrders, `data-action="toggle-setting" data-key="pause" ${canOperate ? "" : "disabled"}`, "Pause des commandes"))}
        <div class="card-head" style="margin-top:18px"><h3>Notifications</h3></div>
        ${row("Nouvelle commande", "Badge et alerte à chaque commande entrante.", switchHTML(s.notif.newOrder, `data-action="toggle-setting" data-key="notif.newOrder" ${canWrite ? "" : "disabled"}`, "Notification nouvelle commande"))}
        ${row("Commande sans livreur", "Alerte après 5 minutes sans livreur assigné.", switchHTML(s.notif.unassigned, `data-action="toggle-setting" data-key="notif.unassigned" ${canWrite ? "" : "disabled"}`, "Notification commande sans livreur"))}
        ${row("Produit épuisé", "Rappel lorsqu'un produit est marqué épuisé.", switchHTML(s.notif.lowStock, `data-action="toggle-setting" data-key="notif.lowStock" ${canWrite ? "" : "disabled"}`, "Notification produit épuisé"))}
        ${row("Rapport quotidien", "Résumé des ventes envoyé chaque soir.", switchHTML(s.notif.dailyReport, `data-action="toggle-setting" data-key="notif.dailyReport" ${canWrite ? "" : "disabled"}`, "Rapport quotidien"))}</div></div>
      <div class="grid grid-even" style="margin-bottom:16px">
        <form class="card" data-form="operations" novalidate><div class="card-head"><h3>Préparation et dispatch</h3></div>${field("dispatchMode", "Affectation des livreurs", `<select name="dispatchMode" id="f-dispatchMode" ${canOperate ? "" : "disabled"}><option value="rotation" ${s.dispatchMode === "rotation" ? "selected" : ""}>Rotation</option><option value="proximity" ${s.dispatchMode === "proximity" ? "selected" : ""}>Proximité</option></select>`)}${field("defaultPrep", "Préparation par défaut (minutes)", input("defaultPrep", s.defaultPrep, "number", `min="5" max="90" step="1" ${canOperate ? "" : "disabled"}`))}${canOperate ? `<button class="btn-gold" type="submit">Enregistrer</button>` : ""}</form>
        ${canWrite ? `<form class="card" data-form="free-delivery" novalidate><div class="card-head"><h3>Livraison</h3></div>${field("freeDelivery", "Seuil global de livraison offerte (MAD)", input("freeDelivery", s.freeDelivery, "number", 'min="0" step="1"'))}<button class="btn-gold" type="submit">Enregistrer</button></form>` : `<div></div>`}
      </div>
      <form class="card" data-form="hours" novalidate style="margin-bottom:16px"><div class="card-head"><h3>Horaires d'ouverture</h3></div>${DAYS.map((d) => { const h = s.hours[d.id]; return `<div class="field" data-field="${d.id}"><div style="display:grid;grid-template-columns:minmax(80px,1fr) auto auto auto;gap:8px;align-items:center"><b>${d.label}</b><label class="small" style="display:flex;gap:5px;align-items:center"><input type="checkbox" name="closed-${d.id}" ${h.closed ? "checked" : ""} ${canWrite ? "" : "disabled"}> Fermé</label><input class="input" style="min-height:38px;width:100px" type="time" name="open-${d.id}" value="${esc(h.open)}" aria-label="${d.label} ouverture" ${canWrite ? "" : "disabled"}><input class="input" style="min-height:38px;width:100px" type="time" name="close-${d.id}" value="${esc(h.close)}" aria-label="${d.label} fermeture" ${canWrite ? "" : "disabled"}></div></div>`; }).join("")}${canWrite ? `<button class="btn-gold" type="submit">Enregistrer les horaires</button>` : ""}</form>`;
  }

  /* ---------- Activity ---------- */
  function activityResults() {
    let list = S().audit;
    if (ui.activity.user !== "all") list = list.filter((a) => a.user === ui.activity.user);
    if (!list.length) return `<div class="card">${emptyState("activity", "Aucune activité")}</div>`;
    return `<div class="card">${list.slice(0, 100).map(logItem).join("")}</div>`;
  }
  function activityPage() {
    const users = [...new Set(S().audit.map((a) => a.user))];
    return `<div class="toolbar"><select class="select" data-filter="activity.user" aria-label="Filtrer par utilisateur"><option value="all">Tous les utilisateurs</option>${users.map((u) => `<option value="${esc(u)}" ${ui.activity.user === u ? "selected" : ""}>${esc(u)}</option>`).join("")}</select></div><div data-results>${activityResults()}</div>`;
  }

  pages = {
    dashboard: { render: dashboardPage }, commandes: { render: ordersPage, results: ordersResults },
    factures: { render: invoicesPage, results: invoicesResults }, carte: { render: mapPage },
    menu: { render: menuPage, results: menuResults }, livreurs: { render: couriersPage, results: couriersResults },
    clients: { render: customersPage, results: customersResults }, zones: { render: zonesPage },
    promotions: { render: promosPage }, activite: { render: activityPage, results: activityResults },
    utilisateurs: { render: usersPage }, reglages: { render: settingsPage }
  };

  /* ---------- Drawer ---------- */
  function drawerShell({ title, sub = "", status = "", body, foot = "", form = "", id = "" }) {
    const tag = form ? "form" : "div";
    const attrs = form ? ` data-form="${form}" ${id ? `data-id="${esc(id)}"` : ""} novalidate` : "";
    return `<div class="drawer-overlay"><${tag} class="drawer" role="dialog" aria-modal="true" aria-labelledby="drawer-title"${attrs}><div class="drawer-head"><div><h2 id="drawer-title">${esc(title)}</h2>${sub ? `<small>${esc(sub)}</small>` : ""}</div><span style="display:flex;align-items:center;gap:10px">${status}<button type="button" class="icon-button" data-action="close-drawer" aria-label="Fermer">${icon("close")}</button></span></div><div class="drawer-body">${body}</div>${foot ? `<div class="drawer-foot">${foot}</div>` : ""}</${tag}></div>`;
  }

  const DRAWERS = { order: orderDrawer, product: productDrawer, categories: categoriesDrawer, courier: courierDrawer, "courier-new": newCourierDrawer, "courier-edit": editCourierDrawer, customer: customerDrawer, promo: promoDrawer, user: userDrawer };

  function openDrawer(type, id = "") {
    ui.returnFocus = ui.drawer ? ui.returnFocus : document.activeElement;
    ui.drawer = { type, id }; ui.catEdit = null;
    renderDrawer(); syncScrollLock();
  }
  function closeDrawer() {
    ui.drawer = null; ui.catEdit = null;
    $("#drawer-root").innerHTML = ""; drawerKey = null; syncScrollLock();
    if (ui.returnFocus && document.contains(ui.returnFocus)) ui.returnFocus.focus();
    ui.returnFocus = null;
  }
  function renderDrawer() {
    const d = ui.drawer; const root = $("#drawer-root");
    if (!d) { if (root.firstChild) root.innerHTML = ""; drawerKey = null; return; }
    const old = $(".drawer-body", root); const scroll = old ? old.scrollTop : 0;
    const html = DRAWERS[d.type](d);
    if (!html) { closeDrawer(); return; }
    root.innerHTML = html;
    const key = `${d.type}:${d.id}`;
    const body = $(".drawer-body", root);
    if (key !== drawerKey) { drawerKey = key; (root.querySelector("input:not([type=checkbox]), select, textarea") || root.querySelector(".drawer-head .icon-button")).focus(); }
    else if (body) body.scrollTop = scroll;
  }

  /* ---------- Actions ---------- */
  async function result(promise, okMsg) {
    const r = await promise;
    if (r.ok) { if (okMsg) toast(okMsg); return true; }
    if (r.error) toast(r.error, "error");
    return false;
  }

  function readProduct(form) {
    const rows = (kind) => [...form.querySelectorAll(`[data-row="${kind}"]`)].map((r) => ({ name: r.querySelector("input").value.trim(), v: r.querySelectorAll("input")[1].value })).filter((r) => r.name || String(r.v).trim());
    return {
      name: form.name.value, category: form.category.value, price: num(form.price.value), dinePrice: String(form.dinePrice?.value || "").trim() === "" ? num(form.price.value) : num(form.dinePrice.value), description: form.description.value, image: form.image.value.trim(),
      discount: String(form.discount.value).trim() === "" ? 0 : num(form.discount.value),
      sizes: rows("size").map((r) => ({ name: r.name, delta: String(r.v).trim() === "" ? 0 : num(r.v) })),
      extras: rows("extra").map((r) => ({ name: r.name, price: String(r.v).trim() === "" ? 0 : num(r.v) })),
      visible: form.visible.checked, available: form.available.checked
    };
  }

  const FORMS = {
    async product(form) { const r = await Store.saveProduct(form.dataset.id || null, readProduct(form)); if (!r.ok) { toast(r.error, "error"); return showErrors(form, r.errors); } closeDrawer(); toast(form.dataset.id ? "Produit mis à jour" : "Produit créé"); renderAll(); },
    async "category-add"(form) { const r = await Store.saveCategory(null, form.name.value); if (!r.ok) { toast(r.error, "error"); return showErrors(form, r.errors); } toast("Catégorie ajoutée"); renderDrawer(); },
    async "category-edit"(form) { const r = await Store.saveCategory(form.dataset.id, form.name.value); if (!r.ok) { toast(r.error, "error"); return showErrors(form, r.errors); } ui.catEdit = null; renderAll(); toast("Catégorie renommée"); },
    async "courier-new"(form) {
      const r = await Store.addCourier({ name: form.name.value, phone: form.phone.value, vehicle: form.vehicle.value, pin: form.pin.value.trim() });
      if (!r.ok) { toast(r.error, "error"); return showErrors(form, r.errors); }
      closeDrawer(); renderAll();
      const courier = r.data?.courier;
      if (r.data?.pin) pinModal("Livreur créé", `${courier?.name || form.name.value} peut désormais se connecter.`, r.data.pin);
      else toast("Livreur créé. Le PIN temporaire doit être communiqué au livreur.", "error");
    },
    async "courier-edit"(form) {
      const r = await Store.saveCourier(form.dataset.id, { name: form.name.value, phone: form.phone.value, vehicle: form.vehicle.value });
      if (!r.ok) { toast(r.error, "error"); return showErrors(form, r.errors); }
      closeDrawer(); toast("Livreur mis à jour");
    },
    async zone(form) {
      const r = await Store.saveZone(form.dataset.id, { fee: num(form.fee.value), min: num(form.min.value), etaMin: num(form.etaMin.value), etaMax: num(form.etaMax.value), freeFrom: num(form.freeFrom.value) });
      if (!r.ok) { toast(r.error, "error"); return showErrors(form, r.errors); }
      toast("Zone mise à jour");
    },
    async promo(form) {
      const r = await Store.savePromo(form.dataset.id || null, { code: form.code.value, type: form.type.value, value: num(form.value.value), min: String(form.min.value).trim() === "" ? 0 : num(form.min.value), expiry: form.expiry.value, active: form.active.checked });
      if (!r.ok) { toast(r.error, "error"); return showErrors(form, r.errors); }
      closeDrawer(); toast(form.dataset.id ? "Code mis à jour" : "Code créé"); renderAll();
    },
    async user(form) {
      const self = form.role.disabled;
      const r = await Store.saveUser(form.dataset.id || null, { name: form.name.value, email: form.email.value, role: form.role.value, password: form.password?.value || "", active: self ? true : form.active.checked });
      if (!r.ok) { toast(r.error, "error"); return showErrors(form, r.errors); }
      closeDrawer();
      if (r.data?.code) setTimeout(() => pinModal("Code personnel", `Communiquez ce code à ${form.name.value} pour la caisse ou le serveur.`, r.data.code), 0);
      else toast("Utilisateur enregistré");
      renderAll();
    },
    async restaurant(form) {
      const r = await Store.saveRestaurant({ name: form.name.value, phone: form.phone.value, email: form.email.value, address: form.address.value });
      if (!r.ok) { toast(r.error, "error"); return showErrors(form, r.errors); }
      toast("Informations enregistrées");
    },
    async operations(form) {
      const r = await Store.saveSettings((s) => {
        s.dispatchMode = form.dispatchMode.value;
        s.defaultPrep = num(form.defaultPrep.value);
      }, "Réglages de préparation et de dispatch mis à jour");
      if (!r.ok) { toast(r.error, "error"); return showErrors(form, r.errors); }
      toast("Réglages opérationnels enregistrés");
    },
    async "free-delivery"(form) {
      const amount = num(form.freeDelivery.value);
      if (!Number.isFinite(amount) || amount < 0) return showErrors(form, { freeDelivery: "Saisissez un seuil valide." });
      const r = await Store.saveSettings((s) => { s.freeDelivery = amount; }, "Seuil de livraison offerte mis à jour");
      if (!r.ok) { toast(r.error, "error"); return showErrors(form, r.errors); }
      toast("Seuil enregistré");
    },
    async hours(form) {
      const hours = {};
      DAYS.forEach((d) => { hours[d.id] = { closed: form.elements[`closed-${d.id}`].checked, open: form.elements[`open-${d.id}`].value, close: form.elements[`close-${d.id}`].value }; });
      const r = await Store.saveHours(hours);
      if (!r.ok) { toast(r.error, "error"); return showErrors(form, r.errors); }
      toast("Horaires enregistrés");
    }
  };

  const ACTIONS = {
    "open-nav": () => setNav(true),
    "close-nav": () => setNav(false),
    "toggle-bell": () => { ui.bell = !ui.bell; ui.user = false; renderTopbar(); },
    "toggle-user": () => { ui.user = !ui.user; ui.bell = false; renderTopbar(); },
    logout: async () => {
      ui.user = false;
      const r = await Store.logout();
      closeAllOverlays(); location.hash = "#/dashboard"; $("#login-view").innerHTML = ""; renderAll();
      if (!r.ok) toast(`Session locale effacée, mais la révocation serveur a échoué : ${r.error}`, "error");
    },
    "change-secret": () => changeSecretModal(),
    "owner-view": async (el) => {
      const target = el.dataset.target;
      const popup = window.open("", "_blank");
      ui.user = false; renderTopbar();
      try {
        const result = await Store.ownerView(target);
        const url = ownerViewUrl(target);
        const payload = { scope: target, token: result.token, user: result.user, branchId: result.branchId };
        const encoded = btoa(unescape(encodeURIComponent(JSON.stringify(payload)))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
        if (popup) popup.location.href = `${url}#gk-view=${encoded}`;
        else toast("Autorisez les fenêtres pop-up pour ouvrir cette vue.", "error");
      } catch (error) {
        if (popup) popup.close();
        toast(error.message || "Impossible d'ouvrir cette vue.", "error");
      }
    },
    goto: (el) => { ui.bell = false; location.hash = el.dataset.href; renderTopbar(); },
    "retry-branches": async () => {
      if (await Store.loadBranches()) {
        await Store.refreshAll();
        renderAll();
      }
    },
    "retry-page": () => Store.routeStatus(ui.route).retry().then(renderAll),
    "close-drawer": () => closeDrawer(),
    "close-modal": () => closeModal(),
    page: (el) => { ui[el.dataset.ns].page += Number(el.dataset.dir); refreshResults(); },
    "set-filter": (el) => { const [ns, key] = el.dataset.filter.split("."); ui[ns][key] = el.dataset.value; if (ui[ns].page) ui[ns].page = 1; renderView(); },
    "open-order": (el) => openDrawer("order", el.dataset.id),
    "advance-order": async (el) => { await result(Store.advanceOrder(el.dataset.id), "Statut mis à jour"); },
    "assign-courier": async (el) => { const v = $("#assign-select").value; await result(Store.assignCourier(el.dataset.id, v), "Livreur assigné"); },
    "refuse-order": (el) => {
      const id = el.dataset.id;
      openModal({ title: `Refuser ${id}`, message: "Indiquez le motif du refus.", confirmLabel: "Refuser la commande", danger: true,
        body: field("reason", "Motif", `<textarea id="f-reason" name="reason" maxlength="200" required></textarea>`),
        onSubmit: async (f) => {
          if (!f.reason.value.trim()) return { reason: "Saisissez un motif." };
          const r = await Store.refuseOrder(id, f.reason.value.trim());
          if (!r.ok) { toast(r.error, "error"); return { reason: r.error }; }
          toast("Commande refusée"); return null;
        } });
    },
    "adjust-prep": (el) => {
      const order = Store.byId(S().orders, el.dataset.id);
      openModal({ title: `Délai · ${el.dataset.id}`, message: "Définissez le nouveau délai estimé de préparation.", confirmLabel: "Mettre à jour",
        body: field("prepMinutes", "Préparation (minutes)", input("prepMinutes", order?.prepMinutes || 20, "number", 'min="5" max="90" step="1"')),
        onSubmit: async (f) => {
          const mins = Number(f.prepMinutes.value);
          if (!Number.isInteger(mins) || mins < 5 || mins > 90) return { prepMinutes: "Saisissez un délai entre 5 et 90 minutes." };
          const r = await Store.adjustPrep(el.dataset.id, mins);
          if (!r.ok) { toast(r.error, "error"); return { prepMinutes: r.error }; }
          toast("Délai mis à jour"); return null;
        } });
    },
    "cancel-order": (el) => {
      const id = el.dataset.id;
      openModal({ title: `Annuler ${id}`, message: "Cette action est définitive. Indiquez le motif d'annulation.", confirmLabel: "Annuler la commande", cancelLabel: "Retour", danger: true,
        body: `${field("reason", "Motif", `<select id="f-reason" name="reason"><option value="">Choisir un motif…</option>${CANCEL_REASONS.map((r) => `<option>${esc(r)}</option>`).join("")}</select>`)}${field("note", "Précision (facultatif)", `<input id="f-note" name="note" class="input" maxlength="120">`)}`,
        onSubmit: async (f) => {
          if (!f.reason.value) return { reason: "Choisissez un motif." };
          const r = await Store.cancelOrder(id, f.reason.value, f.note.value.trim());
          if (!r.ok) { toast(r.error, "error"); return { reason: r.error }; }
          toast("Commande annulée"); return null;
        } });
    },
    "show-receipt": (el) => {
      const o = Store.byId(S().orders, el.dataset.id);
      const doc = receiptDoc(o);
      openModal({ title: `Ticket ${o.id}`, confirmLabel: "Imprimer", cancelLabel: "Fermer", body: `<div class="receipt-preview">${GKReceipt.previewTicket(doc, receiptOpts())}</div>`, onSubmit: () => { GKReceipt.printTicket(doc, receiptOpts()); return null; } });
    },
    "open-invoice": (el) => { const o = Store.byId(S().orders, el.dataset.id); if (o) openInvoiceModal(o); },
    "print-invoice": (el) => { const o = Store.byId(S().orders, el.dataset.id); if (o) GKReceipt.printInvoice(receiptDoc(o), receiptOpts()); },
    "print-ticket": (el) => { const o = Store.byId(S().orders, el.dataset.id); if (o) GKReceipt.printTicket(receiptDoc(o), receiptOpts()); },
    "open-cloture": () => ACTIONS["print-cloture"](),
    paper(el) { Store.setPrinterPrefs({ paper: Number(el.dataset.paper) === 58 ? 58 : 80 }); },
    baud(el) { Store.setPrinterPrefs({ baud: Number(el.dataset.baud) || 9600 }); },
    async "printer-connect"() {
      if (typeof GKPrinter === "undefined") return;
      ui.holdRender = true;
      try {
        const name = await GKPrinter.connect();
        Store.setPrinterPrefs({ lastPrinter: name });
        toast(`Imprimante connectée : ${name}`);
      } catch (error) {
        toast(error?.name === "NotFoundError"
          ? (GKPrinter.platform().android
            ? "Aucune imprimante BLE choisie. Autorisez Localisation / Appareils à proximité, et vérifiez que l'imprimante est BLE."
            : "Fenêtre fermée, ou aucune imprimante BLE. Sur PC, essayez Port série si elle est déjà couplée dans Windows.")
          : `Bluetooth : ${error.message || "erreur"}`, "error");
      } finally {
        ui.holdRender = false;
        renderAll();
      }
    },
    async "printer-serial"() {
      if (typeof GKPrinter === "undefined") return;
      ui.holdRender = true;
      try {
        const name = await GKPrinter.connectSerial(Store.printerPrefs().baud || 9600);
        Store.setPrinterPrefs({ lastPrinter: name });
        toast(`Imprimante connectée : ${name}`);
      } catch (error) {
        toast(error?.name === "NotFoundError"
          ? "Aucun port choisi. Couplez d'abord l'imprimante dans les paramètres Bluetooth de Windows."
          : `Port série : ${error.message || "erreur"}`, "error");
      } finally {
        ui.holdRender = false;
        renderAll();
      }
    },
    "printer-disconnect"() {
      if (typeof GKPrinter !== "undefined") GKPrinter.disconnect();
      renderView();
    },
    async "printer-test"() {
      const paper = Store.printerPrefs().paper;
      const order = {
        id: "TEST", createdAt: Date.now(), mode: "pickup", customer: { name: "Ticket de test" },
        items: [{ qty: 1, name: "Impression OK", size: "Éàç œ 123", extras: [], price: 0 }],
        subtotal: 0, fee: 0, total: 0, payment: "-", paymentType: "card"
      };
      if (typeof GKPrinter !== "undefined" && GKPrinter.connected()) {
        try {
          await ensureTicketArt();
          await GKPrinter.write(buildTestTicket(paper));
          toast("Ticket de test envoyé à l'imprimante");
        } catch (error) {
          toast(error.message || "Impression impossible.", "error");
        }
        return;
      }
      printEscposHtml(order, { paper, kind: "original" });
    },
    "cloture-day": (el) => {
      const value = el.value;
      if (!value) return;
      const [y, m, d] = value.split("-").map(Number);
      return Store.setClotureDay(new Date(y, m - 1, d).getTime()).then((r) => {
        if (!r.ok) toast(r.error || "Impossible de charger ce jour.", "error");
      });
    },
    "cloture-shift": (el) => {
      const dir = Number(el.dataset.dir) || -1;
      const current = S().clotureDayStart || Store.dayStart(Date.now());
      return Store.setClotureDay(current + dir * 86400000).then((r) => {
        if (!r.ok) toast(r.error || "Impossible de charger ce jour.", "error");
      });
    },
    "print-cloture": async () => {
      let report = S().cloture;
      if (!report) {
        const r = await Store.getCloture();
        if (!r.ok) { toast(r.error || "Impossible de charger la clôture.", "error"); return; }
        report = r.data;
      }
      if (!report?.orders) { toast("Aucune vente à clôturer pour ce jour. Sélectionnez une autre date.", "error"); return; }
      const paper = Store.printerPrefs().paper;
      if (typeof GKPrinter !== "undefined" && GKPrinter.connected()) {
        try {
          await ensureTicketArt();
          await GKPrinter.write(buildClotureTicket(report, { paper }));
          toast("Clôture envoyée à l'imprimante");
        } catch (error) {
          toast(error.message || "Impression thermique impossible, aperçu navigateur.", "error");
          GKReceipt.printCloture(report, receiptOpts());
        }
        return;
      }
      GKReceipt.printCloture(report, receiptOpts());
    },
    "export-invoices": () => exportInvoicesCsv(),
    "new-product": () => openDrawer("product"),
    "edit-product": (el) => openDrawer("product", el.dataset.id),
    "toggle-available": (el) => { result(Store.toggleAvailability(el.dataset.id)); },
    "delete-product": (el) => {
      const p = Store.byId(S().products, el.dataset.id);
      confirmDialog("Supprimer ce produit ?", `« ${p.name} » sera définitivement retiré du menu.`, "Supprimer", () => result(Store.deleteProduct(p.id), "Produit supprimé"));
    },
    "add-size": () => $("[data-rows=size]").insertAdjacentHTML("beforeend", sizeRow()),
    "add-extra": () => $("[data-rows=extra]").insertAdjacentHTML("beforeend", extraRow()),
    "remove-row": (el) => el.closest(".repeat-row").remove(),
    "manage-categories": () => openDrawer("categories"),
    "cat-edit": (el) => { ui.catEdit = el.dataset.id; renderDrawer(); const i = $('.drawer [data-form="category-edit"] input'); if (i) i.focus(); },
    "cat-cancel": () => { ui.catEdit = null; renderDrawer(); },
    "cat-delete": (el) => { const c = Store.byId(S().categories, el.dataset.id); confirmDialog("Supprimer la catégorie ?", `« ${c.name} » sera supprimée.`, "Supprimer", () => result(Store.deleteCategory(c.id), "Catégorie supprimée")); },
    "new-courier": () => openDrawer("courier-new"),
    "open-courier": (el) => openDrawer("courier", el.dataset.id),
    "edit-courier": (el) => openDrawer("courier-edit", el.dataset.id),
    "toggle-courier": (el) => {
      const c = Store.byId(S().couriers, el.dataset.id);
      if (c.active) confirmDialog("Désactiver ce livreur ?", `${c.name} ne pourra plus se connecter à l'application livreur.`, "Désactiver", () => result(Store.setCourierActive(c.id, false), "Livreur désactivé"));
      else result(Store.setCourierActive(c.id, true), "Livreur activé");
    },
    "delete-courier": (el) => {
      const c = Store.byId(S().couriers, el.dataset.id);
      confirmDialog("Supprimer ce livreur ?", `${c.name} sera définitivement supprimé s'il ne possède aucune commande.`, "Supprimer", () => result(Store.deleteCourier(c.id), "Livreur supprimé"));
    },
    "reset-pin": (el) => {
      const c = Store.byId(S().couriers, el.dataset.id);
      confirmDialog("Réinitialiser le PIN ?", `Un nouveau PIN temporaire sera généré pour ${c.name}.`, "Réinitialiser", async () => { const r = await Store.resetCourierPin(c.id); if (r.ok) setTimeout(() => pinModal("PIN réinitialisé", `Communiquez ce PIN temporaire à ${c.name}.`, r.pin), 0); else toast(r.error, "error"); }, false);
    },
    "reset-staff-code": (el) => {
      const u = Store.byId(S().users, el.dataset.id);
      confirmDialog("Nouveau code ?", `Un nouveau code 4 chiffres sera généré pour ${u.name}. L'ancien ne fonctionnera plus.`, "Générer", async () => {
        const r = await Store.resetStaffCode(u.id);
        if (r.ok) setTimeout(() => pinModal("Code personnel", `Communiquez ce code à ${u.name}.`, r.code), 0);
        else toast(r.error, "error");
      }, false);
    },
    "settle-cash": (el) => { result(Store.settleCash(el.dataset.id), "Caisse remise"); },
    "open-customer": (el) => openDrawer("customer", el.dataset.id),
    "toggle-blocked": (el) => {
      const c = Store.byId(S().customers, el.dataset.id);
      if (!c.blocked) confirmDialog("Bloquer ce client ?", `${c.name} ne pourra plus passer de commande.`, "Bloquer", () => result(Store.toggleBlocked(c.id), "Client bloqué"));
      else result(Store.toggleBlocked(c.id), "Client débloqué");
    },
    "toggle-zone": (el) => { result(Store.toggleZone(el.dataset.id)); },
    "delete-zone": (el) => {
      const z = Store.byId(S().zones, el.dataset.id);
      confirmDialog("Supprimer cette zone ?", `La zone « ${z.name} » sera retirée définitivement.`, "Supprimer", () => result(Store.deleteZone(z.id), "Zone supprimée"));
    },
    "new-promo": () => openDrawer("promo"),
    "edit-promo": (el) => openDrawer("promo", el.dataset.id),
    "toggle-promo": (el) => { result(Store.togglePromo(el.dataset.id)); },
    "delete-promo": (el) => {
      const p = Store.byId(S().promos, el.dataset.id);
      confirmDialog("Supprimer ce code promo ?", `Le code ${p.code} sera définitivement supprimé.`, "Supprimer", () => result(Store.deletePromo(p.id), "Code promo supprimé"));
    },
    "new-user": () => openDrawer("user"),
    "edit-user": (el) => openDrawer("user", el.dataset.id),
    "toggle-staff": (el) => {
      const u = Store.byId(S().users, el.dataset.id);
      if (u.active) confirmDialog("Désactiver ce compte ?", `${u.name} ne pourra plus se connecter.`, "Désactiver", () => result(Store.toggleUserActive(u.id), "Compte désactivé"));
      else result(Store.toggleUserActive(u.id), "Compte activé");
    },
    "delete-user": (el) => {
      const u = Store.byId(S().users, el.dataset.id);
      confirmDialog("Supprimer ce compte ?", `${u.name} (${u.email}) sera supprimé.`, "Supprimer", () => result(Store.deleteUser(u.id), "Utilisateur supprimé"));
    },
    "toggle-setting": (el) => {
      const key = el.dataset.key; const on = el.checked;
      const r = Store.saveSettings((s) => {
        if (key === "pause") s.acceptingOrders = !on; else if (key.startsWith("notif.")) s.notif[key.slice(6)] = on; else s[key] = on;
      }, key === "pause" ? (on ? "Commandes mises en pause" : "Commandes reprises") : `Réglage « ${key} » ${on ? "activé" : "désactivé"}`);
      result(r);
    },
    "resume-orders": () => { result(Store.saveSettings((s) => { s.acceptingOrders = true; }, "Commandes reprises"), "Commandes reprises"); }
  };

  /* ---------- Events ---------- */
  document.addEventListener("click", (e) => {
    if (e.target.classList.contains("drawer-overlay")) { closeDrawer(); return; }
    if (e.target.classList.contains("modal-overlay")) { closeModal(); return; }
    const el = e.target.closest("[data-action]");
    if (!el) {
      if (ui.bell || ui.user) { if (!e.target.closest(".pop-wrap")) { ui.bell = ui.user = false; renderTopbar(); } }
      return;
    }
    if (el.tagName === "INPUT") return;
    const fn = ACTIONS[el.dataset.action];
    if (fn) Promise.resolve(fn(el)).catch((error) => toast(error.message || "Une erreur est survenue.", "error"));
  });

  document.addEventListener("change", (e) => {
    const t = e.target;
    if (t.id === "branch-select") {
      Store.setBranch(t.value).catch((error) => toast(error.message || "Impossible de changer de restaurant.", "error"));
      return;
    }
    if (t.matches('input[type="checkbox"][data-action]')) { Promise.resolve(ACTIONS[t.dataset.action](t)).catch((error) => toast(error.message || "Une erreur est survenue.", "error")); return; }
    if (t.matches("select[data-filter]")) { const [ns, key] = t.dataset.filter.split("."); ui[ns][key] = t.value; if ("page" in ui[ns]) ui[ns].page = 1; refreshResults(); }
    if (t.matches("input[data-action=cloture-day]")) {
      Promise.resolve(ACTIONS["cloture-day"](t)).catch((error) => toast(error.message || "Une erreur est survenue.", "error"));
    }
  });

  document.addEventListener("input", (e) => {
    const t = e.target;
    if (t.matches("input[data-filter]")) { const [ns, key] = t.dataset.filter.split("."); ui[ns][key] = t.value; if ("page" in ui[ns]) ui[ns].page = 1; refreshResults(); }
  });

  document.addEventListener("submit", (e) => {
    const form = e.target;
    if (form.id === "login-form") { e.preventDefault(); submitLogin(form); return; }
    if (form.id === "required-secret-form") { e.preventDefault(); submitRequiredSecret(form); return; }
    if (form.dataset.form) { e.preventDefault(); const fn = FORMS[form.dataset.form]; if (fn) Promise.resolve(fn(form)).catch((error) => toast(error.message || "Une erreur est survenue.", "error")); }
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      if ($("#modal-root").firstChild) closeModal();
      else if (ui.drawer) closeDrawer();
      else if (ui.bell || ui.user) { ui.bell = ui.user = false; renderTopbar(); }
      else if (!$("#scrim").hidden) setNav(false);
      return;
    }
    if (e.key === "Tab") {
      const box = $("#modal-root .modal") || $("#drawer-root .drawer");
      if (!box) return;
      const items = [...box.querySelectorAll('button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled])')].filter((n) => n.offsetParent !== null);
      if (!items.length) return;
      const first = items[0], last = items[items.length - 1];
      if (!box.contains(document.activeElement)) { first.focus(); e.preventDefault(); }
      else if (e.shiftKey && document.activeElement === first) { last.focus(); e.preventDefault(); }
      else if (!e.shiftKey && document.activeElement === last) { first.focus(); e.preventDefault(); }
    }
    if (e.key === "Enter" && e.target.id === "global-search") {
      ui.orders.q = e.target.value.trim(); ui.orders.page = 1; ui.orders.status = "all"; ui.orders.range = "all"; ui.orders.mode = "all";
      e.target.value = "";
      if (ui.route === "commandes") renderView(); else location.hash = "#/commandes";
    }
  });

  // A broken remote image falls back to the brand emblem once.
  document.addEventListener("error", (e) => {
    const t = e.target;
    if (t.tagName === "IMG" && !t.dataset.fallback) { t.dataset.fallback = "1"; t.src = "assets/emblem-reference.png"; }
  }, true);

  function onRoute() {
    const name = (location.hash.replace(/^#\/?/, "") || "dashboard").split("/")[0];
    if (!Store.currentUser() && name === "owner") ownerLogin = true;
    ui.route = ROUTES[name] ? name : "dashboard";
    ui.bell = ui.user = false;
    setNav(false);
    if (Store.currentUser()) { renderAll(); window.scrollTo(0, 0); }
  }
  window.addEventListener("hashchange", onRoute);

  /* ---------- Boot ---------- */
  Store.subscribe(() => renderAll());
  window.addEventListener("gk-api-session-expired", (event) => {
    if (event.detail?.scope !== Store.get().scope) return;
    Store.logout().then(() => {
      closeAllOverlays(); $("#login-view").innerHTML = ""; renderAll();
      toast("Votre session a expiré. Reconnectez-vous.", "error");
    });
  });
  onRoute();
  renderAll();
  Store.load().then(() => {
    onRoute();
    renderAll();
    if (typeof GKPrinter !== "undefined") {
      GKPrinter.reconnect(Store.printerPrefs().lastPrinter).catch(() => {});
    }
  });
  try {
    if (typeof GKPrinter !== "undefined") {
      GKPrinter.onChange(() => { if (!ui.holdRender && ui.route === "reglages") renderView(); });
    }
  } catch { /* printer optional */ }
})();
