const ui = { tab: "missions", filter: "today", lastFocus: null, installPrompt: null };
const $ = id => document.getElementById(id);
const money = n => `${n} MAD`;
const NAV = [
  { id: "missions", label: "Missions", icon: "bike" },
  { id: "history", label: "Historique", icon: "receipt" },
  { id: "earnings", label: "Gains", icon: "wallet" },
  { id: "profile", label: "Profil", icon: "user" }
];
// Four stages the driver actually experiences. Server steps 3 and 4 both mean "en route".
const STEPS = ["Accepté", "Au restaurant", "En route", "Livré"];
const stageOf = m => (m.step >= 4 ? 2 : m.step >= 2 ? 1 : 0);
const STEP_BUTTONS = {
  1: "Je suis au restaurant",
  2: "Commande récupérée",
  4: "Confirmer la livraison"
};
const scene = (name, className = "") => (window.GKLottie ? GKLottie.animation(name, { className }) : "");

const dayFmt = new Intl.DateTimeFormat("fr-FR", { weekday: "long", day: "numeric", month: "long" });
const timeFmt = new Intl.DateTimeFormat("fr-FR", { hour: "2-digit", minute: "2-digit" });
const shortDay = new Intl.DateTimeFormat("fr-FR", { weekday: "short" });

function mapsNavUrl(dest) {
  const apple = /iPhone|iPad|iPod/i.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  if (apple) return `https://maps.apple.com/?daddr=${encodeURIComponent(dest)}&dirflg=d`;
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(dest)}&travelmode=driving`;
}

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

const telLink = phone => `tel:${phone.replace(/^0/, "+212")}`;
const unreadCount = () => state.notifications.filter(n => !n.read).length;

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
          <label for="phone">Téléphone</label>
          <input id="phone" name="phone" type="tel" inputmode="tel" autocomplete="tel" placeholder="06 12 34 56 78" required />
        </div>
        <div class="field">
          <label for="pin">Code PIN (4 chiffres)</label>
          <input id="pin" class="pin-input" name="pin" type="password" inputmode="numeric" maxlength="4" autocomplete="current-password" placeholder="••••" />
        </div>
        <p id="login-error" class="form-error" role="alert"></p>
        <button class="gold-button" type="submit">Se connecter ${icon("arrowRight")}</button>
        <p class="muted">Saisissez les identifiants fournis par votre administrateur.</p>
      </form>
      <p class="admin-note">${icon("shield")} Compte créé par l'administrateur G&amp;K</p>
    </section>`;
}

function changeSecretView() {
  return `
    <section class="login" aria-labelledby="change-secret-title">
      <img class="login-logo" src="./assets/emblem-reference.png" alt="G&K" />
      <div><span class="role-pill">LIVREUR</span></div>
      <h1 id="change-secret-title">Créez votre nouveau PIN</h1>
      <p class="muted">Votre administrateur vous a fourni un PIN temporaire. Modifiez-le avant de continuer.</p>
      <form id="change-secret-form" novalidate>
        <div class="field">
          <label for="current-pin">PIN actuel</label>
          <input id="current-pin" name="current" type="password" inputmode="numeric" autocomplete="current-password" maxlength="12" required />
        </div>
        <div class="field">
          <label for="next-pin">Nouveau PIN (4 chiffres)</label>
          <input id="next-pin" name="next" type="password" inputmode="numeric" autocomplete="new-password" maxlength="4" required />
        </div>
        <p id="change-error" class="form-error" role="alert"></p>
        <button class="gold-button" type="submit">Enregistrer le nouveau PIN ${icon("arrowRight")}</button>
      </form>
      <button class="outline-button" type="button" data-act="logout">Se déconnecter</button>
    </section>`;
}

const offerLeft = m => Math.max(0, Math.ceil((m.expiresAt - Date.now()) / 1000));

