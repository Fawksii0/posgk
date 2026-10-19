const main = document.querySelector("#app-main");
const overlay = document.querySelector("#overlay");
const sheet = document.querySelector("#sheet");
let toastTimer;
let installPrompt = null;

const RESTAURANT = { x: 17, y: 68 };
const DESTINATION = { x: 83, y: 30 };
const PHONE_RE = /^(\+212|0)[5-7]\d{8}$/;
const DEMO_OTP = "1234";
const BARE_VIEWS = ["onboarding", "auth"];

function showToast(message) {
  const toast = document.querySelector("#toast");
  toast.textContent = message;
  toast.classList.add("visible");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove("visible"), 2600);
}

function sectionHead(title, action = "") {
  return `<div class="section-heading"><h2>${title}</h2>${action}</div>`;
}
const seeAll = `<button class="text-button" type="button" data-view="menu">Voir tout</button>`;

function renderSearch(id, placeholder) {
  return `<div class="search-row"><label class="search-box"><span aria-hidden="true">${icon("search")}</span><input id="${id}" type="search" aria-label="Rechercher un plat" placeholder="${placeholder}" value="${escapeHtml(state.query)}" /></label><button class="filter-button" type="button" data-action="filters" aria-label="Filtrer le menu">${icon("sliders")}</button></div>`;
}

function renderCategories() {
  return `<div class="category-strip" role="group" aria-label="Catégories du menu">${categories.map(category => `<button class="category-chip ${state.category === category.id ? "active" : ""}" type="button" data-category="${category.id}" aria-pressed="${state.category === category.id}">${icon(category.icon)}${category.label}</button>`).join("")}</div>`;
}

function renderProductCard(product) {
  const favorite = state.favorites.has(product.id);
  const soldOut = isSoldOut(product.id);
  return `<article class="product-card ${soldOut ? "is-soldout" : ""}">
    <div class="product-media">
      <button class="product-image-button" type="button" data-product="${product.id}" aria-label="Voir ${escapeHtml(product.name)}${soldOut ? " (épuisé)" : ""}"><img class="product-image" src="${product.image}" alt="${escapeHtml(product.name)}" loading="lazy" /></button>
      ${soldOut ? `<span class="soldout-badge">Épuisé</span>` : product.discount ? `<span class="discount-badge">${product.discount}</span>` : ""}
      <button class="favorite-button ${favorite ? "is-favorite" : ""}" type="button" data-favorite="${product.id}" aria-label="${favorite ? "Retirer des" : "Ajouter aux"} favoris" aria-pressed="${favorite}">${icon("heart", { filled: favorite })}</button>
    </div>
    <div class="product-content">
      <div class="product-title-row"><h3 class="product-title">${escapeHtml(product.name)}</h3><span class="rating">${icon("star", { filled: true })}${product.rating}</span></div>
      <p class="product-meta">${icon("clock")}${product.time} · ${escapeHtml(product.cuisine)}</p>
      <div class="product-footer"><span class="product-price">${formatPrice(product.price)}</span><button class="add-product" type="button" data-product="${product.id}" ${soldOut ? "disabled" : ""} aria-label="${soldOut ? `${escapeHtml(product.name)} épuisé` : `Personnaliser et ajouter ${escapeHtml(product.name)}`}">${icon("plus")}</button></div>
    </div>
  </article>`;
}

function filteredProducts() {
  const query = state.query.trim().toLocaleLowerCase();
  return products.filter(product =>
    (state.category === "All" || (state.category === "Favoris" ? state.favorites.has(product.id) : product.category === state.category)) &&
    (!query || `${product.name} ${product.description} ${product.category} ${product.cuisine}`.toLocaleLowerCase().includes(query))
  );
}

function renderProductGrid(items = filteredProducts()) {
  if (items.length) return `<div class="product-grid">${items.map(renderProductCard).join("")}</div>`;
  const message = state.category === "Favoris" ? "Aucun favori pour l'instant. Touchez le cœur d'un plat pour l'ajouter." : "Aucun plat ne correspond à votre recherche. Essayez un autre mot-clé.";
  return `<div class="empty-state">${message}</div>`;
}

/* ---------- Onboarding & auth ---------- */

const slides = [
  { icon: "utensils", title: "Vos plats G&K préférés", text: "Burgers, pizzas, gelato et boissons fraîches, préparés avec soin à Bouznika." },
  { icon: "bike", title: "Livré chez vous, vite", text: "Suivez votre commande en temps réel, de la cuisine jusqu'à votre porte." },
  { icon: "gift", title: "Gagnez des récompenses", text: "Chaque commande vous rapporte des points échangeables contre des plats offerts." }
];

function renderOnboarding() {
  const slide = slides[state.slide];
  const last = state.slide === slides.length - 1;
  return `<section class="onboarding" aria-label="Bienvenue">
    <div class="onboarding-top"><img class="onboarding-logo" src="./assets/emblem-reference.png" alt="G&K Food" />${last ? "" : `<button class="text-button" type="button" data-action="skip-onboarding">Passer</button>`}</div>
    <div class="onboarding-art" aria-hidden="true">${icon(slide.icon)}</div>
    <h1>${slide.title}</h1>
    <p>${slide.text}</p>
    <div class="onboarding-dots" aria-hidden="true">${slides.map((_, index) => `<span class="${index === state.slide ? "active" : ""}"></span>`).join("")}</div>
    <button class="gold-button full-width" type="button" data-action="${last ? "skip-onboarding" : "next-slide"}">${last ? "Commencer" : "Suivant"}</button>
  </section>`;
}

function renderAuth() {
  const login = state.authMode === "login";
  const back = state.afterAuth === "cart";
  if (state.authStep === "otp") {
    return `<section class="auth" aria-labelledby="auth-heading">
      <button class="icon-button" type="button" data-action="auth-back" aria-label="Retour">${icon("chevronLeft")}</button>
      <h1 id="auth-heading">Code de vérification</h1>
      <p class="auth-lead">Saisissez le code envoyé au ${escapeHtml(state.pendingUser.phone)}.<br /><small>Démo : utilisez ${DEMO_OTP}.</small></p>
      <form id="otp-form" novalidate>
        <label class="field"><span>Code à 4 chiffres</span><input id="otp-code" name="code" inputmode="numeric" autocomplete="one-time-code" maxlength="4" placeholder="••••" /></label>
        <p class="form-error" role="alert"></p>
        <button class="gold-button full-width" type="submit">Valider</button>
      </form>
    </section>`;
  }
  return `<section class="auth" aria-labelledby="auth-heading">
    <div class="onboarding-top"><img class="onboarding-logo" src="./assets/emblem-reference.png" alt="G&K Food" /></div>
    <h1 id="auth-heading">${login ? "Bon retour !" : "Créer un compte"}</h1>
    <p class="auth-lead">${back ? "Connectez-vous pour finaliser votre commande." : "Connectez-vous pour retrouver vos commandes et vos points."}</p>
    <form id="auth-form" novalidate>
      ${login ? "" : `<label class="field"><span>Nom complet</span><input name="name" autocomplete="name" placeholder="Ex. Salma El Idrissi" /></label>`}
      <label class="field"><span>Téléphone</span><input name="phone" type="tel" autocomplete="tel" placeholder="06 12 34 56 78" /></label>
      <p class="form-error" role="alert"></p>
      <button class="gold-button full-width" type="submit">${login ? "Recevoir mon code" : "S'inscrire"}</button>
    </form>
    <p class="auth-switch">${login ? "Pas encore de compte ?" : "Déjà inscrit ?"} <button class="text-button" type="button" data-action="auth-switch">${login ? "Créer un compte" : "Se connecter"}</button></p>
    <button class="outline-button full-width" type="button" data-action="guest">${back ? "Retour au panier" : "Continuer en invité"}</button>
  </section>`;
}

