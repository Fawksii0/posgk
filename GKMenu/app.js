const main = document.querySelector("#app-main");
const overlay = document.querySelector("#overlay");
const sheet = document.querySelector("#sheet");
const dock = document.querySelector("#action-dock");
const changeTableBtn = document.querySelector("#change-table");
const TABLE_KEY = "gk-menu-table";
const ORDER_KEY = "gk-menu-order";
const DINEIN_BRANCH = "gk-food";
const TRACK_STEPS = ["pending", "preparing", "ready", "delivered"];
const LOCAL_DISH_FOLDERS = {
  salades: "salades", sandwichs: "sandwichs", tacos: "tacos", pasticcio: "pasticcio",
  pates: "pates", burgers: "burgers", plats: "plats", pizzas: "pizza",
  desserts: "desserts", boissons: "boissons", jus: "jus"
};

const params = new URLSearchParams(location.search);
const state = {
  view: "boot",
  branches: [],
  branch: null,
  table: Number(params.get("table")) || Number(sessionStorage.getItem(TABLE_KEY)) || 0,
  tableCount: 24,
  category: "all",
  products: [],
  categories: [],
  cart: [],
  detail: null,
  panel: null,
  note: "",
  error: "",
  loading: false,
  submitting: false,
  order: null,
  now: Date.now()
};

let toastTimer = 0;
let pollTimer = 0;
let tickTimer = 0;
const slugKey = text => String(text || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const escapeHtml = value => String(value ?? "").replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));
const formatPrice = amount => `${Math.round(Number(amount) || 0)} MAD`;
const lineUnit = line => line.product.price + (line.size?.delta || 0) + line.extras.reduce((sum, extra) => sum + extra.price, 0);
const cartCount = () => state.cart.reduce((total, line) => total + line.quantity, 0);
const cartTotal = () => state.cart.reduce((total, line) => total + lineUnit(line) * line.quantity, 0);
const isShawarma = branch => /shawarma|crispy/.test(slugKey(`${branch.id} ${branch.slug} ${branch.name} ${branch.cuisine}`));
const clock = ms => new Date(Number(ms) || Date.now()).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
const minutesSince = ms => Math.max(0, Math.floor((state.now - Number(ms || 0)) / 60000));
const countdown = ms => {
  const left = Math.max(0, Math.ceil((Number(ms) - state.now) / 60000));
  return left ? `${left} min` : "imminente";
};

function tableFromScan() {
  const query = Number(params.get("table") || params.get("t") || params.get("tableNo"));
  if (query >= 1 && query <= 80) return query;
  const path = location.pathname.match(/\/(?:t|table)\/(\d+)/i);
  if (path) return Number(path[1]);
  const hash = location.hash.replace(/^#\/?/, "");
  const hashed = new URLSearchParams(hash.includes("=") ? hash : "");
  const fromHash = Number(hashed.get("table") || hashed.get("t"));
  if (fromHash >= 1 && fromHash <= 80) return fromHash;
  const hashPath = hash.match(/^(?:table|t)\/(\d+)/i);
  return hashPath ? Number(hashPath[1]) : 0;
}

function readStoredOrder() {
  try { return JSON.parse(sessionStorage.getItem(ORDER_KEY) || "null"); } catch { return null; }
}

function rememberOrder(order) {
  state.order = order || null;
  if (order?.id) sessionStorage.setItem(ORDER_KEY, JSON.stringify(order));
  else sessionStorage.removeItem(ORDER_KEY);
}

function orderCopy(order) {
  if (!order) return null;
  if (order.status === "pending") return { title: "En attente", lede: "La cuisine va accepter votre commande." };
  if (order.status === "preparing") {
    const modified = (order.history || []).some(entry => entry.action === "modified");
    return { title: "En préparation", lede: modified
      ? `Le serveur a mis à jour la commande.${order.promised_at ? ` Prête vers ${clock(order.promised_at)}.` : ""}`
      : (order.promised_at ? `Prête vers ${clock(order.promised_at)} · ${countdown(order.promised_at)}` : "Le serveur prépare votre commande.") };
  }
  if (order.status === "ready") return { title: "Prête", lede: "Votre commande est prête. Le serveur arrive." };
  if (order.status === "delivered") return { title: "Servie", lede: "Bon appétit." };
  if (order.status === "refused") return { title: "Refusée", lede: order.refused_reason || "La cuisine n'a pas pu prendre cette commande." };
  if (order.status === "cancelled") return { title: "Annulée", lede: "Cette commande a été annulée." };
  return { title: order.status, lede: "" };
}

function localDishImage(item, category) {
  const folder = LOCAL_DISH_FOLDERS[slugKey(category?.name)];
  const name = slugKey(item.name);
  return folder && name ? `../GKMobile/assets/menu/${folder}/${name}.png` : "";
}

function showToast(message) {
  const el = document.querySelector("#toast");
  el.textContent = message;
  el.hidden = false;
  window.gkMotion?.toastIn(el);
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.hidden = true; }, 2800);
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