function offerClock(m) {
  return `<span class="offer-clock" data-expires="${m.expiresAt}" style="--p:1">
    <svg viewBox="0 0 36 36" aria-hidden="true">
      <circle class="track" cx="18" cy="18" r="15" pathLength="100"></circle>
      <circle class="prog" cx="18" cy="18" r="15" pathLength="100"></circle>
    </svg><b>${offerLeft(m)}</b></span>`;
}

function offerCard(m) {
  return `
    <article class="offer">
      <button class="offer-body" type="button" data-act="detail" data-id="${esc(m.id)}" aria-label="Détails de la course ${esc(m.id)}">
        <div class="offer-head">
          <span class="offer-id">#${esc(m.id)}</span>
          ${m.offer ? offerClock(m) : ""}
          ${m.earning !== null ? `<span class="offer-earn">+${money(m.earning)}</span>` : ""}
        </div>
        <div class="offer-route">
          <span class="route-stop"><i class="route-dot pickup"></i><span>G&amp;K Food</span></span>
          <span class="route-stop"><i class="route-dot drop"></i><span>${esc(m.customer)}${m.customer && m.address ? " · " : ""}${esc(m.address)}${m.zone ? ` <em>(${esc(m.zone)})</em>` : ""}</span></span>
        </div>
        <div class="offer-meta">
          ${m.km !== null ? `<span class="tag">${icon("navigate")} ${m.km} km</span>` : ""}
          <span class="tag${m.payment === "cash" ? " cash" : " paid"}">${m.payment === "cash" ? `${icon("cash")} ${money(m.total)} à encaisser` : `${icon("card")} Payé en ligne`}</span>
        </div>
        <p class="offer-items">${esc(m.items)}</p>
      </button>
      <div class="offer-actions">
        <button class="ghost-button" type="button" data-act="refuse" data-id="${esc(m.id)}"${state.actionBusy ? " disabled" : ""}>Refuser</button>
        <button class="primary-button" type="button" data-act="accept" data-id="${esc(m.id)}"${state.actionBusy ? " disabled" : ""}>Accepter</button>
      </div>
    </article>`;
}

function statStrip() {
  const done = filterHistory("today").filter(h => h.status === "delivered");
  const cash = Number(state.profile?.cashToRemit) || 0;
  return `
    <div class="stat-strip" aria-label="Résumé du jour">
      <div><b>${done.length}</b><small>Courses</small></div>
      <div><b>${sumEarnings(done)}<i> MAD</i></b><small>Gains du jour</small></div>
      <div><b>${cash}<i> MAD</i></b><small>Espèces</small></div>
    </div>`;
}

function statusHero() {
  const waiting = state.online && !state.missions.length;
  const art = !state.online ? scene("gk-courier-offline", "hero-art")
    : waiting ? scene("gk-courier-radar", "hero-art") : "";
  const title = !state.online ? "Repos" : waiting ? "Recherche de courses…" : "Vous recevez les offres";
  const detail = !state.online ? "Passez en ligne pour recevoir des courses."
    : waiting ? "Les offres arrivent ici automatiquement." : "Acceptez une offre pour démarrer.";
  return `
    <section class="hero${state.online ? " on" : ""}">
      ${art ? `<div class="hero-art-wrap">${art}</div>` : ""}
      <div class="hero-copy">
        <span class="hero-eyebrow">${state.online ? "En ligne" : "Hors ligne"}</span>
        <strong>${title}</strong>
        <small>${detail}</small>
      </div>
      <button class="switch" type="button" role="switch" aria-checked="${state.online}" aria-label="Statut en ligne" data-act="toggle-online"${state.actionBusy ? " disabled" : ""}></button>
    </section>`;
}

