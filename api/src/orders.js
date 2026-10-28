import { fail, now, randomDigits, randomId, str, numv, jparse, haversineKm, normPhone, safeEqual, catalogItemName } from "./lib.js";
import { all, first, run, stmt, batch, getSetting, setSetting, getOpsMode, audit, notify, need } from "./core.js";
import { courierContact } from "./chat.js";
import { tableAllowed } from "./tables.js";

export const STORE = { lat: 33.7895, lng: -7.1597 };
const MAX_DELIVERY_KM = 12;

async function rejectIfConstruction(c) {
  const ops = await getOpsMode(c.env);
  if (ops.mode === "construction") fail(503, "construction", ops.message || "G&K Food est en travaux. Revenez bientôt.");
}
const ACTIVE = ["preparing", "ready", "enroute"];
const ITEM_FIELDS = ["id", "seq", "customer_name", "customer_phone", "mode", "status", "items", "subtotal", "fee", "service_fee", "discount", "promo", "total", "payment", "zone_id", "zone_name", "address", "address_label", "table_no", "note", "delivery_code", "eta_min", "prep_minutes", "promised_at", "accepted_at", "ready_at", "picked_up_at", "delivered_at", "courier_id", "dispatch_state", "offered_to", "offer_expires", "dispatch_km", "dispatch_manual", "courier_step", "courier_earning", "cash_settled", "refused_reason", "cancel_reason", "history", "created_at", "updated_at", "dest_lat", "dest_lng", "cashier_id"];

function revealDeliveryCode(role) {
  return ["client", "owner", "cashier", "chef", "waiter", "manager", "admin"].includes(role);
}

function newDeliveryCode(seq) {
  for (let i = 0; i < 12; i += 1) {
    const pin = randomDigits(4);
    if (pin !== String(seq) && Number(pin) !== Number(seq)) return pin;
  }
  return randomDigits(4);
}

export function orderOut(row, { revealCode = false } = {}) {
  if (!row) return null;
  const out = Object.fromEntries(ITEM_FIELDS.filter((key) => key in row).map((key) => [key, row[key]]));
  if (row.branch_id) out.branchId = row.branch_id;
  out.items = jparse(row.items, []);
  out.history = jparse(row.history, []);
  out.offered = !!row.offered_to;
  if (row.dest_lat != null && row.dest_lng != null) {
    out.lat = Number(row.dest_lat);
    out.lng = Number(row.dest_lng);
    out.dest_lat = Number(row.dest_lat);
    out.dest_lng = Number(row.dest_lng);
  }
  out.pickup_lat = STORE.lat;
  out.pickup_lng = STORE.lng;
  if (!revealCode) delete out.delivery_code;
  return out;
}

async function getOrder(env, id) {
  return first(env, "SELECT * FROM orders WHERE id = ?", id);
}
function pushHistory(row, status, by, extra = {}) {
  const history = jparse(row.history, []);
  history.push({ status, at: now(), by, ...extra });
  return JSON.stringify(history);
}
async function updateStatus(env, row, status, by, fields = {}, extra = {}) {
  const sets = ["status = ?", "updated_at = ?", "history = ?"];
  const values = [status, now(), pushHistory(row, status, by, extra)];
  for (const [key, value] of Object.entries(fields)) {
    if (!/^[a-z_]+$/.test(key)) continue;
    sets.push(`${key} = ?`);
    values.push(value);
  }
  values.push(row.id);
  return first(env, `UPDATE orders SET ${sets.join(", ")} WHERE id = ? RETURNING *`, ...values);
}
function floorStaffId(user) {
  if (!user?.id) return null;
  return ["cashier", "waiter", "chef", "manager", "admin", "owner"].includes(user.role) ? user.id : null;
}
function withCashier(row, user, fields = {}) {
  if (!row?.cashier_id && floorStaffId(user)) fields.cashier_id = user.id;
  return fields;
}
function requireOrder(row) { if (!row) fail(404, "not_found", "Commande introuvable."); }
function needModeAction(c, row) {
  requireOrder(row);
  if (row.mode === "dinein") need(c.user, "orders.dinein");
  else need(c.user, "orders.act");
}
function clientOwns(c, row) {
  requireOrder(row);
  if (c.user.role === "client" && row.client_id !== c.user.id) fail(404, "not_found", "Commande introuvable.");
}
async function notifyOrder(env, row, title, text, { client = true, courier = false } = {}) {
  if (client && row.client_id) await notify(env, { audience: "client", userId: row.client_id, title, text, orderId: row.id });
  if (courier && row.courier_id) await notify(env, { audience: "courier", userId: row.courier_id, title, text, orderId: row.id });
}
const orderStatusForCourier = (status) => status === "pending" ? "pending" : status;

async function candidates(env, row, exclude = []) {
  const [couriers, busy, mode, pointerValue] = await Promise.all([
    all(env, `SELECT u.id, u.name, c.lat, c.lng FROM couriers c
    JOIN users u ON u.id = c.user_id
    WHERE u.active = 1 AND c.online = 1 AND c.last_seen > ?`, now() - 10 * 60000),
    all(env, `SELECT DISTINCT courier_id FROM orders WHERE status IN ('preparing','ready','enroute')
    AND dispatch_state IN ('assigned','accepted') AND courier_id IS NOT NULL`),
    getSetting(env, "dispatchMode", "rotation"),
    getSetting(env, "rotationPointer", -1)
  ]);
  const busyIds = new Set(busy.map((r) => r.courier_id));
  const excluded = new Set([...exclude, ...busyIds]);
  const ready = couriers.filter((courier) => !excluded.has(courier.id) && courier.lat != null && courier.lng != null);
  if (mode === "proximity") {
    return ready.filter((courier) => courier.lat != null && courier.lng != null)
      .map((courier) => ({ ...courier, km: haversineKm(STORE, { lat: courier.lat, lng: courier.lng }) }))
      .sort((a, b) => a.km - b.km);
  }
  const pointer = Number(pointerValue);
  const ordered = couriers.filter((courier) => !excluded.has(courier.id)).sort((a, b) => a.id.localeCompare(b.id));
  if (!ordered.length) return [];
  const start = (pointer + 1) % ordered.length;
  const rotated = [...ordered.slice(start), ...ordered.slice(0, start)];
  return rotated.map((courier) => ({
    ...courier, km: courier.lat == null || courier.lng == null ? null : haversineKm(STORE, { lat: courier.lat, lng: courier.lng })
  }));
}

