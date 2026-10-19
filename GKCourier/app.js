const ui = { tab: "missions", filter: "today", reason: "", lastFocus: null, installPrompt: null };
const $ = id => document.getElementById(id);
const money = n => `${n} MAD`;
const NAV = [
  { id: "missions", label: "Missions", icon: "bike" },
  { id: "history", label: "Historique", icon: "receipt" },
  { id: "earnings", label: "Gains", icon: "wallet" },
  { id: "profile", label: "Profil", icon: "user" }
];
const STEPS = ["Accepté", "Arrivé", "Récupéré", "En route", "Livré"];
const STEP_BUTTONS = { 1: "Arrivé au restaurant", 2: "Commande récupérée", 3: "Je suis en route" };
const STEP_HINTS = {
  1: "Rendez-vous au restaurant G&K Food.",
  2: "Récupérez la commande au comptoir.",
  3: "Vérifiez la commande puis partez chez le client.",
  4: "Remettez la commande et saisissez le code du client."
};
const REASONS = ["Client injoignable", "Adresse introuvable", "Commande refusée", "Autre"];
// Courier pin position (left %, top %) per step on the demo map.
const COURIER_POS = { 1: [8, 88], 2: [24, 68], 3: [24, 68], 4: [58, 44] };
const MAP_LABELS = { 1: "En direction du restaurant", 2: "Au restaurant", 3: "Commande en main", 4: "En route vers le client" };

const dayFmt = new Intl.DateTimeFormat("fr-FR", { weekday: "long", day: "numeric", month: "long" });
const timeFmt = new Intl.DateTimeFormat("fr-FR", { hour: "2-digit", minute: "2-digit" });
const shortDay = new Intl.DateTimeFormat("fr-FR", { weekday: "short" });
const fullDate = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "long" });

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

const unreadCount = () => state.notifications.filter(n => !n.read).length;
const waLink = phone => `https://wa.me/212${phone.replace(/^0/, "")}`;
const telLink = phone => `tel:${phone.replace(/^0/, "+212")}`;
const paymentBadge = m => m.payment === "cash"
  ? `<span class="badge">${icon("cash")} Espèces ${money(m.total)}</span>`
  : `<span class="badge ok">${icon("card")} Payé en ligne</span>`;

/* ---------- Views ---------- */

function renderHeader() {
  $("app-header").innerHTML = state.session ? `
    <img class="brand-logo" src="./assets/emblem-reference.png" alt="G&K" />
    <span class="role-pill">LIVREUR</span>
    <span class="header-spacer"></span>
    <button class="icon-button" type="button" data-act="bell" aria-label="Notifications${unreadCount() ? `, ${unreadCount()} non lues` : ""}">
      ${icon("bell")}${unreadCount() ? '<span class="dot"></span>' : ""}
    </button>` : "";
}

function renderNav() {
  const badge = state.active ? 1 : state.online ? state.missions.length : 0;
  $("bottom-nav").innerHTML = state.session ? NAV.map(item => `
    <button class="nav-button${ui.tab === item.id ? " active" : ""}" type="button" data-act="tab" data-tab="${item.id}"${ui.tab === item.id ? ' aria-current="page"' : ""}>
      <span class="nav-icon">${icon(item.icon)}</span>${item.label}
      ${item.id === "missions" && badge ? `<span class="nav-badge" aria-label="${badge} mission(s)">${badge}</span>` : ""}
    </button>`).join("") : "";
}

function loginView() {
  const locked = lockRemaining() > 0;
  return `
    <section class="login" aria-labelledby="login-title">
      <img class="login-logo" src="./assets/emblem-reference.png" alt="G&K" />
      <div><span class="role-pill">LIVREUR</span></div>
      <h1 id="login-title">Connexion livreur</h1>
      <form id="login-form" novalidate>
        <div class="field">
          <label for="phone">Téléphone</label>
          <input id="phone" name="phone" type="tel" inputmode="tel" autocomplete="tel" placeholder="06 12 34 56 78" value="${esc(DEMO_PHONE)}" />
        </div>
        <div class="field">
          <label for="pin">Code PIN (4 chiffres)</label>
          <input id="pin" class="pin-input" name="pin" type="password" inputmode="numeric" maxlength="4" autocomplete="current-password" placeholder="••••" />
        </div>
        <p id="login-error" class="form-error" role="alert">${locked ? esc(`Trop de tentatives. Réessayez dans ${lockRemaining()} s.`) : ""}</p>
        <button class="gold-button" type="submit">Se connecter ${icon("arrowRight")}</button>
        <p class="demo-hint">Démo : 0612345678 · PIN 1234</p>
      </form>
      <p class="admin-note">${icon("shield")} Compte créé par l'administrateur G&amp;K</p>
    </section>`;
}

