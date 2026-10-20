const ui = { tab: "missions", filter: "today", lastFocus: null, installPrompt: null };
const $ = id => document.getElementById(id);
const money = n => `${n} MAD`;
const NAV = [
  { id: "missions", label: "Missions", icon: "bike" },
  { id: "history", label: "Historique", icon: "receipt" },
  { id: "earnings", label: "Gains", icon: "wallet" },
  { id: "profile", label: "Profil", icon: "user" }
];
const STEPS = ["AcceptÃ©", "ArrivÃ©", "RÃ©cupÃ©rÃ©", "En route", "LivrÃ©"];
const STEP_BUTTONS = { 1: "ArrivÃ© au restaurant", 2: "Commande rÃ©cupÃ©rÃ©e" };
const STEP_HINTS = {
  1: "Rendez-vous au restaurant G&K Food.",
  2: "RÃ©cupÃ©rez la commande au comptoir.",
  4: "Remettez la commande et saisissez le code du client."
};

const dayFmt = new Intl.DateTimeFormat("fr-FR", { weekday: "long", day: "numeric", month: "long" });
const timeFmt = new Intl.DateTimeFormat("fr-FR", { hour: "2-digit", minute: "2-digit" });
const shortDay = new Intl.DateTimeFormat("fr-FR", { weekday: "short" });

function dayLabel(ts) {
  const diff = Math.round((startOfDay(Date.now()) - startOfDay(ts)) / DAY);
  return diff === 0 ? "Aujourd'hui" : diff === 1 ? "Hier" : dayFmt.format(ts);
}

let toastTimer;
function toast(message) {
  const el = $("toast");
  el.textContent = message;
  el.classList.add("visible");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove("visible"), 2600);
}

async function runAction(task) {
  if (state.actionBusy) return;
  state.actionBusy = true;
  state.actionError = "";
  render();
  try {
    await task();
  } catch (error) {
    state.actionError = error.message || "Une erreur est survenue.";
    toast(state.actionError);
  } finally {
    state.actionBusy = false;
    render();
  }
}

const waLink = phone => `https://wa.me/212${phone.replace(/^0/, "")}`;
const telLink = phone => `tel:${phone.replace(/^0/, "+212")}`;
const unreadCount = () => state.notifications.filter(n => !n.read).length;
const paymentBadge = m => m.payment === "cash"
  ? `<span class="badge">${icon("cash")} EspÃ¨ces ${money(m.total)}</span>`
  : `<span class="badge ok">${icon("card")} PayÃ© en ligne</span>`;

/* ---------- Views ---------- */

function renderHeader() {
  $("app-header").innerHTML = state.session && !state.mustChange ? `
    <img class="brand-logo" src="./assets/emblem-reference.png" alt="G&K" />
    <span class="role-pill">LIVREUR</span>
    <span class="branch-name">${esc(state.session.branchName || "Restaurant G&K")}</span>
    <span class="header-spacer"></span>
    <button class="icon-button" type="button" data-act="bell" aria-label="Notifications${unreadCount() ? `, ${unreadCount()} non lues` : ""}">
      ${icon("bell")}${unreadCount() ? '<span class="dot"></span>' : ""}
    </button>` : "";
}

function renderNav() {
  const badge = state.active ? 1 : state.online ? state.missions.length : 0;
  $("bottom-nav").innerHTML = state.session && !state.mustChange ? NAV.map(item => `
    <button class="nav-button${ui.tab === item.id ? " active" : ""}" type="button" data-act="tab" data-tab="${item.id}"${ui.tab === item.id ? ' aria-current="page"' : ""}>
      <span class="nav-icon">${icon(item.icon)}</span>${item.label}
      ${item.id === "missions" && badge ? `<span class="nav-badge" aria-label="${badge} mission(s)">${badge}</span>` : ""}
    </button>`).join("") : "";
}