/* ---------- Home / menu ---------- */

function renderHome() {
  return `<section aria-label="Accueil">
    ${renderSearch("home-search", "Rechercher un plat, une envie…")}
    ${sectionHead("Offres exclusives", seeAll)}
    <article class="offer-banner">
      <div class="offer-copy"><span class="offer-tag">${icon("tag")}Offre de la semaine</span><h2>Le Classique G&K<br />jusqu'à <b>-20%</b></h2><button class="dark-button" type="button" data-product="classic">Commander</button></div>
      <img class="offer-image" src="${img("photo-1568901346375-23c9450c58cd", 600)}" alt="" />
      <div class="hero-dots" aria-hidden="true"><span class="hero-dot active"></span><span class="hero-dot"></span><span class="hero-dot"></span></div>
    </article>
    ${sectionHead("Explorer les catégories", seeAll)}
    ${renderCategories()}
    ${sectionHead(state.query ? "Résultats" : "Plats populaires", seeAll)}
    ${renderProductGrid(filteredProducts().slice(0, 4))}
    ${sectionHead("Notre maison")}
    ${renderRestaurantCard()}
  </section>`;
}

function renderMenu() {
  return `<section aria-labelledby="menu-heading">
    <h1 class="screen-title" id="menu-heading">Explorer</h1>
    ${renderSearch("menu-search", "Rechercher un plat…")}
    ${renderCategories()}
    ${sectionHead(`${state.category === "All" ? "Tout le menu" : categories.find(c => c.id === state.category).label} <small>${filteredProducts().length} plats</small>`)}
    ${renderProductGrid()}
    ${sectionHead("Trouvez-nous")}
    ${renderRestaurantCard()}
  </section>`;
}

function renderRestaurantCard() {
  return `<article class="restaurant-card">
    <div class="mini-map" role="img" aria-label="Carte : G&K Food, Bouznika"><span class="map-pin restaurant">${icon("store")}</span><span class="map-pin destination">${icon("pin")}</span></div>
    <div class="restaurant-info">
      <div class="restaurant-logo"><img src="./assets/emblem-reference.png" alt="" /></div>
      <div class="restaurant-text"><h3 class="restaurant-name">G&K Food</h3><p class="restaurant-description">Snack · Restaurant · Gelato · Bouznika</p>
        <div class="restaurant-facts"><span class="restaurant-facts-rating">${icon("star", { filled: true })}<strong>4.9</strong> (350+)</span><span>${icon("clock")}25–35 min</span><span>${icon("bike")}Livraison dès 10 MAD</span></div></div>
      <button class="round-button" type="button" data-action="directions" aria-label="Itinéraire vers G&K Food">${icon("navigate")}</button>
    </div>
  </article>`;
}

/* ---------- Cart ---------- */

function renderCart() {
  if (!state.cart.length) {
    return `<section class="cart-empty"><div class="empty-basket-icon" aria-hidden="true">${icon("bag")}</div><h1>Votre panier est vide</h1><p>Ajoutez quelques bons plats et votre prochaine pause G&K commence ici.</p><button class="gold-button" type="button" data-view="menu">Explorer le menu</button></section>`;
  }
  const address = currentAddress();
  const zone = zoneOf(address);
  const issue = checkoutIssue();
  const subtotal = cartSubtotal();
  const freeHint = state.delivery === "delivery" && address && subtotal < FREE_DELIVERY
    ? `Plus que ${formatPrice(FREE_DELIVERY - subtotal)} pour la livraison offerte.` : "";
  const eta = state.delivery === "delivery" ? zone.etaMin : [20, 30];
  const payment = currentPayment();
  return `<section aria-labelledby="cart-heading">
    <h1 class="screen-title" id="cart-heading">Mon panier</h1>
    <div class="cart-list">${state.cart.map((line, index) => `<article class="cart-line">
      <img class="cart-line-image" src="${line.product.image}" alt="" />
      <div class="cart-line-body">
        <h2 class="cart-line-name">${escapeHtml(line.product.name)}</h2>
        <p class="cart-line-price">${formatPrice(lineUnit(line))}</p>
        <div class="chip-row"><span class="mini-chip">${escapeHtml(line.size.name)}</span>${line.extras.map(extra => `<span class="mini-chip">${escapeHtml(extra.name)}</span>`).join("")}</div>
      </div>
      <div class="quantity-control"><button class="quantity-button" type="button" data-cart-index="${index}" data-delta="-1" aria-label="Retirer un ${escapeHtml(line.product.name)}">${icon("minus")}</button><span class="quantity-number">${line.quantity}</span><button class="quantity-button primary" type="button" data-cart-index="${index}" data-delta="1" aria-label="Ajouter un ${escapeHtml(line.product.name)}">${icon("plus")}</button></div>
    </article>`).join("")}</div>
    <h2 class="block-title">Type de commande</h2>
    <div class="delivery-toggle" role="group" aria-label="Type de commande">
      <button class="delivery-choice ${state.delivery === "delivery" ? "active" : ""}" type="button" data-delivery="delivery" aria-pressed="${state.delivery === "delivery"}">${icon("bike")}Livraison<small>${zone.etaMin[0]}–${zone.etaMin[1]} min</small></button>
      <button class="delivery-choice ${state.delivery === "pickup" ? "active" : ""}" type="button" data-delivery="pickup" aria-pressed="${state.delivery === "pickup"}">${icon("store")}À emporter<small>20–30 min</small></button>
    </div>
    <div class="address-card"><span class="address-icon">${icon("pin")}</span><div><strong>${state.delivery === "delivery" ? (address ? escapeHtml(address.street) : "Aucune adresse") : "G&K Food · Bouznika"}</strong><small>${state.delivery === "delivery" ? (address ? `${escapeHtml(address.label)} · ${zone.name}` : "Ajoutez une adresse de livraison") : "Retrait au restaurant"}</small></div>${state.delivery === "delivery" ? `<button class="text-button" type="button" data-action="addresses">${address ? "Modifier" : "Ajouter"}</button>` : ""}</div>
    <div class="address-card"><span class="address-icon">${icon(payment.type === "cash" ? "cash" : "card")}</span><div><strong>${escapeHtml(payment.label)}</strong><small>Moyen de paiement</small></div><button class="text-button" type="button" data-action="payments">Modifier</button></div>
    <form class="promo-box" id="promo-form"><span class="promo-icon" aria-hidden="true">${icon("tag")}</span><input class="promo-input" id="promo-code" type="text" placeholder="Code promo" aria-label="Code promo" /><button class="outline-button" type="submit">${state.promo ? `Appliqué ${icon("check")}` : "Appliquer"}</button></form>
    <label class="note-box"><span>Note pour la cuisine <small>· optionnel</small></span><textarea id="cart-note" rows="2" maxlength="140" placeholder="Ex. sans oignons, bien cuit…">${escapeHtml(state.cartNote || "")}</textarea></label>
    <div class="bill-card"><div class="bill-row"><span>Sous-total</span><span>${formatPrice(subtotal)}</span></div><div class="bill-row"><span>Frais de ${state.delivery === "delivery" ? "livraison" : "préparation"}</span><span>${state.delivery === "delivery" ? (deliveryFee() ? formatPrice(deliveryFee()) : "Offerte") : "Gratuit"}</span></div>${state.promo ? `<div class="bill-row promo"><span>Bienvenue chez G&K</span><span>-10 MAD</span></div>` : ""}<div class="bill-row total"><span>Total</span><strong>${formatPrice(cartTotal())}</strong></div></div>
    ${issue ? `<p class="cart-notice">${escapeHtml(issue)}</p>` : freeHint ? `<p class="cart-notice soft">${freeHint}</p>` : ""}
    <button class="gold-button full-width" type="button" data-action="checkout">${state.user ? "Passer la commande" : "Se connecter pour commander"} · ${formatPrice(cartTotal())}</button>
    <p class="fineprint">Préparation estimée ${eta[0]}–${eta[1]} min</p>
  </section>`;
}