async function offerNext(env, row, exclude = []) {
  if (row.mode !== "delivery" || !["preparing", "ready"].includes(row.status)) return { offered: false };
  const tried = jparse(row.tried, []);
  const list = await candidates(env, row, [...tried, ...exclude]);
  if (!list.length) {
    await run(env, "UPDATE orders SET dispatch_state = 'unassigned', offered_to = NULL, offer_expires = NULL, updated_at = ? WHERE id = ?", now(), row.id);
    return { offered: false, manual: true };
  }
  const courier = list[0];
  const advancePointer = async () => {
    if (await getSetting(env, "dispatchMode", "rotation") !== "rotation") return;
    const onlineIds = (await all(env, "SELECT c.user_id AS id FROM couriers c JOIN users u ON u.id = c.user_id WHERE u.active = 1 AND c.online = 1 AND c.last_seen > ? ORDER BY c.user_id", now() - 10 * 60000)).map((item) => item.id);
    await setSetting(env, "rotationPointer", onlineIds.indexOf(courier.id));
  };
  const expires = now() + 60000;
  const nextTried = [...tried, courier.id];
  await Promise.all([
    advancePointer(),
    run(env, "UPDATE orders SET offered_to = ?, offered_at = ?, offer_expires = ?, tried = ?, dispatch_state = 'offered', dispatch_km = ?, updated_at = ? WHERE id = ?",
      courier.id, now(), expires, JSON.stringify(nextTried), courier.km, now(), row.id),
    notify(env, { audience: "courier", userId: courier.id, title: "Nouvelle mission", text: `Commande #${row.seq} · ${row.zone_name || "Bouznika"}`, orderId: row.id })
  ]);
  return { offered: true, courier: courier.id, expiresAt: expires, km: courier.km };
}

export async function tickDispatch(env) {
  const t = now();
  const expired = await all(env, "SELECT * FROM orders WHERE dispatch_state = 'offered' AND offer_expires <= ? LIMIT 50", t);
  for (const row of expired) {
    const tried = jparse(row.tried, []);
    await run(env, "UPDATE orders SET offered_to = NULL, offer_expires = NULL, dispatch_state = 'searching', updated_at = ? WHERE id = ? AND offered_to = ?",
      t, row.id, row.offered_to);
    const fresh = await getOrder(env, row.id);
    if (fresh && fresh.status !== "delivered") await offerNext(env, fresh, tried);
  }
  return expired.length;
}
export async function retryFailedOrders(env) {
  const rows = await all(env, "SELECT * FROM orders WHERE dispatch_state IN ('unassigned','searching') AND status IN ('preparing','ready') LIMIT 50");
  for (const row of rows) await offerNext(env, row);
  return rows.length;
}
export async function releaseOfferedTo(env, courierId) {
  const rows = await all(env, "SELECT * FROM orders WHERE offered_to = ?", courierId);
  for (const row of rows) {
    const tried = jparse(row.tried, []);
    await run(env, "UPDATE orders SET offered_to = NULL, offer_expires = NULL, dispatch_state = 'searching', updated_at = ? WHERE id = ?", now(), row.id);
    await offerNext(env, await getOrder(env, row.id), tried);
  }
}

export async function ordersList(c) {
  await tickDispatch(c.env);
  const u = c.user;
  let rows;
  if (u.role === "client") rows = await all(c.env, "SELECT * FROM orders WHERE client_id = ? ORDER BY created_at DESC LIMIT 100", u.id);
  else if (u.role === "courier") rows = await all(c.env, "SELECT * FROM orders WHERE courier_id = ? OR offered_to = ? ORDER BY created_at DESC LIMIT 100", u.id, u.id);
  else {
    need(u, "orders.view");
    const status = c.url.searchParams.get("status");
    const mode = c.url.searchParams.get("mode");
    if (mode && !["delivery", "pickup", "dinein"].includes(mode)) fail(400, "invalid", "Mode invalide.");
    const forced = u.role === "waiter" ? "dinein" : u.role === "chef" ? "kitchen" : mode;
    if (forced === "dinein") {
      rows = status
        ? await all(c.env, "SELECT * FROM orders WHERE mode = 'dinein' AND status = ? ORDER BY created_at DESC LIMIT 300", status)
        : await all(c.env, "SELECT * FROM orders WHERE mode = 'dinein' ORDER BY created_at DESC LIMIT 300");
    } else if (forced === "kitchen") {
      rows = status
        ? await all(c.env, "SELECT * FROM orders WHERE status = ? ORDER BY created_at DESC LIMIT 300", status)
        : await all(c.env, "SELECT * FROM orders ORDER BY created_at DESC LIMIT 300");
    } else if (mode) {
      rows = status
        ? await all(c.env, "SELECT * FROM orders WHERE mode = ? AND status = ? ORDER BY created_at DESC LIMIT 300", mode, status)
        : await all(c.env, "SELECT * FROM orders WHERE mode = ? ORDER BY created_at DESC LIMIT 300", mode);
    } else {
      rows = status
        ? await all(c.env, "SELECT * FROM orders WHERE status = ? ORDER BY created_at DESC LIMIT 300", status)
        : await all(c.env, "SELECT * FROM orders ORDER BY created_at DESC LIMIT 300");
    }
  }
  const revealCode = revealDeliveryCode(u.role);
  const out = rows.map((row) => orderOut(row, { revealCode }));
  if (u.role === "client") {
    for (let i = 0; i < rows.length; i += 1) {
      const courier = await courierContact(c.env, rows[i]);
      if (courier) out[i].courier = courier;
    }
  }
  return { orders: out };
}

export async function orderGet(c) {
  const row = await getOrder(c.env, c.params.id);
  clientOwns(c, row);
  if (c.user.role === "courier" && row.courier_id !== c.user.id && row.offered_to !== c.user.id) fail(404, "not_found", "Commande introuvable.");
  if (c.user.role !== "client" && c.user.role !== "courier") need(c.user, "orders.view");
  const out = orderOut(row, { revealCode: revealDeliveryCode(c.user.role) });
  if (c.user.role === "client") {
    const courier = await courierContact(c.env, row);
    if (courier) out.courier = courier;
  }
  return { order: out };
}