function missionCard(m) {
  const z = zones[m.zone];
  return `
    <article class="mission">
      <button class="mission-main" type="button" data-act="detail" data-id="${esc(m.id)}" aria-label="Détails de la mission ${esc(m.id)}">
        <div class="mission-top"><span class="mission-id">${esc(m.id)}</span><span class="earning">+${money(m.earning)}</span></div>
        <div class="mission-route">
          <div>${icon("store")}<span>${esc(RESTAURANT.name)}</span></div>
          <div>${icon("pin")}<span>${esc(m.customer)} · ${esc(m.address)} <span class="muted">(${esc(z.name)})</span></span></div>
        </div>
        <div class="mission-meta">
          <span class="badge dark">${icon("navigate")} ${m.km} km</span>
          ${paymentBadge(m)}
        </div>
        <p class="muted" style="font-size:12px">${esc(m.items)} · Total ${money(m.total)}</p>
      </button>
      <div class="mission-foot">${m.offer
        ? `<span class="badge offer-timer" data-expires="${m.expiresAt}" aria-live="off">${offerLeft(m)} s</span>
           <button class="outline-button" type="button" data-act="refuse" data-id="${esc(m.id)}">Refuser</button>
           <button class="gold-button" type="button" data-act="accept" data-id="${esc(m.id)}">Accepter</button>`
        : `<button class="gold-button" type="button" data-act="accept" data-id="${esc(m.id)}">Accepter</button>`}</div>
    </article>`;
}

const offerLeft = m => Math.max(0, Math.ceil((m.expiresAt - Date.now()) / 1000));