/* ---------- Orders & tracking ---------- */

function orderSummary(order) {
  return order.items.map(item => `${item.quantity}× ${item.name}`).join(", ");
}

function renderOrderCard(order) {
  const first = order.items[0];
  const label = { active: "Active", completed: "Terminée", cancelled: "Annulée", refused: "Refusée" }[order.status];
  const stage = order.status === "active" ? `<p class="order-stage">${stagesFor(order)[order.stage].title}</p>`
    : order.status === "refused" ? `<p class="order-stage">Motif : ${escapeHtml(order.refusedReason || "non précisé")}</p>` : "";
  let actions;
  if (order.status === "active") {
    const cancellable = order.bus ? order.busStatus === "pending" : order.stage <= 1;
    actions = `${cancellable ? `<button class="outline-button" type="button" data-cancel-order="${order.id}">Annuler</button>` : ""}<button class="gold-button" type="button" data-track-order="${order.id}">Suivre ${icon("navigate")}</button>`;
  } else {
    actions = `<button class="gold-button" type="button" data-reorder="${order.id}">Recommander</button>`;
  }
  return `<article class="order-card">
    <div class="order-card-head"><span>Commande #${order.id}</span><span class="status-pill ${order.status}">${label}</span></div>
    <div class="order-card-body"><img src="${first.image}" alt="" /><div><h3>${escapeHtml(orderSummary(order))}</h3><p>${formatDate(order.createdAt)} · ${order.mode === "delivery" ? "Livraison" : "À emporter"}</p>${stage}<strong>${formatPrice(order.total)}</strong></div></div>
    <div class="order-actions">${actions}</div>
  </article>`;
}

function courierPoint(order) {
  const progress = courierProgress(order);
  return { x: RESTAURANT.x + (DESTINATION.x - RESTAURANT.x) * progress, y: RESTAURANT.y + (DESTINATION.y - RESTAURANT.y) * progress };
}

function trackingEta(order) {
  if (order.status === "completed") return "Terminée";
  if (order.status === "refused") return "Refusée";
  if (order.status === "cancelled") return "Annulée";
  if (order.bus && order.promisedAt) {
    const arrival = order.promisedAt + (order.mode === "delivery" ? (order.travelMin || 10) * 60000 : 0);
    return `${hhmm(arrival)} – ${hhmm(arrival + 5 * 60000)}`;
  }
  return `${hhmm(order.createdAt + order.etaMin[0] * 60000)} – ${hhmm(order.createdAt + order.etaMin[1] * 60000)}`;
}

function renderTracking(order) {
  const steps = stagesFor(order);
  const delivery = order.mode === "delivery";
  const done = order.status === "completed";
  const ended = order.status === "refused" || order.status === "cancelled";
  const courier = courierPoint(order);
  const etaText = trackingEta(order);
  const pinVisible = delivery && (order.bus ? order.stage >= 3 : order.stage >= 2);
  const courierVisible = order.bus ? !!order.courier : delivery && order.stage >= 1;
  const courierName = order.bus && order.courier ? order.courier.name : "Youssef";
  const courierPhone = order.bus && order.courier ? order.courier.phone : "+212600000000";
  const prepNote = order.bus && order.status === "active" && order.prepMin ? `<p class="fineprint">Préparation estimée par la cuisine : ${order.prepMin} min.</p>` : "";
  const fine = order.status !== "active" ? "" : order.bus ? "" : `<p class="fineprint">${window.GKBus && GKBus.linked ? "Aucune cuisine connectée : " : "Mode démo hors liaison : "}démo accélérée, une étape toutes les ${STAGE_MS / 1000} secondes.</p>`;
  return `<section aria-labelledby="tracking-heading">
    <div class="back-row"><button class="icon-button" type="button" data-back-orders aria-label="Retour aux commandes">${icon("chevronLeft")}</button><h1 class="screen-title" id="tracking-heading">Suivi de commande</h1></div>
    <div class="tracking-map" role="img" aria-label="Carte illustrative de votre trajet">
      <svg class="route" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true"><line x1="${RESTAURANT.x}" y1="${RESTAURANT.y}" x2="${DESTINATION.x}" y2="${DESTINATION.y}" /></svg>
      <span class="map-pin restaurant" style="left:${RESTAURANT.x}%;top:${RESTAURANT.y}%">${icon("store")}</span>
      ${delivery ? `<span class="map-pin destination" style="left:${DESTINATION.x}%;top:${DESTINATION.y}%">${icon("pin")}</span>` : ""}
      ${pinVisible ? `<span class="map-pin courier" id="courier-pin" style="left:${courier.x}%;top:${courier.y}%">${icon("bike")}</span>` : ""}
      <span class="map-label">${escapeHtml(delivery ? order.address : "G&K Food · Bouznika")}</span>
    </div>
    <article class="tracking-card">
      <div class="eta-row"><div><small>${done || ended ? "Statut" : "Arrivée estimée"}</small><strong>${etaText}</strong></div><span class="status-pill ${order.status}">Commande #${order.id}</span></div>
      ${order.status === "refused" ? `<p class="cart-notice">Commande refusée par la cuisine. Motif : ${escapeHtml(order.refusedReason || "non précisé")}.</p>` : ""}
      ${courierVisible ? `<div class="courier-card"><span class="courier-avatar">${escapeHtml(courierName[0])}</span><span class="courier-copy"><strong>${escapeHtml(courierName.split(" ")[0])}</strong><small>Votre livreur · ${icon("star", { filled: true })}4.9</small></span><button class="round-button" type="button" data-action="chat" aria-label="Écrire au livreur">${icon("chat")}</button><a class="round-button filled" href="tel:${escapeHtml(courierPhone)}" aria-label="Appeler le livreur">${icon("phone")}</a></div>` : ""}
      ${ended ? "" : `<ol class="step-list">${steps.map((step, index) => {
        const status = index < order.stage || (done && index === steps.length - 1) ? "done" : index === order.stage ? "current" : "";
        return `<li class="step-item ${status}"><span class="step-dot">${icon(step.icon)}</span><span class="step-copy"><strong>${step.title}</strong><small>${step.detail}</small></span></li>`;
      }).join("")}</ol>`}
      ${order.bus && order.status === "active" && order.busStatus === "pending" ? `<button class="outline-button full-width" type="button" data-cancel-order="${order.id}">Annuler la commande</button>` : ""}
      ${prepNote}${fine}
    </article>
  </section>`;
}