function loginView() {
  return `
    <section class="login" aria-labelledby="login-title">
      <img class="login-logo" src="./assets/emblem-reference.png" alt="G&K" />
      <div><span class="role-pill">LIVREUR</span></div>
      <h1 id="login-title">Connexion livreur</h1>
      <form id="login-form" novalidate>
        <div class="field">
          <label for="phone">TÃ©lÃ©phone</label>
          <input id="phone" name="phone" type="tel" inputmode="tel" autocomplete="tel" placeholder="06 12 34 56 78" required />
        </div>
        <div class="field">
          <label for="pin">Code PIN (4 chiffres)</label>
          <input id="pin" class="pin-input" name="pin" type="password" inputmode="numeric" maxlength="4" autocomplete="current-password" placeholder="â€¢â€¢â€¢â€¢" />
        </div>
        <p id="login-error" class="form-error" role="alert"></p>
        <button class="gold-button" type="submit">Se connecter ${icon("arrowRight")}</button>
        <p class="muted">Saisissez les identifiants fournis par votre administrateur.</p>
      </form>
      <p class="admin-note">${icon("shield")} Compte crÃ©Ã© par l'administrateur G&amp;K</p>
    </section>`;
}

function changeSecretView() {
  return `
    <section class="login" aria-labelledby="change-secret-title">
      <img class="login-logo" src="./assets/emblem-reference.png" alt="G&K" />
      <div><span class="role-pill">LIVREUR</span></div>
      <h1 id="change-secret-title">CrÃ©ez votre nouveau PIN</h1>
      <p class="muted">Votre administrateur vous a fourni un PIN temporaire. Modifiez-le avant de continuer.</p>
      <form id="change-secret-form" novalidate>
        <div class="field">
          <label for="current-pin">PIN actuel</label>
          <input id="current-pin" name="current" type="password" inputmode="numeric" autocomplete="current-password" maxlength="12" required />
        </div>
        <div class="field">
          <label for="next-pin">Nouveau PIN (4 Ã  6 chiffres)</label>
          <input id="next-pin" name="next" type="password" inputmode="numeric" autocomplete="new-password" maxlength="6" required />
        </div>
        <p id="change-error" class="form-error" role="alert"></p>
        <button class="gold-button" type="submit">Enregistrer le nouveau PIN ${icon("arrowRight")}</button>
      </form>
      <button class="outline-button" type="button" data-act="logout">Se dÃ©connecter</button>
    </section>`;
}

function missionCard(m) {
  return `
    <article class="mission">
      <button class="mission-main" type="button" data-act="detail" data-id="${esc(m.id)}" aria-label="DÃ©tails de la mission ${esc(m.id)}">
        <div class="mission-top"><span class="mission-id">${esc(m.id)}</span>${m.earning !== null ? `<span class="earning">+${money(m.earning)}</span>` : ""}</div>
        <div class="mission-route">
          <div>${icon("store")}<span>G&amp;K Food</span></div>
          <div>${icon("pin")}<span>${esc(m.customer)}${m.customer && m.address ? " Â· " : ""}${esc(m.address)}${m.zone ? ` <span class="muted">(${esc(m.zone)})</span>` : ""}</span></div>
        </div>
        <div class="mission-meta">
          ${m.km !== null ? `<span class="badge dark">${icon("navigate")} ${m.km} km</span>` : ""}
          ${paymentBadge(m)}
        </div>
        <p class="muted" style="font-size:12px">${esc(m.items)}${m.items ? " Â· " : ""}Total ${money(m.total)}</p>
      </button>
      <div class="mission-foot">${m.offer
        ? `<span class="badge offer-timer" data-expires="${m.expiresAt}" aria-live="off">${offerLeft(m)} s</span>
           <button class="outline-button" type="button" data-act="refuse" data-id="${esc(m.id)}"${state.actionBusy ? " disabled" : ""}>Refuser</button>
           <button class="gold-button" type="button" data-act="accept" data-id="${esc(m.id)}"${state.actionBusy ? " disabled" : ""}>Accepter</button>`
        : `<button class="gold-button" type="button" data-act="accept" data-id="${esc(m.id)}"${state.actionBusy ? " disabled" : ""}>Accepter</button>`}</div>
    </article>`;
}