function showOverlay() {
  overlay.hidden = false;
  document.body.style.overflow = "hidden";
  window.gkMotion?.overlayIn(overlay, sheet);
}

function hydrateIcons(root) {
  root.querySelectorAll("[data-icon]").forEach(node => {
    node.innerHTML = icon(node.dataset.icon);
  });
}

async function loadBranches() {
  const response = await GKApi.get("/api/branches");
  state.branches = (response.branches || []).filter(branch => branch.active !== false && !isShawarma(branch));
  const wanted = params.get("branch") || GKApi.getBranch();
  const skipWanted = wanted && /shawarma|crispy/.test(slugKey(wanted));
  state.branch = (!skipWanted && state.branches.find(branch => branch.id === wanted || branch.slug === wanted))
    || state.branches.find(branch => branch.id === DINEIN_BRANCH || branch.slug === DINEIN_BRANCH)
    || (state.branches.length === 1 ? state.branches[0] : null);
  if (state.branch) GKApi.setBranch(state.branch.id);
}

async function loadMenu() {
  const menu = await GKApi.get("/api/menu");
  const categoryMap = new Map((menu.categories || []).map(category => [category.id, category]));
  state.tableCount = Number(menu.settings?.tableCount) || 24;
  const hidden = name => slugKey(name) === "tajines";
  const visibleCategories = (menu.categories || []).filter(category => !hidden(category.name));
  state.categories = [{ id: "all", name: "Tout" }, ...visibleCategories];
  const allowed = new Set(visibleCategories.map(category => category.id));
  state.products = (menu.items || []).filter(item => item.visible !== false && allowed.has(item.categoryId)).map(item => {
    const category = categoryMap.get(item.categoryId);
    return {
      ...item,
      categoryName: category?.name || "",
      price: Number(item.dinePrice ?? item.price) || 0,
      sizes: Array.isArray(item.sizes) ? item.sizes : [],
      extras: Array.isArray(item.extras) ? item.extras : [],
      image: item.image || localDishImage(item, category)
    };
  });
}

function filteredProducts() {
  if (state.category === "all") return state.products;
  return state.products.filter(product => product.categoryId === state.category);
}

function renderBranches() {
  return `<p class="eyebrow">Bienvenue</p>
    <h1 class="screen-title">Où êtes-vous ?</h1>
    <p class="lede">Choisissez le restaurant, puis votre table.</p>
    <div class="branch-list">${state.branches.map(branch => `<button class="branch-card" type="button" data-branch="${escapeHtml(branch.id)}"><strong>${escapeHtml(branch.name)}</strong><small>${escapeHtml(branch.address || "")}</small></button>`).join("")}</div>`;
}

function renderTables() {
  const count = Math.max(1, Math.min(80, state.tableCount));
  const buttons = Array.from({ length: count }, (_, index) => {
    const n = index + 1;
    return `<button type="button" class="${state.table === n ? "active" : ""}" data-table="${n}">${n}</button>`;
  }).join("");
  return `<p class="eyebrow">${escapeHtml(state.branch?.name || "G&K Food")}</p>
    <h1 class="screen-title">Quelle table ?</h1>
    <p class="lede">Sélectionnez le numéro de votre table pour ouvrir le menu.</p>
    <div class="table-pad">${buttons}</div>`;
}

function productCard(product) {
  const sold = product.available === false;
  const cutout = product.image && product.image.includes("/assets/menu/") ? " cutout" : "";
  return `<article class="product-card ${sold ? "off" : ""}">
    <div class="product-media">
      <button class="product-image-button" type="button" data-product="${escapeHtml(product.id)}" ${sold ? "disabled" : ""} aria-label="${escapeHtml(product.name)}">
        ${product.image ? `<img class="product-image${cutout}" src="${escapeHtml(product.image)}" alt="">` : `<span class="placeholder">${icon("utensils")}</span>`}
      </button>
    </div>
    <div class="product-content">
      <h3 class="product-title">${escapeHtml(product.name)}</h3>
      <div class="product-footer">
        <p class="product-price">${formatPrice(product.price)}</p>
        <button class="add-product" type="button" data-product="${escapeHtml(product.id)}" ${sold ? "disabled" : ""} aria-label="Ajouter ${escapeHtml(product.name)}">${icon("plus")}</button>
      </div>
    </div>
  </article>`;
}