function renderOrders() {
  if (state.trackingId) {
    const tracked = state.orders.find(order => order.id === state.trackingId);
    if (tracked) return renderTracking(tracked);
    state.trackingId = null;
  }
  const tabs = [["active", "Actives"], ["completed", "Terminées"], ["cancelled", "Annulées"]];
  const list = state.orders.filter(order => order.status === state.ordersTab || (state.ordersTab === "cancelled" && order.status === "refused"));
  const empty = state.ordersTab === "active" ? "Aucune commande en cours pour l'instant." : "Rien à afficher ici.";
  return `<section aria-labelledby="orders-heading"><h1 class="screen-title" id="orders-heading">Mes commandes</h1>
    <div class="tabs" role="tablist">${tabs.map(([id, label]) => `<button class="tab ${state.ordersTab === id ? "active" : ""}" type="button" role="tab" aria-selected="${state.ordersTab === id}" data-orders-tab="${id}">${label}</button>`).join("")}</div>
    ${list.length ? list.map(renderOrderCard).join("") : `<div class="cart-empty"><div class="empty-basket-icon" aria-hidden="true">${icon("receipt")}</div><h2>${empty}</h2><button class="gold-button" type="button" data-view="menu">Trouver mon prochain favori</button></div>`}
  </section>`;
}

/* ---------- Profile ---------- */

function renderProfile() {
  const points = loyaltyPoints();
  const next = REWARDS.find(reward => reward.points > points);
  const items = [
    ["orders", "receipt", "Mes commandes"], ["addresses", "pin", "Mes adresses"], ["payments", "card", "Moyens de paiement"],
    ["favorites", "heart", "Mes favoris"], ["loyalty", "gift", "Programme de fidélité"],     ["support", "help", "Aide & contact"]
     ];
  if (installPrompt) items.push(["install", "download", "Installer l'application"]);
  const user = state.user;
  return `<section aria-labelledby="profile-heading"><h1 class="screen-title" id="profile-heading">Mon profil</h1>
    <article class="profile-card"><div class="profile-avatar">${escapeHtml((user?.name || "G")[0].toUpperCase())}</div><div class="profile-text"><h2>${user ? escapeHtml(user.name) : "Bienvenue chez G&K"}</h2><p>${user ? escapeHtml(user.phone) : "Connectez-vous pour retrouver vos commandes et favoris."}</p></div>${user ? "" : `<button class="gold-button compact" type="button" data-action="login">Connexion</button>`}</article>
    <article class="loyalty-card"><small>${icon("gift")}Programme fidélité</small><div class="loyalty-points">${points} <span>${next ? `/ ${next.points} points` : "points"}</span></div><div class="loyalty-progress"><span style="width:${next ? Math.min(100, Math.round(points / next.points * 100)) : 100}%"></span></div><p class="loyalty-hint">${next ? `Encore ${next.points - points} points avant « ${next.label} ».` : "Niveau maximum atteint, merci !"}</p></article>
    <nav class="profile-menu" aria-label="Raccourcis du compte">${items.map(([action, ico, label]) => `<button class="profile-menu-button" type="button" ${action === "orders" ? 'data-view="orders"' : `data-action="${action}"`}><span>${icon(ico)}</span>${label}</button>`).join("")}${user ? `<button class="profile-menu-button" type="button" data-action="logout"><span>${icon("logout")}</span>Se déconnecter</button>` : ""}<button class="profile-menu-button subtle" type="button" data-action="reset"><span>${icon("refresh")}</span>Réinitialiser les données de démo</button></nav>
  </section>`;
}

/* ---------- Main render ---------- */

function updateChrome() {
  const address = currentAddress();
  document.querySelector("#location-label").textContent = address ? address.street : "Ajouter une adresse";
  document.querySelector("#location-button").setAttribute("aria-label", `Adresse de livraison : ${address ? address.street : "aucune"}`);
  const unread = state.notifications.some(note => !note.read);
  document.querySelector("#notif-button .dot").style.display = unread ? "" : "none";
  const count = document.querySelector("#nav-cart-count");
  count.textContent = String(cartCount());
  count.hidden = cartCount() === 0;
}

function render() {
  const views = { onboarding: renderOnboarding, auth: renderAuth, home: renderHome, menu: renderMenu, cart: renderCart, orders: renderOrders, profile: renderProfile };
  document.body.toggleAttribute("data-bare", BARE_VIEWS.includes(state.view));
  const banner = isPaused() && ["home", "menu", "cart", "orders"].includes(state.view)
    ? `<div class="pause-banner" role="alert">${icon("clock")}<span>${PAUSE_MESSAGE}</span></div>` : "";
  main.innerHTML = banner + views[state.view]();
  document.querySelectorAll(".nav-button").forEach(button => {
    const active = button.dataset.view === state.view;
    button.classList.toggle("active", active);
    if (active) button.setAttribute("aria-current", "page");
    else button.removeAttribute("aria-current");
  });
  updateChrome();
  saveState();
}

function goTo(view, { top = true } = {}) {
  if (view !== "orders") state.trackingId = null;
  state.view = view;
  render();
  main.focus({ preventScroll: true });
  if (top) window.scrollTo({ top: 0 });
}

function setView(view) {
  if (!["home", "menu", "cart", "orders", "profile"].includes(view)) return;
  goTo(view);
}

/* ---------- Overlay: product sheet & panels ---------- */

function detailTotal() {
  const { product, size, extras, quantity } = state.detail;
  return (product.price + size.delta + [...extras].reduce((sum, index) => sum + product.extras[index].price, 0)) * quantity;
}