const offerLeft = m => Math.max(0, Math.ceil((m.expiresAt - Date.now()) / 1000));

function missionsView() {
  if (state.active) return activeView();
  const body = !state.online ? `
      <div class="empty">${icon("bike")}<strong>Vous Ãªtes hors ligne</strong>
        <p>Passez en ligne pour recevoir des missions de livraison.</p></div>`
    : state.offersLoading && !state.missions.length ? `
      <div class="empty">${icon("clock")}<strong>Chargement des missionsâ€¦</strong></div>`
    : state.offersError && !state.missions.length ? `
      <div class="empty">${icon("alert")}<strong>Impossible de charger les missions</strong>
        <p>${esc(state.offersError)}</p><button class="outline-button" type="button" data-act="refresh">RÃ©essayer</button></div>`
    : !state.missions.length ? `
      <div class="empty">${icon("clock")}<strong>En attente de missionsâ€¦</strong>
        <p>Les nouvelles missions apparaÃ®tront ici automatiquement.</p></div>`
    : state.missions.map(missionCard).join("");
  return `
    <div class="online-card${state.online ? " on" : ""}">
      <div><strong>${state.online ? "En ligne" : "Hors ligne"}</strong>
        <small>${state.online ? "Vous recevez des missions" : "Vous ne recevez aucune mission"}</small></div>
      <button class="switch" type="button" role="switch" aria-checked="${state.online}" aria-label="Statut en ligne" data-act="toggle-online"${state.actionBusy ? " disabled" : ""}></button>
    </div>
    ${state.online ? `<div class="section-heading"><h2>Missions disponibles</h2><small>${state.missions.length}</small></div>` : ""}
    ${state.offersError && state.missions.length ? `<p class="form-error" role="alert">${esc(state.offersError)} <button class="outline-button" type="button" data-act="refresh">RÃ©essayer</button></p>` : ""}
    ${body}`;
}

function mapCard(m) {
  const status = m.step === 1 ? "En attente de votre arrivÃ©e au restaurant"
    : m.step === 2 ? "ArrivÃ©e au restaurant confirmÃ©e"
      : "Commande rÃ©cupÃ©rÃ©e Â· en route vers le client";
  return `
    <div class="tracking-map" role="status" aria-label="Ã‰tat de la mission">
      <span class="map-label">${icon("bike")} ${esc(status)}${m.km !== null ? ` Â· ${m.km} km` : ""}</span>
    </div>`;
}

function activeView() {
  const m = state.active;
  const stepper = STEPS.map((label, i) => `
    <li class="step${i < m.step ? " done" : i === m.step ? " current" : ""}"${i === m.step ? ' aria-current="step"' : ""}>
      <span class="step-dot">${i < m.step ? icon("check") : i + 1}</span>${label}</li>`).join("");
  const cash = m.payment === "cash"
    ? `<div class="cash-alert"><span>${icon("cash")} EspÃ¨ces Ã  encaisser</span><strong>${money(m.total)}</strong></div>` : "";
  const waiting = m.step === 2 && m.orderStatus !== "ready";
  const action = m.step < 4
    ? `<button class="gold-button" type="button" data-act="advance"${waiting || state.actionBusy ? " disabled" : ""}>${waiting ? "En attente de la cuisineâ€¦" : `${STEP_BUTTONS[m.step]} ${icon("arrowRight")}`}</button>`
    : `<form id="deliver-form" class="card" novalidate>
        <h3>Confirmer la livraison</h3>
        <div class="field" style="margin-top:10px">
          <label for="code">Code de livraison du client</label>
          <input id="code" class="pin-input" name="code" type="text" inputmode="numeric" maxlength="4" autocomplete="one-time-code" placeholder="â€¢â€¢â€¢â€¢" />
        </div>
        ${m.payment === "cash" ? `<label class="check-row"><input id="cash-ok" type="checkbox" /> EspÃ¨ces encaissÃ©es (${money(m.total)})</label>` : ""}
        <p id="deliver-error" class="form-error" role="alert"></p>
        <button class="gold-button" type="submit">${icon("check")} LivrÃ©</button>
      </form>`;
  return `
    <h1 class="screen-title">Mission ${esc(m.id)}</h1>
    <ol class="stepper" aria-label="Progression">${stepper}</ol>
    ${mapCard(m)}
    <div class="card">
      <div class="mission-top"><span class="badge">${esc(STEP_HINTS[m.step])}</span>${m.earning !== null ? `<span class="earning">+${money(m.earning)}</span>` : ""}</div>
      <div class="kv">
        <div><span>Restaurant</span><span>G&amp;K Food</span></div>
        <div><span>Client</span><span>${esc(m.customer)}</span></div>
        <div><span>Adresse</span><span>${esc(m.address)}${m.zone ? `<br>${esc(m.zone)}` : ""}${m.km !== null ? ` Â· ${m.km} km` : ""}</span></div>
        <div><span>Articles</span><span>${esc(m.items)}</span></div>
        <div><span>Paiement</span><span>${m.payment === "cash" ? "EspÃ¨ces" : "PayÃ© en ligne"}</span></div>
      </div>
      ${m.phone ? `<div class="contact-row">
        <a class="outline-button" href="${telLink(m.phone)}" aria-label="Appeler ${esc(m.customer)}">${icon("phone")} Appeler</a>
        <a class="outline-button" href="${waLink(m.phone)}" target="_blank" rel="noopener" aria-label="WhatsApp ${esc(m.customer)}">${icon("chat")} WhatsApp</a>
      </div>` : ""}
      ${cash}
    </div>
    <div class="sticky-actions">
      ${action}
    </div>`;
}