export async function orderCreate(c) {
  if (c.user.role !== "client") fail(403, "forbidden", "Réservé aux clients.");
  await rejectIfConstruction(c);
  const body = c.body;
  if (body.mode !== "delivery" && body.mode !== "pickup") fail(400, "invalid", "Mode de commande invalide.");
  if (!Array.isArray(body.items) || !body.items.length || body.items.length > 30) fail(400, "invalid", "Panier invalide.");
  const lineIds = body.items.map((line) => str(line.id, { max: 80, min: 1, field: "Produit" }));
  const [settingRows, productRows, categoryRows] = await Promise.all([
    all(c.env, "SELECT key, value FROM settings WHERE key IN ('paused', 'freeDelivery', 'deliveryOn', 'defaultPrep')"),
    all(c.env, `SELECT * FROM menu_items WHERE visible = 1 AND available = 1 AND id IN (${lineIds.map(() => "?").join(",")})`, ...lineIds),
    all(c.env, "SELECT id, name FROM menu_categories")
  ]);
  const categoryById = new Map(categoryRows.map((row) => [row.id, row.name]));
  const setting = (key, def) => { const r = settingRows.find((x) => x.key === key); return r ? jparse(r.value, def) : def; };
  if (setting("paused", false)) fail(409, "paused", "Les commandes sont temporairement en pause.");
  const productsById = new Map(productRows.map((r) => [r.id, r]));
  const normalized = [];
  let subtotal = 0;
  for (const line of body.items) {
    const product = productsById.get(line.id);
    if (!product) fail(409, "unavailable", "Un produit n'est plus disponible.");
    const qty = numv(line.qty, { min: 1, max: 50, int: true, field: "Quantité" });
    const size = jparse(product.sizes, []).find((item) => item.name === line.size);
    const extras = jparse(product.extras, []).filter((item) => (line.extras || []).includes(item.name));
    const unit = product.price + (size?.delta || 0) + extras.reduce((sum, item) => sum + item.price, 0);
    const price = Math.round(unit * qty * 100) / 100;
    subtotal += price;
    const category = categoryById.get(product.category_id) || "";
    normalized.push({ id: product.id, name: catalogItemName(product.name, category), category, qty, size: size?.name || "", extras: extras.map((item) => item.name), unit, price, image: product.image_url });
  }
  const settings = setting("freeDelivery", 150);
  let fee = 0, zoneId = null, zoneName = "", address = "", addressLabel = "", etaMin = null, destLat = null, destLng = null;
  if (body.mode === "delivery") {
    if (!setting("deliveryOn", true)) fail(409, "delivery_paused", "La livraison est indisponible.");
    destLat = numv(body.address?.lat, { min: -90, max: 90, field: "Latitude" });
    destLng = numv(body.address?.lng, { min: -180, max: 180, field: "Longitude" });
    const km = haversineKm(STORE, { lat: destLat, lng: destLng });
    if (km > MAX_DELIVERY_KM) fail(400, "out_of_zone", "Cette position est hors zone de livraison.");
    const zones = await all(c.env, "SELECT * FROM zones WHERE enabled = 1 ORDER BY fee, name");
    if (!zones.length) fail(400, "invalid_zone", "Aucune zone de livraison n'est ouverte.");
    const askedZone = body.address?.zone ? str(body.address.zone, { max: 40, min: 1, field: "Zone" }) : "";
    const zone = zones.find((row) => row.id === askedZone) || zones[0];
    if (subtotal < zone.min_order) fail(400, "minimum_order", `Commande minimum de ${zone.min_order} MAD.`);
    address = str(body.address?.street || "Position GPS", { max: 200, min: 5, field: "Adresse" });
    addressLabel = str(body.address?.label || "GPS", { max: 30 });
    zoneId = zone.id; zoneName = zone.name; etaMin = zone.eta_min;
    fee = subtotal >= (zone.free_from ?? settings) ? 0 : zone.fee;
  }
  let discount = 0, promo = null;
  if (body.promo) {
    const p = await first(c.env, "SELECT * FROM promos WHERE code = ? AND active = 1", str(body.promo, { max: 30 }).toUpperCase());
    if (!p || (p.expiry && p.expiry < new Date().toISOString().slice(0, 10)) || subtotal < p.min_order) fail(400, "invalid_promo", "Code promo invalide.");
    discount = Math.min(subtotal, p.type === "pct" ? subtotal * p.value / 100 : p.value);
    promo = p.code;
    await run(c.env, "UPDATE promos SET uses = uses + 1 WHERE id = ?", p.id);
  }
  const counter = await first(c.env, "INSERT INTO order_counters (branch_id, value) VALUES (?, 1000) ON CONFLICT (branch_id) DO UPDATE SET value = order_counters.value + 1 RETURNING value", c.branchId);
  const seq = Number(counter.value);
  const id = "1" + randomDigits(8), t = now(), prep = Number(setting("defaultPrep", 20));
  const name = str(body.customer?.name || c.user.name, { max: 60, min: 1, field: "Nom" });
  const phone = body.customer?.phone ? normPhone(body.customer.phone) : str(c.user.phone, { max: 20, min: 1, field: "Téléphone" });
  const note = str(body.note, { max: 300, field: "Note" });
  const history = JSON.stringify([{ status: "pending", at: t, by: c.user.id }]);
  const total = Math.max(0, Math.round((subtotal + fee - discount) * 100) / 100);
  await run(c.env, `INSERT INTO orders
    (id, seq, client_id, customer_name, customer_phone, mode, status, items, subtotal, fee, service_fee, discount, promo, total, payment, zone_id, zone_name, address, address_label, note, delivery_code, eta_min, prep_minutes, promised_at, dispatch_state, history, created_at, updated_at, dest_lat, dest_lng)
    VALUES (?,?,?,?,? ,?,'pending',?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?, 'none',?,?,?,?,?)`,
    id, seq, c.user.id, name, phone, body.mode, JSON.stringify(normalized), subtotal, fee, 0, discount, promo, total,
    str(body.payment || "cash", { max: 40 }), zoneId, zoneName, address, addressLabel, note, newDeliveryCode(seq),
    body.mode === "delivery" ? etaMin : prep,
    prep, t + prep * 60000, history, t, t, destLat, destLng);
  const row = await getOrder(c.env, id);
  await Promise.all([
    notify(c.env, { audience: "staff", title: `Nouvelle commande #${seq}`, text: `${name} · ${total} MAD`, orderId: id }),
    audit(c.env, c.user, "Commande créée", `#${seq} · ${total} MAD`, { id, role: "client" })
  ]);
  return { order: orderOut(row, { revealCode: true }) };
}