function missionsView() {
  if (state.active) return activeView();
  const body = !state.online ? `
      <div class="empty">${icon("bike")}<strong>Vous êtes hors ligne</strong>
        <p>Passez en ligne pour recevoir des missions de livraison.</p></div>`
    : !state.missions.length ? `
      <div class="empty">${icon("clock")}<strong>En attente de missions…</strong>
        <p>Les nouvelles missions apparaîtront ici automatiquement.</p></div>`
    : state.missions.map(missionCard).join("");
  return `
    <div class="online-card${state.online ? " on" : ""}">
      <div><strong>${state.online ? "En ligne" : "Hors ligne"}</strong>
        <small>${state.online ? "Vous recevez des missions" : "Vous ne recevez aucune mission"}</small></div>
      <button class="switch" type="button" role="switch" aria-checked="${state.online}" aria-label="Statut en ligne" data-act="toggle-online"></button>
    </div>
    ${state.online ? `<div class="section-heading"><h2>Missions disponibles</h2><small>${state.missions.length}/${MAX_AVAILABLE}</small></div>` : ""}
    ${linked() ? "" : `<p class="muted demo-note">Mode démo hors liaison : missions simulées (ouvrez l'app via http://localhost pour la liaison Cuisine).</p>`}
    ${body}`;
}

function mapCard(m) {
  const [cx, cy] = COURIER_POS[m.step];
  return `
    <div class="tracking-map" role="img" aria-label="Carte : ${esc(MAP_LABELS[m.step])}">
      <svg class="route" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true"><line x1="24" y1="68" x2="76" y2="28"></line></svg>
      <span class="map-pin" style="left:24%;top:68%" title="Restaurant">${icon("store")}</span>
      <span class="map-pin destination" style="left:76%;top:28%" title="Client">${icon("pin")}</span>
      <span class="map-pin courier" style="left:${cx}%;top:${cy}%" title="Vous">${icon("bike")}</span>
      <span class="map-label">${esc(MAP_LABELS[m.step])} · ${m.km} km</span>
    </div>`;
}

function activeView() {
  const m = state.active;
  const z = zones[m.zone];
  const stepper = STEPS.map((label, i) => `
    <li class="step${i < m.step ? " done" : i === m.step ? " current" : ""}"${i === m.step ? ' aria-current="step"' : ""}>
      <span class="step-dot">${i < m.step ? icon("check") : i + 1}</span>${label}</li>`).join("");
  const cash = m.payment === "cash"
    ? `<div class="cash-alert"><span>${icon("cash")} Espèces à encaisser</span><strong>${money(m.total)}</strong></div>` : "";
  const waiting = linked() && m.step === 2 && m.orderStatus !== "ready";
  const action = m.step < 4
    ? `<button class="gold-button" type="button" data-act="advance"${waiting ? " disabled" : ""}>${waiting ? "En attente de la cuisine…" : `${STEP_BUTTONS[m.step]} ${icon("arrowRight")}`}</button>`
    : `<form id="deliver-form" class="card" novalidate>
        <h3>Confirmer la livraison</h3>
        <div class="field" style="margin-top:10px">
          <label for="code">Code de livraison du client</label>
          <input id="code" class="pin-input" name="code" type="text" inputmode="numeric" maxlength="4" autocomplete="one-time-code" placeholder="••••" />
        </div>
        <p class="code-hint" style="margin-top:10px">Démo : le code du client est ${esc(DELIVERY_CODE)}.</p>
        ${m.payment === "cash" ? `<label class="check-row"><input id="cash-ok" type="checkbox" /> Espèces encaissées (${money(m.total)})</label>` : ""}
        <p id="deliver-error" class="form-error" role="alert"></p>
        <button class="gold-button" type="submit">${icon("check")} Livré</button>
      </form>`;
  return `
    <h1 class="screen-title">Mission ${esc(m.id)}</h1>
    <ol class="stepper" aria-label="Progression">${stepper}</ol>
    ${mapCard(m)}
    <div class="card">
      <div class="mission-top"><span class="badge">${esc(STEP_HINTS[m.step])}</span><span class="earning">+${money(m.earning)}</span></div>
      <div class="kv">
        <div><span>Restaurant</span><span>${esc(RESTAURANT.name)}</span></div>
        <div><span>Client</span><span>${esc(m.customer)}</span></div>
        <div><span>Adresse</span><span>${esc(m.address)}<br>${esc(z.name)} · ${m.km} km</span></div>
        <div><span>Articles</span><span>${esc(m.items)}</span></div>
        <div><span>Paiement</span><span>${m.payment === "cash" ? "Espèces" : "Payé en ligne"}</span></div>
      </div>
      <div class="contact-row">
        <a class="outline-button" href="${telLink(m.phone)}" aria-label="Appeler ${esc(m.customer)}">${icon("phone")} Appeler</a>
        <a class="outline-button" href="${waLink(m.phone)}" target="_blank" rel="noopener" aria-label="WhatsApp ${esc(m.customer)}">${icon("chat")} WhatsApp</a>
      </div>
      ${cash}
    </div>
    <div class="sticky-actions">
      ${action}
      <button class="outline-button danger full" type="button" data-act="problem">${icon("alert")} Signaler un problème</button>
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
        <span class="row-copy"><strong>${esc(h.id)} · ${esc(h.customer)}</strong>
          <small>${timeFmt.format(h.at)} · ${esc(zones[h.zone].name)}${ok ? "" : ` · ${esc(h.note)}`}</small></span>
        <span class="row-amount${ok ? "" : " zero"}">${ok ? `+${money(h.earning)}` : "Annulée"}</span>
      </div>`;
  }).join("");
  return `
    <h1 class="screen-title">Historique</h1>
    <div class="chips" role="group" aria-label="Période">
      ${filters.map(([id, label]) => `<button class="chip" type="button" data-act="filter" data-filter="${id}" aria-pressed="${ui.filter === id}">${label}</button>`).join("")}
    </div>
    ${rows || `<div class="empty">${icon("receipt")}<strong>Aucune mission</strong><p>Rien à afficher pour cette période.</p></div>`}`;
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
  const today = filterHistory("today").filter(h => h.status === "delivered");
  const week = filterHistory("week").filter(h => h.status === "delivered");
  const cash = cashToRemit();
  const pending = pendingPayout();
  const payouts = [...state.payouts].sort((a, b) => b.at - a.at).map(p => `
    <div class="row"><span class="row-icon">${icon("wallet")}</span>
      <span class="row-copy"><strong>${esc(p.label)}</strong><small>${esc(fullDate.format(p.at))}</small></span>
      <span class="row-amount">${money(p.amount)}</span><span class="badge ok">Payé</span></div>`).join("");
  return `
    <h1 class="screen-title">Gains</h1>
    <div class="stat-grid">
      <div class="stat hero"><small>Aujourd'hui</small><strong>${money(sumEarnings(today))}</strong></div>
      <div class="stat"><small>Cette semaine</small><strong>${money(sumEarnings(week))}</strong></div>
      <div class="stat"><small>Livraisons (semaine)</small><strong>${week.length}</strong></div>
      <div class="stat"><small>Espèces à reverser</small><strong>${money(cash)}</strong></div>
    </div>
    ${cash ? `<button class="outline-button full" type="button" data-act="remit" style="margin-top:12px">${icon("cash")} Marquer comme reversé</button>` : ""}
    <div class="section-heading"><h2>7 derniers jours</h2><small>MAD</small></div>
    <div class="card">${chartSvg()}</div>
    <div class="section-heading"><h2>Versements</h2></div>
    <div class="row"><span class="row-icon">${icon("clock")}</span>
      <span class="row-copy"><strong>Prochain versement</strong><small>En attente</small></span>
      <span class="row-amount">${money(pending)}</span><span class="badge">En cours</span></div>
    ${payouts}`;
}

function profileView() {
  const s = state.session;
  const rate = Math.round((state.stats.accepted / Math.max(1, state.stats.offered)) * 100);
  return `
    <h1 class="screen-title">Profil</h1>
    <div class="profile-head">
      <span class="avatar" aria-hidden="true">KA</span>
      <div><h2>${esc(s.name)}</h2><p>${esc(s.phone)}</p><p>${icon("bike")} Véhicule : Moto</p></div>
    </div>
    <div class="stat-grid" style="margin-top:12px">
      <div class="stat"><small>Note</small><strong>${icon("star")} 4.9</strong></div>
      <div class="stat"><small>Taux d'acceptation</small><strong>${rate} %</strong></div>
    </div>
    <div class="section-heading"><h2>Assistance</h2></div>
    <div class="menu-list">
      <a class="menu-item" href="tel:${SUPPORT.tel}"><span class="row-icon">${icon("phone")}</span><span class="grow">Appeler le support<br><small class="muted">${esc(SUPPORT.telLabel)}</small></span></a>
      <a class="menu-item" href="https://wa.me/${SUPPORT.wa}" target="_blank" rel="noopener"><span class="row-icon">${icon("chat")}</span><span class="grow">Support WhatsApp</span></a>
      ${ui.installPrompt ? `<button class="menu-item" type="button" data-act="install"><span class="row-icon">${icon("download")}</span><span class="grow">Installer l'application</span></button>` : ""}
      <button class="menu-item" type="button" data-act="reset"><span class="row-icon">${icon("refresh")}</span><span class="grow">Réinitialiser les données de démo</span></button>
      <button class="menu-item danger" type="button" data-act="logout"><span class="row-icon">${icon("logout")}</span><span class="grow">Se déconnecter</span></button>
    </div>
    <p class="fineprint">G&amp;K Livreur · prototype de démonstration</p>`;
}

function render() {
  document.body.toggleAttribute("data-bare", !state.session);
  renderHeader();
  renderNav();
  const views = { missions: missionsView, history: historyView, earnings: earningsView, profile: profileView };
  $("app-main").innerHTML = state.session ? views[ui.tab]() : loginView();
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
    <div class="mission-top"><span class="badge">${esc(zones[m.zone].name)} · ${m.km} km</span><span class="earning">+${money(m.earning)}</span></div>
    <div class="kv">
      <div><span>Retrait</span><span>${esc(RESTAURANT.name)}<br>${esc(RESTAURANT.address)}</span></div>
      <div><span>Client</span><span>${esc(m.customer)}</span></div>
      <div><span>Livraison</span><span>${esc(m.address)}</span></div>
      <div><span>Articles</span><span>${esc(m.items)}</span></div>
      <div><span>Total commande</span><span>${money(m.total)}</span></div>
      <div><span>Paiement</span><span>${m.payment === "cash" ? `Espèces à encaisser : ${money(m.total)}` : "Payé en ligne"}</span></div>
    </div>
    <button class="gold-button" type="button" data-act="accept" data-id="${esc(m.id)}">Accepter la mission</button>`);
}