function historyView() {
  const list = filterHistory(ui.filter);
  const filters = [["today", "Aujourd'hui"], ["week", "Semaine"], ["all", "Tout"]];
  let lastDay = null;
  const rows = list.map(h => {
    const day = startOfDay(h.at);
    const head = day !== lastDay ? `<h2 class="day-label">${esc(dayLabel(h.at))}</h2>` : "";
    lastDay = day;
    const ok = h.status === "delivered";
    return `${head}
      <div class="row">
        <span class="row-icon${ok ? "" : " bad"}">${icon(ok ? "check" : "alert")}</span>
        <span class="row-copy"><strong>${esc(h.id)} Â· ${esc(h.customer)}</strong>
          <small>${timeFmt.format(h.at)}${h.zone ? ` Â· ${esc(h.zone)}` : ""}</small></span>
        <span class="row-amount${ok ? "" : " zero"}">${ok ? `+${money(h.earning)}` : "AnnulÃ©e"}</span>
      </div>`;
  }).join("");
  return `
    <h1 class="screen-title">Historique</h1>
    <div class="chips" role="group" aria-label="PÃ©riode">
      ${filters.map(([id, label]) => `<button class="chip" type="button" data-act="filter" data-filter="${id}" aria-pressed="${ui.filter === id}">${label}</button>`).join("")}
    </div>
    ${state.historyError && list.length ? `<p class="form-error" role="alert">${esc(state.historyError)} <button class="outline-button" type="button" data-act="refresh-history">RÃ©essayer</button></p>` : ""}
    ${state.historyLoading && !list.length
      ? `<div class="empty">${icon("clock")}<strong>Chargement de lâ€™historiqueâ€¦</strong></div>`
      : state.historyError && !list.length
        ? `<div class="empty">${icon("alert")}<strong>Impossible de charger lâ€™historique</strong><p>${esc(state.historyError)}</p><button class="outline-button" type="button" data-act="refresh-history">RÃ©essayer</button></div>`
        : rows || `<div class="empty">${icon("receipt")}<strong>Aucune mission</strong><p>Rien Ã  afficher pour cette pÃ©riode.</p></div>`}`;
}