function missionsView() {
  if (state.active) return activeView();
  const body = !state.online ? ""
    : state.offersLoading && !state.missions.length ? (window.GKLottie
      ? GKLottie.loading("Chargement des courses…")
      : `<div class="empty">${icon("clock")}<strong>Chargement des courses…</strong></div>`)
    : state.offersError && !state.missions.length ? `
      <div class="empty">${icon("alert")}<strong>Impossible de charger les courses</strong>
        <p>${esc(state.offersError)}</p><button class="ghost-button" type="button" data-act="refresh">Réessayer</button></div>`
    : !state.missions.length ? ""
    : state.missions.map(offerCard).join("");
  return `
    ${statusHero()}
    ${statStrip()}
    ${state.online && state.missions.length ? `<div class="section-heading"><h2>Offres</h2><small>${state.missions.length}</small></div>` : ""}
    ${state.offersError && state.missions.length ? `<p class="form-error" role="alert">${esc(state.offersError)} <button class="ghost-button" type="button" data-act="refresh">Réessayer</button></p>` : ""}
    ${body}`;
}

function stageCard(m) {
  const waiting = m.step === 2 && m.orderStatus !== "ready";
  const art = waiting ? scene("gk-empty-bag", "stage-art") : scene("gk-courier-ride", "stage-art");
  const title = waiting ? "La cuisine prépare la commande" : m.step >= 4 ? "En route vers le client" : "Direction le restaurant";
  const detail = waiting ? "Attendez le signal avant de partir."
    : m.step >= 4 ? `${m.km !== null ? `${m.km} km · ` : ""}Demandez le code au client`
      : "Commande à récupérer au comptoir";
  return `
    <div class="stage${waiting ? " waiting" : ""}" role="status">
      <div class="stage-art-wrap">${art}</div>
      <div class="stage-copy"><strong>${esc(title)}</strong><small>${esc(detail)}</small></div>
    </div>`;
}

function activeView() {
  const m = state.active;
  const stage = stageOf(m);
  const waiting = m.step === 2 && m.orderStatus !== "ready";
  const stepper = STEPS.map((label, i) => `
    <li class="step${i < stage ? " done" : i === stage ? " current" : ""}"${i === stage ? ' aria-current="step"' : ""}>
      <span class="step-bar"></span><span class="step-label">${label}</span></li>`).join("");
  const cash = m.payment === "cash"
    ? `<div class="cash-banner"><span>${icon("cash")} À encaisser</span><strong>${money(m.total)}</strong></div>` : "";
  const action = m.step === 4
    ? `<button class="primary-button big" type="submit" form="deliver-form">${icon("check")} Confirmer la livraison</button>`
    : `<button class="primary-button big" type="button" data-act="advance"${waiting || state.actionBusy ? " disabled" : ""}>${waiting ? "En attente de la cuisine…" : esc(STEP_BUTTONS[m.step] || "Actualiser")} ${icon("arrowRight")}</button>`;
  const deliverForm = m.step === 4 ? `
      <form id="deliver-form" class="card delivery" novalidate>
        <h3>Code de livraison</h3>
        <p class="hint">Demandez le code imprimé sur le ticket (pas le n° de commande).</p>
        <input id="code" class="code-input" name="code" type="text" inputmode="numeric" maxlength="8" autocomplete="one-time-code" placeholder="00000" aria-label="Code de livraison" />
        ${m.payment === "cash" ? `<label class="check-row"><input id="cash-ok" type="checkbox" /> Espèces encaissées (${money(m.total)})</label>` : ""}
        <p id="deliver-error" class="form-error" role="alert"></p>
      </form>` : "";
  const toPickup = m.step < 4;
  const dest = toPickup ? (m.pickupCoords || m.pickupAddress) : (m.coords || m.rawAddress);
  const targetLabel = toPickup ? "Restaurant" : "Client";
  const targetName = toPickup ? "G&K Food" : m.customer;
  const targetDetail = toPickup
    ? "Récupérez la commande au comptoir"
    : `${m.address}${m.km !== null ? ` · ${m.km} km` : ""}`;
  return `
    <div class="mission-head">
      <div><span class="mission-kicker">Course en cours</span><h1 class="screen-title">#${esc(m.id)}</h1></div>
      ${m.earning !== null ? `<span class="offer-earn lg">+${money(m.earning)}</span>` : ""}
    </div>
    <ol class="progress" aria-label="Progression">${stepper}</ol>
    ${stageCard(m)}
    <div class="card target-card">
      <span class="target-label">${targetLabel}</span>
      <strong>${esc(targetName || "Client")}</strong>
      <small>${esc(targetDetail)}</small>
      <div class="quick-actions">
        ${dest ? `<a class="quick primary" href="${mapsNavUrl(dest)}" target="_blank" rel="noopener">${icon("navigate")}<span>Maps</span></a>` : ""}
        ${m.phone ? `<a class="quick" href="${telLink(m.phone)}">${icon("phone")}<span>Appeler</span></a>` : ""}
        <button class="quick" type="button" data-act="open-chat" data-id="${esc(m.id)}" data-name="${esc(m.customer)}">${icon("chat")}<span>Message</span>${chatUnread[m.id] ? `<span class="gkc-badge">${chatUnread[m.id]}</span>` : ""}</button>
      </div>
    </div>
    ${cash}
    <details class="card more">
      <summary>Détails de la course</summary>
      <div class="kv">
        <div><span>Restaurant</span><span>G&amp;K Food</span></div>
        <div><span>Client</span><span>${esc(m.customer)}</span></div>
        <div><span>Adresse</span><span>${esc(m.address)}${m.zone ? `<br>${esc(m.zone)}` : ""}${m.km !== null ? ` · ${m.km} km` : ""}</span></div>
        <div><span>Articles</span><span>${esc(m.items)}</span></div>
        <div><span>Paiement</span><span>${m.payment === "cash" ? `Espèces · ${money(m.total)}` : "Payé en ligne"}</span></div>
        <div><span>Total</span><span>${money(m.total)}</span></div>
      </div>
    </details>
    ${deliverForm}
    <div class="sticky-actions">${action}</div>`;
}