export async function orderCancel(c) {
  const row = await getOrder(c.env, c.params.id);
  clientOwns(c, row);
  if (c.user.role !== "client" && !["cashier", "manager", "admin", "owner"].includes(c.user.role)) fail(403, "forbidden", "Accès refusé.");
  if (row.status !== "pending") fail(409, "invalid_status", "Seules les commandes en attente peuvent être annulées.");
  const reason = str(c.body.reason, { max: 200 });
  const updated = await updateStatus(c.env, row, "cancelled", c.user.id, { cancel_reason: reason });
  await Promise.all([
    notifyOrder(c.env, row, `Commande #${row.seq} annulée`, reason || "La commande a été annulée.", { client: row.client_id !== c.user.id }),
    audit(c.env, c.user, "Commande annulée", `#${row.seq}`, row)
  ]);
  return { order: orderOut(updated, { revealCode: c.user.role === "client" }) };
}

export async function orderAccept(c) {
  const row = await getOrder(c.env, c.params.id);
  needModeAction(c, row);
  if (row.status !== "pending") fail(409, "invalid_status", "Cette commande n'est plus en attente.");
  const prep = numv(c.body.prepMinutes, { min: 5, max: 90, int: true, def: 20, field: "Préparation" });
  const t = now();
  const fresh = await updateStatus(c.env, row, "preparing", c.user.id, withCashier(row, c.user, { accepted_at: t, prep_minutes: prep, promised_at: t + prep * 60000, eta_min: prep, dispatch_state: row.mode === "delivery" ? "searching" : "none" }), { prepMinutes: prep, cashier: c.user.name || c.user.email || "" });
  await Promise.all([
    notifyOrder(c.env, fresh, `Commande #${row.seq} acceptée`, `Préparation estimée : ${prep} min.`),
    ...(row.mode === "dinein" ? [notify(c.env, { audience: "waiter", title: `Table ${row.table_no} acceptée`, text: `#${row.seq} · ${prep} min`, orderId: row.id })] : []),
    audit(c.env, c.user, "Commande acceptée", `#${row.seq} · ${prep} min`, row)
  ]);
  if (row.mode === "delivery") { await offerNext(c.env, fresh); return { order: orderOut(await getOrder(c.env, row.id)) }; }
  return { order: orderOut(fresh) };
}

export async function orderRefuse(c) {
  const row = await getOrder(c.env, c.params.id);
  needModeAction(c, row);
  const canRefuse = row.status === "pending" || (row.mode === "dinein" && row.status === "preparing");
  if (!canRefuse) fail(409, "invalid_status", "Cette commande n'est plus en attente.");
  const reason = str(c.body.reason, { max: 200, min: 2, field: "Motif" });
  const updated = await updateStatus(c.env, row, "refused", c.user.id, { refused_reason: reason });
  await Promise.all([
    notifyOrder(c.env, row, `Commande #${row.seq} refusée`, reason),
    audit(c.env, c.user, "Commande refusée", `#${row.seq} · ${reason}`, row)
  ]);
  return { order: orderOut(updated) };
}

export async function orderAdjust(c) {
  need(c.user, "orders.act");
  const row = await getOrder(c.env, c.params.id); requireOrder(row);
  if (row.status !== "preparing") fail(409, "invalid_status", "La préparation n'est pas en cours.");
  const prep = numv(c.body.prepMinutes, { min: 5, max: 90, int: true, field: "Préparation" });
  const updated = await first(c.env, "UPDATE orders SET prep_minutes = ?, eta_min = ?, promised_at = ?, updated_at = ? WHERE id = ? RETURNING *", prep, prep, now() + prep * 60000, now(), row.id);
  await Promise.all([
    notifyOrder(c.env, row, `Délai mis à jour · commande #${row.seq}`, `Nouvelle estimation : ${prep} min.`),
    audit(c.env, c.user, "Délai modifié", `#${row.seq} · ${prep} min`, row)
  ]);
  return { order: orderOut(updated) };
}

export async function orderReady(c) {
  const row = await getOrder(c.env, c.params.id);
  requireOrder(row);
  if (row.mode === "dinein") need(c.user, "orders.dinein");
  else need(c.user, "orders.ready");
  const fromPending = row.mode === "dinein" && row.status === "pending";
  if (!fromPending && row.status !== "preparing") fail(409, "invalid_status", "La commande ne peut pas être marquée prête.");
  const fields = { ready_at: now() };
  if (fromPending) fields.accepted_at = now();
  const extra = fromPending ? { cashier: c.user.name || c.user.email || "" } : {};
  const fresh = await updateStatus(c.env, row, "ready", c.user.id, withCashier(row, c.user, fields), extra);
  await Promise.all([
    notifyOrder(c.env, fresh, `Commande #${row.seq} prête`, row.mode === "delivery" ? "Le livreur peut venir la récupérer." : "Votre commande est prête à retirer.", { client: row.mode === "pickup", courier: row.mode === "delivery" }),
    ...(row.mode === "dinein" ? [notify(c.env, { audience: "waiter", title: `Table ${row.table_no} prête`, text: `#${row.seq}`, orderId: row.id })] : []),
    audit(c.env, c.user, "Commande prête", `#${row.seq}`, row)
  ]);
  return { order: orderOut(fresh) };
}

export async function orderHandover(c) {
  need(c.user, "orders.handover");
  const row = await getOrder(c.env, c.params.id); requireOrder(row);
  if (!["pickup", "dinein"].includes(row.mode) || row.status !== "ready") fail(409, "invalid_status", "Cette commande n'est pas prête à être remise.");
  const updated = await updateStatus(c.env, row, "delivered", c.user.id, { delivered_at: now() });
  await Promise.all([
    notifyOrder(c.env, row, `Commande #${row.seq} remise`, "Bonne dégustation !"),
    audit(c.env, c.user, "Commande remise au client", `#${row.seq}`, row)
  ]);
  return { order: orderOut(updated) };
}

