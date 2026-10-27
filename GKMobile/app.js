const main = document.querySelector("#app-main");
const overlay = document.querySelector("#overlay");
const sheet = document.querySelector("#sheet");
let toastTimer;
let installPrompt = null;

const PHONE_RE = /^(\+212|0)[5-7]\d{8}$/;
const BARE_VIEWS = ["auth"];
const LOCAL_DISH_FOLDERS = {
  salades: "salades",
  sandwichs: "sandwichs",
  tacos: "tacos",
  pasticcio: "pasticcio",
  pates: "pates",
  tajines: "tajines",
  burgers: "burgers",
  plats: "plats",
  pizzas: "pizza",
  desserts: "desserts",
  boissons: "boissons",
  jus: "jus"
};

function slugKey(text) {
  return String(text || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function localDishImage(item, category) {
  const folder = LOCAL_DISH_FOLDERS[slugKey(category?.name)];
  const name = slugKey(item.name);
  return folder && name ? `./assets/menu/${folder}/${name}.png?v=37` : "";
}

function cutoutClass(src) {
  return src && src.includes("/assets/menu/") ? " cutout" : "";
}

function normalizeProduct(item, categoryMap) {
  const category = categoryMap.get(item.categoryId);
  return {
    ...item,
    category: category?.name || "",
    categoryName: category?.name || "",
    price: Number(item.price) || 0,
    sizes: Array.isArray(item.sizes) ? item.sizes.map(size => ({ ...size, delta: Number(size.delta) || 0 })) : [],
    extras: Array.isArray(item.extras) ? item.extras.map(extra => ({ ...extra, price: Number(extra.price) || 0 })) : [],
    image: item.image || localDishImage(item, category) || "",
    discount: item.discount || "",
    available: !!item.available
  };
}

async function loadMenu() {
  if (!state.selectedBranchId) {
    products = [];
    zones = [];
    categories = [{ id: "All", label: "Tout", icon: "sparkles" }, { id: "Favoris", label: "Favoris", icon: "heart" }];
    state.settings = {};
    state.menuStatus = "loaded";
    state.menuError = "";
    render();
    return;
  }
  state.menuStatus = "loading";
  state.menuError = "";
  render();
  try {
    const [menu, zonesResponse] = await Promise.all([
      GKApi.get("/api/menu"),
      GKApi.get("/api/zones")
    ]);
    const hiddenCategory = slug => slugKey(slug) === "tajines";
    const visibleCategories = (menu.categories || []).filter(category => !hiddenCategory(category.name));
    const categoryMap = new Map(visibleCategories.map(category => [category.id, category]));
    categories = [
      { id: "All", label: "Tout", icon: "sparkles" },
      ...visibleCategories.map(category => ({ id: category.id, label: category.name, icon: "utensils" })),
      { id: "Favoris", label: "Favoris", icon: "heart" }
    ];
    products = (menu.items || []).filter(item => item.visible && categoryMap.has(item.categoryId)).map(item => normalizeProduct(item, categoryMap));
    zones = zonesResponse.zones ?? menu.zones ?? [];
    state.settings = menu.settings || {};
    state.cart = hydrateCart(state.cart);
    state.menuStatus = "loaded";
    if (!categories.some(category => category.id === state.category)) state.category = "All";
  } catch (error) {
    state.menuStatus = "error";
    state.menuError = error.message || "Le menu n'a pas pu être chargé.";
  }
  render();
}

function normalizeOrder(row) {
  const status = row.status === "delivered" ? "completed" : ["pending", "preparing", "ready", "enroute"].includes(row.status) ? "active" : row.status;
  const stage = { pending: 0, preparing: 1, ready: 2, enroute: 3, delivered: row.mode === "delivery" ? 4 : 3 }[row.status] ?? 0;
  const zone = zones.find(item => item.id === row.zone_id);
  const createdAt = Number(row.created_at) || Date.parse(row.created_at) || Date.now();
  const promisedAt = Number(row.promised_at) || Date.parse(row.promised_at) || 0;
  const etaStart = Number(row.eta_min) || Number(zone?.etaMin) || 0;
  const etaEnd = Number(zone?.etaMax) || etaStart;
  const items = (row.items || []).map(item => ({
    id: item.id,
    name: item.name,
    quantity: Number(item.qty) || 1,
    image: item.image || "",
    detail: item.size || "",
    extras: item.extras || []
  }));
  return {
    ...row,
    status,
    stage,
    createdAt,
    promisedAt,
    etaMin: etaStart ? [etaStart, etaEnd] : [],
    total: Number(row.total) || 0,
    address: [row.address, row.zone_name].filter(Boolean).join(" · ") || "Retrait au restaurant",
    refusedReason: row.refused_reason || "",
    items
  };
}

async function loadBranches() {
  state.branchLoading = true;
  state.branchError = "";
  if (state.view !== "auth") render();
  try {
    const response = await GKApi.get("/api/branches");
    state.branches = Array.isArray(response.branches) ? response.branches.filter(branch => branch.active !== false) : [];
    if (state.selectedBranchId && !state.branches.some(branch => branch.id === state.selectedBranchId)) {
      GKApi.clearBranch();
      state.selectedBranchId = "";
    }
  } catch (error) {
    state.branchError = error.message || "Impossible de charger les restaurants.";
  } finally {
    state.branchLoading = false;
    if (state.view !== "auth") render();
  }
}

function lastOrderToReorder(orderId) {
  const completed = state.orders
    .filter(item => item.status === "completed" && item.items?.length)
    .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  const order = orderId ? completed.find(item => item.id === orderId) : completed[0];
  if (!order || !products.length) return null;
  const skipped = [];
  const lines = [];
  for (const item of order.items) {
    const product = products.find(entry => entry.id === item.id);
    if (!product || !product.available) {
      skipped.push(item.name || item.id);
      continue;
    }
    const wanted = item.detail || "";
    const size = wanted
      ? product.sizes.find(entry => entry.name === wanted)
      : (product.sizes[0] || { name: "", delta: 0 });
    if (!size) {
      skipped.push(item.name || item.id);
      continue;
    }
    const names = (item.extras || []).map(extra => (typeof extra === "string" ? extra : extra?.name)).filter(Boolean);
    const extras = product.extras.filter(extra => names.includes(extra.name));
    lines.push({ product, size, extras, quantity: Math.max(1, Number(item.quantity) || 1) });
  }
  return lines.length ? { order, lines, skipped } : null;
}

function renderReorder() {
  const found = lastOrderToReorder();
  if (!found) return "";
  const first = found.lines[0].product;
  const total = found.lines.reduce((sum, line) => sum + lineUnit(line) * line.quantity, 0);
  return `<button class="reorder-chip" type="button" data-reorder="${escapeHtml(found.order.id)}">
    ${first.image ? `<img src="${escapeHtml(first.image)}" alt="" />` : `<span class="reorder-chip-dot" aria-hidden="true"></span>`}
    <span class="reorder-copy"><strong>Commander à nouveau</strong><span>${escapeHtml(orderSummary(found.order))} · ${formatPrice(total)}</span></span>
    <span class="reorder-go">Ajouter</span>
  </button>`;
}

const TOP_SELLER_FALLBACK = ["margarita", "peperone", "chicken-burger", "thon", "poulet"];

function featuredProduct() {
  const available = products.filter(item => item.available);
  if (!available.length) return null;
  const counts = new Map();
  for (const order of state.orders || []) {
    for (const item of order.items || []) {
      const id = item.id;
      if (!id) continue;
      counts.set(id, (counts.get(id) || 0) + (Number(item.quantity) || 1));
    }
  }
  const fromOrders = available
    .map(item => ({ item, n: counts.get(item.id) || 0 }))
    .sort((a, b) => b.n - a.n)[0];
  if (fromOrders?.n) return fromOrders.item;
  for (const slug of TOP_SELLER_FALLBACK) {
    const hit = available.find(item => slugKey(item.name) === slug);
    if (hit) return hit;
  }
  return available.find(item => slugKey(item.categoryName) === "pizzas") || available.find(item => item.image) || available[0];
}

function renderFeatured() {
  const product = featuredProduct();
  if (!product) return "";
  return `<button class="top-seller" type="button" data-product="${escapeHtml(product.id)}" aria-label="Top seller, voir ${escapeHtml(product.name)}">
    <span class="top-seller-copy">
      <span class="top-seller-badge">Top seller</span>
      <strong>${escapeHtml(product.name)}</strong>
      <em>${escapeHtml(product.categoryName || "")}</em>
      <span class="top-seller-price">${formatPrice(product.price)}</span>
    </span>
    <span class="top-seller-photo">
      ${product.image
        ? `<img class="${cutoutClass(product.image).trim()}" src="${escapeHtml(product.image)}" alt="" />`
        : `<span aria-hidden="true">${icon("utensils")}</span>`}
    </span>
  </button>`;
}

function renderHomeTile(product) {
  const soldOut = !product.available;
  const price = Math.round(Number(product.price) || 0);
  return `<article class="home-tile">
    <button class="home-food" type="button" data-product="${escapeHtml(product.id)}" aria-label="Voir ${escapeHtml(product.name)}${soldOut ? " (indisponible)" : ""}">
      <span class="home-blob">${product.image ? `<img class="${cutoutClass(product.image).trim()}" src="${escapeHtml(product.image)}" alt="" />` : `<span aria-hidden="true">${icon("utensils")}</span>`}</span>
      <span class="home-food-copy"><strong>${escapeHtml(product.name)}</strong><em>${escapeHtml(product.categoryName || "")}</em></span>
    </button>
    <button class="home-add" type="button" data-product="${escapeHtml(product.id)}" ${soldOut ? "disabled" : ""} aria-label="${soldOut ? `${escapeHtml(product.name)} indisponible` : `Personnaliser et ajouter ${escapeHtml(product.name)}, ${price} DH`}">${soldOut ? "—" : `${price} DH`}</button>
  </article>`;
}

function updateLiveBar() {
  const bar = document.querySelector("#live-bar");
  if (!bar) return;
  const tracking = state.view === "orders" && state.trackingId;
  const active = [...state.orders]
    .filter(order => order.status === "active")
    .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))[0];
  let html = "";
  if (active && !tracking) {
    html = `<button type="button" data-live="track" data-order="${escapeHtml(active.id)}"><span class="live-dot"></span><span class="live-copy"><strong>Commande n° ${escapeHtml(active.seq || active.id)}</strong><small>${escapeHtml(stagesFor(active)[active.stage]?.title || "En cours")}</small></span><span class="live-go">Suivre</span></button>`;
  } else if (state.cart.length && ["home", "menu"].includes(state.view)) {
    const count = cartCount();
    html = `<button type="button" data-live="cart"><span class="live-dot"></span><span class="live-copy"><strong>Mon ticket · ${count} article${count > 1 ? "s" : ""}</strong><small>${formatPrice(cartSubtotal())}</small></span><span class="live-go">Voir</span></button>`;
  }
  bar.innerHTML = html;
  bar.hidden = !html;
  bar.onclick = onLiveBarClick;
  document.body.classList.toggle("has-live-bar", Boolean(html));
}

