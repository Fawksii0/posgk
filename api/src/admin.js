// Menu, zones, promos, settings, users, couriers (admin side), clients, audit, notifications, stats.
import { fail, now, hashSecret, randomId, randomDigits, normPhone, normEmail, str, numv, bool, oneOf, jparse } from "./lib.js";
import { run, first, all, stmt, batch, getSetting, setSetting, audit, notify, need, can, publicUser, MANAGED_STAFF } from "./core.js";
import { validateNewSecret, createAuthUser, updateAuthUser, deleteAuthUser } from "./auth.js";
import { tickDispatch, retryFailedOrders, releaseOfferedTo, STORE } from "./orders.js";

/* ---------- serializers ---------- */
export const itemOut = (r) => ({ id: r.id, categoryId: r.category_id, name: r.name, description: r.description, price: r.price, discount: r.discount, sizes: jparse(r.sizes, []), extras: jparse(r.extras, []), image: r.image_url, available: !!r.available, visible: !!r.visible });
export const zoneOut = (r) => ({ id: r.id, name: r.name, fee: r.fee, min: r.min_order, etaMin: r.eta_min, etaMax: r.eta_max, freeFrom: r.free_from, enabled: !!r.enabled });
const promoOut = (r) => ({ id: r.id, code: r.code, type: r.type, value: r.value, min: r.min_order, expiry: r.expiry, active: !!r.active, uses: r.uses });
const catOut = (r) => ({ id: r.id, name: r.name, position: r.position });

const PUBLIC_SETTINGS = ["paused", "deliveryOn", "restaurant", "hours", "freeDelivery"];
const HIDDEN_SETTINGS = ["rotationPointer"];

export async function publicMenu(c) {
  const defaults = { paused: false, deliveryOn: true, freeDelivery: 150 };
  const [cats, items, zones, rows] = await Promise.all([
    all(c.env, "SELECT * FROM menu_categories ORDER BY position, name"),
    all(c.env, "SELECT * FROM menu_items WHERE visible = 1 ORDER BY created_at"),
    all(c.env, "SELECT * FROM zones WHERE enabled = 1 ORDER BY fee, name"),
    all(c.env, `SELECT key, value FROM settings WHERE key IN (${PUBLIC_SETTINGS.map(() => "?").join(",")})`, ...PUBLIC_SETTINGS)
  ]);
  const stored = new Map(rows.map((r) => [r.key, r.value]));
  const settings = {};
  for (const k of PUBLIC_SETTINGS) settings[k] = stored.has(k) ? jparse(stored.get(k), defaults[k] ?? null) : (defaults[k] ?? null);
  settings.paused = !!settings.paused; settings.deliveryOn = !!settings.deliveryOn;
  return { categories: cats.map(catOut), items: items.map(itemOut), zones: zones.map(zoneOut), settings };
}