function notifSheet() {
  const items = state.notifications.map(n => `
    <div class="notif${n.read ? "" : " unread"}"><span class="row-icon">${icon("bell")}</span>
      <div>${esc(n.text)}<small>${esc(dayLabel(n.at))} · ${timeFmt.format(n.at)}</small></div></div>`).join("");
  openSheet("Notifications", items || '<p class="muted">Aucune notification.</p>');
  state.notifications.forEach(n => { n.read = true; });
  save();
  renderHeader();
}

function problemSheet() {
  ui.reason = "";
  openSheet("Signaler un problème", `
    <form id="problem-form" class="panel-body" style="padding:0" novalidate>
      ${REASONS.map(r => `<button class="pick" type="button" data-act="pick-reason" data-reason="${esc(r)}" aria-pressed="false">${esc(r)}</button>`).join("")}
      <div class="field"><label for="problem-note">Précisions (facultatif)</label><textarea id="problem-note" maxlength="200"></textarea></div>
      <p id="problem-error" class="form-error" role="alert"></p>
      <button class="gold-button" type="submit">Annuler la mission</button>
    </form>`);
}

/* ---------- Events ---------- */

const actions = {
  tab(el) { ui.tab = el.dataset.tab; render(); window.scrollTo(0, 0); },
  filter(el) { ui.filter = el.dataset.filter; render(); },
  "toggle-online"() {
    goOnline(!state.online);
    toast(state.online ? "Vous êtes en ligne." : "Vous êtes hors ligne.");
    render();
  },
  detail(el) { detailSheet(el.dataset.id); },
  accept(el) {
    const result = acceptMission(el.dataset.id);
    if (result === "busy") return toast("Terminez d'abord votre mission en cours.");
    if (result === "gone") { closeSheet(); render(); return toast("Mission plus disponible."); }
    closeSheet();
    ui.tab = "missions";
    render();
    toast("Mission acceptée. Direction le restaurant !");
  },
  advance() {
    const error = advanceMission();
    if (error) toast(error);
    render();
  },
  refuse(el) { refuseMission(el.dataset.id); render(); toast("Offre refusée."); },
  bell() { notifSheet(); },
  close() { closeSheet(); },
  problem() { problemSheet(); },
  "pick-reason"(el) {
    ui.reason = el.dataset.reason;
    $("overlay").querySelectorAll("[data-act='pick-reason']").forEach(b => b.setAttribute("aria-pressed", String(b === el)));
  },
  remit() { remitCash(); toast("Espèces reversées."); render(); },
  logout() { logout(); ui.tab = "missions"; render(); toast("Vous êtes déconnecté."); },
  reset() { resetDemo(); ui.tab = "missions"; ui.filter = "today"; render(); toast("Données de démo réinitialisées."); },
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
  if (el && actions[el.dataset.act]) actions[el.dataset.act](el);
});