function renderSheet() {
  const { product, size, extras, quantity } = state.detail;
  const favorite = state.favorites.has(product.id);
  sheet.innerHTML = `<div class="sheet-scroll">
    <div class="sheet-hero"><img class="sheet-image" src="${product.image}" alt="${escapeHtml(product.name)}" />
      <button class="sheet-close" type="button" data-action="close-sheet" aria-label="Fermer">${icon("chevronLeft")}</button>
      <button class="favorite-button ${favorite ? "is-favorite" : ""}" type="button" data-detail-favorite aria-label="${favorite ? "Retirer des" : "Ajouter aux"} favoris" aria-pressed="${favorite}">${icon("heart", { filled: favorite })}</button></div>
    <div class="sheet-body">
      <div class="sheet-meta">${product.discount ? `<span class="discount-badge static">${product.discount}</span>` : ""}<span class="rating">${icon("star", { filled: true })}${product.rating} <small>(${product.reviews})</small></span></div>
      <h2 id="sheet-title">${escapeHtml(product.name)}</h2>
      <p class="sheet-description">${escapeHtml(product.description)}</p>
      <div class="info-row"><div class="info-tile">${icon("clock")}<small>Préparation</small><strong>${product.time}</strong></div><div class="info-tile">${icon("utensils")}<small>Cuisine</small><strong>${escapeHtml(product.cuisine)}</strong></div></div>
      <h3 class="block-title">Choisir la taille</h3>
      <div class="option-row" role="group" aria-label="Taille">${product.sizes.map((option, index) => `<button class="option ${option === size ? "active" : ""}" type="button" data-size="${index}" aria-pressed="${option === size}"><strong>${escapeHtml(option.name)}</strong><small>${formatPrice(product.price + option.delta)}</small></button>`).join("")}</div>
      <h3 class="block-title">Suppléments <small>· optionnel</small></h3>
      <div class="chip-row wrap" role="group" aria-label="Suppléments">${product.extras.map((extra, index) => `<button class="extra-chip ${extras.has(index) ? "active" : ""}" type="button" data-extra="${index}" aria-pressed="${extras.has(index)}">${escapeHtml(extra.name)} <small>+${formatPrice(extra.price)}</small></button>`).join("")}</div>
    </div></div>
    <div class="sheet-actions"><div class="quantity-control big"><button class="quantity-button" type="button" data-detail-delta="-1" aria-label="Retirer un">${icon("minus")}</button><span class="quantity-number" id="detail-quantity">${quantity}</span><button class="quantity-button primary" type="button" data-detail-delta="1" aria-label="Ajouter un">${icon("plus")}</button></div><button class="gold-button" type="button" data-action="add-to-cart">Ajouter · ${formatPrice(detailTotal())}</button></div>`;
}

function showOverlay() {
  overlay.hidden = false;
  document.body.style.overflow = "hidden";
}

function closeOverlay() {
  overlay.hidden = true;
  document.body.style.overflow = "";
  state.detail = null;
  state.panel = null;
  sheet.className = "sheet";
}

function openProduct(productId) {
  const product = products.find(item => item.id === productId);
  if (!product) return;
  if (isSoldOut(productId)) return showToast(`${product.name} est épuisé pour le moment.`);
  state.panel = null;
  sheet.className = "sheet";
  state.detail = { product, size: product.sizes[0], extras: new Set(), quantity: 1 };
  renderSheet();
  showOverlay();
  sheet.querySelector(".sheet-close").focus();
}

const panelHead = title => `<div class="panel-head"><h2 id="sheet-title">${title}</h2><button class="icon-button" type="button" data-action="close-sheet" aria-label="Fermer">${icon("close")}</button></div>`;
const labelIcon = label => ({ Maison: "home", Travail: "briefcase" })[label] ?? "pin";

function pickRow({ attr, id, active, icon: ico, title, sub, removable }) {
  return `<div class="pick-row ${active ? "active" : ""}"><button class="pick-main" type="button" ${attr}="${id}" aria-pressed="${active}"><span class="pick-icon">${icon(ico)}</span><span class="pick-copy"><strong>${escapeHtml(title)}</strong><small>${escapeHtml(sub)}</small></span><span class="radio" aria-hidden="true"></span></button>${removable ? `<button class="pick-remove" type="button" data-remove-${attr.replace("data-pick-", "")}="${id}" aria-label="Supprimer ${escapeHtml(title)}">${icon("trash")}</button>` : ""}</div>`;
}

function renderPanel() {
  let body = "";
  switch (state.panel) {
    case "addresses":
      body = `${panelHead("Mes adresses")}<div class="panel-body">${state.addresses.length ? state.addresses.map(address => pickRow({ attr: "data-pick-address", id: address.id, active: address.id === state.addressId, icon: labelIcon(address.label), title: address.label, sub: `${address.street} · ${zones.find(zone => zone.id === address.zone).name}`, removable: true })).join("") : `<p class="empty-state">Aucune adresse enregistrée.</p>`}<button class="outline-button full-width" type="button" data-panel-go="address-new">${icon("plus")}Ajouter une adresse</button></div>`;
      break;
    case "address-new":
      body = `${panelHead("Nouvelle adresse")}<form class="panel-body" id="address-form" novalidate>
        <label class="field"><span>Nom</span><select name="label"><option>Maison</option><option>Travail</option><option>Autre</option></select></label>
        <label class="field"><span>Adresse</span><input name="street" autocomplete="street-address" placeholder="Rue, numéro, immeuble" /></label>
        <label class="field"><span>Zone de livraison</span><select name="zone">${zones.map(zone => `<option value="${zone.id}">${zone.name} · ${zone.fee} MAD${zone.min ? ` · min. ${zone.min} MAD` : ""}</option>`).join("")}</select></label>
        <p class="form-error" role="alert"></p>
        <button class="gold-button full-width" type="submit">Enregistrer</button></form>`;
      break;
    case "payments":
      body = `${panelHead("Moyens de paiement")}<div class="panel-body">${state.payments.map(payment => pickRow({ attr: "data-pick-payment", id: payment.id, active: payment.id === state.payId, icon: payment.type === "cash" ? "cash" : "card", title: payment.label, sub: payment.type === "cash" ? "Payez à la réception" : `Expire ${payment.expiry}`, removable: payment.type !== "cash" })).join("")}<button class="outline-button full-width" type="button" data-panel-go="card-new">${icon("plus")}Ajouter une carte</button><p class="fineprint">Démo : seules la marque et les 4 derniers chiffres sont conservés.</p></div>`;
      break;
    case "card-new":
      body = `${panelHead("Nouvelle carte")}<form class="panel-body" id="card-form" novalidate>
        <label class="field"><span>Numéro de carte</span><input name="number" inputmode="numeric" autocomplete="cc-number" placeholder="4242 4242 4242 4242" /></label>
        <div class="field-row"><label class="field"><span>Expiration</span><input name="expiry" inputmode="numeric" autocomplete="cc-exp" placeholder="MM/AA" maxlength="5" /></label><label class="field"><span>CVC</span><input name="cvc" inputmode="numeric" autocomplete="cc-csc" placeholder="123" maxlength="4" /></label></div>
        <p class="form-error" role="alert"></p>
        <button class="gold-button full-width" type="submit">Ajouter la carte</button></form>`;
      break;
    case "notifications":
      body = `${panelHead("Notifications")}<div class="panel-body">${state.notifications.length ? state.notifications.map(note => `<article class="note ${note.read ? "" : "unread"}"><strong>${escapeHtml(note.title)}</strong><p>${escapeHtml(note.text)}</p><small>${formatDate(note.time)}</small></article>`).join("") : `<p class="empty-state">Aucune notification.</p>`}</div>`;
      break;
    case "loyalty": {
      const points = loyaltyPoints();
      body = `${panelHead("Programme fidélité")}<div class="panel-body"><article class="loyalty-card"><small>${icon("gift")}Vos points</small><div class="loyalty-points">${points}</div><p class="loyalty-hint">1 point gagné pour chaque 10 MAD dépensés.</p></article>${REWARDS.map(reward => `<div class="reward ${points >= reward.points ? "unlocked" : ""}"><span class="pick-icon">${icon(points >= reward.points ? "check" : "gift")}</span><span class="pick-copy"><strong>${reward.label}</strong><small>${reward.points} points${points >= reward.points ? " · débloquée" : ` · encore ${reward.points - points}`}</small></span></div>`).join("")}</div>`;
      break;
    }
    case "support":
      body = `${panelHead("Aide & contact")}<div class="panel-body"><a class="outline-button full-width" href="tel:+212612345678">${icon("phone")}Appeler le restaurant</a><a class="outline-button full-width" href="https://wa.me/212612345678" target="_blank" rel="noopener">${icon("chat")}WhatsApp</a><article class="note"><strong>Horaires</strong><p>Tous les jours, 11:00 – 00:00</p></article><article class="note"><strong>Une question sur une commande ?</strong><p>Indiquez le numéro de commande, par exemple #GK-2790.</p></article></div>`;
      break;
  }
  sheet.className = "sheet panel";
  sheet.innerHTML = body;
}