function onLiveBarClick(event) {
  const button = event.target.closest("[data-live]");
  if (!button) return;
  event.preventDefault();
  if (button.dataset.live === "cart") return setView("cart");
  state.trackingId = button.dataset.order;
  goTo("orders", { top: true });
  void refreshTrackedOrder();
}

function selectedBranch() {
  return state.branches.find(branch => branch.id === state.selectedBranchId) || null;
}

const BRANCH_DETAILS = {
  "gk-food": {
    image: "./assets/gk-food-storefront.jpg",
    address: "LOT OTHMAN (PIKMAR), BOUZNIKA.",
    maps: "https://www.google.com/maps/search/?api=1&query=LOT%20OTHMAN%20PIKMAR%20BOUZNIKA"
  },
  "gk-shawarma-crispy": {
    image: "./assets/gk-shawarma-storefront.jpg",
    photoClass: "shawarma",
    address: "BD DE L'AVENIR, QUARTIER GHITA, BOUZNIKA.",
    maps: "https://www.google.com/maps/search/?api=1&query=BD%20DE%20L%27AVENIR%20QUARTIER%20GHITA%20BOUZNIKA"
  }
};

function detailsFor(branch) {
  const id = typeof branch === "string" ? branch : branch?.id || state.selectedBranchId;
  if (BRANCH_DETAILS[id]) return BRANCH_DETAILS[id];
  const name = String((typeof branch === "object" && branch?.name) || selectedBranch()?.name || "").toLowerCase();
  if (name.includes("shawarma")) return BRANCH_DETAILS["gk-shawarma-crispy"];
  if (name.includes("food")) return BRANCH_DETAILS["gk-food"];
  return {};
}

async function chooseBranch(branchId) {
  const branch = state.branches.find(item => item.id === branchId);
  if (!branch) return showToast("Ce restaurant n'est pas disponible.");
  if (state.selectedBranchId && state.selectedBranchId !== branchId && state.cart.length
    && !confirm("Changer de restaurant videra votre panier. Continuer ?")) return;
  if (state.selectedBranchId !== branchId) {
    state.cart = [];
    state.promo = null;
    state.addressId = null;
    state.cartNote = "";
    state.trackingId = null;
    state.orders = [];
    state.promoError = "";
    state.promoMessage = "";
  }
  state.selectedBranchId = GKApi.setBranch(branchId);
  saveState();
  await loadMenu();
  const target = state.afterBranch || "home";
  state.afterBranch = "home";
  goTo(target);
  if (state.user) void refreshOrders();
}

async function syncNotifications() {
  if (!state.user || !GKApi.session("client")?.token || state.syncingNotes) return;
  state.syncingNotes = true;
  try {
    const result = await GKApi.get("/api/notifications", "client");
    const wasOpen = state.panel === "notifications";
    state.notifications = (result.notifications || []).map(note => ({ id: `s${note.id}`, title: note.title, text: note.text, time: note.at, read: !!note.read || wasOpen }));
    if (wasOpen) renderPanel();
    updateChrome();
  } catch {} finally { state.syncingNotes = false; }
}

async function refreshOrders() {
  if (!GKApi.session("client")?.token) {
    state.orders = [];
    state.ordersError = "";
    state.ordersLoading = false;
    return;
  }
  state.ordersLoading = true;
  state.ordersError = "";
  const hadReorder = !!lastOrderToReorder();
  if (state.view === "orders") render();
  try {
    const result = await GKApi.get("/api/orders", "client");
    state.orders = (result.orders || []).map(normalizeOrder);
    state.ordersError = "";
  } catch (error) {
    state.ordersError = error.message || "Impossible de charger vos commandes.";
    if (error.status === 401) {
      state.user = null;
      state.orders = [];
    }
  } finally {
    state.ordersLoading = false;
  }
  if (state.view === "orders") render();
  else if (state.view === "home" && hadReorder !== !!lastOrderToReorder()) render();
  else updateLiveBar();
}

let chatUnread = {};
function renderCourierCard(order) {
  const links = GKChat.contactLinks(order.courier.phone);
  const unread = chatUnread[order.id] || 0;
  return `<div class="courier-card"><div class="courier-who"><span class="courier-avatar">${escapeHtml((order.courier.name || "L")[0].toUpperCase())}</span><div><small>Votre livreur</small><strong>${escapeHtml(order.courier.name || "Livreur G&K")}</strong></div></div>
    <div class="courier-actions"><button class="gold-button compact" type="button" data-chat-order="${escapeHtml(order.id)}">${icon("chat")} Chat${unread ? `<span class="gkc-badge">${unread}</span>` : ""}</button>${links ? `<a class="outline-button compact" href="${escapeHtml(links.tel)}">${icon("phone")} Appeler</a><a class="outline-button compact" href="${escapeHtml(links.wa)}" target="_blank" rel="noopener">WhatsApp</a>` : ""}</div></div>`;
}

async function pollChatUnread() {
  if (!GKApi.session("client")?.token) return;
  try {
    const res = await GKApi.get("/api/chat/unread", "client");
    const grew = res.total > Object.values(chatUnread).reduce((a, b) => a + b, 0);
    const changed = JSON.stringify(res.unread) !== JSON.stringify(chatUnread);
    chatUnread = res.unread || {};
    if (grew && window.GKSound) GKSound.play("message");
    if (changed && state.view === "orders" && state.trackingId) render();
  } catch { /* badge is best effort */ }
}