/* ---------- menu ---------- */
function readItem(b) {
  const sizes = Array.isArray(b.sizes) ? b.sizes : [];
  const extras = Array.isArray(b.extras) ? b.extras : [];
  if (sizes.length > 8 || extras.length > 20) fail(400, "invalid", "Trop d'options.");
  const image = str(b.image, { max: 500, field: "Image" });
  if (image && !/^https?:\/\//i.test(image)) fail(400, "invalid", "URL d'image invalide.");
  return {
    name: str(b.name, { max: 60, min: 1, field: "Nom" }),
    description: str(b.description, { max: 240, field: "Description" }),
    price: numv(b.price, { min: 0, max: 10000, field: "Prix" }),
    discount: numv(b.discount, { min: 0, max: 90, int: true, def: 0, field: "Remise" }),
    sizes: sizes.map((s) => ({ name: str(s?.name, { max: 30, min: 1, field: "Taille" }), delta: numv(s?.delta, { min: -1000, max: 1000, def: 0, field: "Supplément" }) })),
    extras: extras.map((s) => ({ name: str(s?.name, { max: 30, min: 1, field: "Supplément" }), price: numv(s?.price, { min: 0, max: 1000, def: 0, field: "Prix du supplément" }) })),
    image, visible: bool(b.visible ?? true), available: bool(b.available ?? true)
  };
}

export async function menuList(c) {
  need(c.user, "menu.view");
  const [cats, items] = await Promise.all([all(c.env, "SELECT * FROM menu_categories ORDER BY position, name"), all(c.env, "SELECT * FROM menu_items ORDER BY created_at")]);
  return { categories: cats.map(catOut), items: items.map(itemOut) };
}

async function categoryExists(env, id) { if (id && !(await first(env, "SELECT id FROM menu_categories WHERE id = ?", id))) fail(400, "invalid", "Catégorie inconnue."); }

export async function itemCreate(c) {
  need(c.user, "menu.write");
  const v = readItem(c.body); const catId = c.body.categoryId || null; await categoryExists(c.env, catId);
  const id = randomId("p_"), t = now();
  await run(c.env, "INSERT INTO menu_items (id, category_id, name, description, price, discount, sizes, extras, image_url, available, visible, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)",
    id, catId, v.name, v.description, v.price, v.discount, JSON.stringify(v.sizes), JSON.stringify(v.extras), v.image, v.available, v.visible, t, t);
  await audit(c.env, c.user, "Produit créé", v.name);
  return itemOut(await first(c.env, "SELECT * FROM menu_items WHERE id = ?", id));
}
export async function itemUpdate(c) {
  need(c.user, "menu.write");
  const cur = await first(c.env, "SELECT * FROM menu_items WHERE id = ?", c.params.id); if (!cur) fail(404, "not_found", "Produit introuvable.");
  const v = readItem(c.body); const catId = c.body.categoryId || null; await categoryExists(c.env, catId);
  await run(c.env, "UPDATE menu_items SET category_id=?, name=?, description=?, price=?, discount=?, sizes=?, extras=?, image_url=?, available=?, visible=?, updated_at=? WHERE id=?",
    catId, v.name, v.description, v.price, v.discount, JSON.stringify(v.sizes), JSON.stringify(v.extras), v.image, v.available, v.visible, now(), cur.id);
  await audit(c.env, c.user, "Produit modifié", v.name);
  return itemOut(await first(c.env, "SELECT * FROM menu_items WHERE id = ?", cur.id));
}
export async function itemAvailability(c) {
  need(c.user, "menu.stock");
  const cur = await first(c.env, "SELECT * FROM menu_items WHERE id = ?", c.params.id); if (!cur) fail(404, "not_found", "Produit introuvable.");
  const av = bool(c.body.available);
  await run(c.env, "UPDATE menu_items SET available = ?, updated_at = ? WHERE id = ?", av, now(), cur.id);
  await audit(c.env, c.user, av ? "Produit disponible" : "Produit épuisé", cur.name);
  return { ...itemOut(cur), available: !!av };
}
export async function itemDelete(c) {
  need(c.user, "menu.delete");
  const cur = await first(c.env, "SELECT * FROM menu_items WHERE id = ?", c.params.id); if (!cur) fail(404, "not_found", "Produit introuvable.");
  await run(c.env, "DELETE FROM menu_items WHERE id = ?", cur.id);
  await audit(c.env, c.user, "Produit supprimé", cur.name);
  return { ok: true };
}
export async function categorySave(c) {
  need(c.user, "menu.write");
  const name = str(c.body.name, { max: 30, min: 1, field: "Nom" });
  if (c.params.id) {
    const cur = await first(c.env, "SELECT * FROM menu_categories WHERE id = ?", c.params.id); if (!cur) fail(404, "not_found", "Catégorie introuvable.");
    if (await first(c.env, "SELECT id FROM menu_categories WHERE lower(name) = lower(?) AND id != ?", name, cur.id)) fail(409, "duplicate", "Cette catégorie existe déjà.");
    await run(c.env, "UPDATE menu_categories SET name = ? WHERE id = ?", name, cur.id);
    await audit(c.env, c.user, "Catégorie renommée", `${cur.name} → ${name}`);
    return catOut({ ...cur, name });
  }
  if (await first(c.env, "SELECT id FROM menu_categories WHERE lower(name) = lower(?)", name)) fail(409, "duplicate", "Cette catégorie existe déjà.");
  const pos = (await first(c.env, "SELECT COALESCE(MAX(position), 0) + 1 AS p FROM menu_categories")).p;
  const id = randomId("c_");
  await run(c.env, "INSERT INTO menu_categories (id, name, position) VALUES (?,?,?)", id, name, pos);
  await audit(c.env, c.user, "Catégorie créée", name);
  return catOut({ id, name, position: pos });
}
export async function categoryDelete(c) {
  need(c.user, "menu.delete");
  const cur = await first(c.env, "SELECT * FROM menu_categories WHERE id = ?", c.params.id); if (!cur) fail(404, "not_found", "Catégorie introuvable.");
  if ((await first(c.env, "SELECT COUNT(*) AS n FROM menu_items WHERE category_id = ?", cur.id)).n) fail(409, "in_use", "Cette catégorie contient encore des produits.");
  await run(c.env, "DELETE FROM menu_categories WHERE id = ?", cur.id);
  await audit(c.env, c.user, "Catégorie supprimée", cur.name);
  return { ok: true };
}

/* ---------- zones ---------- */
function readZone(b) {
  const etaMin = numv(b.etaMin, { min: 1, max: 300, int: true, field: "ETA min" });
  const etaMax = numv(b.etaMax, { min: 1, max: 300, int: true, field: "ETA max" });
  if (etaMax < etaMin) fail(400, "invalid", "ETA max doit être supérieur à ETA min.");
  return { name: str(b.name, { max: 40, min: 1, field: "Nom" }), fee: numv(b.fee, { max: 1000, field: "Frais" }), min: numv(b.min, { max: 10000, def: 0, field: "Minimum" }), etaMin, etaMax, freeFrom: b.freeFrom === null || b.freeFrom === "" || b.freeFrom === undefined ? null : numv(b.freeFrom, { max: 100000, field: "Seuil" }) };
}
export async function zonesList(c) { need(c.user, "orders.view"); return { zones: (await all(c.env, "SELECT * FROM zones ORDER BY fee, name")).map(zoneOut) }; }
export async function zoneSave(c) {
  need(c.user, "zones.write");
  if (c.params.id) {
    const cur = await first(c.env, "SELECT * FROM zones WHERE id = ?", c.params.id); if (!cur) fail(404, "not_found", "Zone introuvable.");
    const merged = { name: cur.name, fee: cur.fee, min: cur.min_order, etaMin: cur.eta_min, etaMax: cur.eta_max, freeFrom: cur.free_from, ...c.body };
    const v = readZone(merged);
    const enabled = c.body.enabled === undefined ? cur.enabled : bool(c.body.enabled);
    await run(c.env, "UPDATE zones SET name=?, fee=?, min_order=?, eta_min=?, eta_max=?, free_from=?, enabled=? WHERE id=?", v.name, v.fee, v.min, v.etaMin, v.etaMax, v.freeFrom, enabled, cur.id);
    await audit(c.env, c.user, "Zone modifiée", v.name);
    return zoneOut(await first(c.env, "SELECT * FROM zones WHERE id = ?", cur.id));
  }
  const v = readZone(c.body); const id = randomId("z_");
  await run(c.env, "INSERT INTO zones (id, name, fee, min_order, eta_min, eta_max, free_from, enabled) VALUES (?,?,?,?,?,?,?,1)", id, v.name, v.fee, v.min, v.etaMin, v.etaMax, v.freeFrom);
  await audit(c.env, c.user, "Zone créée", v.name);
  return zoneOut(await first(c.env, "SELECT * FROM zones WHERE id = ?", id));
}
export async function zoneDelete(c) {
  need(c.user, "settings.write");
  const cur = await first(c.env, "SELECT * FROM zones WHERE id = ?", c.params.id); if (!cur) fail(404, "not_found", "Zone introuvable.");
  await run(c.env, "DELETE FROM zones WHERE id = ?", cur.id);
  await audit(c.env, c.user, "Zone supprimée", cur.name);
  return { ok: true };
}

/* ---------- promos ---------- */
function readPromo(b) {
  const type = oneOf(b.type, ["pct", "mad"], "Type");
  const value = numv(b.value, { min: 0.01, max: type === "pct" ? 100 : 10000, field: "Valeur" });
  const code = str(b.code, { max: 20, min: 3, field: "Code" }).toUpperCase();
  if (!/^[A-Z0-9_-]+$/.test(code)) fail(400, "invalid", "Code invalide (lettres, chiffres, - et _).");
  const expiry = str(b.expiry, { max: 10, field: "Expiration" });
  if (expiry && !/^\d{4}-\d{2}-\d{2}$/.test(expiry)) fail(400, "invalid", "Date invalide.");
  return { code, type, value, min: numv(b.min, { max: 100000, def: 0, field: "Minimum" }), expiry: expiry || null, active: bool(b.active ?? true) };
}
export async function promosList(c) { need(c.user, "promos.manage"); return { promos: (await all(c.env, "SELECT * FROM promos ORDER BY code")).map(promoOut) }; }
export async function promoSave(c) {
  need(c.user, "promos.manage");
  const v = readPromo(c.body);
  const dup = await first(c.env, "SELECT id FROM promos WHERE code = ? AND id != ?", v.code, c.params.id || "");
  if (dup) fail(409, "duplicate", "Ce code existe déjà.");
  if (c.params.id) {
    const cur = await first(c.env, "SELECT * FROM promos WHERE id = ?", c.params.id); if (!cur) fail(404, "not_found", "Code introuvable.");
    await run(c.env, "UPDATE promos SET code=?, type=?, value=?, min_order=?, expiry=?, active=? WHERE id=?", v.code, v.type, v.value, v.min, v.expiry, v.active, cur.id);
    await audit(c.env, c.user, "Promo modifiée", v.code);
    return promoOut(await first(c.env, "SELECT * FROM promos WHERE id = ?", cur.id));
  }
  const id = randomId("pr_");
  await run(c.env, "INSERT INTO promos (id, code, type, value, min_order, expiry, active) VALUES (?,?,?,?,?,?,?)", id, v.code, v.type, v.value, v.min, v.expiry, v.active);
  await audit(c.env, c.user, "Promo créée", v.code);
  return promoOut(await first(c.env, "SELECT * FROM promos WHERE id = ?", id));
}
export async function promoDelete(c) {
  need(c.user, "promos.manage");
  const cur = await first(c.env, "SELECT * FROM promos WHERE id = ?", c.params.id); if (!cur) fail(404, "not_found", "Code introuvable.");
  await run(c.env, "DELETE FROM promos WHERE id = ?", cur.id);
  await audit(c.env, c.user, "Promo supprimée", cur.code);
  return { ok: true };
}
export function promoDiscount(p, subtotal) {
  if (!p || !p.active) return { error: "Code promo invalide." };
  if (p.expiry && p.expiry < new Date().toISOString().slice(0, 10)) return { error: "Ce code a expiré." };
  if (subtotal < p.min_order) return { error: `Commande minimum ${p.min_order} MAD pour ce code.` };
  const d = p.type === "pct" ? subtotal * (p.value / 100) : p.value;
  return { discount: Math.round(Math.min(d, subtotal) * 100) / 100 };
}
export async function promoValidate(c) {
  const code = str(c.body.code, { max: 20, field: "Code" }).toUpperCase();
  const subtotal = numv(c.body.subtotal, { max: 100000, def: 0, field: "Sous-total" });
  const p = await first(c.env, "SELECT * FROM promos WHERE code = ?", code);
  const r = promoDiscount(p, subtotal);
  if (r.error) fail(400, "invalid_promo", r.error);
  return { code, type: p.type, value: p.value, discount: r.discount };
}

/* ---------- settings ---------- */
export async function settingsGet(c) {
  need(c.user, "settings.view");
  const rows = await all(c.env, "SELECT key, value FROM settings");
  const out = {};
  for (const r of rows) if (!HIDDEN_SETTINGS.includes(r.key)) out[r.key] = jparse(r.value, null);
  out.paused = !!out.paused; out.deliveryOn = out.deliveryOn === undefined ? true : !!out.deliveryOn;
  if (out.freeDelivery === undefined) out.freeDelivery = 150;
  if (out.defaultPrep === undefined) out.defaultPrep = 20;
  if (out.dispatchMode === undefined) out.dispatchMode = "rotation";
  return out;
}
const HOURS_KEYS = ["lun", "mar", "mer", "jeu", "ven", "sam", "dim"];
const time = (v) => { const s = str(v, { max: 5, min: 4, field: "Heure" }); if (!/^\d{1,2}:\d{2}$/.test(s)) fail(400, "invalid", "Heure invalide."); return s; };
async function applySettings(c, body, keys) {
  const done = [];
  for (const [k, v] of Object.entries(body)) {
    if (!keys.includes(k)) continue;
    let val;
    switch (k) {
      case "paused": case "deliveryOn": val = bool(v); break;
      case "dispatchMode": val = oneOf(v, ["rotation", "proximity"], "Mode"); break;
      case "defaultPrep": val = numv(v, { min: 5, max: 90, int: true, field: "Préparation" }); break;
      case "freeDelivery": val = numv(v, { max: 100000, field: "Seuil" }); break;
      case "restaurant": val = { name: str(v?.name, { max: 60, min: 1, field: "Nom" }), phone: str(v?.phone, { max: 30 }), email: str(v?.email, { max: 120 }), address: str(v?.address, { max: 160 }) }; break;
      case "hours": {
        val = {};
        for (const d of HOURS_KEYS) { const h = v?.[d] || {}; val[d] = { closed: !!h.closed, open: time(h.open || "11:00"), close: time(h.close || "23:00") }; }
        break;
      }
      case "notif": val = { newOrder: !!v?.newOrder, unassigned: !!v?.unassigned, lowStock: !!v?.lowStock, dailyReport: !!v?.dailyReport }; break;
      default: continue;
    }
    await setSetting(c.env, k, val); done.push(k);
  }
  if (done.length) await audit(c.env, c.user, "Réglages modifiés", done.join(", "));
  return done;
}
export async function settingsPut(c) { need(c.user, "settings.write"); await applySettings(c, c.body, ["paused", "deliveryOn", "dispatchMode", "defaultPrep", "freeDelivery", "restaurant", "hours", "notif"]); return settingsGet(c); }
export async function settingsOps(c) { need(c.user, "settings.ops"); await applySettings(c, c.body, ["paused", "dispatchMode", "defaultPrep"]); return settingsGet(c); }

/* ---------- staff users ---------- */
const isOwner = (u) => u.role === "owner";
function visibleTarget(c, target) { if (!target || (target.role === "owner" && !isOwner(c.user))) fail(404, "not_found", "Utilisateur introuvable."); return target; }

export async function usersList(c) {
  need(c.user, "users.manage");
  const roles = isOwner(c.user) ? [...MANAGED_STAFF, "owner"] : MANAGED_STAFF;
  const rows = await all(c.env, `SELECT u.*, b.name AS branch_name FROM users u LEFT JOIN branches b ON b.id = u.branch_id WHERE u.role IN (${roles.map(() => "?").join(",")}) AND u.id NOT LIKE 'u\\_ov\\_%' ORDER BY u.created_at`, ...roles);
  return { users: rows.map(publicUser) };
}
const userWithBranch = (env, id) => first(env, "SELECT u.*, b.name AS branch_name FROM users u LEFT JOIN branches b ON b.id = u.branch_id WHERE u.id = ?", id);
export async function userCreate(c) {
  need(c.user, "users.manage");
  const role = oneOf(c.body.role, MANAGED_STAFF, "Rôle");
  const email = normEmail(c.body.email); const name = str(c.body.name, { max: 50, min: 1, field: "Nom" });
  const password = str(c.body.password, { max: 100, trim: false, field: "Mot de passe" });
  validateNewSecret(role, password);
  if (await first(c.env, "SELECT id FROM users WHERE email = ?", email)) fail(409, "duplicate", "Cet e-mail est déjà utilisé.");
  const authUser = await createAuthUser(c.env, { email, password, metadata: { gk_role: role } });
  const id = randomId("u_");
  try {
    await run(c.env, "INSERT INTO users (id, auth_user_id, role, name, email, active, must_change, created_at, created_by) VALUES (?,?,?,?,?,1,1,?,?)", id, authUser.id, role, name, email, now(), c.user.id);
  } catch (error) {
    await deleteAuthUser(c.env, authUser.id);
    throw error;
  }
  await audit(c.env, c.user, "Utilisateur créé", `${name} (${role})`, { id, role });
  return publicUser(await userWithBranch(c.env, id));
}
export async function userUpdate(c) {
  need(c.user, "users.manage");
  const cur = visibleTarget(c, await first(c.env, "SELECT * FROM users WHERE id = ?", c.params.id));
  if (!MANAGED_STAFF.includes(cur.role)) fail(400, "invalid", "Ce compte ne se gère pas ici.");
  const self = cur.id === c.user.id;
  const role = c.body.role === undefined ? cur.role : oneOf(c.body.role, MANAGED_STAFF, "Rôle");
  const active = c.body.active === undefined ? cur.active : bool(c.body.active);
  if (self && (role !== cur.role || !active)) fail(400, "invalid", "Vous ne pouvez pas modifier votre propre rôle ou statut.");
  const name = c.body.name === undefined ? cur.name : str(c.body.name, { max: 50, min: 1, field: "Nom" });
  const email = c.body.email === undefined ? cur.email : normEmail(c.body.email);
  if (email !== cur.email && (await first(c.env, "SELECT id FROM users WHERE email = ? AND id != ?", email, cur.id))) fail(409, "duplicate", "Cet e-mail est déjà utilisé.");
  let mc = cur.must_change, tv = cur.token_version;
  const authChanges = {};
  if (email !== cur.email) { authChanges.email = email; authChanges.email_confirm = true; }
  if (c.body.password) {
    const pw = str(c.body.password, { max: 100, trim: false, field: "Mot de passe" });
    validateNewSecret(role, pw);
    authChanges.password = pw;
    mc = 1;
    tv++;
  }
  if (role !== cur.role) authChanges.user_metadata = { gk_role: role };
  if (Object.keys(authChanges).length) await updateAuthUser(c.env, cur.auth_user_id, authChanges);
  if (!active && cur.active) tv++;
  if (role !== cur.role) tv++;
  await run(c.env, "UPDATE users SET name=?, email=?, role=?, active=?, must_change=?, token_version=? WHERE id=?", name, email, role, active, mc, tv, cur.id);
  await audit(c.env, c.user, "Utilisateur modifié", `${name} (${role})${active ? "" : " — désactivé"}`, cur);
  return publicUser(await userWithBranch(c.env, cur.id));
}
export async function userDelete(c) {
  need(c.user, "users.manage");
  const cur = visibleTarget(c, await first(c.env, "SELECT * FROM users WHERE id = ?", c.params.id));
  if (!MANAGED_STAFF.includes(cur.role) || cur.id === c.user.id) fail(400, "invalid", "Suppression impossible.");
  await run(c.env, "DELETE FROM users WHERE id = ?", cur.id);
  if (cur.auth_user_id) await deleteAuthUser(c.env, cur.auth_user_id);
  await audit(c.env, c.user, "Utilisateur supprimé", `${cur.name} (${cur.role})`, cur);
  return { ok: true };
}

/* ---------- couriers ---------- */
async function courierRows(env, id) {
  const sql = `SELECT u.*, b.name AS branch_name, c.vehicle, c.online, c.lat, c.lng, c.last_seen FROM users u JOIN couriers c ON c.user_id = u.id LEFT JOIN branches b ON b.id = u.branch_id WHERE u.role = 'courier'${id ? " AND u.id = ?" : " AND u.id NOT LIKE 'u\\_ov\\_%'"} ORDER BY u.created_at`;
  return id ? all(env, sql, id) : all(env, sql);
}
export async function couriersList(c) {
  need(c.user, "couriers.view");
  const t = now(); const dayStart = Number(c.url.searchParams.get("dayStart")) || t - (t % 86400000);
  const rows = await courierRows(c.env);
  const busy = await all(c.env, "SELECT courier_id AS id FROM orders WHERE courier_id IS NOT NULL AND dispatch_state = 'assigned' AND status IN ('preparing','ready','enroute') UNION SELECT offered_to FROM orders WHERE dispatch_state = 'offering' AND offer_expires > ?", t);
  const busySet = new Set(busy.map((b) => b.id));
  const stats = await all(c.env, "SELECT courier_id AS id, SUM(CASE WHEN delivered_at >= ? THEN 1 ELSE 0 END) AS today, SUM(CASE WHEN payment = 'cash' AND cash_settled = 0 THEN total ELSE 0 END) AS cash FROM orders WHERE status = 'delivered' AND courier_id IS NOT NULL GROUP BY courier_id", dayStart);
  const sm = new Map(stats.map((s) => [s.id, s]));
  return {
    couriers: rows.map((r) => ({
      ...publicUser(r), vehicle: r.vehicle, online: !!r.online && t - (r.last_seen || 0) < 10 * 60000, busy: busySet.has(r.id),
      lat: r.lat, lng: r.lng, lastSeen: r.last_seen, todayDeliveries: sm.get(r.id)?.today || 0, cashHeld: sm.get(r.id)?.cash || 0
    }))
  };
}
// Live positions for the admin map and the kitchen: only recently seen couriers with a known position.
export async function liveCouriers(c) {
  need(c.user, "orders.view");
  const t = now();
  const rows = (await courierRows(c.env)).filter((r) => r.lat != null && r.lng != null && r.online && t - (r.last_seen || 0) < 10 * 60000);
  const active = await all(c.env, "SELECT id, seq, courier_id, status, courier_step, customer_name, zone_name FROM orders WHERE courier_id IS NOT NULL AND dispatch_state = 'assigned' AND status IN ('preparing','ready','enroute')");
  const byCourier = new Map();
  for (const o of active) {
    if (!byCourier.has(o.courier_id)) byCourier.set(o.courier_id, []);
    byCourier.get(o.courier_id).push({ id: o.id, seq: o.seq, status: o.status, step: o.courier_step, customer: o.customer_name, zone: o.zone_name });
  }
  return {
    store: STORE, now: t,
    couriers: rows.map((r) => ({ id: r.id, name: r.name, vehicle: r.vehicle, lat: r.lat, lng: r.lng, lastSeen: r.last_seen, orders: byCourier.get(r.id) || [] }))
  };
}
export async function courierCreate(c) {
  need(c.user, "couriers.write");
  const name = str(c.body.name, { max: 50, min: 1, field: "Nom" }); const phone = normPhone(c.body.phone);
  const vehicle = str(c.body.vehicle, { max: 40, field: "Véhicule" });
  const pin = c.body.pin ? String(c.body.pin) : randomDigits(4);
  if (!/^\d{4}$/.test(pin)) fail(400, "weak_secret", "Le PIN doit contenir 4 chiffres.");
  if (await first(c.env, "SELECT id FROM users WHERE phone = ? AND role = 'courier'", phone)) fail(409, "duplicate", "Ce numéro est déjà utilisé.");
  const id = randomId("u_");
  await batch(c.env, [
    stmt(c.env, "INSERT INTO users (id, role, name, phone, pin_hash, active, must_change, created_at, created_by) VALUES (?, 'courier', ?, ?, ?, 1, 1, ?, ?)", id, name, phone, await hashSecret(pin), now(), c.user.id),
    stmt(c.env, "INSERT INTO couriers (user_id, vehicle) VALUES (?, ?)", id, vehicle)
  ]);
  await audit(c.env, c.user, "Livreur créé", name, { id, role: "courier" });
  const [row] = await courierRows(c.env, id);
  return { courier: { ...publicUser(row), vehicle: row.vehicle }, pin };
}
export async function courierUpdate(c) {
  need(c.user, "couriers.write");
  const [cur] = await courierRows(c.env, c.params.id); if (!cur) fail(404, "not_found", "Livreur introuvable.");
  const name = c.body.name === undefined ? cur.name : str(c.body.name, { max: 50, min: 1, field: "Nom" });
  const phone = c.body.phone === undefined ? cur.phone : normPhone(c.body.phone);
  const vehicle = c.body.vehicle === undefined ? cur.vehicle : str(c.body.vehicle, { max: 40 });
  const active = c.body.active === undefined ? cur.active : bool(c.body.active);
  if (phone !== cur.phone && (await first(c.env, "SELECT id FROM users WHERE phone = ? AND role = 'courier' AND id != ?", phone, cur.id))) fail(409, "duplicate", "Ce numéro est déjà utilisé.");
  await batch(c.env, [
    stmt(c.env, "UPDATE users SET name=?, phone=?, active=?, token_version = token_version + ? WHERE id=?", name, phone, active, active ? 0 : 1, cur.id),
    stmt(c.env, "UPDATE couriers SET vehicle=?, online = CASE WHEN ? = 0 THEN 0 ELSE online END WHERE user_id=?", vehicle, active, cur.id)
  ]);
  if (!active) await releaseOfferedTo(c.env, cur.id);
  await audit(c.env, c.user, active ? "Livreur modifié" : "Livreur désactivé", name, cur);
  const [row] = await courierRows(c.env, cur.id);
  return { courier: { ...publicUser(row), vehicle: row.vehicle } };
}
export async function courierResetPin(c) {
  need(c.user, "couriers.write");
  const [cur] = await courierRows(c.env, c.params.id); if (!cur) fail(404, "not_found", "Livreur introuvable.");
  const pin = randomDigits(4);
  await run(c.env, "UPDATE users SET pin_hash = ?, must_change = 1, token_version = token_version + 1 WHERE id = ?", await hashSecret(pin), cur.id);
  await audit(c.env, c.user, "PIN réinitialisé", cur.name, cur);
  return { pin };
}
export async function courierSettle(c) {
  need(c.user, "couriers.write");
  const [cur] = await courierRows(c.env, c.params.id); if (!cur) fail(404, "not_found", "Livreur introuvable.");
  const r = await first(c.env, "SELECT COALESCE(SUM(total),0) AS s FROM orders WHERE courier_id = ? AND status = 'delivered' AND payment = 'cash' AND cash_settled = 0", cur.id);
  await run(c.env, "UPDATE orders SET cash_settled = 1 WHERE courier_id = ? AND status = 'delivered' AND payment = 'cash'", cur.id);
  await audit(c.env, c.user, "Caisse remise", `${cur.name} · ${r.s} MAD`, cur);
  return { settled: r.s };
}
export async function courierDelete(c) {
  need(c.user, "users.manage");
  const [cur] = await courierRows(c.env, c.params.id); if (!cur) fail(404, "not_found", "Livreur introuvable.");
  if (await first(c.env, "SELECT id FROM orders WHERE courier_id = ? LIMIT 1", cur.id)) fail(409, "in_use", "Ce livreur a des commandes : désactivez-le plutôt.");
  await run(c.env, "DELETE FROM users WHERE id = ?", cur.id);
  await audit(c.env, c.user, "Livreur supprimé", cur.name, cur);
  return { ok: true };
}

/* Courier self-service */
export async function courierMe(c) {
  const [row] = await courierRows(c.env, c.user.id);
  const t = now();
  const cash = await first(c.env, "SELECT COALESCE(SUM(total),0) AS s FROM orders WHERE courier_id = ? AND status = 'delivered' AND payment = 'cash' AND cash_settled = 0", c.user.id);
  return { user: publicUser(c.user), vehicle: row?.vehicle || "", online: !!row?.online, cashToRemit: cash.s, serverTime: t };
}
export async function courierOnline(c) {
  const online = bool(c.body.online);
  const lat = c.body.lat === undefined ? null : numv(c.body.lat, { min: -90, max: 90, field: "Latitude" });
  const lng = c.body.lng === undefined ? null : numv(c.body.lng, { min: -180, max: 180, field: "Longitude" });
  await run(c.env, "UPDATE couriers SET online = ?, lat = COALESCE(?, lat), lng = COALESCE(?, lng), last_seen = ? WHERE user_id = ?", online, lat, lng, now(), c.user.id);
  if (!online) await releaseOfferedTo(c.env, c.user.id); else await retryFailedOrders(c.env);
  return { online: !!online };
}
export async function courierPosition(c) {
  const lat = numv(c.body.lat, { min: -90, max: 90, field: "Latitude" });
  const lng = numv(c.body.lng, { min: -180, max: 180, field: "Longitude" });
  await run(c.env, "UPDATE couriers SET lat = ?, lng = ?, last_seen = ? WHERE user_id = ?", lat, lng, now(), c.user.id);
  return { ok: true };
}
export async function courierHistory(c) {
  const rows = await all(c.env, "SELECT id, customer_name, zone_name, address, total, payment, courier_earning, cash_settled, delivered_at, items, mode FROM orders WHERE courier_id = ? AND status = 'delivered' ORDER BY delivered_at DESC LIMIT 300", c.user.id);
  return { history: rows.map((r) => ({ id: r.id, customer: r.customer_name, zone: r.zone_name, address: r.address, total: r.total, payment: r.payment, earning: r.courier_earning, settled: !!r.cash_settled, deliveredAt: r.delivered_at, items: jparse(r.items, []).map((i) => `${i.qty}× ${i.name}`).join(", ") })) };
}

/* ---------- clients ---------- */
export async function clientsList(c) {
  need(c.user, "clients.view");
  const rows = await all(c.env, `SELECT u.*, (SELECT COUNT(*) FROM orders o WHERE o.client_id = u.id) AS n, (SELECT COALESCE(SUM(total),0) FROM orders o WHERE o.client_id = u.id AND o.status = 'delivered') AS spent, (SELECT MAX(created_at) FROM orders o WHERE o.client_id = u.id) AS last_order FROM users u WHERE u.role = 'client' AND u.id NOT LIKE 'u\\_ov\\_%' ORDER BY u.created_at DESC LIMIT 1000`);
  return { clients: rows.map((r) => ({ ...publicUser(r), orderCount: r.n, spent: r.spent, lastOrder: r.last_order, points: Math.floor(r.spent / 10) })) };
}
export async function clientBlock(c) {
  need(c.user, "clients.view");
  const cur = await first(c.env, "SELECT * FROM users WHERE id = ? AND role = 'client'", c.params.id); if (!cur) fail(404, "not_found", "Client introuvable.");
  const blocked = bool(c.body.blocked);
  await run(c.env, "UPDATE users SET blocked = ?, token_version = token_version + ? WHERE id = ?", blocked, blocked ? 1 : 0, cur.id);
  await audit(c.env, c.user, blocked ? "Client bloqué" : "Client débloqué", cur.name, cur);
  return { ok: true, blocked: !!blocked };
}

/* ---------- me ---------- */
export async function me(c) {
  const out = { user: publicUser(c.user) };
  if (c.user.role === "client") {
    const r = await first(c.env, "SELECT COALESCE(SUM(total),0) AS s FROM orders WHERE client_id = ? AND status = 'delivered'", c.user.id);
    out.loyaltyPoints = Math.floor(r.s / 10);
  }
  return out;
}
export async function meUpdate(c) {
  if (c.user.role !== "client") fail(403, "forbidden", "Accès refusé.");
  const name = str(c.body.name, { max: 60, min: 1, field: "Nom" });
  await run(c.env, "UPDATE users SET name = ? WHERE id = ?", name, c.user.id);
  return { user: { ...publicUser(c.user), name } };
}

/* ---------- notifications ---------- */
export async function notificationsList(c) {
  const u = c.user;
  const [audience, userId] = u.role === "client" ? ["client", u.id] : u.role === "courier" ? ["courier", u.id] : ["staff", null];
  const rows = userId
    ? await all(c.env, "SELECT * FROM notifications WHERE audience = ? AND user_id = ? ORDER BY id DESC LIMIT 50", audience, userId)
    : await all(c.env, "SELECT * FROM notifications WHERE audience = ? AND user_id IS NULL ORDER BY id DESC LIMIT 50", audience);
  return { notifications: rows.map((n) => ({ id: n.id, title: n.title, text: n.text, orderId: n.order_id, at: n.created_at, read: !!n.read })) };
}
export async function notificationsRead(c) {
  const u = c.user;
  const [audience, userId] = u.role === "client" ? ["client", u.id] : u.role === "courier" ? ["courier", u.id] : ["staff", null];
  if (userId) await run(c.env, "UPDATE notifications SET read = 1 WHERE audience = ? AND user_id = ?", audience, userId);
  else await run(c.env, "UPDATE notifications SET read = 1 WHERE audience = ? AND user_id IS NULL", audience);
  return { ok: true };
}

/* ---------- audit ---------- */
export async function auditList(c) {
  need(c.user, "audit.view");
  const limit = Math.min(500, Math.max(1, Number(c.url.searchParams.get("limit")) || 200));
  const rows = isOwner(c.user)
    ? await all(c.env, "SELECT * FROM audit_log ORDER BY id DESC LIMIT ?", limit)
    : await all(c.env, "SELECT * FROM audit_log WHERE actor_role != 'owner' AND COALESCE(target_role, '') != 'owner' ORDER BY id DESC LIMIT ?", limit);
  return { audit: rows.map((a) => ({ id: a.id, at: a.at, user: a.actor_name, role: a.actor_role, action: a.action, detail: a.detail })) };
}
export async function ownerAuditList(c) {
  if (!isOwner(c.user)) fail(404, "not_found", "Introuvable.");
  const rows = await all(c.env, "SELECT * FROM owner_audit ORDER BY id DESC LIMIT 200");
  return { logins: rows.map((r) => ({ id: r.id, at: r.at, outcome: r.outcome, ip: r.ip, userAgent: r.user_agent })) };
}

/* ---------- stats ---------- */
export async function stats(c) {
  need(c.user, "stats.view");
  await tickDispatch(c.env);
  const t = now();
  let dayStart = Number(c.url.searchParams.get("dayStart"));
  if (!Number.isFinite(dayStart) || dayStart <= 0 || dayStart > t) dayStart = t - (t % 86400000);
  const D = 86400000;
  const base = dayStart - 7 * D;
  const [dayRows, statusRows, orders7, online, totalC, onMission] = await Promise.all([
    all(c.env, "SELECT ((created_at - ?::bigint) / ?::bigint)::int AS d, COUNT(*) AS count, COALESCE(SUM(total),0) AS revenue FROM orders WHERE status NOT IN ('refused','cancelled') AND created_at >= ? AND created_at < ? GROUP BY 1", base, D, base, dayStart + D),
    all(c.env, "SELECT status, COUNT(*) AS n FROM orders WHERE created_at >= ? GROUP BY status", dayStart),
    all(c.env, "SELECT items FROM orders WHERE status NOT IN ('refused','cancelled') AND created_at >= ?", dayStart - 6 * D),
    first(c.env, "SELECT COUNT(*) AS n FROM couriers c JOIN users u ON u.id = c.user_id WHERE u.active = 1 AND c.online = 1 AND c.last_seen > ?", t - 10 * 60000),
    first(c.env, "SELECT COUNT(*) AS n FROM users WHERE role = 'courier' AND active = 1 AND id NOT LIKE 'u\\_ov\\_%'"),
    first(c.env, "SELECT COUNT(DISTINCT courier_id) AS n FROM orders WHERE dispatch_state = 'assigned' AND status IN ('preparing','ready','enroute')")
  ]);
  const byDay = new Map(dayRows.map((r) => [Number(r.d), { count: Number(r.count), revenue: Number(r.revenue) }]));
  const at = (d) => byDay.get(d) || { count: 0, revenue: 0 };
  const today = at(7), yesterday = at(6);
  const series = [];
  for (let i = 6; i >= 0; i--) series.push({ start: dayStart - i * D, ...at(7 - i) });
  const top = new Map();
  for (const o of orders7) for (const i of jparse(o.items, [])) top.set(i.name, (top.get(i.name) || 0) + i.qty);
  const topProducts = [...top.entries()].map(([name, qty]) => ({ name, qty })).sort((a, b) => b.qty - a.qty).slice(0, 5);  return {
    today: { ...today, avg: today.count ? today.revenue / today.count : 0 }, yesterday: { ...yesterday, avg: yesterday.count ? yesterday.revenue / yesterday.count : 0 },
    series, statusToday: Object.fromEntries(statusRows.map((r) => [r.status, r.n])), topProducts,
    couriers: { online: online.n, total: totalC.n, onMission: onMission.n }
  };
}