function chartSvg() {
  const days = dailyEarnings();
  const max = Math.max(10, ...days.map(d => d.total));
  const bars = days.map((d, i) => {
    const h = Math.round((d.total / max) * 90);
    const x = 14 + i * 44;
    const last = i === days.length - 1;
    return `<rect class="${last ? "today" : ""}" x="${x}" y="${115 - h}" width="28" height="${Math.max(h, 2)}" rx="6"></rect>
      <text class="val" x="${x + 14}" y="${109 - h}">${d.total}</text>
      <text x="${x + 14}" y="132">${esc(shortDay.format(d.day).replace(".", ""))}</text>`;
  }).join("");
  const summary = days.map(d => `${shortDay.format(d.day)} ${d.total} MAD`).join(", ");
  return `<svg class="chart" viewBox="0 0 320 140" role="img" aria-label="Gains des 7 derniers jours : ${esc(summary)}"><line x1="8" y1="115" x2="312" y2="115"></line>${bars}</svg>`;
}

function earningsView() {
  if (!state.historyLoaded && state.historyLoading) {
    return `<h1 class="screen-title">Gains</h1><div class="empty">${icon("clock")}<strong>Chargement des gainsâ€¦</strong></div>`;
  }
  if (!state.historyLoaded && state.historyError) {
    return `<h1 class="screen-title">Gains</h1><div class="empty">${icon("alert")}<strong>Impossible de charger les gains</strong><p>${esc(state.historyError)}</p><button class="outline-button" type="button" data-act="refresh-history">RÃ©essayer</button></div>`;
  }
  const today = filterHistory("today").filter(h => h.status === "delivered");
  const week = filterHistory("week").filter(h => h.status === "delivered");
  const cash = Number(state.profile?.cashToRemit) || 0;
  return `
    <h1 class="screen-title">Gains</h1>
    <div class="stat-grid">
      <div class="stat hero"><small>Aujourd'hui</small><strong>${money(sumEarnings(today))}</strong></div>
      <div class="stat"><small>Cette semaine</small><strong>${money(sumEarnings(week))}</strong></div>
      <div class="stat"><small>Livraisons (semaine)</small><strong>${week.length}</strong></div>
      <div class="stat"><small>EspÃ¨ces Ã  reverser</small><strong>${money(cash)}</strong></div>
    </div>
    <div class="section-heading"><h2>7 derniers jours</h2><small>MAD</small></div>
    <div class="card">${chartSvg()}</div>
    ${state.historyLoading ? `<p class="muted">Actualisation des gainsâ€¦</p>` : ""}
    ${state.historyError ? `<p class="form-error">${esc(state.historyError)}</p>` : ""}
    <p class="fineprint">CalculÃ© Ã  partir des livraisons terminÃ©es enregistrÃ©es sur le serveur.</p>`;
}

