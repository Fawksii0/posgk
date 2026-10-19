import { fail, now, randomDigits, randomId, str, numv, jparse, haversineKm } from "./lib.js";
import { all, first, run, stmt, batch, getSetting, setSetting, audit, notify, need } from "./core.js";

const STORE = { lat: 33.7895, lng: -7.1597 };
const ACTIVE = ["preparing", "ready", "enroute"];
const ITEM_FIELDS = ["id", "customer_name", "customer_phone", "mode", "status", "items", "subtotal", "fee", "discount", "promo", "total", "payment", "zone_id", "zone_name", "address", "address_label", "note", "delivery_code", "eta_min", "prep_minutes", "promised_at", "accepted_at", "ready_at", "picked_up_at", "delivered_at", "courier_id", "dispatch_state", "offered_to", "offer_expires", "dispatch_km", "dispatch_manual", "courier_step", "courier_earning", "cash_settled", "refused_reason", "cancel_reason", "history", "created_at", "updated_at"];

export function orderOut(row, { revealCode = false } = {}) {
  if (!row) return null;
  const out = Object.fromEntries(ITEM_FIELDS.filter((key) => key in row).map((key) => [key, row[key]]));
  if (row.branch_id) out.branchId = row.branch_id;
  out.items = jparse(row.items, []);
  out.history = jparse(row.history, []);
  out.offered = !!row.offered_to;
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
  await run(env, `UPDATE orders SET ${sets.join(", ")} WHERE id = ?`, ...values);
}
function requireOrder(row) { if (!row) fail(404, "not_found", "Commande introuvable."); }
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
  const couriers = await all(env, `SELECT u.id, u.name, c.lat, c.lng FROM couriers c
    JOIN users u ON u.id = c.user_id
    WHERE u.active = 1 AND c.online = 1 AND c.last_seen > ?`, now() - 10 * 60000);
  const busy = await all(env, `SELECT DISTINCT courier_id FROM orders WHERE status IN ('preparing','ready','enroute')
    AND dispatch_state IN ('assigned','accepted') AND courier_id IS NOT NULL`);
  const busyIds = new Set(busy.map((r) => r.courier_id));
  const excluded = new Set([...exclude, ...busyIds]);
  const ready = couriers.filter((courier) => !excluded.has(courier.id) && courier.lat != null && courier.lng != null);
  const mode = await getSetting(env, "dispatchMode", "rotation");
  if (mode === "proximity") {
    return ready.filter((courier) => courier.lat != null && courier.lng != null)
      .map((courier) => ({ ...courier, km: haversineKm(STORE, { lat: courier.lat, lng: courier.lng }) }))
      .sort((a, b) => a.km - b.km);
  }
  const pointer = Number(await getSetting(env, "rotationPointer", -1));
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
  if (await getSetting(env, "dispatchMode", "rotation") === "rotation") {
    const onlineIds = (await all(env, "SELECT c.user_id AS id FROM couriers c JOIN users u ON u.id = c.user_id WHERE u.active = 1 AND c.online = 1 AND c.last_seen > ? ORDER BY c.user_id", now() - 10 * 60000)).map((item) => item.id);
    const pointer = onlineIds.indexOf(courier.id);
    await setSetting(env, "rotationPointer", pointer);
  }
  const expires = now() + 60000;
  const nextTried = [...tried, courier.id];
  await run(env, "UPDATE orders SET offered_to = ?, offered_at = ?, offer_expires = ?, tried = ?, dispatch_state = 'offered', dispatch_km = ?, updated_at = ? WHERE id = ?",
    courier.id, now(), expires, JSON.stringify(nextTried), courier.km, now(), row.id);
  await notify(env, { audience: "courier", userId: courier.id, title: "Nouvelle mission", text: `Commande #${row.seq} · ${row.zone_name || "Bouznika"}`, orderId: row.id });
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
    rows = status
      ? await all(c.env, "SELECT * FROM orders WHERE status = ? ORDER BY created_at DESC LIMIT 300", status)
      : await all(c.env, "SELECT * FROM orders ORDER BY created_at DESC LIMIT 300");
  }
  return { orders: rows.map((row) => orderOut(row, { revealCode: u.role === "client" || u.role === "owner" })) };
}

export async function orderGet(c) {
  const row = await getOrder(c.env, c.params.id);
  clientOwns(c, row);
  if (c.user.role === "courier" && row.courier_id !== c.user.id && row.offered_to !== c.user.id) fail(404, "not_found", "Commande introuvable.");
  if (c.user.role !== "client" && c.user.role !== "courier") need(c.user, "orders.view");
  return { order: orderOut(row, { revealCode: c.user.role === "client" || c.user.role === "owner" }) };
}