function openChat(orderId) {
  GKChat.open({
    scope: "client", orderId, title: "Votre livreur", subtitle: `Commande #${orderId}`,
    quick: ["Je descends", "Merci !", "Le code porte est …"],
    onMessage: () => window.GKSound && GKSound.play("message"),
    onClose: () => { void pollChatUnread(); }
  });
}

async function refreshTrackedOrder() {
  if (!state.trackingId || !GKApi.session("client")?.token) return;
  try {
    const result = await GKApi.get(`/api/orders/${encodeURIComponent(state.trackingId)}`, "client");
    const updated = normalizeOrder(result.order);
    state.orders = state.orders.map(order => order.id === updated.id ? updated : order);
    state.ordersError = "";
    if (state.view === "orders") render();
  } catch (error) {
    state.ordersError = error.message || "Impossible de lire le suivi de cette commande.";
    if (state.view === "orders") render();
  }
}

function showToast(message) {
  const toast = document.querySelector("#toast");
  toast.textContent = message;
  toast.classList.add("visible");
  window.gkMotion?.toastIn(toast);
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
  return `<div class="category-strip" role="group" aria-label="Catégories du menu">${categories.map(category => `<button class="category-chip ${state.category === category.id ? "active" : ""}" type="button" data-category="${escapeHtml(category.id)}" aria-pressed="${state.category === category.id}">${icon(category.icon)}${escapeHtml(category.label)}</button>`).join("")}</div>`;
}

function renderProductCard(product) {
  const favorite = state.favorites.has(product.id);
  const soldOut = !product.available;
  return `<article class="product-card ${soldOut ? "is-soldout" : ""}">
    <div class="product-media">
      <button class="product-image-button" type="button" data-product="${escapeHtml(product.id)}" aria-label="Voir ${escapeHtml(product.name)}${soldOut ? " (indisponible)" : ""}">${product.image ? `<img class="product-image${cutoutClass(product.image)}" src="${escapeHtml(product.image)}" alt="${escapeHtml(product.name)}" loading="lazy" />` : `<span class="product-image-placeholder" aria-hidden="true">${icon("utensils")}</span>`}</button>
      ${soldOut ? `<span class="soldout-badge">Épuisé</span>` : product.discount ? `<span class="discount-badge">${escapeHtml(product.discount)}</span>` : ""}
      <button class="favorite-button ${favorite ? "is-favorite" : ""}" type="button" data-favorite="${escapeHtml(product.id)}" aria-label="${favorite ? "Retirer des" : "Ajouter aux"} favoris" aria-pressed="${favorite}">${icon("heart", { filled: favorite })}</button>
    </div>
    <div class="product-content">
      <div class="product-title-row"><h3 class="product-title">${escapeHtml(product.name)}</h3></div>
      <p class="product-meta">${escapeHtml(product.categoryName)}</p>
      <div class="product-footer"><span class="product-price">${formatPrice(product.price)}</span><button class="add-product" type="button" data-product="${escapeHtml(product.id)}" ${soldOut ? "disabled" : ""} aria-label="${soldOut ? `${escapeHtml(product.name)} indisponible` : `Personnaliser et ajouter ${escapeHtml(product.name)}`}">${icon("plus")}</button></div>
    </div>
  </article>`;
}

const fold = text => String(text).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase();
function filteredProducts() {
  const query = fold(state.query.trim());
  return products.filter(product =>
    (state.category === "All" || (state.category === "Favoris" ? state.favorites.has(product.id) : product.categoryId === state.category)) &&
    (!query || fold(`${product.name} ${product.description} ${product.category} ${product.cuisine}`).includes(query))
  );
}

function renderProductGrid(items = filteredProducts()) {
  if (items.length) return `<div class="product-grid">${items.map(renderProductCard).join("")}</div>`;
  const message = state.category === "Favoris" ? "Aucun favori pour l'instant. Touchez le cœur d'un plat pour l'ajouter." : products.length ? "Aucun plat ne correspond à votre recherche. Essayez un autre mot-clé." : "Le menu ne contient aucun plat pour le moment.";
  return `<div class="empty-state">${message}</div>`;
}

/* ---------- Authentication ---------- */

function renderAuth() {
  const login = state.authMode === "login";
  const back = state.afterAuth === "cart";
  return `<section class="auth" aria-labelledby="auth-heading">
    <div class="onboarding-top"><img class="onboarding-logo" src="./assets/emblem-reference.png" alt="G&K Food" /></div>
    <h1 id="auth-heading">${login ? "Bon retour !" : "Créer un compte"}</h1>
    <p class="auth-lead">${back ? "Connectez-vous pour finaliser votre commande." : "Connectez-vous pour consulter vos commandes."}</p>
    <form id="auth-form" novalidate>
      ${login ? `<label class="field"><span>E-mail ou téléphone</span><input name="identifier" autocomplete="username" placeholder="vous@exemple.com ou 06 12 34 56 78" /></label>` : `
      <label class="field"><span>Nom complet</span><input name="name" autocomplete="name" placeholder="Votre nom complet" /></label>
      <label class="field"><span>Téléphone</span><input name="phone" type="tel" autocomplete="tel" placeholder="06 12 34 56 78" /></label>
      <label class="field"><span>E-mail</span><input name="email" type="email" autocomplete="email" placeholder="vous@exemple.com" /></label>`}
      <label class="field"><span>Mot de passe</span><input name="password" type="password" autocomplete="${login ? "current-password" : "new-password"}" placeholder="${login ? "Votre mot de passe" : "8 caractères minimum"}" /></label>
      <p class="form-error" role="alert"></p>
      <button class="gold-button full-width" id="auth-submit" type="submit">${login ? "Se connecter" : "S'inscrire"}</button>
    </form>
    <p class="auth-switch">${login ? "Pas encore de compte ?" : "Déjà inscrit ?"} <button class="text-button" type="button" data-action="auth-switch">${login ? "Créer un compte" : "Se connecter"}</button></p>
    <button class="outline-button full-width" type="button" data-action="guest">${back ? "Retour au panier" : "Continuer en invité"}</button>
  </section>`;
}

function renderHouseCard(branch) {
  const details = detailsFor(branch);
  const address = details.address || branch.address || "";
  return `<button class="house-card" type="button" data-branch="${escapeHtml(branch.id)}">
    ${details.image
      ? `<span class="house-photo${details.photoClass ? ` ${details.photoClass}` : ""}"><img src="${escapeHtml(details.image)}" alt="" /></span>`
      : `<span class="house-photo house-photo-empty" aria-hidden="true">${icon("store")}</span>`}
    <span class="house-row">
      <span class="restaurant-logo"><img src="./assets/emblem-reference.png" alt="" /></span>
      <span class="house-copy">
        <strong>${escapeHtml(branch.name)}</strong>
        ${address ? `<small>${escapeHtml(address)}</small>` : `<span>${escapeHtml(branch.cuisine || "")}</span>`}
      </span>
      <span class="branch-card-arrow" aria-hidden="true">${icon("chevronRight")}</span>
    </span>
  </button>`;
}