export async function dineinTableSettle(c) {
  need(c.user, "orders.dinein");
  const table = tableNo({ table: c.params.table });
  const rows = await all(c.env,
    `SELECT * FROM orders WHERE mode = 'dinein' AND table_no = ?
     AND (status IN ('pending', 'preparing', 'ready') OR (status = 'delivered' AND COALESCE(cash_settled, 0) = 0))
     ORDER BY created_at`, table);
  if (rows.some((row) => ["pending", "preparing", "ready"].includes(row.status))) {
    fail(409, "open_tickets", "La table a encore des commandes en cours. Servez-les avant d'encaisser.");
  }
  const bills = rows.filter((row) => row.status === "delivered");
  if (!bills.length) fail(409, "nothing", "Rien à encaisser sur cette table.");
  const t = now();
  const ids = bills.map((row) => row.id);
  await run(c.env, `UPDATE orders SET cash_settled = 1, updated_at = ? WHERE id IN (${ids.map(() => "?").join(",")})`, t, ...ids);
  const total = bills.reduce((sum, row) => sum + Number(row.total || 0), 0);
  await audit(c.env, c.user, "Table encaissée", `Table ${table} · ${bills.length} ticket${bills.length > 1 ? "s" : ""} · ${Math.round(total)} MAD`, { table, ids });
  return { ok: true, table, count: bills.length, total };
}

export async function courierOffers(c) {
  if (c.user.role !== "courier") fail(403, "forbidden", "Réservé aux livreurs.");
  await tickDispatch(c.env);
  const rows = await all(c.env, "SELECT * FROM orders WHERE offered_to = ? OR courier_id = ? ORDER BY created_at DESC LIMIT 100", c.user.id, c.user.id);
  return { orders: rows.map((row) => orderOut(row, { revealCode: false })) };
}

export async function courierOfferAccept(c) {
  if (c.user.role !== "courier") fail(403, "forbidden", "Réservé aux livreurs.");
  const row = await getOrder(c.env, c.params.id); requireOrder(row);
  if (row.offered_to !== c.user.id || row.offer_expires < now()) fail(409, "offer_expired", "Cette offre n'est plus disponible.");
  await run(c.env, "UPDATE orders SET courier_id = ?, offered_to = NULL, offer_expires = NULL, dispatch_state = 'assigned', updated_at = ? WHERE id = ? AND offered_to = ?",
    c.user.id, now(), row.id, c.user.id);
  await notify(c.env, { audience: "staff", title: `Livreur affecté · #${row.seq}`, text: c.user.name, orderId: row.id });
  await audit(c.env, c.user, "Mission acceptée", `#${row.seq}`, row);
  return { order: orderOut(await getOrder(c.env, row.id)) };
}

export async function courierOfferRefuse(c) {
  if (c.user.role !== "courier") fail(403, "forbidden", "Réservé aux livreurs.");
  const row = await getOrder(c.env, c.params.id); requireOrder(row);
  if (row.offered_to !== c.user.id) fail(404, "not_found", "Offre introuvable.");
  const tried = jparse(row.tried, []);
  await run(c.env, "UPDATE orders SET offered_to = NULL, offer_expires = NULL, dispatch_state = 'searching', updated_at = ? WHERE id = ?", now(), row.id);
  await offerNext(c.env, await getOrder(c.env, row.id), tried);
  await audit(c.env, c.user, "Mission refusée", `#${row.seq}`, row);
  return { ok: true };
}

export async function courierStep(c) {
  if (c.user.role !== "courier") fail(403, "forbidden", "Réservé aux livreurs.");
  const row = await getOrder(c.env, c.params.id); requireOrder(row);
  if (row.courier_id !== c.user.id) fail(404, "not_found", "Mission introuvable.");
  if (c.params.step === "arrived") {
    if (!["preparing", "ready"].includes(row.status)) fail(409, "invalid_status", "La mission ne peut pas avancer.");
    await run(c.env, "UPDATE orders SET courier_step = 1, updated_at = ? WHERE id = ?", now(), row.id);
  } else if (c.params.step === "picked-up") {
    if (row.status !== "ready") fail(409, "not_ready", "La cuisine n'a pas encore marqué la commande prête.");
    await updateStatus(c.env, row, "enroute", c.user.id, { picked_up_at: now(), courier_step: 2 });
    await notifyOrder(c.env, row, `Commande #${row.seq} en route`, "Votre livreur est en chemin.");
  } else if (c.params.step === "delivered") {
    if (row.status !== "enroute") fail(409, "invalid_status", "La commande n'est pas en route.");
    if (!(await safeEqual(str(c.body.code, { max: 8 }), row.delivery_code))) fail(400, "invalid_code", "Code de livraison incorrect.");
    await updateStatus(c.env, row, "delivered", c.user.id, { delivered_at: now(), courier_step: 3, dispatch_state: "done", courier_earning: row.fee || 0 });
    await notifyOrder(c.env, row, `Commande #${row.seq} livrée`, "Bonne dégustation !");
  } else fail(404, "not_found", "Étape inconnue.");
  await audit(c.env, c.user, `Livreur · ${c.params.step}`, `#${row.seq}`, row);
  return { order: orderOut(await getOrder(c.env, row.id)) };
}

export async function courierAssign(c) {
  need(c.user, "orders.act");
  const row = await getOrder(c.env, c.params.id); requireOrder(row);
  const courierId = str(c.body.courierId, { max: 100, min: 1, field: "Livreur" });
  const available = await first(c.env, "SELECT u.id FROM users u JOIN couriers c ON c.user_id = u.id WHERE u.id = ? AND u.role = 'courier' AND u.active = 1", courierId);
  if (!available) fail(400, "invalid_courier", "Livreur introuvable.");
  await run(c.env, "UPDATE orders SET courier_id = ?, offered_to = NULL, offer_expires = NULL, dispatch_state = 'assigned', dispatch_manual = 1, updated_at = ? WHERE id = ?", courierId, now(), row.id);
  await notify(c.env, { audience: "courier", userId: courierId, title: "Mission assignée", text: `Commande #${row.seq}`, orderId: row.id });
  return { order: orderOut(await getOrder(c.env, row.id)) };
}

export async function orderDispatchRetry(c) {
  need(c.user, "orders.act");
  const row = await getOrder(c.env, c.params.id); requireOrder(row);
  await run(c.env, "UPDATE orders SET tried = '[]', dispatch_state = 'searching', updated_at = ? WHERE id = ?", now(), row.id);
  await offerNext(c.env, await getOrder(c.env, row.id));
  return { order: orderOut(await getOrder(c.env, row.id)) };
}

export async function cronDispatch(env) {
  await tickDispatch(env);
  await retryFailedOrders(env);
}