function renderTrack() {
  const order = state.order;
  if (!order) return "";
  const copy = orderCopy(order);
  const stepIndex = TRACK_STEPS.indexOf(order.status);
  const accepted = order.accepted_at || (order.history || []).find(entry => entry.status === "preparing")?.at;
  const times = [
    order.created_at ? `${icon("clock")}<span>Envoyée à <b>${clock(order.created_at)}</b> · ${minutesSince(order.created_at) ? `${minutesSince(order.created_at)} min` : "à l'instant"}</span>` : "",
    accepted ? `${icon("check")}<span>Acceptée à <b>${clock(accepted)}</b>${order.prep_minutes ? ` · ${order.prep_minutes} min de préparation` : ""}</span>` : "",
    order.status === "preparing" && order.promised_at ? `${icon("sparkles")}<span>Prête vers <b>${clock(order.promised_at)}</b></span>` : "",
    order.ready_at ? `${icon("bag")}<span>Prête à <b>${clock(order.ready_at)}</b></span>` : ""
  ].filter(Boolean);
  return `<article class="track-card" aria-live="polite">
    <div class="track-card-top"><small>Commande #${escapeHtml(order.seq || order.id)}</small><strong>Table ${escapeHtml(order.table_no || state.table)}</strong></div>
    <p class="track-status">${escapeHtml(copy.title)}</p>
    <p class="track-lede">${escapeHtml(copy.lede)}</p>
    ${times.length ? `<div class="track-times">${times.map(row => `<p>${row}</p>`).join("")}</div>` : ""}
    <div class="track-steps" aria-hidden="true">${TRACK_STEPS.map((step, index) => `<span class="track-step ${stepIndex > index ? "on" : stepIndex === index ? "current" : ""}"></span>`).join("")}</div>
  </article>`;
}

function renderMenu() {
  const products = filteredProducts();
  return `${renderTrack()}<p class="eyebrow table-chip">Table ${state.table}</p>
    <h1 class="screen-title">La carte</h1>
    <p class="lede">Installez-vous. On s'occupe du reste.</p>
    <div class="category-strip">${state.categories.map(category => `<button class="category-chip ${state.category === category.id ? "active" : ""}" type="button" data-category="${escapeHtml(category.id)}">${escapeHtml(category.name)}</button>`).join("")}</div>
    ${products.length ? `<div class="product-grid">${products.map(productCard).join("")}</div>` : `<p class="empty-state">Aucun plat dans cette catégorie.</p>`}`;
}

function render() {
  dock.hidden = state.view !== "menu";
  changeTableBtn.hidden = state.view !== "menu";
  changeTableBtn.textContent = state.table ? `Table ${state.table}` : "Table";
  document.querySelector("#header-kicker").textContent = state.view === "menu" ? "Menu sur place" : "G&K Food";
  document.querySelector("#header-title").textContent = state.branch?.name || "G&K Food";
  const count = cartCount();
  const label = document.querySelector("#cart-label");
  if (label) label.textContent = count ? `Commander · ${count}` : "Commander";
  if (state.loading) main.innerHTML = `<p class="empty-state">Chargement…</p>`;
  else if (state.error && state.view === "boot") main.innerHTML = `<p class="empty-state">${escapeHtml(state.error)}</p>`;
  else if (state.view === "branches") main.innerHTML = renderBranches();
  else if (state.view === "table") main.innerHTML = renderTables();
  else main.innerHTML = renderMenu();
  hydrateIcons(document);
  window.gkMotion?.enterView(main, state.view);
}

function openProduct(id) {
  const product = state.products.find(item => item.id === id);
  if (!product || product.available === false) return;
  state.panel = null;
  state.detail = { product, size: product.sizes[0] || { name: "", delta: 0 }, extras: new Set(), quantity: 1 };
  renderSheet();
  showOverlay();
}