document.addEventListener("submit", event => {
  event.preventDefault();
  const form = event.target;
  if (form.id === "login-form") {
    const error = login(form.phone.value, form.pin.value);
    if (error) {
      $("login-error").textContent = error;
      form.pin.value = "";
      form.pin.focus();
      return;
    }
    ui.tab = "missions";
    render();
    toast(`Bienvenue ${state.session.name.split(" ")[0]} !`);
  } else if (form.id === "deliver-form") {
    const earning = state.active.earning;
    const error = completeMission(form.code.value.trim(), form["cash-ok"]?.checked ?? true);
    if (error) { $("deliver-error").textContent = error; return; }
    render();
    toast(`Livraison terminée · +${money(earning)}`);
  } else if (form.id === "problem-form") {
    if (!ui.reason) { $("problem-error").textContent = "Choisissez un motif."; return; }
    reportProblem(ui.reason, form["problem-note"].value.trim());
    closeSheet();
    render();
    toast("Mission annulée et signalée.");
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

// New missions every ~45 s while online (max 5 available) — standalone demo only.
setInterval(() => {
  if (linked()) return;
  const mission = spawnMission();
  if (!mission) return;
  toast(`Nouvelle mission ${mission.id} · +${money(mission.earning)}`);
  renderHeader();
  renderNav();
  if (ui.tab === "missions" && !state.active && $("overlay").hidden) render();
}, 45000);

function onBusChange() {
  if (!linked() || !state.session) return;
  const { changed, notes } = syncBus();
  notes.forEach(n => toast(`${n.title} · ${n.text}`));
  if (notes.length) renderHeader();
  if (changed) {
    renderNav();
    const typing = document.activeElement && /^(INPUT|TEXTAREA)$/.test(document.activeElement.tagName);
    if (ui.tab === "missions" && $("overlay").hidden && !typing) render();
  }
}

if (window.GKBus) {
  GKBus.subscribe(onBusChange);
  if (linked() && state.session) {
    if (!state.session.courierId) { state.session = null; save(); }
    else syncBus();
  }
}

setInterval(() => {
  if (!linked()) return;
  GKBus.tick();
  GKBus.heartbeat("courier");
  onBusChange();
  document.querySelectorAll(".offer-timer").forEach(el => { el.textContent = `${Math.max(0, Math.ceil((Number(el.dataset.expires) - Date.now()) / 1000))} s`; });
}, 1000);

// Login lock countdown.
setInterval(() => {
  const note = $("login-error");
  if (state.session || !note) return;
  const left = lockRemaining();
  if (left > 0) note.textContent = `Trop de tentatives. Réessayez dans ${left} s.`;
  else if (note.textContent.startsWith("Trop de tentatives")) note.textContent = "";
}, 1000);

if ("serviceWorker" in navigator && /^https?:$/.test(location.protocol)) {
  navigator.serviceWorker.register("./sw.js").catch(() => {});
}

render();