function openPanel(name) {
  state.detail = null;
  state.panel = name;
  renderPanel();
  showOverlay();
  if (name === "notifications") {
    state.notifications.forEach(note => { note.read = true; });
    updateChrome();
    saveState();
  }
  (sheet.querySelector("input, select, .pick-main, a, .icon-button") || sheet).focus?.();
}

function setPanel(name) {
  state.panel = name;
  renderPanel();
}

function panelClick(event) {
  const target = event.target;
  let el;
  if ((el = target.closest("[data-panel-go]"))) return setPanel(el.dataset.panelGo);
  if ((el = target.closest("[data-remove-address]"))) {
    state.addresses = state.addresses.filter(address => address.id !== el.dataset.removeAddress);
    if (!state.addresses.some(address => address.id === state.addressId)) state.addressId = state.addresses[0]?.id ?? null;
    render();
    return setPanel("addresses");
  }
  if ((el = target.closest("[data-remove-payment]"))) {
    state.payments = state.payments.filter(payment => payment.id !== el.dataset.removePayment);
    if (!state.payments.some(payment => payment.id === state.payId)) state.payId = "cash";
    render();
    return setPanel("payments");
  }
  if ((el = target.closest("[data-pick-address]"))) {
    state.addressId = el.dataset.pickAddress;
    render();
    closeOverlay();
    return showToast("Adresse de livraison mise à jour.");
  }
  if ((el = target.closest("[data-pick-payment]"))) {
    state.payId = el.dataset.pickPayment;
    render();
    closeOverlay();
    return showToast("Moyen de paiement mis à jour.");
  }
}

const luhn = number => {
  let sum = 0;
  [...number].reverse().forEach((digit, index) => {
    let value = Number(digit);
    if (index % 2) { value *= 2; if (value > 9) value -= 9; }
    sum += value;
  });
  return sum % 10 === 0;
};

function formError(form, message) {
  form.querySelector(".form-error").textContent = message;
}

function submitAddress(form) {
  const data = new FormData(form);
  const street = String(data.get("street")).trim();
  if (street.length < 5) return formError(form, "Saisissez une adresse complète (5 caractères minimum).");
  const address = { id: `a${Date.now()}`, label: String(data.get("label")), street, zone: String(data.get("zone")) };
  state.addresses.push(address);
  state.addressId = address.id;
  render();
  closeOverlay();
  showToast("Adresse ajoutée.");
}

function submitCard(form) {
  const data = new FormData(form);
  const number = String(data.get("number")).replace(/\s/g, "");
  if (!/^\d{13,19}$/.test(number) || !luhn(number)) return formError(form, "Numéro de carte invalide.");
  const match = String(data.get("expiry")).match(/^(\d{2})\/(\d{2})$/);
  const month = match ? Number(match[1]) : 0;
  const now = new Date();
  if (!match || month < 1 || month > 12 || new Date(2000 + Number(match[2]), month, 1) <= now) return formError(form, "Date d'expiration invalide ou dépassée.");
  if (!/^\d{3,4}$/.test(String(data.get("cvc")))) return formError(form, "CVC invalide.");
  const brand = number.startsWith("4") ? "Visa" : /^(5[1-5]|2[2-7])/.test(number) ? "Mastercard" : "Carte";
  const payment = { id: `p${Date.now()}`, type: "card", label: `${brand} •••• ${number.slice(-4)}`, expiry: match[0] };
  state.payments.push(payment);
  state.payId = payment.id;
  render();
  closeOverlay();
  showToast("Carte ajoutée.");
}

/* ---------- Cart & orders logic ---------- */

function addToCart(product, size, extras, quantity) {
  const key = line => `${line.product.id}|${line.size.name}|${line.extras.map(extra => extra.name).sort().join(",")}`;
  const candidate = { product, size, extras, quantity };
  const match = state.cart.find(line => key(line) === key(candidate));
  if (match) match.quantity += quantity;
  else state.cart.push(candidate);
}

function startCheckout() {
  if (!state.user) {
    state.afterAuth = "cart";
    state.authMode = "login";
    state.authStep = "form";
    showToast("Connectez-vous pour finaliser votre commande.");
    return goTo("auth");
  }
  const issue = checkoutIssue();
  if (issue) return showToast(issue);
  placeOrder();
}