async function asDinein(c) {
  if (!c.branchId) fail(400, "branch_required", "Choisissez un restaurant.");
  await c.env.DB.setContext({ actorId: null, actorRole: "dinein", branchId: c.branchId });
}

function tableNo(body) {
  return numv(body.table ?? body.tableNo, { min: 1, max: 80, int: true, field: "Table" });
}

function assertTable(c, table, tableCount) {
  if (!tableAllowed(c.branchId, table, tableCount)) fail(400, "invalid", "Numéro de table invalide.");
}

async function dineinLines(c, items) {
  if (!Array.isArray(items) || !items.length || items.length > 30) fail(400, "invalid", "Panier invalide.");
  const lineIds = items.map((line) => str(String(line.id ?? ""), { max: 80, min: 1, field: "Produit" }));
  const [productRows, categoryRows] = await Promise.all([
    all(c.env, `SELECT * FROM menu_items WHERE visible = 1 AND available = 1 AND id IN (${lineIds.map(() => "?").join(",")})`, ...lineIds),
    all(c.env, "SELECT id, name FROM menu_categories")
  ]);
  const productsById = new Map(productRows.map((row) => [String(row.id), row]));
  const categoryById = new Map(categoryRows.map((row) => [String(row.id), row.name]));
  const normalized = [];
  let subtotal = 0;
  for (const line of items) {
    const product = productsById.get(String(line.id));
    if (!product) fail(409, "unavailable", "Un produit n'est plus disponible.");
    const qty = numv(line.qty, { min: 1, max: 50, int: true, field: "Quantité" });
    const size = jparse(product.sizes, []).find((item) => item.name === line.size);
    const extras = jparse(product.extras, []).filter((item) => (line.extras || []).includes(item.name));
    const base = product.dine_price == null ? product.price : product.dine_price;
    const unit = base + (size?.delta || 0) + extras.reduce((sum, item) => sum + item.price, 0);
    const price = Math.round(unit * qty * 100) / 100;
    subtotal += price;
    const category = categoryById.get(String(product.category_id)) || "";
    normalized.push({ id: product.id, name: catalogItemName(product.name, category), category, qty, size: size?.name || "", extras: extras.map((item) => item.name), unit, price, image: product.image_url });
  }
  return { normalized, subtotal: Math.max(0, Math.round(subtotal * 100) / 100) };
}

async function takeawayLines(c, items) {
  if (!Array.isArray(items) || !items.length || items.length > 30) fail(400, "invalid", "Panier invalide.");
  const lineIds = items.map((line) => str(String(line.id ?? ""), { max: 80, min: 1, field: "Produit" }));
  const [productRows, categoryRows] = await Promise.all([
    all(c.env, `SELECT * FROM menu_items WHERE visible = 1 AND available = 1 AND id IN (${lineIds.map(() => "?").join(",")})`, ...lineIds),
    all(c.env, "SELECT id, name FROM menu_categories")
  ]);
  const productsById = new Map(productRows.map((row) => [String(row.id), row]));
  const categoryById = new Map(categoryRows.map((row) => [String(row.id), row.name]));
  const normalized = [];
  let subtotal = 0;
  for (const line of items) {
    const product = productsById.get(String(line.id));
    if (!product) fail(409, "unavailable", "Un produit n'est plus disponible.");
    const qty = numv(line.qty, { min: 1, max: 50, int: true, field: "Quantité" });
    const size = jparse(product.sizes, []).find((item) => item.name === line.size);
    const extras = jparse(product.extras, []).filter((item) => (line.extras || []).includes(item.name));
    const unit = product.price + (size?.delta || 0) + extras.reduce((sum, item) => sum + item.price, 0);
    const price = Math.round(unit * qty * 100) / 100;
    subtotal += price;
    const category = categoryById.get(String(product.category_id)) || "";
    normalized.push({ id: product.id, name: catalogItemName(product.name, category), category, qty, size: size?.name || "", extras: extras.map((item) => item.name), unit, price, image: product.image_url });
  }
  return { normalized, subtotal: Math.max(0, Math.round(subtotal * 100) / 100) };
}

export async function dineinOrderCreate(c) {
  await asDinein(c);
  await rejectIfConstruction(c);
  const body = c.body;
  const table = tableNo(body);
  const [settingRows, priced] = await Promise.all([
    all(c.env, "SELECT key, value FROM settings WHERE key IN ('paused', 'defaultPrep', 'tableCount')"),
    dineinLines(c, body.items)
  ]);
  const setting = (key, def) => { const r = settingRows.find((x) => x.key === key); return r ? jparse(r.value, def) : def; };
  if (setting("paused", false)) fail(409, "paused", "Les commandes sont temporairement en pause.");
  const maxTable = Number(setting("tableCount", 17)) || 17;
  assertTable(c, table, maxTable);
  const { normalized, subtotal } = priced;
  const counter = await first(c.env, "INSERT INTO order_counters (branch_id, value) VALUES (?, 1000) ON CONFLICT (branch_id) DO UPDATE SET value = order_counters.value + 1 RETURNING value", c.branchId);
  const seq = Number(counter.value);
  const id = "1" + randomDigits(8), t = now(), prep = Number(setting("defaultPrep", 20));
  const name = `Table ${table}`;
  const note = str(body.note, { max: 300, field: "Note" });
  const history = JSON.stringify([{ status: "pending", at: t, by: "dinein" }]);
  const total = subtotal;
  await run(c.env, `INSERT INTO orders
    (id, seq, client_id, customer_name, customer_phone, mode, status, items, subtotal, fee, service_fee, discount, promo, total, payment, zone_id, zone_name, address, address_label, table_no, note, delivery_code, eta_min, prep_minutes, promised_at, dispatch_state, history, created_at, updated_at)
    VALUES (?,?,NULL,?,?,'dinein','pending',?,?,0,0,0,NULL,?, 'cash', NULL, '', ?, ?, ?, ?, ?, ?, ?, ?, 'none', ?, ?, ?)`,
    id, seq, name, `table-${table}`, JSON.stringify(normalized), subtotal, total,
    `Table ${table}`, "Sur place", table, note, newDeliveryCode(seq),
    prep, prep, t + prep * 60000, history, t, t);
  const row = await getOrder(c.env, id);
  await Promise.all([
    notify(c.env, { audience: "waiter", title: `Table ${table} · #${seq}`, text: `Commande sur place · ${total} MAD`, orderId: id }),
    notify(c.env, { audience: "staff", title: `Table ${table} · #${seq}`, text: `Sur place · ${total} MAD`, orderId: id }),
    audit(c.env, { name: `Table ${table}`, role: "dinein" }, "Commande sur place", `#${seq} · table ${table} · ${total} MAD`, { id })
  ]);
  return { order: orderOut(row, { revealCode: true }) };
}