function historyView() {
  const list = filterHistory(ui.filter);
  const filters = [["today", "Aujourd'hui"], ["week", "Semaine"], ["all", "Tout"]];
  const totals = new Map();
  list.forEach(h => {
    const day = startOfDay(h.at);
    const t = totals.get(day) || { count: 0, sum: 0 };
    t.count += 1;
    if (h.status === "delivered") t.sum += Number(h.earning) || 0;
    totals.set(day, t);
  });
  let lastDay = null;
  const rows = list.map(h => {
    const day = startOfDay(h.at);
    const head = day !== lastDay
      ? `<h2 class="day-label"><span>${esc(dayLabel(h.at))}</span><small>${totals.get(day).count} course${totals.get(day).count > 1 ? "s" : ""} · ${money(totals.get(day).sum)}</small></h2>`
      : "";
    lastDay = day;
    const ok = h.status === "delivered";
    return `${head}
      <div class="row">
        <span class="row-icon${ok ? "" : " bad"}">${icon(ok ? "check" : "alert")}</span>
        <span class="row-copy"><strong>#${esc(h.id)} · ${esc(h.customer)}</strong>
          <small>${timeFmt.format(h.at)}${h.zone ? ` · ${esc(h.zone)}` : ""}</small></span>
        <span class="row-amount${ok ? "" : " zero"}">${ok ? `+${money(h.earning)}` : "Annulée"}</span>
      </div>`;
  }).join("");
  return `
    <h1 class="screen-title">Historique</h1>
    <div class="chips" role="group" aria-label="Période">
      ${filters.map(([id, label]) => `<button class="chip" type="button" data-act="filter" data-filter="${id}" aria-pressed="${ui.filter === id}">${label}</button>`).join("")}
    </div>
    ${state.historyError && list.length ? `<p class="form-error" role="alert">${esc(state.historyError)} <button class="ghost-button" type="button" data-act="refresh-history">Réessayer</button></p>` : ""}
    ${state.historyLoading && !list.length
      ? (window.GKLottie ? GKLottie.loading("Chargement de l’historique…") : `<div class="empty">${icon("clock")}<strong>Chargement de l’historique…</strong></div>`)
      : state.historyError && !list.length
        ? `<div class="empty">${icon("alert")}<strong>Impossible de charger l’historique</strong><p>${esc(state.historyError)}</p><button class="ghost-button" type="button" data-act="refresh-history">Réessayer</button></div>`
        : rows || (window.GKLottie ? GKLottie.empty("Aucune course", "Rien à afficher pour cette période.") : `<div class="empty">${icon("receipt")}<strong>Aucune course</strong><p>Rien à afficher pour cette période.</p></div>`)}`;
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
    return `<h1 class="screen-title">Gains</h1>${window.GKLottie ? GKLottie.loading("Chargement des gains…") : `<div class="empty">${icon("clock")}<strong>Chargement des gains…</strong></div>`}`;
  }
  if (!state.historyLoaded && state.historyError) {
    return `<h1 class="screen-title">Gains</h1><div class="empty">${icon("alert")}<strong>Impossible de charger les gains</strong><p>${esc(state.historyError)}</p><button class="ghost-button" type="button" data-act="refresh-history">Réessayer</button></div>`;
  }
  const today = filterHistory("today").filter(h => h.status === "delivered");
  const week = filterHistory("week").filter(h => h.status === "delivered");
  const cash = Number(state.profile?.cashToRemit) || 0;
  return `
    <h1 class="screen-title">Gains</h1>
    <div class="money-hero">
      <small>Aujourd'hui</small>
      <strong>${money(sumEarnings(today))}</strong>
      <span>${today.length} course${today.length > 1 ? "s" : ""} · cette semaine ${money(sumEarnings(week))}</span>
    </div>
    <div class="stat-strip">
      <div><b>${week.length}</b><small>Courses 7j</small></div>
      <div><b>${sumEarnings(week)}<i> MAD</i></b><small>7 derniers jours</small></div>
      <div><b>${cash}<i> MAD</i></b><small>À reverser</small></div>
    </div>
    <div class="section-heading"><h2>7 derniers jours</h2><small>MAD</small></div>
    <div class="card chart-card">${chartSvg()}</div>
    ${state.historyLoading ? `<p class="muted refresh-note">Actualisation des gains…</p>` : ""}
    ${state.historyError ? `<p class="form-error">${esc(state.historyError)}</p>` : ""}
    <p class="fineprint">Calculé à partir des livraisons terminées enregistrées sur le serveur.</p>`;
}