function placeOrder() {
  const delivery = state.delivery === "delivery";
  const address = currentAddress();
  const zone = zoneOf(address);
  const live = busLive();
  const order = {
    id: `GK-${state.orderSeq++}`,
    status: "active",
    stage: 0,
    nextAt: Date.now() + STAGE_MS,
    createdAt: Date.now(),
    mode: state.delivery,
    address: delivery ? `${address.street} · ${zone.name}` : "G&K Food · Bouznika",
    etaMin: delivery ? zone.etaMin : [20, 30],
    total: cartTotal(),
    payment: currentPayment().label,
    items: state.cart.map(line => ({ name: line.product.name, quantity: line.quantity, image: line.product.image, detail: line.size.name, extras: line.extras.map(extra => extra.name) }))
  };
  if (live) {
    const note = (state.cartNote || "").trim();
    const result = GKBus.publishOrder({
      items: state.cart.map(line => ({ productId: line.product.id, name: line.product.name, qty: line.quantity, size: line.size.name, extras: line.extras.map(extra => extra.name), price: lineUnit(line), image: line.product.image })),
      subtotal: cartSubtotal(), fee: deliveryFee(), total: order.total,
      mode: state.delivery, payment: order.payment, paymentType: currentPayment().type,
      customer: { name: state.user.name, phone: state.user.phone },
      address: delivery ? { street: address.street, zone: address.zone, label: address.label } : { street: "Retrait au restaurant", zone: "centre", label: "Comptoir" },
      createdAt: order.createdAt, etaMin: order.etaMin, travelMin: delivery ? Math.max(5, zone.etaMin[0] - 15) : 0, note
    });
    if (result.error) return showToast(result.error);
    state.orderSeq--;
    Object.assign(order, { id: result.order.id, bus: true, busStatus: "pending", nextAt: 0, travelMin: result.order.travelMin });
  }
  state.orders.unshift(order);
  pushNotification(`Commande #${order.id}`, live ? "Commande envoyée. En attente de confirmation de la cuisine." : "Votre commande est confirmée. Nous la préparons.");
  state.cart = [];
  state.cartNote = "";
  state.promo = false;
  state.ordersTab = "active";
  state.trackingId = order.id;
  goTo("orders");
  showToast(live ? "Commande envoyée à la cuisine, en attente de confirmation." : "Merci ! Votre commande G&K est confirmée.");
}

/* ---------- Kitchen link (GKBus) ---------- */

const BUS_STAGE = { pending: 0, preparing: 1, ready: 2, enroute: 3 };
let busSignature = "";
let busDirty = false;

function applyBusOrder(local, remote) {
  const delivery = local.mode === "delivery";
  local.busStatus = remote.status;
  local.stage = remote.status === "delivered" ? (delivery ? 4 : 3) : BUS_STAGE[remote.status] ?? local.stage;
  local.status = { delivered: "completed", refused: "refused", cancelled: "cancelled" }[remote.status] || "active";
  local.prepMin = remote.prepMin;
  local.promisedAt = remote.promisedAt;
  local.courier = remote.courier;
  local.refusedReason = remote.refusedReason || "";
  local.enrouteAt = (remote.history.find(entry => entry.status === "enroute") || {}).at;
}

function syncFromBus() {
  if (!window.GKBus || !GKBus.linked) return false;
  const remote = GKBus.get();
  state.orders.forEach(order => {
    const match = order.bus && remote.orders.find(item => item.id === order.id);
    if (match) applyBusOrder(order, match);
  });
  if (remote.nid < state.busNoteSeen) state.busNoteSeen = 0;
  const mine = new Set(state.orders.filter(order => order.bus).map(order => order.id));
  remote.notifications.client.filter(note => note.id >= state.busNoteSeen && mine.has(note.orderId) && !state.notifications.some(known => known.busId === `${note.orderId}:${note.id}`))
    .reverse().forEach(note => {
      pushNotification(note.title, note.text);
      state.notifications[0].busId = `${note.orderId}:${note.id}`;
      showToast(`${note.title} · #${note.orderId}`);
    });
  state.busNoteSeen = remote.nid;
  const signature = JSON.stringify([remote.settings.paused, remote.menuAvailability, state.orders.filter(order => order.bus).map(order => [order.id, order.busStatus, order.prepMin, order.promisedAt, order.courier && order.courier.id])]);
  if (signature === busSignature) return false;
  busSignature = signature;
  return true;
}

const isTyping = () => /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName || "");

function onBusChange() {
  if (!syncFromBus()) return;
  saveState();
  if (["home", "menu", "cart", "orders"].includes(state.view)) {
    if (isTyping() && overlay.hidden) busDirty = true;
    else render();
  } else updateChrome();
}

function reorder(order) {
  order.items.forEach(item => {
    const product = products.find(candidate => candidate.name === item.name);
    if (!product) return;
    const size = product.sizes.find(option => option.name === item.detail) ?? product.sizes[0];
    addToCart(product, size, product.extras.filter(extra => (item.extras || []).includes(extra.name)), item.quantity);
  });
  goTo("cart");
  showToast("Articles ajoutés à votre panier.");
}

function tick() {
  const now = Date.now();
  let changed = false;
  onBusChange();
  if (busDirty && !isTyping()) { busDirty = false; render(); }
  for (const order of state.orders) {
    if (order.bus || order.status !== "active" || order.nextAt > now) continue;
    const step = advanceOrder(order);
    changed = true;
    if (step) showToast(`#${order.id} · ${step.title}`);
  }
  if (changed) {
    if (state.view === "orders") render();
    else { updateChrome(); saveState(); }
    return;
  }
  const tracked = state.view === "orders" && state.trackingId && state.orders.find(order => order.id === state.trackingId);
  const pin = document.querySelector("#courier-pin");
  if (tracked && pin && tracked.status === "active" && tracked.stage === (tracked.bus ? 3 : 2)) {
    const point = courierPoint(tracked);
    pin.style.left = `${point.x}%`;
    pin.style.top = `${point.y}%`;
  }
}

/* ---------- Events ---------- */

document.querySelector(".bottom-nav").addEventListener("click", event => {
  const button = event.target.closest("[data-view]");
  if (button) setView(button.dataset.view);
});
document.querySelector("#home-brand").addEventListener("click", () => setView("home"));
document.querySelector("#notif-button").addEventListener("click", () => openPanel("notifications"));
document.querySelector("#location-button").addEventListener("click", () => openPanel("addresses"));

const actionMessages = {
  chat: "La messagerie avec le livreur sera bientôt disponible.",
  directions: "Ouverture de l'itinéraire vers G&K Food…"
};
const panelActions = ["addresses", "payments", "loyalty", "support"];