export async function orderCreate(c) {
  if (c.user.role !== "client") fail(403, "forbidden", "Réservé aux clients.");
  const body = c.body;
  if (await getSetting(c.env, "paused", false)) fail(409, "paused", "Les commandes sont temporairement en pause.");
  if (body.mode !== "delivery" && body.mode !== "pickup") fail(400, "invalid", "Mode de commande invalide.");
  if (!Array.isArray(body.items) || !body.items.length || body.items.length > 30) fail(400, "invalid", "Panier invalide.");
  const normalized = [];
  let subtotal = 0;
  for (const line of body.items) {
    const product = await first(c.env, "SELECT * FROM menu_items WHERE id = ? AND visible = 1 AND available = 1", str(line.id, { max: 80, min: 1, field: "Produit" }));
    if (!product) fail(409, "unavailable", "Un produit n'est plus disponible.");
    const qty = numv(line.qty, { min: 1, max: 50, int: true, field: "Quantité" });
    const size = jparse(product.sizes, []).find((item) => item.name === line.size);
    const extras = jparse(product.extras, []).filter((item) => (line.extras || []).includes(item.name));
    const unit = product.price + (size?.delta || 0) + extras.reduce((sum, item) => sum + item.price, 0);
    const price = Math.round(unit * qty * 100) / 100;
    subtotal += price;
    normalized.push({ id: product.id, name: product.name, qty, size: size?.name || "", extras: extras.map((item) => item.name), unit, price, image: product.image_url });
  }
  const settings = await getSetting(c.env, "freeDelivery", 150);
  let fee = 0, zoneId = null, zoneName = "", address = "", addressLabel = "";
  if (body.mode === "delivery") {
    if (!(await getSetting(c.env, "deliveryOn", true))) fail(409, "delivery_paused", "La livraison est indisponible.");
    zoneId = str(body.address?.zone, { max: 40, min: 1, field: "Zone" });
    const zone = await first(c.env, "SELECT * FROM zones WHERE id = ? AND enabled = 1", zoneId);
    if (!zone) fail(400, "invalid_zone", "Zone de livraison invalide.");
    if (subtotal < zone.min_order) fail(400, "minimum_order", `Commande minimum de ${zone.min_order} MAD.`);
    address = str(body.address?.street, { max: 200, min: 5, field: "Adresse" });
    addressLabel = str(body.address?.label, { max: 30 });
    zoneName = zone.name;
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
  const id = randomId("o_"), t = now(), prep = Number(await getSetting(c.env, "defaultPrep", 20));
  const name = str(body.customer?.name || c.user.name, { max: 60, min: 1, field: "Nom" });
  const phone = str(body.customer?.phone || c.user.phone, { max: 20, min: 1, field: "Téléphone" });
  const note = str(body.note, { max: 300, field: "Note" });
  const history = JSON.stringify([{ status: "pending", at: t, by: c.user.id }]);
  const total = Math.max(0, Math.round((subtotal + fee - discount) * 100) / 100);
  await run(c.env, `INSERT INTO orders
    (id, seq, client_id, customer_name, customer_phone, mode, status, items, subtotal, fee, discount, promo, total, payment, zone_id, zone_name, address, address_label, note, delivery_code, eta_min, prep_minutes, promised_at, dispatch_state, history, created_at, updated_at)
    VALUES (?,?,?,?,? ,?,'pending',?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?, 'none',?,?,?)`,
    id, seq, c.user.id, name, phone, body.mode, JSON.stringify(normalized), subtotal, fee, discount, promo, total,
    str(body.payment || "cash", { max: 40 }), zoneId, zoneName, address, addressLabel, note, randomDigits(4),
    body.mode === "delivery" ? (await first(c.env, "SELECT eta_min FROM zones WHERE id = ?", zoneId)).eta_min : prep,
    prep, t + prep * 60000, history, t, t);
  const row = await getOrder(c.env, id);
  await notify(c.env, { audience: "staff", title: `Nouvelle commande #${seq}`, text: `${name} · ${total} MAD`, orderId: id });
  await audit(c.env, c.user, "Commande créée", `#${seq} · ${total} MAD`, { id, role: "client" });
  return { order: orderOut(row, { revealCode: true }) };
}

export async function orderCancel(c) {
  const row = await getOrder(c.env, c.params.id);
  clientOwns(c, row);
  if (c.user.role !== "client" && !["cashier", "manager", "admin", "owner"].includes(c.user.role)) fail(403, "forbidden", "Accès refusé.");
  if (row.status !== "pending") fail(409, "invalid_status", "Seules les commandes en attente peuvent être annulées.");
  const reason = str(c.body.reason, { max: 200 });
  await updateStatus(c.env, row, "cancelled", c.user.id, { cancel_reason: reason });
  await notifyOrder(c.env, row, `Commande #${row.seq} annulée`, reason || "La commande a été annulée.", { client: row.client_id !== c.user.id });
  await audit(c.env, c.user, "Commande annulée", `#${row.seq}`, row);
  return { order: orderOut(await getOrder(c.env, row.id), { revealCode: c.user.role === "client" }) };
}

export async function orderAccept(c) {
  need(c.user, "orders.act");
  const row = await getOrder(c.env, c.params.id); requireOrder(row);
  if (row.status !== "pending") fail(409, "invalid_status", "Cette commande n'est plus en attente.");
  const prep = numv(c.body.prepMinutes, { min: 5, max: 90, int: true, def: 20, field: "Préparation" });
  const t = now();
  await updateStatus(c.env, row, "preparing", c.user.id, { accepted_at: t, prep_minutes: prep, promised_at: t + prep * 60000, eta_min: prep, dispatch_state: row.mode === "delivery" ? "searching" : "none" }, { prepMinutes: prep });
  const fresh = await getOrder(c.env, row.id);
  await notifyOrder(c.env, fresh, `Commande #${row.seq} acceptée`, `Préparation estimée : ${prep} min.`);
  if (row.mode === "delivery") await offerNext(c.env, fresh);
  await audit(c.env, c.user, "Commande acceptée", `#${row.seq} · ${prep} min`, row);
  return { order: orderOut(await getOrder(c.env, row.id)) };
}

export async function orderRefuse(c) {
  need(c.user, "orders.act");
  const row = await getOrder(c.env, c.params.id); requireOrder(row);
  if (row.status !== "pending") fail(409, "invalid_status", "Cette commande n'est plus en attente.");
  const reason = str(c.body.reason, { max: 200, min: 2, field: "Motif" });
  await updateStatus(c.env, row, "refused", c.user.id, { refused_reason: reason });
  await notifyOrder(c.env, row, `Commande #${row.seq} refusée`, reason);
  await audit(c.env, c.user, "Commande refusée", `#${row.seq} · ${reason}`, row);
  return { order: orderOut(await getOrder(c.env, row.id)) };
}

export async function orderAdjust(c) {
  need(c.user, "orders.act");
  const row = await getOrder(c.env, c.params.id); requireOrder(row);
  if (row.status !== "preparing") fail(409, "invalid_status", "La préparation n'est pas en cours.");
  const prep = numv(c.body.prepMinutes, { min: 5, max: 90, int: true, field: "Préparation" });
  await run(c.env, "UPDATE orders SET prep_minutes = ?, eta_min = ?, promised_at = ?, updated_at = ? WHERE id = ?", prep, prep, now() + prep * 60000, now(), row.id);
  await notifyOrder(c.env, row, `Délai mis à jour · commande #${row.seq}`, `Nouvelle estimation : ${prep} min.`);
  await audit(c.env, c.user, "Délai modifié", `#${row.seq} · ${prep} min`, row);
  return { order: orderOut(await getOrder(c.env, row.id)) };
}

export async function orderReady(c) {
  need(c.user, "orders.ready");
  const row = await getOrder(c.env, c.params.id); requireOrder(row);
  if (row.status !== "preparing") fail(409, "invalid_status", "La commande ne peut pas être marquée prête.");
  await updateStatus(c.env, row, row.mode === "delivery" ? "ready" : "ready", c.user.id, { ready_at: now() });
  const fresh = await getOrder(c.env, row.id);
  await notifyOrder(c.env, fresh, `Commande #${row.seq} prête`, row.mode === "delivery" ? "Le livreur peut venir la récupérer." : "Votre commande est prête à retirer.", { client: row.mode === "pickup", courier: row.mode === "delivery" });
  await audit(c.env, c.user, "Commande prête", `#${row.seq}`, row);
  return { order: orderOut(fresh) };
}

export async function orderHandover(c) {
  need(c.user, "orders.handover");
  const row = await getOrder(c.env, c.params.id); requireOrder(row);
  if (row.mode !== "pickup" || row.status !== "ready") fail(409, "invalid_status", "Cette commande n'est pas prête à être remise.");
  await updateStatus(c.env, row, "delivered", c.user.id, { delivered_at: now() });
  await notifyOrder(c.env, row, `Commande #${row.seq} remise`, "Bonne dégustation !");
  await audit(c.env, c.user, "Commande remise au client", `#${row.seq}`, row);
  return { order: orderOut(await getOrder(c.env, row.id)) };
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
    if (!(await import("./lib.js")).safeEqual(str(c.body.code, { max: 8 }), row.delivery_code)) fail(400, "invalid_code", "Code de livraison incorrect.");
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