function profileView() {
  const s = state.session;
  if (!state.profileLoaded && state.profileLoading) {
    return `<h1 class="screen-title">Profil</h1>${window.GKLottie ? GKLottie.loading("Chargement du profil…") : `<div class="empty">${icon("clock")}<strong>Chargement du profil…</strong></div>`}`;
  }
  if (!state.profileLoaded && state.profileError) {
    return `<h1 class="screen-title">Profil</h1><div class="empty">${icon("alert")}<strong>Impossible de charger le profil</strong><p>${esc(state.profileError)}</p><button class="outline-button" type="button" data-act="refresh-profile">Réessayer</button></div>`;
  }
  const initials = String(s.name || "").split(/\s+/).filter(Boolean).slice(0, 2).map(part => part[0]).join("").toUpperCase();
  return `
    <h1 class="screen-title">Profil</h1>
    <div class="profile-head">
      <span class="avatar" aria-hidden="true">${esc(initials)}</span>
      <div><h2>${esc(s.name || "")}</h2><p>${esc(s.phone || "")}</p>
        ${state.profile?.vehicle ? `<p>${icon("bike")} Véhicule : ${esc(state.profile.vehicle)}</p>` : ""}</div>
    </div>
    <div class="stat-strip" style="margin-top:12px">
      <div><b>${state.online ? "En ligne" : "Hors ligne"}</b><small>Statut</small></div>
      <div><b>${Number(state.profile?.cashToRemit) || 0}<i> MAD</i></b><small>À reverser</small></div>
      <div><b>${esc(state.profile?.vehicle || "—")}</b><small>Véhicule</small></div>
    </div>
    <div class="menu-list">
      ${ui.installPrompt ? `<button class="menu-item" type="button" data-act="install"><span class="row-icon">${icon("download")}</span><span class="grow">Installer l'application</span>${icon("chevronRight")}</button>` : ""}
      <button class="menu-item danger" type="button" data-act="logout"><span class="row-icon">${icon("logout")}</span><span class="grow">Se déconnecter</span></button>
    </div>
    ${state.profileLoading ? `<p class="muted refresh-note">Actualisation du profil…</p>` : ""}
    ${state.profileError ? `<p class="form-error">${esc(state.profileError)} <button class="ghost-button" type="button" data-act="refresh-profile">Réessayer</button></p>` : ""}
    <p class="fineprint">G&amp;K Livreur · v1</p>`;
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
  $("app-main").classList.toggle("has-sticky", Boolean(state.session && !state.mustChange && ui.tab === "missions" && state.active));
  window.gkMotionLive?.playLiveScenes($("app-main"));
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
  openSheet(`Course #${m.id}`, `
    <div class="offer-meta" style="margin-bottom:4px">
      ${m.zone ? `<span class="tag">${esc(m.zone)}</span>` : ""}
      ${m.km !== null ? `<span class="tag">${icon("navigate")} ${m.km} km</span>` : ""}
      ${m.earning !== null ? `<span class="tag paid">+${money(m.earning)}</span>` : ""}
    </div>
    <div class="kv">
      <div><span>Retrait</span><span>G&amp;K Food</span></div>
      <div><span>Client</span><span>${esc(m.customer)}</span></div>
      <div><span>Livraison</span><span>${esc(m.address)}</span></div>
      <div><span>Articles</span><span>${esc(m.items)}</span></div>
      <div><span>Total commande</span><span>${money(m.total)}</span></div>
      <div><span>Paiement</span><span>${m.payment === "cash" ? `Espèces à encaisser : ${money(m.total)}` : "Payé en ligne"}</span></div>
    </div>
    <button class="primary-button" type="button" data-act="accept" data-id="${esc(m.id)}"${state.actionBusy ? " disabled" : ""}>Accepter la course</button>`);
}

function celebrate(earning, id) {
  openSheet("Course terminée", `
    <div class="celebration">
      ${scene("gk-order-success", "celebration-art")}
      <strong>+${money(earning || 0)}</strong>
      <span>Course #${esc(id || "")} livrée</span>
    </div>
    <button class="primary-button" type="button" data-act="go-earnings">Voir mes gains ${icon("arrowRight")}</button>`);
}

function notifSheet() {
  const items = state.notifications.map(n => `
    <div class="notif${n.read ? "" : " unread"}"><span class="row-icon">${icon("bell")}</span>
      <div>${esc(n.text)}<small>${esc(dayLabel(n.at))} · ${timeFmt.format(n.at)}</small></div></div>`).join("");
  openSheet("Notifications", items || '<p class="muted">Aucune notification.</p>');
  void runAction(async () => {
    await markNotificationsRead();
    renderHeader();
  });
}

/* ---------- Events ---------- */

const actions = {
  "open-chat"(el) {
    GKChat.open({
      scope: "courier", orderId: el.dataset.id, title: el.dataset.name, subtitle: "Client",
      quick: ["J'arrive dans 5 min", "Je suis devant", "Pouvez-vous descendre ?", "Quel est le code porte ?"],
      onMessage: () => GKSound.play("message"),
      onClose: () => { void pollChatUnread(); }
    });
  },
  tab(el) { ui.tab = el.dataset.tab; render(); window.scrollTo(0, 0); },
  filter(el) { ui.filter = el.dataset.filter; render(); },
  async "toggle-online"() {
    const online = await goOnline(!state.online);
    if (online) startLocationTracking();
    else stopLocationTracking();
    toast(online ? "Vous êtes en ligne." : "Vous êtes hors ligne.");
    render();
  },
  detail(el) { detailSheet(el.dataset.id); },
  async accept(el) {
    await acceptMission(el.dataset.id);
    closeSheet();
    ui.tab = "missions";
    render();
    toast("Course acceptée. Direction le restaurant !");
  },
  async advance() {
    await advanceMission();
    render();
  },
  async refuse(el) { await refuseMission(el.dataset.id); render(); toast("Offre refusée."); },
  "go-earnings"() { closeSheet(); ui.tab = "earnings"; render(); window.scrollTo(0, 0); },
  bell() { notifSheet(); },
  close() { closeSheet(); },
  async logout() { stopLocationTracking(); await logout(); ui.tab = "missions"; render(); toast("Vous êtes déconnecté."); },
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
      toast("PIN modifié. Vous pouvez continuer.");
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
    const missionId = state.active.id;
    const submit = document.querySelector('[type=submit][form="deliver-form"]');
    submit.disabled = true;
    try {
      await completeMission(($("code")?.value || form.code?.value || "").trim(), form["cash-ok"]?.checked ?? true);
      render();
      celebrate(earning, missionId);
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
  if (event.key === "Escape") {
    return closeSheet();
  }
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
    state.locationError = "La géolocalisation n’est pas disponible dans ce navigateur.";
    render();
    return;
  }
  locationWatch = navigator.geolocation.watchPosition(position => {
    state.locationError = "";
    const { latitude: lat, longitude: lng } = position.coords;
    if (Date.now() - lastPositionSent < 6000) return;
    lastPositionSent = Date.now();
    GKApi.patch("/api/courier/position", { lat, lng }, "courier")
      .catch(error => { state.locationError = error.message || "Position non envoyée."; render(); });
  }, error => {
    state.locationError = error.code === error.PERMISSION_DENIED
      ? "La localisation est refusée. Autorisez-la pour partager votre position de livraison."
      : "La localisation est indisponible. Vous pouvez rester en ligne sans partager votre position.";
    render();
  }, { enableHighAccuracy: true, maximumAge: 15000, timeout: 20000 });
}

function stopLocationTracking() {
  if (locationWatch !== null && navigator.geolocation) navigator.geolocation.clearWatch(locationWatch);
  locationWatch = null;
  state.locationError = "";
}

let chatUnread = {};
async function pollChatUnread() {
  try {
    const res = await GKApi.get("/api/chat/unread", "courier");
    const grew = res.total > Object.values(chatUnread).reduce((a, b) => a + b, 0);
    const changed = JSON.stringify(res.unread) !== JSON.stringify(chatUnread);
    chatUnread = res.unread || {};
    if (grew) GKSound.play("message");
    if (changed && $("overlay").hidden) render();
  } catch { /* chat badge is best effort */ }
}

async function pollServer() {
  if (!state.session || state.mustChange || polling) return;
  polling = true;
  void pollChatUnread();
  const before = JSON.stringify([state.online, { ...state.profile, serverTime: 0 }, state.missions, state.active, state.history, state.notifications, state.offersError, state.historyError, state.profileError, state.actionError]);
  try {
    const errors = await refreshAll({ light: true });
    if (!errors.length) soundForMissions();
    if (errors.length) state.actionError = errors[0].message || "Certaines données n’ont pas pu être actualisées.";
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
  toast("Votre session a expiré. Reconnectez-vous.");
});

setInterval(() => {
  if (state.session) void pollServer();
}, 5000);

setInterval(() => {
  document.querySelectorAll(".offer-clock").forEach(el => {
    const left = Math.max(0, Number(el.dataset.expires) - Date.now());
    const label = el.querySelector("b");
    if (label) label.textContent = String(Math.ceil(left / 1000));
    el.style.setProperty("--p", Math.min(1, left / 40000).toFixed(3));
    el.classList.toggle("urgent", left <= 10000);
  });
}, 500);

if ("serviceWorker" in navigator && /^https?:$/.test(location.protocol)) {
  navigator.serviceWorker.register("./sw.js", { updateViaCache: "none" })
    .then(() => {
      if (state.session && !state.mustChange) {
        try { void window.GKPush?.enable({ api: API, scope: SCOPE, app: "courier", prompt: true }); } catch { /* optional */ }
      }
    })
    .catch(() => {});
}

render();
if (state.session && !state.mustChange) {
  void refreshAll().then(() => {
    if (state.online) startLocationTracking();
    render();
  });
}