function renderBranches() {
  const branchCards = state.branches.map(renderHouseCard).join("");
  return `<section class="branch-picker" aria-labelledby="branch-heading">
    <span class="eyebrow">G&amp;K · Choisissez votre restaurant</span>
    <h1 class="screen-title" id="branch-heading">Où souhaitez-vous commander ?</h1>
    <p class="auth-lead">Chaque restaurant possède son propre menu et sa zone de livraison.</p>
    ${state.branchLoading ? `<p class="empty-state">Chargement des restaurants…</p>` : ""}
    ${state.branchError ? `<p class="cart-notice" role="alert">${escapeHtml(state.branchError)}</p><button class="outline-button" type="button" data-action="reload-branches">Réessayer</button>` : ""}
    ${!state.branchLoading && !state.branchError && !branchCards ? `<p class="empty-state">Aucun restaurant n'est disponible pour le moment.</p>` : ""}
    <div class="branch-list">${branchCards}</div>
    <p class="fineprint">${state.user ? `Connecté en tant que ${escapeHtml(state.user.name)}.` : "Choisissez un restaurant pour voir son menu."}</p>
  </section>`;
}

/* ---------- Home / menu ---------- */

function renderHome() {
  if (!state.selectedBranchId) {
    if (state.user) return renderBranches();
    return renderBranches();
  }
  if (state.menuStatus === "loading") return `<section><h1 class="screen-title">Accueil</h1><p class="empty-state">Chargement du menu…</p></section>`;
  if (state.menuStatus === "error") return `<section><h1 class="screen-title">Accueil</h1><p class="cart-notice" role="alert">${escapeHtml(state.menuError)}</p><button class="gold-button" type="button" data-action="reload-menu">Réessayer</button></section>`;
  const branch = selectedBranch();
  const homeItems = filteredProducts();
  const compact = state.category === "All" && !state.query;
  const preview = compact ? homeItems.slice(0, 4) : homeItems;
  const menuTitle = state.query ? "Résultats" : state.category === "All" ? "Menu" : escapeHtml(categories.find(c => c.id === state.category)?.label || "Menu");
  return `<section class="home-stage" aria-label="Accueil">
    <button class="branch-switcher" type="button" data-action="choose-branch">
      <span class="branch-switcher-icon">${icon("store")}</span>
      <span><small>Vous commandez chez</small><strong>${escapeHtml(branch?.name || "G&K")}</strong></span>
      <span class="branch-switcher-change">Changer</span>
    </button>
    ${sectionHead("Notre maison")}
    ${renderRestaurantCard()}
    ${renderFeatured()}
    ${renderReorder()}
    ${renderSearch("home-search", "Rechercher un plat, une envie…")}
    ${sectionHead("Explorer les catégories", seeAll)}
    ${renderCategories()}
    ${sectionHead(`${menuTitle}${compact ? "" : ` <small>${preview.length} plats</small>`}`, seeAll)}
    ${compact && preview.length ? `<div class="home-rail">${preview.map(renderHomeTile).join("")}</div>` : renderProductGrid(preview)}
  </section>`;
}

function renderMenu() {
  if (state.menuStatus === "loading") return `<section><h1 class="screen-title">Explorer</h1><p class="empty-state">Chargement du menu…</p></section>`;
  if (state.menuStatus === "error") return `<section><h1 class="screen-title">Explorer</h1><p class="cart-notice" role="alert">${escapeHtml(state.menuError)}</p><button class="gold-button" type="button" data-action="reload-menu">Réessayer</button></section>`;
  return `<section aria-labelledby="menu-heading">
    <h1 class="screen-title" id="menu-heading">Explorer</h1>
    ${renderSearch("menu-search", "Rechercher un plat…")}
    ${renderCategories()}
    ${sectionHead(`${state.category === "All" ? "Tout le menu" : escapeHtml(categories.find(c => c.id === state.category)?.label || "")} <small>${filteredProducts().length} plats</small>`)}
    ${renderProductGrid()}
    ${sectionHead("Trouvez-nous")}
    ${renderRestaurantCard()}
  </section>`;
}

function renderRestaurantCard() {
  const restaurant = state.settings.restaurant;
  const name = typeof restaurant === "string" ? restaurant : restaurant?.name;
  const hours = typeof state.settings.hours === "string" ? state.settings.hours : "";
  const details = detailsFor(selectedBranch() || state.selectedBranchId);
  const address = details.address || (restaurant && typeof restaurant === "object" && restaurant.address) || selectedBranch()?.address || "";
  return `<article class="restaurant-card">
    ${details.image
      ? `<div class="mini-map photo${details.photoClass ? ` ${details.photoClass}` : ""}"><img src="${details.image}" alt="Façade de ${escapeHtml(name || selectedBranch()?.name || "G&K Food")}" loading="lazy" /></div>`
      : `<div class="mini-map" role="img" aria-label="Restaurant G&K"><span class="map-pin restaurant">${icon("store")}</span></div>`}
    <div class="restaurant-info">
      <div class="restaurant-logo"><img src="./assets/emblem-reference.png" alt="" /></div>
      <div class="restaurant-text"><h3 class="restaurant-name">${escapeHtml(name || selectedBranch()?.name || "G&K Food")}</h3><p class="restaurant-description">${escapeHtml(address)}</p>
        <div class="restaurant-facts">${hours ? `<span>${icon("clock")}${escapeHtml(hours)}</span>` : ""}<span>${icon("bike")}${state.settings.deliveryOn ? "Livraison disponible" : "Livraison indisponible"}</span></div></div>
      <button class="round-button" type="button" data-action="directions" aria-label="Itinéraire vers G&K Food">${icon("navigate")}</button>
    </div>
  </article>`;
}

/* ---------- Cart ---------- */

function accountPhone() {
  return String(state.user?.phone || "").replace(/[\s.-]/g, "");
}

function checkoutPhone() {
  if (state.phoneOverride || !accountPhone()) return String(state.orderPhone || "").replace(/[\s.-]/g, "");
  return accountPhone();
}

function formatPhoneDisplay(phone) {
  const digits = String(phone || "").replace(/\D/g, "");
  if (digits.length === 10) return `${digits.slice(0, 2)} ${digits.slice(2, 4)} ${digits.slice(4, 6)} ${digits.slice(6, 8)} ${digits.slice(8, 10)}`;
  return phone || "";
}

function renderCartPhone() {
  const account = accountPhone();
  if (!state.user) {
    return `<div class="address-card"><span class="address-icon">${icon("phone")}</span><div><strong>Téléphone de contact</strong><small>Connectez-vous pour utiliser le numéro du compte, ou un autre.</small></div><button class="text-button" type="button" data-action="login">Connexion</button></div>`;
  }
  if (!state.phoneOverride && account) {
    return `<div class="address-card"><span class="address-icon">${icon("phone")}</span><div><strong>${escapeHtml(formatPhoneDisplay(account))}</strong><small>Numéro du compte</small></div><button class="text-button" type="button" data-action="phone-other">Autre numéro</button></div>`;
  }
  return `<div class="address-card phone-card"><span class="address-icon">${icon("phone")}</span><div><strong>Autre numéro</strong><input id="cart-phone" type="tel" inputmode="tel" autocomplete="tel" placeholder="06 12 34 56 78" aria-label="Numéro de contact" value="${escapeHtml(state.orderPhone || "")}" /><small>${account ? "Pour cette commande seulement" : "Pour vous joindre à la livraison"}</small></div>${account ? `<button class="text-button" type="button" data-action="phone-account">Compte</button>` : ""}</div>`;
}

function renderCart() {
  if (state.menuStatus === "loading") return `<section><h1 class="screen-title">Mon panier</h1><p class="empty-state">Chargement du menu…</p></section>`;
  if (state.menuStatus === "error") return `<section><h1 class="screen-title">Mon panier</h1><p class="cart-notice" role="alert">${escapeHtml(state.menuError)}</p><button class="gold-button" type="button" data-action="reload-menu">Réessayer</button></section>`;
  if (!state.cart.length) {
    return `<section class="cart-empty"><div class="empty-basket-icon" aria-hidden="true">${icon("bag")}</div><h1>Votre panier est vide</h1><p>Ajoutez quelques bons plats et votre prochaine pause G&K commence ici.</p><button class="gold-button" type="button" data-view="menu">Explorer le menu</button></section>`;
  }
  if (state.settings.deliveryOn === false) return "La livraison est indisponible pour le moment.";
  const address = currentAddress();
  const zone = zoneOf(address);
  const issue = checkoutIssue();
  const subtotal = cartSubtotal();
  const freeFrom = zone ? Number(zone.freeFrom ?? freeDeliveryFrom()) : freeDeliveryFrom();
  const freeHint = state.delivery === "delivery" && address && subtotal < freeFrom
    ? `Plus que ${formatPrice(freeFrom - subtotal)} pour la livraison offerte.` : "";
  const eta = state.delivery === "delivery" && zone ? [zone.etaMin, zone.etaMax] : null;
  const feeLabel = !address || !zone ? "À calculer" : deliveryFee() ? formatPrice(deliveryFee()) : "Offerte";
  const payment = currentPayment();
  return `<section aria-labelledby="cart-heading">
    <h1 class="screen-title" id="cart-heading">Mon panier</h1>
    <div class="cart-list">${state.cart.map((line, index) => `<article class="cart-line">
      ${line.product.image ? `<img class="cart-line-image${cutoutClass(line.product.image)}" src="${escapeHtml(line.product.image)}" alt="" />` : `<span class="cart-line-image product-image-placeholder" aria-hidden="true">${icon("utensils")}</span>`}
      <div class="cart-line-body">
        <h2 class="cart-line-name">${escapeHtml(line.product.name)}</h2>
        <p class="cart-line-price">${formatPrice(lineUnit(line))}</p>
        <div class="chip-row"><span class="mini-chip">${escapeHtml(line.size.name)}</span>${line.extras.map(extra => `<span class="mini-chip">${escapeHtml(extra.name)}</span>`).join("")}</div>
      </div>
      <div class="quantity-control"><button class="quantity-button" type="button" data-cart-index="${index}" data-delta="-1" aria-label="Retirer un ${escapeHtml(line.product.name)}">${icon("minus")}</button><span class="quantity-number">${line.quantity}</span><button class="quantity-button primary" type="button" data-cart-index="${index}" data-delta="1" aria-label="Ajouter un ${escapeHtml(line.product.name)}">${icon("plus")}</button></div>
    </article>`).join("")}</div>
    <h2 class="block-title">Type de commande</h2>
    <div class="delivery-toggle" role="group" aria-label="Type de commande">
      <button class="delivery-choice ${state.delivery === "delivery" ? "active" : ""}" type="button" data-delivery="delivery" aria-pressed="${state.delivery === "delivery"}" ${state.settings.deliveryOn === false ? "disabled" : ""}>${icon("bike")}Livraison<small>${zone ? `${zone.etaMin}–${zone.etaMax} min` : "Choisir une adresse"}</small></button>
      <button class="delivery-choice ${state.delivery === "pickup" ? "active" : ""}" type="button" data-delivery="pickup" aria-pressed="${state.delivery === "pickup"}">${icon("store")}À emporter<small>Retrait au restaurant</small></button>
    </div>
    <div class="address-card"><span class="address-icon">${icon("pin")}</span><div><strong>${state.delivery === "delivery" ? (address ? escapeHtml(address.street) : "Aucune adresse") : escapeHtml((state.settings.restaurant && typeof state.settings.restaurant === "object" && state.settings.restaurant.name) || state.settings.restaurant || "G&K Food")}</strong><small>${state.delivery === "delivery" ? (address ? `${escapeHtml(address.label)} · ${escapeHtml(zone?.name || "")}` : "Ajoutez une adresse de livraison") : "Retrait au restaurant"}</small></div>${state.delivery === "delivery" ? `<button class="text-button" type="button" data-action="addresses">${address ? "Modifier" : "Ajouter"}</button>` : ""}</div>
    ${renderCartPhone()}
    <div class="address-card"><span class="address-icon">${icon("cash")}</span><div><strong>${escapeHtml(payment.label)}</strong><small>Le paiement par carte n'est pas disponible. Aucun numéro de carte n'est collecté.</small></div></div>
    <form class="promo-box" id="promo-form"><span class="promo-icon" aria-hidden="true">${icon("tag")}</span><input class="promo-input" id="promo-code" type="text" placeholder="Code promo" aria-label="Code promo" ${state.promo ? `value="${escapeHtml(state.promo.code)}"` : ""} /><button class="outline-button" type="submit">${state.promo ? `Appliqué ${icon("check")}` : "Appliquer"}</button></form>
    ${state.promoError ? `<p class="form-error" role="alert">${escapeHtml(state.promoError)}</p>` : ""}
    ${state.promoMessage ? `<p class="cart-notice soft">${escapeHtml(state.promoMessage)}</p>` : ""}
    ${state.orderError ? `<p class="cart-notice" role="alert">${escapeHtml(state.orderError)}</p>` : ""}
    <label class="note-box"><span>Note pour la cuisine <small>· optionnel</small></span><textarea id="cart-note" rows="2" maxlength="140" placeholder="Ex. sans oignons, bien cuit…">${escapeHtml(state.cartNote || "")}</textarea></label>
    <div class="bill-card"><div class="bill-row"><span>Sous-total</span><span>${formatPrice(subtotal)}</span></div>${state.delivery === "delivery" ? `<div class="bill-row"><span>Frais de livraison</span><span>${feeLabel}</span></div>` : ""}${state.promo ? `<div class="bill-row promo"><span>${escapeHtml(state.promo.code)}</span><span>-${formatPrice(state.promo.discount)}</span></div>` : ""}<div class="bill-row total"><span>Total</span><strong>${formatPrice(cartTotal())}</strong></div></div>
    ${issue ? `<p class="cart-notice">${escapeHtml(issue)}</p>` : freeHint ? `<p class="cart-notice soft">${freeHint}</p>` : ""}
    <button class="gold-button full-width" type="button" data-action="checkout" ${state.orderSubmitting ? "disabled" : ""}>${state.orderSubmitting ? "Envoi en cours…" : state.user ? "Passer la commande" : "Se connecter pour commander"} · ${formatPrice(cartTotal())}</button>
    ${eta ? `<p class="fineprint">Délai de livraison estimé : ${eta[0]}–${eta[1]} min</p>` : ""}
  </section>`;
}

/* ---------- Orders & tracking ---------- */

function orderSummary(order) {
  return order.items.map(item => `${item.quantity}× ${item.name}`).join(", ") || "Commande";
}

function renderOrderCard(order) {
  const first = order.items[0];
  const label = { active: "Active", completed: "Terminée", cancelled: "Annulée", refused: "Refusée" }[order.status];
  const stage = order.status === "active" ? `<p class="order-stage">${stagesFor(order)[order.stage].title}</p>`
    : order.status === "refused" ? `<p class="order-stage">Motif : ${escapeHtml(order.refusedReason || "non précisé")}</p>` : "";
  let actions;
  if (order.status === "active") {
    const cancellable = order.status === "active" && order.stage === 0;
    actions = `${cancellable ? `<button class="outline-button" type="button" data-cancel-order="${escapeHtml(order.id)}">Annuler</button>` : ""}<button class="gold-button" type="button" data-track-order="${escapeHtml(order.id)}">Suivre ${icon("navigate")}</button>`;
  } else {
    actions = "";
  }
  return `<article class="order-card">
    <div class="order-card-head"><span>Commande #${escapeHtml(order.seq || order.id)}</span><span class="status-pill ${order.status}">${label}</span></div>
    <div class="order-card-body">${first?.image ? `<img src="${escapeHtml(first.image)}" alt="" />` : ""}<div><h3>${escapeHtml(orderSummary(order))}</h3><p>${formatDate(order.createdAt)} · ${order.mode === "delivery" ? "Livraison" : "À emporter"}</p>${stage}<strong>${formatPrice(order.total)}</strong></div></div>
    <div class="order-actions">${actions}</div>
  </article>`;
}

function trackingEta(order) {
  if (order.status === "completed") return "Terminée";
  if (order.status === "refused") return "Refusée";
  if (order.status === "cancelled") return "Annulée";
  if (order.promisedAt) return hhmm(order.promisedAt);
  if (order.etaMin.length) return `${hhmm(order.createdAt + order.etaMin[0] * 60000)} – ${hhmm(order.createdAt + order.etaMin[1] * 60000)}`;
  return "En cours";
}

function trackingScene(order) {
  const html = window.gkMotionLive?.liveSceneHtml;
  if (!html || order.status !== "active") return "";
  if (order.stage === 0) return html("wait", "La cuisine va confirmer votre commande");
  if (order.stage === 1) return html("cook", "Le chef prépare vos plats");
  if (order.stage === 2) return html("ready", order.mode === "pickup" ? "Votre commande vous attend au comptoir" : "En attente du livreur");
  if (order.stage === 3) return html("ride", "Votre livreur est en route");
  return "";
}

function renderTracking(order) {
  const steps = stagesFor(order);
  const done = order.status === "completed";
  const ended = order.status === "refused" || order.status === "cancelled";
  const etaText = trackingEta(order);
  return `<section aria-labelledby="tracking-heading">
    <div class="back-row"><button class="icon-button" type="button" data-back-orders aria-label="Retour aux commandes">${icon("chevronLeft")}</button><h1 class="screen-title" id="tracking-heading">Suivi de commande</h1></div>
    ${state.ordersError ? `<p class="cart-notice" role="alert">${escapeHtml(state.ordersError)}</p>` : ""}
    <article class="tracking-card">
      <div class="eta-row"><div><small>${done || ended ? "Statut" : "Estimation du restaurant"}</small><strong>${etaText}</strong></div><span class="status-pill ${order.status}">Commande #${escapeHtml(order.seq || order.id)}</span></div>
      ${trackingScene(order)}
      ${order.status === "active" && order.mode === "delivery" && order.delivery_code ? `<p class="cart-notice">Code de livraison à donner au livreur : <strong>${escapeHtml(order.delivery_code)}</strong></p>` : ""}
      ${order.status === "refused" ? `<p class="cart-notice">Commande refusée par la cuisine. Motif : ${escapeHtml(order.refusedReason || "non précisé")}.</p>` : ""}
      ${ended ? "" : `<ol class="step-list">${steps.map((step, index) => {
        const status = index < order.stage || (done && index === steps.length - 1) ? "done" : index === order.stage ? "current" : "";
        return `<li class="step-item ${status}"><span class="step-dot">${icon(step.icon)}</span><span class="step-copy"><strong>${step.title}</strong><small>${step.detail}</small></span></li>`;
      }).join("")}</ol>`}
      ${order.courier ? renderCourierCard(order) : ""}
      ${order.status === "active" && order.stage === 0 ? `<button class="outline-button full-width" type="button" data-cancel-order="${escapeHtml(order.id)}">Annuler la commande</button>` : ""}
      ${order.status === "active" ? `<p class="fineprint">Le suivi reflète les statuts transmis par le restaurant. La position GPS du livreur n'est pas disponible.</p>` : ""}
    </article>
  </section>`;
}

function renderOrders() {
  if (!state.user) return `<section aria-labelledby="orders-heading"><h1 class="screen-title" id="orders-heading">Mes commandes</h1><div class="cart-empty"><div class="empty-basket-icon" aria-hidden="true">${icon("receipt")}</div><h2>Connectez-vous pour consulter vos commandes.</h2><button class="gold-button" type="button" data-action="login">Se connecter</button></div></section>`;
  if (state.trackingId) {
    const tracked = state.orders.find(order => order.id === state.trackingId);
    if (tracked) return renderTracking(tracked);
    state.trackingId = null;
  }
  const tabs = [["active", "Actives"], ["completed", "Terminées"], ["cancelled", "Annulées"]];
  const list = state.orders.filter(order => order.status === state.ordersTab || (state.ordersTab === "cancelled" && order.status === "refused"));
  const empty = state.ordersTab === "active" ? "Aucune commande en cours pour l'instant." : "Rien à afficher ici.";
  return `<section aria-labelledby="orders-heading"><h1 class="screen-title" id="orders-heading">Mes commandes</h1>
    ${state.ordersError ? `<p class="cart-notice" role="alert">${escapeHtml(state.ordersError)}</p><button class="outline-button" type="button" data-action="reload-orders">Réessayer</button>` : ""}
    <div class="tabs" role="tablist">${tabs.map(([id, label]) => `<button class="tab ${state.ordersTab === id ? "active" : ""}" type="button" role="tab" aria-selected="${state.ordersTab === id}" data-orders-tab="${id}">${label}</button>`).join("")}</div>
    ${state.ordersLoading ? `<p class="empty-state">Chargement de vos commandes…</p>` : list.length ? list.map(renderOrderCard).join("") : `<div class="cart-empty"><div class="empty-basket-icon" aria-hidden="true">${icon("receipt")}</div><h2>${empty}</h2><button class="gold-button" type="button" data-view="menu">Explorer le menu</button></div>`}
  </section>`;
}

/* ---------- Profile ---------- */

function renderProfile() {
  const items = [
    ["orders", "receipt", "Mes commandes"], ["addresses", "pin", "Mes adresses"], ["payments", "card", "Moyens de paiement"],
    ["favorites", "heart", "Mes favoris"], ["support", "help", "Aide & contact"]
  ];
  if (installPrompt) items.push(["install", "download", "Installer l'application"]);
  const user = state.user;
  const branch = selectedBranch();
  return `<section aria-labelledby="profile-heading"><h1 class="screen-title" id="profile-heading">Mon profil</h1>
    <article class="profile-card"><div class="profile-avatar">${escapeHtml((user?.name || "G")[0].toUpperCase())}</div><div class="profile-text"><h2>${user ? escapeHtml(user.name) : "Bienvenue chez G&K"}</h2><p>${user ? escapeHtml(user.phone) : "Connectez-vous pour retrouver vos commandes et favoris."}</p></div>${user ? "" : `<button class="gold-button compact" type="button" data-action="login">Connexion</button>`}</article>
    ${user ? `<button class="branch-switcher profile-branch-switcher" type="button" data-action="choose-branch"><span class="branch-switcher-icon">${icon("store")}</span><span><small>Restaurant sélectionné</small><strong>${escapeHtml(branch?.name || "Choisir un restaurant")}</strong></span><span class="branch-switcher-change">Changer</span></button>` : ""}
    <nav class="profile-menu" aria-label="Raccourcis du compte">${items.map(([action, ico, label]) => `<button class="profile-menu-button" type="button" ${action === "orders" ? 'data-view="orders"' : `data-action="${action}"`}><span>${icon(ico)}</span>${label}</button>`).join("")}${user ? `<button class="profile-menu-button" type="button" data-action="logout"><span>${icon("logout")}</span>Se déconnecter</button>` : ""}<button class="profile-menu-button subtle" type="button" data-action="reset"><span>${icon("refresh")}</span>Effacer les préférences locales</button></nav>
  </section>`;
}

/* ---------- Main render ---------- */

function updateChrome() {
  const address = currentAddress();
  document.querySelector("#location-label").textContent = address ? address.street : "Choisir une adresse";
  document.querySelector("#location-button").setAttribute("aria-label", `Adresse de livraison : ${address ? address.street : "aucune"}`);
  const unread = state.notifications.some(note => !note.read);
  document.querySelector("#notif-button .dot").style.display = unread ? "" : "none";
  const count = document.querySelector("#nav-cart-count");
  count.textContent = String(cartCount());
  count.hidden = cartCount() === 0;
  updateLiveBar();
}

function render() {
  const views = { auth: renderAuth, branches: renderBranches, home: renderHome, menu: renderMenu, cart: renderCart, orders: renderOrders, profile: renderProfile };
  document.body.toggleAttribute("data-bare", BARE_VIEWS.includes(state.view));
  const banner = state.menuStatus === "loaded" && isPaused() && ["home", "menu", "cart", "orders"].includes(state.view)
    ? `<div class="pause-banner" role="alert">${icon("clock")}<span>${PAUSE_MESSAGE}</span></div>` : "";
  main.innerHTML = banner + views[state.view]();
  document.querySelectorAll(".nav-button").forEach(button => {
    const active = button.dataset.view === state.view || (button.dataset.view === "home" && state.view === "branches");
    button.classList.toggle("active", active);
    if (active) button.setAttribute("aria-current", "page");
    else button.removeAttribute("aria-current");
  });
  updateChrome();
  saveState();
  const filter = document.querySelector(".category-chip.active")?.textContent || "";
  window.gkMotion?.enterView(main, `${state.view}:${state.category}:${filter}:${state.query}`);
  window.gkMotionLive?.playLiveScenes(main);
}

function goTo(view, { top = true } = {}) {
  if (view !== "orders") state.trackingId = null;
  state.view = view;
  render();
  if (view === "orders") void refreshOrders();
  main.focus({ preventScroll: true });
  if (top) window.scrollTo({ top: 0 });
}

function setView(view) {
  if (!["home", "menu", "cart", "orders", "profile"].includes(view)) return;
  if (["menu", "cart", "orders"].includes(view) && !state.selectedBranchId) {
    state.afterBranch = view;
    return goTo("branches");
  }
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
    <div class="sheet-hero">${product.image ? `<img class="sheet-image${cutoutClass(product.image)}" src="${escapeHtml(product.image)}" alt="${escapeHtml(product.name)}" />` : `<div class="sheet-image product-image-placeholder" aria-hidden="true">${icon("utensils")}</div>`}
      <button class="sheet-close" type="button" data-action="close-sheet" aria-label="Fermer">${icon("close")}</button>
      <button class="favorite-button ${favorite ? "is-favorite" : ""}" type="button" data-detail-favorite aria-label="${favorite ? "Retirer des" : "Ajouter aux"} favoris" aria-pressed="${favorite}">${icon("heart", { filled: favorite })}</button></div>
    <div class="sheet-body">
      <div class="sheet-meta">${product.discount ? `<span class="discount-badge static">${escapeHtml(product.discount)}</span>` : ""}<span>${escapeHtml(product.categoryName)}</span></div>
      <h2 id="sheet-title">${escapeHtml(product.name)}</h2>
      <p class="sheet-description">${escapeHtml(product.description)}</p>
      ${product.sizes.length ? `<h3 class="block-title">Choisir la taille</h3><div class="option-row" role="group" aria-label="Taille">${product.sizes.map((option, index) => `<button class="option ${option === size ? "active" : ""}" type="button" data-size="${index}" aria-pressed="${option === size}"><strong>${escapeHtml(option.name)}</strong><small>${formatPrice(product.price + option.delta)}</small></button>`).join("")}</div>` : ""}
      ${product.extras.length ? `<h3 class="block-title">Suppléments <small>· optionnel</small></h3><div class="chip-row wrap" role="group" aria-label="Suppléments">${product.extras.map((extra, index) => `<button class="extra-chip ${extras.has(index) ? "active" : ""}" type="button" data-extra="${index}" aria-pressed="${extras.has(index)}">${escapeHtml(extra.name)} <small>+${formatPrice(extra.price)}</small></button>`).join("")}</div>` : ""}
    </div></div>
    <div class="sheet-actions"><div class="quantity-control big"><button class="quantity-button" type="button" data-detail-delta="-1" aria-label="Retirer un">${icon("minus")}</button><span class="quantity-number" id="detail-quantity">${quantity}</span><button class="quantity-button primary" type="button" data-detail-delta="1" aria-label="Ajouter un">${icon("plus")}</button></div><button class="gold-button" type="button" data-action="add-to-cart">Ajouter · ${formatPrice(detailTotal())}</button></div>`;
}