main.addEventListener("click", event => {
  const closest = selector => event.target.closest(selector);
  let el;
  if ((el = closest("[data-view]"))) return setView(el.dataset.view);
  if ((el = closest("[data-category]"))) { state.category = el.dataset.category; return render(); }
  if ((el = closest("[data-favorite]"))) {
    const id = el.dataset.favorite;
    if (state.favorites.has(id)) state.favorites.delete(id); else state.favorites.add(id);
    render();
    return showToast(state.favorites.has(id) ? "Ajouté à vos favoris" : "Retiré de vos favoris");
  }
  if ((el = closest("[data-product]"))) return openProduct(el.dataset.product);
  if ((el = closest("[data-cart-index]"))) {
    const index = Number(el.dataset.cartIndex);
    state.cart[index].quantity += Number(el.dataset.delta);
    if (state.cart[index].quantity <= 0) state.cart.splice(index, 1);
    return render();
  }
  if ((el = closest("[data-delivery]"))) { state.delivery = el.dataset.delivery; return render(); }
  if ((el = closest("[data-orders-tab]"))) { state.ordersTab = el.dataset.ordersTab; return render(); }
  if ((el = closest("[data-track-order]"))) { state.trackingId = el.dataset.trackOrder; render(); return window.scrollTo({ top: 0 }); }
  if (closest("[data-back-orders]")) { state.trackingId = null; return render(); }
  if ((el = closest("[data-cancel-order]"))) {
    const order = state.orders.find(item => item.id === el.dataset.cancelOrder);
    if (order && order.bus) {
      const error = GKBus.cancelOrder(order.id);
      if (error) showToast(error);
      else { showToast("Commande annulée."); pushNotification(`Commande #${order.id}`, "Votre commande a été annulée."); }
      syncFromBus();
      return render();
    }
    if (order && order.stage <= 1) {
      order.status = "cancelled";
      pushNotification(`Commande #${order.id}`, "Votre commande a été annulée.");
    }
    render();
    return showToast("Commande annulée.");
  }
  if ((el = closest("[data-reorder]"))) return reorder(state.orders.find(item => item.id === el.dataset.reorder));
  if (!(el = closest("[data-action]"))) return;
  const action = el.dataset.action;
  if (panelActions.includes(action)) return openPanel(action);
  switch (action) {
    case "checkout": return startCheckout();
    case "filters": return setView("menu");
    case "favorites":
      state.category = "Favoris";
      state.query = "";
      return goTo("menu");
    case "next-slide": state.slide += 1; return render();
    case "skip-onboarding":
      state.onboarded = true;
      state.authMode = "login";
      state.authStep = "form";
      return goTo("auth");
    case "login":
      state.afterAuth = "profile";
      state.authMode = "login";
      state.authStep = "form";
      return goTo("auth");
    case "auth-switch": state.authMode = state.authMode === "login" ? "signup" : "login"; return render();
    case "auth-back": state.authStep = "form"; return render();
    case "guest": {
      const target = state.afterAuth || "home";
      state.afterAuth = "home";
      return goTo(target);
    }
    case "logout":
      state.user = null;
      render();
      return showToast("Vous êtes déconnecté.");
    case "reset":
      if (confirm("Effacer toutes les données de démo (commandes, adresses, panier) ?")) resetState();
      return;
    case "install":
      if (installPrompt) { installPrompt.prompt(); installPrompt = null; render(); }
      return;
    default:
      if (actionMessages[action]) showToast(actionMessages[action]);
  }
});

main.addEventListener("input", event => {
  if (!event.target.matches("#home-search, #menu-search")) return;
  const position = event.target.selectionStart;
  const selector = `#${event.target.id}`;
  state.query = event.target.value;
  render();
  const input = document.querySelector(selector);
  input.focus();
  input.setSelectionRange(position, position);
});

main.addEventListener("submit", event => {
  event.preventDefault();
  const form = event.target;
  if (form.id === "promo-form") {
    if (document.querySelector("#promo-code").value.trim().toUpperCase() === "GKBONJOUR") {
      state.promo = true;
      render();
      showToast("10 MAD de remise appliqués à votre panier.");
    } else {
      showToast("Code non reconnu. Essayez GKBONJOUR.");
    }
  } else if (form.id === "auth-form") {
    const data = new FormData(form);
    const phone = String(data.get("phone")).replace(/[\s.-]/g, "");
    const name = String(data.get("name") ?? "").trim();
    if (state.authMode === "signup" && name.length < 2) return formError(form, "Saisissez votre nom.");
    if (!PHONE_RE.test(phone)) return formError(form, "Numéro invalide. Exemple : 06 12 34 56 78.");
    state.pendingUser = { name: name || "Client G&K", phone };
    state.authStep = "otp";
    render();
    document.querySelector("#otp-code").focus();
  } else if (form.id === "otp-form") {
    if (new FormData(form).get("code") !== DEMO_OTP) return formError(form, "Code incorrect. Essayez 1234.");
    state.user = state.pendingUser;
    state.pendingUser = null;
    state.authStep = "form";
    const target = state.afterAuth || "home";
    state.afterAuth = "home";
    goTo(target);
    showToast(`Bienvenue, ${state.user.name} !`);
  }
});

overlay.addEventListener("click", event => {
  if (event.target === overlay || event.target.closest('[data-action="close-sheet"]')) return closeOverlay();
  if (state.panel) return panelClick(event);
  if (!state.detail) return;
  let el;
  if ((el = event.target.closest("[data-size]"))) state.detail.size = state.detail.product.sizes[Number(el.dataset.size)];
  else if ((el = event.target.closest("[data-extra]"))) {
    const index = Number(el.dataset.extra);
    if (state.detail.extras.has(index)) state.detail.extras.delete(index); else state.detail.extras.add(index);
  } else if ((el = event.target.closest("[data-detail-delta]"))) state.detail.quantity = Math.max(1, state.detail.quantity + Number(el.dataset.detailDelta));
  else if (event.target.closest("[data-detail-favorite]")) {
    const id = state.detail.product.id;
    if (state.favorites.has(id)) state.favorites.delete(id); else state.favorites.add(id);
    render();
  } else if (event.target.closest('[data-action="add-to-cart"]')) {
    const { product, size, extras, quantity } = state.detail;
    if (isSoldOut(product.id)) { closeOverlay(); render(); return showToast(`${product.name} est épuisé pour le moment.`); }
    addToCart(product, size, [...extras].map(index => product.extras[index]), quantity);
    closeOverlay();
    render();
    return showToast(`${product.name} ajouté au panier.`);
  } else return;
  const scroll = sheet.querySelector(".sheet-scroll").scrollTop;
  renderSheet();
  sheet.querySelector(".sheet-scroll").scrollTop = scroll;
});

overlay.addEventListener("submit", event => {
  event.preventDefault();
  if (event.target.id === "address-form") submitAddress(event.target);
  else if (event.target.id === "card-form") submitCard(event.target);
});

document.addEventListener("keydown", event => {
  if (event.key === "Escape" && !overlay.hidden) closeOverlay();
});

window.addEventListener("beforeinstallprompt", event => {
  event.preventDefault();
  installPrompt = event;
  if (state.view === "profile") render();
});

/* ---------- Boot ---------- */

loadState();
if (!state.onboarded) state.view = "onboarding";
document.querySelectorAll("[data-icon]").forEach(slot => { slot.innerHTML = icon(slot.dataset.icon); });
syncFromBus();
render();
setInterval(tick, 1000);
if (window.GKBus) GKBus.subscribe(onBusChange);
main.addEventListener("input", event => {
  if (event.target.id === "cart-note") { state.cartNote = event.target.value; saveState(); }
});

if ("serviceWorker" in navigator && location.protocol.startsWith("http")) {
  navigator.serviceWorker.register("./sw.js").catch(() => {});
}