function detailTotal() {
  const { product, size, extras, quantity } = state.detail;
  return (product.price + (size?.delta || 0) + [...extras].reduce((sum, index) => sum + product.extras[index].price, 0)) * quantity;
}

function renderSheet() {
  if (state.panel === "cart") return renderCartSheet();
  const { product, size, extras, quantity } = state.detail;
  sheet.innerHTML = `<div class="sheet-scroll">
    <div class="sheet-hero">${product.image ? `<img src="${escapeHtml(product.image)}" alt="">` : ""}
      <button class="sheet-close" type="button" data-action="close-sheet" aria-label="Fermer">${icon("close")}</button></div>
    <div class="sheet-body">
      <p class="eyebrow">${escapeHtml(product.categoryName)}</p>
      <h2 id="sheet-title">${escapeHtml(product.name)}</h2>
      <p class="sheet-description">${escapeHtml(product.description || "")}</p>
      ${product.sizes.length ? `<h3 class="block-title">Taille</h3><div class="option-row">${product.sizes.map((option, index) => `<button class="option ${option === size ? "active" : ""}" type="button" data-size="${index}"><strong>${escapeHtml(option.name)}</strong><small>${formatPrice(product.price + option.delta)}</small></button>`).join("")}</div>` : ""}
    </div></div>
    <div class="sheet-actions">
      <div class="quantity-control">
        <button class="quantity-button" type="button" data-delta="-1" aria-label="Retirer">${icon("minus")}</button>
        <span>${quantity}</span>
        <button class="quantity-button primary" type="button" data-delta="1" aria-label="Ajouter">${icon("plus")}</button>
      </div>
      <button class="gold-button" type="button" data-action="add-line">Ajouter · ${formatPrice(detailTotal())}</button>
    </div>`;
}

function renderCartSheet() {
  const lines = state.cart.map((line, index) => `<div class="cart-line">
    <div><strong>${escapeHtml(line.product.name)}</strong>${line.size?.name ? `<div class="sheet-description">${escapeHtml(line.size.name)}</div>` : ""}<div class="sheet-description">${formatPrice(lineUnit(line))} × ${line.quantity}</div></div>
    <button class="icon-button" type="button" data-remove="${index}" aria-label="Retirer">${icon("close")}</button>
  </div>`).join("");
  sheet.innerHTML = `<div class="sheet-scroll"><div class="sheet-body" style="margin-top:0">
    <button class="sheet-close" type="button" data-action="close-sheet" aria-label="Fermer" style="position:relative;top:0;right:0;margin-left:auto;margin-bottom:12px">${icon("close")}</button>
    <h2 id="sheet-title">Votre commande</h2>
    <p class="lede">Table ${state.table} · paiement au restaurant</p>
    ${lines || `<p class="empty-state">Ajoutez des plats depuis la carte.</p>`}
    ${state.cart.length ? `<label class="block-title" for="order-note">Note pour la cuisine</label><textarea class="note-field" id="order-note" maxlength="300">${escapeHtml(state.note)}</textarea>
    <div class="cart-total"><span>Total</span><span>${formatPrice(cartTotal())}</span></div>` : ""}
  </div></div>
  ${state.cart.length ? `<div class="sheet-actions" style="grid-template-columns:1fr"><button class="gold-button" type="button" data-action="place-order" ${state.submitting ? "disabled" : ""}>${state.submitting ? "Envoi…" : `Envoyer · ${formatPrice(cartTotal())}`}</button></div>` : ""}`;
}

function addLine() {
  const { product, size, extras, quantity } = state.detail;
  state.cart.push({
    product,
    size,
    extras: product.extras.filter((_, index) => extras.has(index)),
    quantity
  });
  closeOverlay();
  render();
  showToast(`${product.name} ajouté`);
}

async function placeOrder() {
  if (!state.cart.length || state.submitting) return;
  state.submitting = true;
  renderCartSheet();
  try {
    const result = await GKApi.post("/api/dinein/orders", {
      table: state.table,
      note: state.note,
      items: state.cart.map(line => ({
        id: line.product.id,
        qty: line.quantity,
        size: line.size?.name || "",
        extras: line.extras.map(extra => extra.name)
      }))
    });
    rememberOrder(result.order);
    state.cart = [];
    state.note = "";
    state.submitting = false;
    closeOverlay();
    render();
    startOrderWatch();
    showToast("Commande envoyée à la cuisine.");
  } catch (error) {
    state.submitting = false;
    renderCartSheet();
    showToast(error.message || "Impossible d'envoyer la commande.");
  }
}