function showOverlay() {
  overlay.hidden = false;
  document.body.style.overflow = "hidden";
  window.gkMotion?.overlayIn(overlay, sheet);
}

function closeOverlay() {
  const finish = () => {
    overlay.hidden = true;
    document.body.style.overflow = "";
    state.detail = null;
    state.panel = null;
    sheet.className = "sheet";
  };
  const run = window.gkMotion?.overlayOut?.(overlay, sheet);
  if (run && typeof run.then === "function") run.then(finish, finish);
  else finish();
}

function openProduct(productId) {
  const product = products.find(item => item.id === productId);
  if (!product) return;
  if (isSoldOut(productId)) return showToast(`${product.name} est épuisé pour le moment.`);
  state.panel = null;
  sheet.className = "sheet";
  state.detail = { product, size: product.sizes[0] || { name: "", delta: 0 }, extras: new Set(), quantity: 1 };
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
      body = `${panelHead("Mes adresses")}<div class="panel-body">${state.addresses.length ? state.addresses.map(address => pickRow({ attr: "data-pick-address", id: address.id, active: address.id === state.addressId, icon: labelIcon(address.label), title: address.label, sub: `${address.street} · ${zones.find(zone => zone.id === address.zone)?.name || "Zone inconnue"}`, removable: true })).join("") : `<p class="empty-state">Aucune adresse enregistrée.</p>`}${zones.length ? `<button class="outline-button full-width" type="button" data-panel-go="address-new">${icon("plus")}Ajouter une adresse</button>` : `<p class="fineprint">Aucune zone de livraison disponible.</p>`}</div>`;
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
      body = `${panelHead("Moyen de paiement")}<div class="panel-body"><article class="note"><strong>Espèces à la réception</strong><p>Le paiement par carte n'est pas disponible pour le moment. Aucun numéro de carte n'est demandé ni enregistré.</p></article></div>`;
      break;
    case "notifications":
      body = `${panelHead("Notifications")}<div class="panel-body">${state.notifications.length ? state.notifications.map(note => `<article class="note ${note.read ? "" : "unread"}"><strong>${escapeHtml(note.title)}</strong><p>${escapeHtml(note.text)}</p><small>${formatDate(note.time)}</small></article>`).join("") : `<p class="empty-state">Aucune notification.</p>`}</div>`;
      break;
    case "support":
      body = `${panelHead("Aide & contact")}<div class="panel-body"><article class="note"><strong>Contactez le restaurant</strong><p>${escapeHtml(state.settings.restaurant && typeof state.settings.restaurant === "object" ? state.settings.restaurant.phone || "Les coordonnées ne sont pas renseignées." : "Les coordonnées ne sont pas renseignées.")}</p></article>${state.settings.hours ? `<article class="note"><strong>Horaires</strong><p>${escapeHtml(state.settings.hours)}</p></article>` : ""}</div>`;
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
    if (state.user && GKApi.session("client")?.token) void GKApi.post("/api/notifications/read", {}, "client").catch(() => {});
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
  if ((el = target.closest("[data-pick-address]"))) {
    state.addressId = el.dataset.pickAddress;
    render();
    closeOverlay();
    return showToast("Adresse de livraison mise à jour.");
  }
}