export async function orderRevise(c) {
  const row = await getOrder(c.env, c.params.id);
  needModeAction(c, row);
  if (row.mode !== "dinein") fail(409, "invalid_status", "Seules les commandes sur place peuvent être modifiées.");
  if (!["pending", "preparing", "ready"].includes(row.status)) fail(409, "invalid_status", "Cette commande ne peut plus être modifiée.");
  const { normalized, subtotal } = await dineinLines(c, c.body.items);
  const note = str(c.body.note ?? row.note, { max: 300, field: "Note" });
  const history = pushHistory(row, row.status, c.user.id, { action: "modified" });
  const updated = await first(c.env, `UPDATE orders SET items = ?, subtotal = ?, total = ?, note = ?, history = ?, updated_at = ? WHERE id = ? RETURNING *`,
    JSON.stringify(normalized), subtotal, subtotal, note, history, now(), row.id);
  await Promise.all([
    notify(c.env, { audience: "waiter", title: `Table ${row.table_no} modifiée`, text: `#${row.seq} · ${subtotal} MAD`, orderId: row.id }),
    audit(c.env, c.user, "Commande sur place modifiée", `#${row.seq} · ${subtotal} MAD`, row)
  ]);
  return { order: orderOut(updated, { revealCode: true }) };
}

export async function posOrderCreate(c) {
  const body = c.body || {};
  const mode = body.mode;
  if (!["pickup", "delivery", "dinein"].includes(mode)) fail(400, "invalid", "Mode de commande invalide.");
  if (c.user.role === "waiter") {
    if (mode !== "dinein") fail(403, "forbidden", "Le serveur ne peut prendre que des commandes sur place.");
    need(c.user, "orders.dinein");
  } else {
    need(c.user, "orders.act");
  }
  const settingRows = await all(c.env, "SELECT key, value FROM settings WHERE key IN ('paused', 'freeDelivery', 'deliveryOn', 'defaultPrep', 'tableCount')");
  const setting = (key, def) => { const r = settingRows.find((x) => x.key === key); return r ? jparse(r.value, def) : def; };
  if (setting("paused", false)) fail(409, "paused", "Les commandes sont temporairement en pause.");
  let table = 0;
  let priced;
  if (mode === "dinein") {
    table = tableNo(body);
    assertTable(c, table, Number(setting("tableCount", 17)) || 17);
    priced = await dineinLines(c, body.items);
  } else {
    priced = await takeawayLines(c, body.items);
  }
  let fee = 0, zoneId = null, zoneName = "", address = "", addressLabel = "", etaMin = null, destLat = null, destLng = null;
  if (mode === "delivery") {
    if (!setting("deliveryOn", true)) fail(409, "delivery_paused", "La livraison est indisponible.");
    const hasGps = body.address?.lat != null && body.address?.lng != null && body.address.lat !== "" && body.address.lng !== "";
    const zones = await all(c.env, "SELECT * FROM zones WHERE enabled = 1 ORDER BY fee, name");
    if (!zones.length) fail(400, "invalid_zone", "Aucune zone de livraison n'est ouverte.");
    const askedZone = body.address?.zone ? str(body.address.zone, { max: 40, min: 1, field: "Zone" }) : "";
    const zone = zones.find((row) => row.id === askedZone) || zones[0];
    if (priced.subtotal < zone.min_order) fail(400, "minimum_order", `Commande minimum de ${zone.min_order} MAD.`);
    if (hasGps) {
      destLat = numv(body.address.lat, { min: -90, max: 90, field: "Latitude" });
      destLng = numv(body.address.lng, { min: -180, max: 180, field: "Longitude" });
      if (haversineKm(STORE, { lat: destLat, lng: destLng }) > MAX_DELIVERY_KM) fail(400, "out_of_zone", "Cette position est hors zone de livraison.");
    }
    address = str(body.address?.street || "Caisse · livraison", { max: 200, min: 5, field: "Adresse" });
    addressLabel = str(body.address?.label || "Caisse", { max: 30 });
    zoneId = zone.id; zoneName = zone.name; etaMin = zone.eta_min;
    fee = priced.subtotal >= (zone.free_from ?? setting("freeDelivery", 150)) ? 0 : zone.fee;
  } else if (mode === "dinein") {
    address = `Table ${table}`;
    addressLabel = "Sur place";
  }
  const { normalized, subtotal } = priced;
  const counter = await first(c.env, "INSERT INTO order_counters (branch_id, value) VALUES (?, 1000) ON CONFLICT (branch_id) DO UPDATE SET value = order_counters.value + 1 RETURNING value", c.branchId);
  const seq = Number(counter.value);
  const id = "1" + randomDigits(8), t = now(), prep = Number(setting("defaultPrep", 20));
  const name = str(body.customer?.name || (mode === "dinein" ? `Table ${table}` : "Caisse"), { max: 60, min: 1, field: "Nom" });
  let phone = "caisse";
  if (body.customer?.phone) phone = normPhone(body.customer.phone);
  else if (mode === "dinein") phone = `table-${table}`;
  const note = str(body.note, { max: 300, field: "Note" });
  const payment = str(body.payment || "cash", { max: 40 });
  const source = c.user.role === "waiter" ? "Serveur" : "Caisse";
  const history = JSON.stringify([{ status: "pending", at: t, by: c.user.id, cashier: c.user.name || c.user.email || "" }]);
  const total = Math.max(0, Math.round((subtotal + fee) * 100) / 100);
  await run(c.env, `INSERT INTO orders
    (id, seq, client_id, customer_name, customer_phone, mode, status, items, subtotal, fee, service_fee, discount, promo, total, payment, zone_id, zone_name, address, address_label, table_no, note, delivery_code, eta_min, prep_minutes, promised_at, dispatch_state, history, created_at, updated_at, dest_lat, dest_lng, cashier_id)
    VALUES (?,?,NULL,?,?,?,'pending',?,?,?,?,0,NULL,?,?,?,?,?,?,?,?,?,?,?,?, 'none',?,?,?,?,?,?)`,
    id, seq, name, phone, mode, JSON.stringify(normalized), subtotal, fee, 0, total, payment,
    zoneId, zoneName, address, addressLabel, mode === "dinein" ? table : null, note, newDeliveryCode(seq),
    mode === "delivery" ? etaMin : prep, prep, t + prep * 60000, history, t, t, destLat, destLng, floorStaffId(c.user));
  let row = await getOrder(c.env, id);
  await Promise.all([
    notify(c.env, { audience: "staff", title: `${source} · #${seq}`, text: `${name} · ${total} MAD`, orderId: id }),
    ...(mode === "dinein" ? [notify(c.env, { audience: "waiter", title: `Table ${table} · #${seq}`, text: `${source} · ${total} MAD`, orderId: id })] : []),
    audit(c.env, c.user, `Commande ${source.toLowerCase()}`, `#${seq} · ${mode} · ${total} MAD`, { id })
  ]);
  if (body.accept !== false) {
    const accepted = await updateStatus(c.env, row, "preparing", c.user.id, withCashier(row, c.user, {
      accepted_at: t, prep_minutes: prep, promised_at: t + prep * 60000, eta_min: prep,
      dispatch_state: mode === "delivery" ? "searching" : "none"
    }), { prepMinutes: prep, cashier: c.user.name || c.user.email || "", source: "caisse" });
    if (mode === "delivery") await offerNext(c.env, accepted);
    row = await getOrder(c.env, id);
  }
  return { order: orderOut(row, { revealCode: true }) };
}