function profileView() {
  const s = state.session;
  if (!state.profileLoaded && state.profileLoading) {
    return `<h1 class="screen-title">Profil</h1><div class="empty">${icon("clock")}<strong>Chargement du profilâ€¦</strong></div>`;
  }
  if (!state.profileLoaded && state.profileError) {
    return `<h1 class="screen-title">Profil</h1><div class="empty">${icon("alert")}<strong>Impossible de charger le profil</strong><p>${esc(state.profileError)}</p><button class="outline-button" type="button" data-act="refresh-profile">RÃ©essayer</button></div>`;
  }
  const initials = String(s.name || "").split(/\s+/).filter(Boolean).slice(0, 2).map(part => part[0]).join("").toUpperCase();
  return `
    <h1 class="screen-title">Profil</h1>
    <div class="profile-head">
      <span class="avatar" aria-hidden="true">${esc(initials)}</span>
      <div><h2>${esc(s.name || "")}</h2><p>${esc(s.phone || "")}</p>
        ${state.profile?.vehicle ? `<p>${icon("bike")} VÃ©hicule : ${esc(state.profile.vehicle)}</p>` : ""}</div>
    </div>
    <div class="stat-grid" style="margin-top:12px">
      <div class="stat"><small>Statut</small><strong>${state.online ? "En ligne" : "Hors ligne"}</strong></div>
      <div class="stat"><small>EspÃ¨ces Ã  reverser</small><strong>${money(Number(state.profile?.cashToRemit) || 0)}</strong></div>
    </div>
    <div class="menu-list">
      ${ui.installPrompt ? `<button class="menu-item" type="button" data-act="install"><span class="row-icon">${icon("download")}</span><span class="grow">Installer l'application</span></button>` : ""}
      <button class="menu-item danger" type="button" data-act="logout"><span class="row-icon">${icon("logout")}</span><span class="grow">Se dÃ©connecter</span></button>
    </div>
    ${state.profileLoading ? `<p class="muted">Actualisation du profilâ€¦</p>` : ""}
    ${state.profileError ? `<p class="form-error">${esc(state.profileError)} <button class="outline-button" type="button" data-act="refresh-profile">RÃ©essayer</button></p>` : ""}
    <p class="fineprint">G&amp;K Livreur</p>`;
}

function render() {
  document.body.toggleAttribute("data-bare", !state.session || state.mustChange);
  renderHeader();
  renderNav();
  const views = { missions: missionsView, history: historyView, earnings: earningsView, profile: profileView };
  $("app-main").innerHTML = state.mustChange
    ? changeSecretView()
    : state.session
      ? `${state.actionError ? `<p class="form-error" role="alert">${esc(state.actionError)}</p>` : ""}${state.locationError ? `<p class="form-error" role="status">${esc(state.locationError)}</p>` : ""}${views[ui.tab]()}`
      : loginView();
}

/* ---------- Sheets ---------- */

function openSheet(title, body) {
  ui.lastFocus = document.activeElement;
  const overlay = $("overlay");
  overlay.innerHTML = `
    <div class="sheet" role="dialog" aria-modal="true" aria-labelledby="sheet-title">
      <div class="panel-head"><h2 id="sheet-title">${esc(title)}</h2>
        <button class="icon-button" type="button" data-act="close" aria-label="Fermer">${icon("close")}</button></div>
      <div class="panel-body">${body}</div>
    </div>`;
  overlay.hidden = false;
  overlay.querySelector("[data-act='close']").focus();
}

function closeSheet() {
  const overlay = $("overlay");
  if (overlay.hidden) return;
  overlay.hidden = true;
  overlay.innerHTML = "";
  if (ui.lastFocus && document.contains(ui.lastFocus)) ui.lastFocus.focus();
}

function detailSheet(id) {
  const m = state.missions.find(x => x.id === id);
  if (!m) return;
  openSheet(`Mission ${m.id}`, `
    <div class="mission-top"><span class="badge">${esc(m.zone)}${m.km !== null ? ` Â· ${m.km} km` : ""}</span>${m.earning !== null ? `<span class="earning">+${money(m.earning)}</span>` : ""}</div>
    <div class="kv">
      <div><span>Retrait</span><span>G&amp;K Food</span></div>
      <div><span>Client</span><span>${esc(m.customer)}</span></div>
      <div><span>Livraison</span><span>${esc(m.address)}</span></div>
      <div><span>Articles</span><span>${esc(m.items)}</span></div>
      <div><span>Total commande</span><span>${money(m.total)}</span></div>
      <div><span>Paiement</span><span>${m.payment === "cash" ? `EspÃ¨ces Ã  encaisser : ${money(m.total)}` : "PayÃ© en ligne"}</span></div>
    </div>
    <button class="gold-button" type="button" data-act="accept" data-id="${esc(m.id)}"${state.actionBusy ? " disabled" : ""}>Accepter la mission</button>`);
}

function notifSheet() {
  const items = state.notifications.map(n => `
    <div class="notif${n.read ? "" : " unread"}"><span class="row-icon">${icon("bell")}</span>
      <div>${esc(n.text)}<small>${esc(dayLabel(n.at))} Â· ${timeFmt.format(n.at)}</small></div></div>`).join("");
  openSheet("Notifications", items || '<p class="muted">Aucune notification.</p>');
  void runAction(async () => {
    await markNotificationsRead();
    renderHeader();
  });
}

/* ---------- Events ---------- */

const actions = {
  tab(el) { ui.tab = el.dataset.tab; render(); window.scrollTo(0, 0); },
  filter(el) { ui.filter = el.dataset.filter; render(); },
  async "toggle-online"() {
    const online = await goOnline(!state.online);
    if (online) startLocationTracking();
    else stopLocationTracking();
    toast(online ? "Vous Ãªtes en ligne." : "Vous Ãªtes hors ligne.");
    render();
  },
  detail(el) { detailSheet(el.dataset.id); },
  async accept(el) {
    await acceptMission(el.dataset.id);
    closeSheet();
    ui.tab = "missions";
    render();
    toast("Mission acceptÃ©e. Direction le restaurant !");
  },
  async advance() {
    await advanceMission();
    render();
  },
  async refuse(el) { await refuseMission(el.dataset.id); render(); toast("Offre refusÃ©e."); },
  bell() { notifSheet(); },
  close() { closeSheet(); },
  async logout() { stopLocationTracking(); await logout(); ui.tab = "missions"; render(); toast("Vous Ãªtes dÃ©connectÃ©."); },
  async refresh() { await refreshOffers(); render(); },
  async "refresh-history"() { await refreshHistory(); render(); },
  async "refresh-profile"() { await refreshProfile(); render(); },
  install() {
    const prompt = ui.installPrompt;
    if (!prompt) return;
    prompt.prompt();
    ui.installPrompt = null;
    render();
  }
};

document.addEventListener("click", event => {
  const overlay = $("overlay");
  if (event.target === overlay) return closeSheet();
  const el = event.target.closest("[data-act]");
  if (!el || !actions[el.dataset.act]) return;
  if (state.mustChange && el.dataset.act !== "logout") return;
  const action = actions[el.dataset.act];
  const asynchronous = ["toggle-online", "accept", "advance", "refuse", "logout", "refresh", "refresh-history", "refresh-profile"].includes(el.dataset.act);
  if (asynchronous) void runAction(() => action(el));
  else action(el);
});

document.addEventListener("submit", async event => {
  event.preventDefault();
  const form = event.target;
  if (state.mustChange && form.id !== "change-secret-form") return;
  if (form.id === "login-form") {
    const submit = form.querySelector("[type=submit]");
    submit.disabled = true;
    try {
      await login(form.phone.value, form.pin.value);
      ui.tab = "missions";
      render();
      toast(`Bienvenue ${state.session.name.split(" ")[0]} !`);
    } catch (error) {
      $("login-error").textContent = error.message || "Connexion impossible.";
      form.pin.value = "";
      form.pin.focus();
    } finally {
      submit.disabled = false;
    }
  } else if (form.id === "change-secret-form") {
    const submit = form.querySelector("[type=submit]");
    submit.disabled = true;
    try {
      await changeSecret(form.current.value, form.next.value);
      render();
      toast("PIN modifiÃ©. Vous pouvez continuer.");
    } catch (error) {
      const message = $("change-error");
      if (message) message.textContent = error.message || "Impossible de modifier le PIN.";
      form.next.value = "";
      if (document.contains(form.next)) form.next.focus();
    } finally {
      if (document.contains(submit)) submit.disabled = false;
    }
  } else if (form.id === "deliver-form") {
    const earning = state.active.earning;
    const submit = form.querySelector("[type=submit]");
    submit.disabled = true;
    try {
      await completeMission(form.code.value.trim(), form["cash-ok"]?.checked ?? true);
      render();
      toast(`Livraison terminÃ©e Â· +${money(earning)}`);
    } catch (error) {
      $("deliver-error").textContent = error.message || "Impossible de confirmer la livraison.";
    } finally {
      if (document.contains(submit)) submit.disabled = false;
    }
  }
});

document.addEventListener("keydown", event => {
  const overlay = $("overlay");
  if (overlay.hidden) return;
  if (event.key === "Escape") return closeSheet();
  if (event.key !== "Tab") return;
  const focusable = [...overlay.querySelectorAll("button, input, textarea, a[href]")].filter(el => !el.disabled);
  if (!focusable.length) return;
  const first = focusable[0], last = focusable[focusable.length - 1];
  if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
  else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
});

window.addEventListener("beforeinstallprompt", event => {
  event.preventDefault();
  ui.installPrompt = event;
  if (state.session && ui.tab === "profile") render();
});
window.addEventListener("appinstalled", () => { ui.installPrompt = null; if (state.session) render(); });

let locationWatch = null;
let lastPositionSent = 0;
let polling = false;
let seenStatus = null;

// Rings for new delivery offers (and again while one is waiting), chimes when an order becomes ready.
function soundForMissions() {
  const all = [...state.missions, ...(state.active ? [state.active] : [])];
  const current = new Map(all.map(mission => [mission.id, mission.orderStatus]));
  const previous = seenStatus;
  seenStatus = current;
  if (!previous) return;
  const becameReady = all.some(mission => mission.orderStatus === "ready" && previous.has(mission.id) && previous.get(mission.id) !== "ready");
  const newOffer = state.missions.some(mission => !previous.has(mission.id));
  if (becameReady) GKSound.play("ready");
  else if (newOffer || state.missions.length) GKSound.play("order");
}

function startLocationTracking() {
  if (locationWatch !== null) return;
  if (!navigator.geolocation) {
    state.locationError = "La gÃ©olocalisation nâ€™est pas disponible dans ce navigateur.";
    render();
    return;
  }
  locationWatch = navigator.geolocation.watchPosition(position => {
    state.locationError = "";
    const { latitude: lat, longitude: lng } = position.coords;
    if (Date.now() - lastPositionSent < 15000) return;
    lastPositionSent = Date.now();
    GKApi.patch("/api/courier/position", { lat, lng }, "courier")
      .catch(error => { state.locationError = error.message || "Position non envoyÃ©e."; render(); });
  }, error => {
    state.locationError = error.code === error.PERMISSION_DENIED
      ? "La localisation est refusÃ©e. Autorisez-la pour partager votre position de livraison."
      : "La localisation est indisponible. Vous pouvez rester en ligne sans partager votre position.";
    render();
  }, { enableHighAccuracy: true, maximumAge: 15000, timeout: 20000 });
}

function stopLocationTracking() {
  if (locationWatch !== null && navigator.geolocation) navigator.geolocation.clearWatch(locationWatch);
  locationWatch = null;
  state.locationError = "";
}

async function pollServer() {
  if (!state.session || state.mustChange || polling) return;
  polling = true;
  const before = JSON.stringify([state.online, { ...state.profile, serverTime: 0 }, state.missions, state.active, state.history, state.notifications, state.offersError, state.historyError, state.profileError, state.actionError]);
  try {
    const errors = await refreshAll();
    if (!errors.length) soundForMissions();
    if (errors.length) state.actionError = errors[0].message || "Certaines donnÃ©es nâ€™ont pas pu Ãªtre actualisÃ©es.";
    else state.actionError = "";
  } finally {
    polling = false;
  }
  const after = JSON.stringify([state.online, { ...state.profile, serverTime: 0 }, state.missions, state.active, state.history, state.notifications, state.offersError, state.historyError, state.profileError, state.actionError]);
  if (before !== after && $("overlay").hidden) render();
}

window.addEventListener("gk-api-session-expired", event => {
  if (event.detail?.scope !== "courier") return;
  stopLocationTracking();
  state.session = null;
  state.mustChange = false;
  state.profile = null;
  state.online = false;
  state.missions = [];
  state.active = null;
  render();
  toast("Votre session a expirÃ©. Reconnectez-vous.");
});

setInterval(() => {
  if (state.session) void pollServer();
}, 6000);

setInterval(() => {
  document.querySelectorAll(".offer-timer").forEach(el => {
    el.textContent = `${Math.max(0, Math.ceil((Number(el.dataset.expires) - Date.now()) / 1000))} s`;
  });
}, 1000);

if ("serviceWorker" in navigator && /^https?:$/.test(location.protocol)) {
  navigator.serviceWorker.register("./sw.js").catch(() => {});
}

render();
if (state.session && !state.mustChange) {
  void refreshAll().then(() => {
    if (state.online) startLocationTracking();
    render();
  });
}