function formError(form, message) {
  form.querySelector(".form-error").textContent = message;
}

function submitAddress(form) {
  const data = new FormData(form);
  const street = String(data.get("street")).trim();
  if (street.length < 5) return formError(form, "Saisissez une adresse complète (5 caractères minimum).");
  const address = { id: `a${Date.now()}`, label: String(data.get("label")), street, zone: String(data.get("zone")) };
  if (!zones.some(zone => zone.id === address.zone)) return formError(form, "Choisissez une zone de livraison valide.");
  state.addresses.push(address);
  state.addressId = address.id;
  render();
  closeOverlay();
  showToast("Adresse ajoutée.");
}

/* ---------- Cart & orders logic ---------- */

function addToCart(product, size, extras, quantity) {
  const key = line => `${line.product.id}|${line.size.name}|${line.extras.map(extra => extra.name).sort().join(",")}`;
  const candidate = { product, size, extras, quantity };
  const match = state.cart.find(line => key(line) === key(candidate));
  if (match) match.quantity += quantity;
  else state.cart.push(candidate);
  state.promo = null;
  state.promoError = "";
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
  if (!PHONE_RE.test(checkoutPhone())) {
    state.orderError = "Saisissez un numéro de téléphone valide (06 12 34 56 78) pour être joint à la livraison.";
    state.phoneOverride = true;
    return render();
  }
  placeOrder();
}