export async function dineinOrderGet(c) {
  await asDinein(c);
  const table = tableNo({ table: c.url.searchParams.get("table") ?? c.url.searchParams.get("t") });
  const row = await getOrder(c.env, c.params.id);
  if (!row || row.mode !== "dinein" || Number(row.table_no) !== table) fail(404, "not_found", "Commande introuvable.");
  return { order: orderOut(row, { revealCode: true }) };
}

export async function waiterCallCreate(c) {
  await asDinein(c);
  await rejectIfConstruction(c);
  const table = tableNo(c.body);
  const maxTable = Number(await getSetting(c.env, "tableCount", 17)) || 17;
  assertTable(c, table, maxTable);
  const recent = await first(c.env, "SELECT id FROM waiter_calls WHERE table_no = ? AND status = 'open' AND created_at > ?", table, now() - 120000);
  if (recent) fail(429, "wait", "Le serveur a déjà été prévenu. Patientez un instant.");
  const id = randomId("w_"), t = now();
  await run(c.env, "INSERT INTO waiter_calls (id, table_no, status, created_at, updated_at) VALUES (?,?,?,?,?)", id, table, "open", t, t);
  await notify(c.env, { audience: "waiter", title: `Table ${table}`, text: "Un client demande un serveur." });
  return { ok: true, id, table };
}

export async function waiterCallsList(c) {
  need(c.user, "orders.view");
  const rows = await all(c.env, "SELECT * FROM waiter_calls WHERE created_at > ? ORDER BY created_at DESC LIMIT 80", now() - 12 * 60 * 60000);
  return {
    calls: rows.map((row) => ({
      id: row.id, table: row.table_no, status: row.status,
      createdAt: row.created_at, updatedAt: row.updated_at
    }))
  };
}

export async function waiterCallAck(c) {
  need(c.user, "orders.view");
  const row = await first(c.env, "SELECT * FROM waiter_calls WHERE id = ?", c.params.id);
  if (!row) fail(404, "not_found", "Appel introuvable.");
  if (row.status !== "open") return { ok: true, call: { id: row.id, table: row.table_no, status: row.status } };
  const updated = await first(c.env, "UPDATE waiter_calls SET status = 'ack', updated_at = ? WHERE id = ? RETURNING *", now(), row.id);
  return { ok: true, call: { id: updated.id, table: updated.table_no, status: updated.status } };
}

export async function livePulse(c) {
  const kind = c.url.searchParams.get("kind") === "kitchen" ? "kitchen" : "dinein";
  if (kind === "dinein") need(c.user, "orders.dinein");
  else need(c.user, "orders.view");
  if (kind === "dinein") {
    const [orders, calls] = await Promise.all([
      all(c.env, `SELECT id, status, COALESCE(cash_settled, 0) AS cash_settled FROM orders
        WHERE mode = 'dinein' AND (
          status IN ('pending', 'preparing', 'ready')
          OR (status = 'delivered' AND COALESCE(cash_settled, 0) = 0)
        ) ORDER BY created_at DESC LIMIT 200`),
      all(c.env, "SELECT id FROM waiter_calls WHERE status = 'open' ORDER BY created_at DESC LIMIT 80")
    ]);
    const pendingIds = orders.filter((row) => row.status === "pending").map((row) => row.id);
    const callIds = calls.map((row) => row.id);
    const board = orders.map((row) => `${row.id}:${row.status}:${row.cash_settled}`).join(",");
    return { kind, pendingIds, callIds, rev: `${board}|${callIds.join(",")}` };
  }
  const orders = await all(c.env, "SELECT id FROM orders WHERE mode != 'dinein' AND status = 'pending' ORDER BY created_at DESC LIMIT 80");
  const pendingIds = orders.map((row) => row.id);
  return { kind, pendingIds, callIds: [], rev: pendingIds.join(",") };
}

function notifyMatches(kind, raw) {
  if (!raw) return true;
  try {
    const msg = JSON.parse(raw);
    if (kind === "dinein") return msg.table === "waiter_calls" || msg.mode === "dinein";
    return msg.table === "orders" && msg.mode && msg.mode !== "dinein";
  } catch {
    return true;
  }
}

export async function liveWait(c) {
  const kind = c.url.searchParams.get("kind") === "kitchen" ? "kitchen" : "dinein";
  const since = String(c.url.searchParams.get("rev") || "");
  const first = await livePulse(c);
  if (!since || first.rev !== since) return first;
  if (typeof c.env.DB.finish === "function") await c.env.DB.finish(true);
  const signal = c.req.signal;
  if (typeof c.env.DB.waitNotify === "function") {
    const deadline = Date.now() + 12000;
    while (Date.now() < deadline && !signal?.aborted) {
      const payload = await c.env.DB.waitNotify("gk_live", Math.max(80, deadline - Date.now()), signal);
      if (signal?.aborted) break;
      if (!payload || notifyMatches(kind, payload)) break;
    }
  }
  return livePulse(c);
}