async function callWaiter() {
  try {
    await GKApi.post("/api/dinein/waiter", { table: state.table });
    showToast("Le serveur arrive.");
  } catch (error) {
    showToast(error.message || "Impossible d'appeler le serveur.");
  }
}

async function refreshTrackedOrder() {
  const order = state.order;
  if (!order?.id || !state.table) return;
  if (["delivered", "refused", "cancelled"].includes(order.status)) return;
  try {
    const result = await GKApi.get(`/api/dinein/orders/${encodeURIComponent(order.id)}?table=${encodeURIComponent(state.table)}`);
    if (result.order) {
      rememberOrder(result.order);
      render();
    }
  } catch {
    /* keep the last known ticket if the probe fails */
  }
}

function startOrderWatch() {
  clearInterval(pollTimer);
  clearInterval(tickTimer);
  if (!state.order) return;
  tickTimer = setInterval(() => {
    state.now = Date.now();
    if (state.view === "menu" && state.order) render();
  }, 15000);
  pollTimer = setInterval(() => {
    if (document.hidden) return;
    void refreshTrackedOrder();
  }, 7000);
  void refreshTrackedOrder();
}

async function boot() {
  const scanned = tableFromScan();
  if (scanned) {
    state.table = scanned;
    sessionStorage.setItem(TABLE_KEY, String(scanned));
  }
  const stored = readStoredOrder();
  if (stored?.id) state.order = stored;
  state.loading = true;
  render();
  try {
    await loadBranches();
    if (!state.branch) {
      state.view = "branches";
    } else {
      await loadMenu();
      if (!state.table) {
        state.view = "table";
      } else if (state.table > state.tableCount) {
        state.table = 0;
        sessionStorage.removeItem(TABLE_KEY);
        state.view = "table";
      } else {
        sessionStorage.setItem(TABLE_KEY, String(state.table));
        state.view = "menu";
      }
    }
    state.error = "";
  } catch (error) {
    state.error = error.message || "Connexion impossible.";
    state.view = "boot";
  }
  state.loading = false;
  render();
  startOrderWatch();
}

document.addEventListener("click", event => {
  const target = event.target;
  const closest = selector => target.closest(selector);
  let el;
  if (closest('[data-action="close-sheet"]') || target === overlay) return closeOverlay();
  if ((el = closest("[data-branch]"))) {
    GKApi.setBranch(el.dataset.branch);
    state.branch = state.branches.find(branch => branch.id === el.dataset.branch);
    state.view = "table";
    state.loading = true;
    render();
    loadMenu().then(() => { state.loading = false; render(); }).catch(error => {
      state.loading = false;
      showToast(error.message);
      render();
    });
    return;
  }
  if ((el = closest("[data-table]"))) {
    state.table = Number(el.dataset.table);
    sessionStorage.setItem(TABLE_KEY, String(state.table));
    state.view = "menu";
    return render();
  }
  if ((el = closest("[data-category]"))) {
    state.category = el.dataset.category;
    return render();
  }
  if ((el = closest("[data-product]"))) return openProduct(el.dataset.product);
  if ((el = closest("[data-size]")) && state.detail) {
    state.detail.size = state.detail.product.sizes[Number(el.dataset.size)];
    return renderSheet();
  }
  if ((el = closest("[data-delta]")) && state.detail) {
    state.detail.quantity = Math.max(1, state.detail.quantity + Number(el.dataset.delta));
    return renderSheet();
  }
  if ((el = closest("[data-remove]"))) {
    state.cart.splice(Number(el.dataset.remove), 1);
    render();
    return renderCartSheet();
  }
  const action = closest("[data-action]")?.dataset.action;
  if (action === "add-line") return addLine();
  if (action === "open-cart") {
    state.detail = null;
    state.panel = "cart";
    renderCartSheet();
    return showOverlay();
  }
  if (action === "place-order") return void placeOrder();
  if (action === "call-waiter") return void callWaiter();
});

changeTableBtn.addEventListener("click", () => {
  state.table = 0;
  sessionStorage.removeItem(TABLE_KEY);
  state.view = "table";
  render();
});

sheet.addEventListener("input", event => {
  if (event.target.id === "order-note") state.note = event.target.value;
});

if ("serviceWorker" in navigator && location.protocol !== "file:") {
  navigator.serviceWorker.register("./sw.js").catch(() => {});
}

void boot();