function placeOrder() {
  if (state.orderSubmitting) return;
  state.orderError = "";
  state.orderSubmitting = true;
  render();
  const delivery = state.delivery === "delivery";
  const address = currentAddress();
  const payload = {
    items: state.cart.map(line => ({
      id: line.product.id,
      qty: line.quantity,
      size: line.size.name,
      extras: line.extras.map(extra => extra.name)
    })),
    mode: state.delivery,
    note: (state.cartNote || "").trim(),
    payment: "cash"
  };
  if (delivery) payload.address = { zone: address.zone, street: address.street, label: address.label };
  if (state.promo?.code) payload.promo = state.promo.code;
  payload.customer = { phone: checkoutPhone() };
  GKApi.post("/api/orders", payload, "client").then(result => {
    state.orderSubmitting = false;
    const order = normalizeOrder(result.order);
    state.orders.unshift(order);
    state.cart = [];
    state.cartNote = "";
    state.promo = null;
    state.promoError = "";
    state.promoMessage = "";
    state.ordersTab = "active";
    state.trackingId = order.id;
    goTo("orders");
    showToast(`Commande #${order.id} envoyée au restaurant.`);
    void refreshTrackedOrder();
  }).catch(error => {
    state.orderSubmitting = false;
    state.orderError = error.message || "La commande n'a pas pu être créée.";
    render();
  });
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
  directions: "L'itinéraire n'est pas disponible dans l'application."
};
const panelActions = ["addresses", "payments", "support"];

main.addEventListener("click", event => {
  const closest = selector => event.target.closest(selector);
  let el;
  if ((el = closest("[data-branch]"))) { void chooseBranch(el.dataset.branch); return; }
  if ((el = closest("[data-reorder]"))) {
    const found = lastOrderToReorder(el.dataset.reorder);
    if (!found) return;
    found.lines.forEach(line => addToCart(line.product, line.size, line.extras, line.quantity));
    saveState();
    showToast(found.skipped.length
      ? `Ajouté au panier · ${found.skipped.length} article(s) indisponible(s)`
      : "Ajouté à votre panier");
    return render();
  }
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
    state.promo = null;
    return render();
  }
  if ((el = closest("[data-delivery]"))) { state.delivery = el.dataset.delivery; return render(); }
  if ((el = closest("[data-orders-tab]"))) { state.ordersTab = el.dataset.ordersTab; return render(); }
  if ((el = closest("[data-track-order]"))) {
    state.trackingId = el.dataset.trackOrder;
    render();
    window.scrollTo({ top: 0 });
    void refreshTrackedOrder();
    return;
  }
  if (closest("[data-back-orders]")) { state.trackingId = null; return render(); }
  if ((el = closest("[data-chat-order]"))) { openChat(el.dataset.chatOrder); return; }
  if ((el = closest("[data-cancel-order]"))) {
    const orderId = el.dataset.cancelOrder;
    GKApi.post(`/api/orders/${encodeURIComponent(orderId)}/cancel`, { reason: "Annulation demandée par le client." }, "client")
      .then(result => {
        const updated = normalizeOrder(result.order);
        state.orders = state.orders.map(order => order.id === updated.id ? updated : order);
        pushNotification(`Commande #${updated.id}`, "Votre commande a été annulée.");
        render();
        showToast("Commande annulée.");
      })
      .catch(error => { state.ordersError = error.message || "Impossible d'annuler cette commande."; render(); });
    return;
  }
  if (!(el = closest("[data-action]"))) return;
  const action = el.dataset.action;
  if (panelActions.includes(action)) return openPanel(action);
  switch (action) {
    case "phone-other":
      state.phoneOverride = true;
      render();
      document.querySelector("#cart-phone")?.focus();
      return;
    case "phone-account":
      state.phoneOverride = false;
      state.orderError = "";
      return render();
    case "checkout": return startCheckout();
    case "reload-menu": return void loadMenu();
    case "reload-branches": return void loadBranches();
    case "choose-branch":
      state.afterBranch = state.view === "cart" ? "home" : state.view;
      return goTo("branches");
    case "reload-orders": return void refreshOrders();
    case "filters": return setView("menu");
    case "favorites":
      state.category = "Favoris";
      state.query = "";
      return goTo("menu");
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
      if (!state.selectedBranchId) return goTo("branches");
      return goTo(target === "cart" ? "home" : target);
    }
    case "logout":
      GKApi.logout("client").then(() => {
        state.user = null;
        GKApi.clearBranch();
        state.selectedBranchId = "";
        state.orders = [];
        state.ordersError = "";
        state.trackingId = null;
        state.view = "auth";
        state.authMode = "login";
        render();
        showToast("Vous êtes déconnecté.");
      }).catch(error => {
        try { GKApi.clearSession("client"); } catch { /* logout reports the original revocation failure below */ }
        try { GKApi.clearBranch(); } catch { /* the server-side logout error remains visible below */ }
        state.user = null;
        state.selectedBranchId = "";
        state.orders = [];
        state.trackingId = null;
        state.ordersError = error.message || "La révocation a échoué ; la session locale a été effacée.";
        state.view = "auth";
        state.authMode = "login";
        render();
        showToast("Session locale effacée, mais la révocation serveur a échoué.");
      });
      return;
    case "reset":
      if (confirm("Effacer les préférences locales de cette application ? Votre compte et vos commandes serveur ne seront pas supprimés.")) resetState();
      return;
    case "install":
      if (installPrompt) { installPrompt.prompt(); installPrompt = null; render(); }
      return;
    default:
      if (action === "directions" && detailsFor(state.selectedBranchId)?.maps) {
        window.open(detailsFor(state.selectedBranchId).maps, "_blank", "noopener");
        return;
      }
      if (actionMessages[action]) showToast(actionMessages[action]);
  }
});

window.addEventListener("gk-api-session-expired", event => {
  if (event.detail?.scope !== "client") return;
  GKApi.clearBranch();
  state.selectedBranchId = "";
  state.user = null;
  state.orders = [];
  state.trackingId = null;
  state.ordersError = "Votre session a expiré. Reconnectez-vous pour consulter vos commandes.";
  state.view = "auth";
  state.authMode = "login";
  render();
  showToast("Votre session a expiré. Veuillez vous reconnecter.");
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

main.addEventListener("submit", async event => {
  event.preventDefault();
  const form = event.target;
  if (form.id === "promo-form") {
    const code = document.querySelector("#promo-code").value.trim().toUpperCase();
    if (!code) { state.promoError = "Saisissez un code promo."; return render(); }
    state.promoError = "";
    state.promoMessage = "";
    try {
      state.promo = await GKApi.post("/api/promos/validate", { code, subtotal: cartSubtotal() });
      render();
      showToast(`Code ${state.promo.code} appliqué.`);
    } catch (error) {
      state.promo = null;
      state.promoError = error.message || "Ce code promo n'a pas pu être validé.";
      render();
    }
  } else if (form.id === "auth-form") {
    const data = new FormData(form);
    const signup = state.authMode === "signup";
    const password = String(data.get("password") ?? "");
    let path, body;
    if (signup) {
      const name = String(data.get("name") ?? "").trim();
      const phone = String(data.get("phone") ?? "").replace(/[\s.-]/g, "");
      const email = String(data.get("email") ?? "").trim().toLowerCase();
      if (name.length < 2) return formError(form, "Saisissez votre nom.");
      if (!PHONE_RE.test(phone)) return formError(form, "Numéro invalide. Exemple : 06 12 34 56 78.");
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return formError(form, "E-mail invalide.");
      if (password.length < 8) return formError(form, "Le mot de passe doit contenir au moins 8 caractères.");
      path = "/api/auth/client/signup";
      body = { name, phone, email, password };
    } else {
      const identifier = String(data.get("identifier") ?? "").trim();
      if (!identifier || !password) return formError(form, "Saisissez votre e-mail ou téléphone et votre mot de passe.");
      path = "/api/auth/client/login";
      body = { identifier, password };
    }
    const button = form.querySelector('[type="submit"]');
    button.disabled = true;
    try {
      const result = await GKApi.post(path, body);
      const session = GKApi.setSession("client", result);
      state.user = session.user;
      const target = state.afterAuth || "home";
      state.afterAuth = "home";
      if (!state.selectedBranchId) {
        state.afterBranch = target;
        goTo("branches");
      } else {
        goTo(target);
        void loadMenu();
      }
      showToast(`Bienvenue, ${state.user.name} !`);
      void refreshOrders();
    } catch (error) {
      formError(form, error.message || "Connexion impossible. Vérifiez vos informations.");
    } finally {
      if (button.isConnected) button.disabled = false;
    }
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

function dismissSplash() {
  const el = document.querySelector("#splash");
  if (!el) return Promise.resolve();
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    el.remove();
    return Promise.resolve();
  }
  el.classList.add("is-playing");
  el.setAttribute("aria-hidden", "false");
  return new Promise(resolve => {
    window.setTimeout(() => {
      el.classList.add("is-leaving");
      window.setTimeout(() => {
        el.remove();
        resolve();
      }, 340);
    }, 980);
  });
}

loadState();
if (!state.user) {
  state.view = "auth";
  state.authMode = "login";
} else if (!state.selectedBranchId) {
  state.view = "branches";
} else {
  state.view = "home";
}
document.querySelectorAll("[data-icon]").forEach(slot => { slot.innerHTML = icon(slot.dataset.icon); });
render();
void dismissSplash();
void loadBranches().then(() => {
  if (state.selectedBranchId) void loadMenu();
  if (state.user && state.selectedBranchId) void refreshOrders();
  void syncNotifications();
});
setInterval(() => { if (!document.hidden) void syncNotifications(); }, 15000);
setInterval(() => {
  if (state.view === "orders" && state.trackingId) void pollChatUnread();
}, 6000);

setInterval(() => {
  if (state.view === "orders" && state.trackingId) void refreshTrackedOrder();
  else if (state.view === "orders" && state.user) void refreshOrders();
  else if (!document.hidden && state.user && state.orders.some(order => order.status === "active")) void refreshOrders();
}, 8000);
main.addEventListener("input", event => {
  if (event.target.id === "cart-note") { state.cartNote = event.target.value; saveState(); }
  if (event.target.id === "cart-phone") state.orderPhone = event.target.value;
  if (event.target.id === "promo-code") { state.promoError = ""; state.promoMessage = ""; }
});

if ("serviceWorker" in navigator && location.protocol.startsWith("http")) {
  navigator.serviceWorker.register("./sw.js").catch(() => {});
}
