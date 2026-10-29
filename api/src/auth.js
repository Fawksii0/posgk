// Authentication endpoints. Supabase Auth owns client/staff credentials; courier and owner checks stay here.
import { fail, now, hashSecret, verifySecret, safeEqual, signToken, randomId, normPhone, normEmail, str } from "./lib.js";
import { run, first, audit, publicUser, lockLeft, recordFail, clearFails, tooMany, POLICY } from "./core.js";

const TTL = { owner: 4 * 3600, courier: 30 * 86400 };
const STAFF_TTL = 12 * 3600;
const WEAK_PINS = new Set(["0000", "1111", "2222", "3333", "4444", "5555", "6666", "7777", "8888", "9999", "1234", "4321", "0123", "2580"]);

export async function issueToken(env, user, ttl) {
  const iat = Math.floor(now() / 1000);
  return signToken(env, { sub: user.id, role: user.role, tv: user.token_version, iat, exp: iat + (ttl || TTL[user.role] || STAFF_TTL) });
}

async function finishLogin(env, user) {
  await env.DB.setContext({ actorId: user.id, actorRole: user.role, branchId: user.branch_id || null });
  if (user.branch_id) {
    const branch = await first(env, "SELECT name FROM branches WHERE id = ? AND active = 1", user.branch_id);
    user.branch_name = branch?.name || null;
  }
  await run(env, "UPDATE users SET last_login = ? WHERE id = ?", now(), user.id);
  return {
    token: await issueToken(env, user),
    user: publicUser(user),
    branchId: user.branch_id || undefined,
    mustChange: !!user.must_change
  };
}

const BAD = () => fail(401, "invalid_credentials", "Identifiants incorrects.");

function authConfig(env) {
  if (!env.SUPABASE_URL || !env.SUPABASE_ANON_KEY) fail(501, "auth_unavailable", "Supabase Auth n'est pas configuré.");
  return { url: env.SUPABASE_URL.replace(/\/+$/, ""), key: env.SUPABASE_ANON_KEY };
}

async function authRequest(env, path, body, admin = false) {
  const { url, key } = authConfig(env);
  const apiKey = admin ? env.SUPABASE_SERVICE_ROLE_KEY : key;
  if (!apiKey) fail(501, "auth_unavailable", "Supabase Auth n'est pas configuré.");
  let response;
  try {
    response = await fetch(`${url}/auth/v1/${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: apiKey, Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify(body)
    });
  } catch {
    fail(502, "auth_unavailable", "Supabase Auth est temporairement indisponible.");
  }
  let data = {};
  try { data = await response.json(); } catch { /* non-JSON Auth error */ }
  return { ok: response.ok, data };
}

export async function verifySupabaseAccessToken(env, token) {
  const { url, key } = authConfig(env);
  let response;
  try {
    response = await fetch(`${url}/auth/v1/user`, { headers: { apikey: key, Authorization: `Bearer ${token}` } });
  } catch {
    fail(502, "auth_unavailable", "Supabase Auth est temporairement indisponible.");
  }
  if (!response.ok) return null;
  try { return await response.json(); } catch { return null; }
}

export async function createAuthUser(env, { email, password, phone, metadata = {} }) {
  const body = { email, password, email_confirm: true, user_metadata: metadata };
  if (phone) body.phone = phone;
  const result = await authRequest(env, "admin/users", body, true);
  if (!result.ok || !result.data.id) fail(result.data.code === 422 || result.data.status === 422 ? 409 : 502, "auth_user_create_failed", "Impossible de créer le compte Supabase Auth.");
  return result.data;
}

export async function updateAuthUser(env, id, values) {
  const { url } = authConfig(env);
  if (!env.SUPABASE_SERVICE_ROLE_KEY) fail(501, "auth_unavailable", "Supabase Auth n'est pas configuré.");
  let response;
  try {
    response = await fetch(`${url}/auth/v1/admin/users/${encodeURIComponent(id)}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", apikey: env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}` },
      body: JSON.stringify(values)
    });
  } catch {
    fail(502, "auth_unavailable", "Supabase Auth est temporairement indisponible.");
  }
  if (!response.ok) fail(502, "auth_user_update_failed", "Impossible de mettre à jour le compte Supabase Auth.");
}

export async function deleteAuthUser(env, id) {
  const { url } = authConfig(env);
  if (!env.SUPABASE_SERVICE_ROLE_KEY) fail(501, "auth_unavailable", "Supabase Auth n'est pas configuré.");
  let response;
  try {
    response = await fetch(`${url}/auth/v1/admin/users/${encodeURIComponent(id)}`, {
      method: "DELETE",
      headers: { apikey: env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}` }
    });
  } catch {
    fail(502, "auth_unavailable", "Supabase Auth est temporairement indisponible.");
  }
  if (!response.ok) fail(502, "auth_user_delete_failed", "Impossible de supprimer le compte Supabase Auth.");
}

async function logoutAll(env, token) {
  const { url, key } = authConfig(env);
  const response = await fetch(`${url}/auth/v1/logout?scope=global`, {
    method: "POST",
    headers: { apikey: key, Authorization: `Bearer ${token}` }
  });
  if (!response.ok) fail(502, "auth_revoke_failed", "Impossible de révoquer les sessions Supabase Auth.");
}

async function profileForAuthUser(env, authUser, role, name, contact = {}) {
  await env.DB.setContext({ actorId: authUser.id, actorRole: "anonymous", branchId: null });
  let user = await first(env, "SELECT * FROM users WHERE auth_user_id = ?", authUser.id);
  if (!user && role === "client") {
    const phone = contact.phone || null;
    const email = contact.email || authUser.email || null;
    const id = randomId("u_");
    await run(env, "INSERT INTO users (id, auth_user_id, role, name, email, phone, active, created_at) VALUES (?, ?, 'client', ?, ?, ?, 1, ?) ON CONFLICT (auth_user_id) DO NOTHING", id, authUser.id, name || "Client", email, phone, now());
    user = await first(env, "SELECT * FROM users WHERE auth_user_id = ?", authUser.id);
  }
  if (!user || (role && user.role !== role) || !user.active || user.blocked) fail(403, "blocked", "Ce compte n'est pas autorisé.");
  await env.DB.setContext({ actorId: user.id, actorRole: user.role, branchId: user.branch_id || null });
  if (user.branch_id) {
    const branch = await first(env, "SELECT name FROM branches WHERE id = ? AND active = 1", user.branch_id);
    user.branch_name = branch?.name || null;
  }
  return user;
}

function supabaseLogin(data, user) {
  return {
    token: data.access_token,
    refreshToken: data.refresh_token,
    user: publicUser(user),
    ...(user.branch_id ? { branchId: user.branch_id } : {}),
    mustChange: !!user.must_change
  };
}

export async function refresh(c) {
  const refreshToken = str(c.body.refreshToken, { max: 4096, min: 1, field: "Jeton de renouvellement", trim: false });
  const result = await authRequest(c.env, "token?grant_type=refresh_token", { refresh_token: refreshToken });
  if (!result.ok || !result.data.access_token || !result.data.refresh_token || !result.data.user) {
    fail(401, "invalid_refresh_token", "Session expirée. Veuillez vous reconnecter.");
  }
  const authUser = result.data.user;
  const role = authUser.user_metadata?.gk_role || null;
  const user = await profileForAuthUser(c.env, authUser, role, "");
  return supabaseLogin(result.data, user);
}

/* ---------- Clients: name, phone, e-mail and password (no SMS/e-mail verification) ---------- */
export async function clientSignup(c) {
  const name = str(c.body.name, { max: 60, min: 2, field: "Nom" });
  const phone = normPhone(c.body.phone);
  const email = normEmail(c.body.email);
  const password = str(c.body.password, { max: 100, min: 8, field: "Mot de passe", trim: false });
  const keys = [[`signup:ip:${c.ip}`, POLICY.ip]];
  const left = await lockLeft(c.env, keys);
  if (left) tooMany(left);
  await recordFail(c.env, keys); // counts attempts so signups are rate-limited per IP

  await c.env.DB.setContext({ actorId: null, actorRole: "admin", branchId: null });
  const taken = await first(c.env, "SELECT id FROM users WHERE role = 'client' AND (email = ? OR phone = ?) LIMIT 1", email, phone);
  await c.env.DB.setContext({ actorId: null, actorRole: "anonymous", branchId: null });
  if (taken) fail(409, "account_exists", "Un compte existe déjà avec cet e-mail ou ce numéro.");

  const created = await createAuthUser(c.env, { email, password, metadata: { gk_role: "client" } });
  try {
    const login = await authRequest(c.env, "token?grant_type=password", { email, password });
    if (!login.ok || !login.data.user) fail(502, "auth_unavailable", "Création du compte impossible. Réessayez.");
    const user = await profileForAuthUser(c.env, login.data.user, "client", name, { email, phone });
    await clearFails(c.env, keys);
    return supabaseLogin(login.data, user);
  } catch (error) {
    await deleteAuthUser(c.env, created.id).catch(() => {});
    throw error;
  }
}

export async function clientLogin(c) {
  const identifier = str(c.body.identifier, { max: 120, min: 1, field: "E-mail ou téléphone" });
  const password = str(c.body.password, { max: 200, min: 1, field: "Mot de passe", trim: false });
  const keys = [[`client:${identifier.toLowerCase()}`, POLICY.account], [`ip:${c.ip}`, POLICY.ip]];
  const left = await lockLeft(c.env, keys);
  if (left) tooMany(left);

  let email = identifier.includes("@") ? identifier.toLowerCase() : null;
  if (!email) {
    let phone = null;
    try { phone = normPhone(identifier); } catch { /* handled as bad credentials */ }
    if (phone) {
      await c.env.DB.setContext({ actorId: null, actorRole: "admin", branchId: null });
      const row = await first(c.env, "SELECT email FROM users WHERE role = 'client' AND phone = ?", phone);
      await c.env.DB.setContext({ actorId: null, actorRole: "anonymous", branchId: null });
      email = row?.email || null;
    }
  }
  const result = email ? await authRequest(c.env, "token?grant_type=password", { email, password }) : { ok: false, data: {} };
  if (!result.ok || !result.data.user) { await recordFail(c.env, keys); BAD(); }
  let user;
  try { user = await profileForAuthUser(c.env, result.data.user, "client", ""); } catch { await recordFail(c.env, keys); BAD(); }
  await clearFails(c.env, keys);
  return supabaseLogin(result.data, user);
}

/* ---------- courier phone + PIN ---------- */
export async function courierLogin(c) {
  const phone = normPhone(c.body.phone);
  const pin = str(c.body.pin, { max: 12, field: "PIN", trim: false });
  const keys = [[`courier:${phone}`, POLICY.account], [`ip:${c.ip}`, POLICY.ip]];
  const left = await lockLeft(c.env, keys);
  if (left) tooMany(left);
  const user = await first(c.env, "SELECT * FROM users WHERE phone = ? AND role = 'courier'", phone);
  const ok = await verifySecret(pin, user && user.pin_hash);
  if (!ok || !user?.active) { await recordFail(c.env, keys); BAD(); }
  await clearFails(c.env, keys);
  return finishLogin(c.env, user);
}

/* ---------- Supabase Auth staff email/password ---------- */
export async function staffLogin(c) {
  const email = String(c.body.email || "").trim().toLowerCase().slice(0, 120);
  const password = str(c.body.password, { max: 200, field: "Mot de passe", trim: false });
  const keys = [[`staff:${email}`, POLICY.account], [`ip:${c.ip}`, POLICY.ip]];
  const left = await lockLeft(c.env, keys);
  if (left) tooMany(left);
  const result = await authRequest(c.env, "token?grant_type=password", { email, password });
  if (!result.ok || !result.data.user) { await recordFail(c.env, keys); BAD(); }
  const role = result.data.user.user_metadata?.gk_role || null;
  const user = await profileForAuthUser(c.env, result.data.user, role, "");
  if (!["cashier", "chef", "waiter", "manager", "admin"].includes(user.role)) { await recordFail(c.env, keys); BAD(); }
  await clearFails(c.env, keys);
  return supabaseLogin(result.data, user);
}

/* ---------- owner door-key back door ---------- */
export async function ownerLogin(c) {
  const { env } = c;
  const ip = c.ip;
  const ua = (c.req.headers.get("User-Agent") || "").slice(0, 200);
  const keys = [[`owner:ip:${ip}`, POLICY.owner], ["owner:all", POLICY.ownerAll]];
  const log = (outcome) => run(env, "INSERT INTO owner_audit (at, outcome, ip, user_agent) VALUES (?,?,?,?)", now(), outcome, ip, ua);
  const door = String(c.body.door ?? "").slice(0, 300);
  // The door key is a high-entropy secret: whoever holds it is never locked out, while guessers without it still are.
  const hasKey = !!env.OWNER_DOOR_KEY && await safeEqual(door, env.OWNER_DOOR_KEY);
  const left = hasKey ? 0 : await lockLeft(env, keys);
  if (left) { await log("locked"); tooMany(left); }
  const email = String(c.body.email || "").trim().toLowerCase().slice(0, 120);
  const password = String(c.body.password ?? "").slice(0, 200);
  const user = await first(env, "SELECT * FROM users WHERE email = ? AND role = 'owner'", email);
  const passwordOk = await verifySecret(password, user && user.password_hash);
  const good = passwordOk && hasKey && !!user && !!user.active;
  if (!good) { if (!hasKey) await recordFail(env, keys); await log("fail"); BAD(); }
  await clearFails(env, keys);
  await log("ok");
  return finishLogin(env, user);
}

/* ---------- owner view-as: personal client/courier/kitchen profiles ---------- */
const VIEW_ROLES = { client: "client", courier: "courier", cuisine: "cashier" };
export const OWNER_VIEW_ID_PREFIX = "u_ov_";

export async function ownerSwitch(c) {
  const { env, user: owner } = c;
  if (owner.role !== "owner") fail(403, "forbidden", "Réservé au propriétaire.");
  const target = String(c.body.target || "");
  const role = VIEW_ROLES[target];
  if (!role) fail(400, "invalid", "Vue inconnue.");
  const selectedBranchId = c.branchId || null;
  const branchId = role === "client" ? null : selectedBranchId;
  if (role !== "client" && !branchId) fail(400, "branch_required", "Choisissez une succursale.");
  const id = role === "client" ? `${OWNER_VIEW_ID_PREFIX}client` : `${OWNER_VIEW_ID_PREFIX}${target}_${branchId}`;
  // The linked profiles are created under admin rights; the owner context is restored afterwards.
  await env.DB.setContext({ actorId: owner.id, actorRole: "admin", branchId });
  let row = await first(env, "SELECT * FROM users WHERE id = ?", id);
  if (!row) {
    await run(env, "INSERT INTO users (id, role, name, active, must_change, created_at, created_by) VALUES (?,?,?,1,0,?,?)", id, role, `${owner.name} (aperçu)`, now(), owner.id);
    if (role === "courier") await run(env, "INSERT INTO couriers (user_id, vehicle) VALUES (?, ?)", id, "Aperçu propriétaire");
    row = await first(env, "SELECT * FROM users WHERE id = ?", id);
  }
  if (!row.active || row.blocked) fail(403, "blocked", "Ce profil d'aperçu est désactivé.");
  if (row.branch_id) {
    const branch = await first(env, "SELECT name FROM branches WHERE id = ? AND active = 1", row.branch_id);
    row.branch_name = branch?.name || null;
  }
  const token = await issueToken(env, row, 8 * 3600);
  await env.DB.setContext({ actorId: owner.id, actorRole: "owner", branchId: null });
  await run(env, "INSERT INTO owner_audit (at, outcome, ip, user_agent) VALUES (?,?,?,?)", now(), `view:${target}`, c.ip, (c.req.headers.get("User-Agent") || "").slice(0, 200));
  return { token, user: publicUser(row), branchId: selectedBranchId || row.branch_id || undefined, mustChange: false };
}

/* ---------- secret change ---------- */
export function validateNewSecret(role, value) {
  if (role === "courier") {
    if (!/^\d{4}$/.test(value)) fail(400, "weak_secret", "Le PIN doit contenir exactement 4 chiffres.");
    if (WEAK_PINS.has(value)) fail(400, "weak_secret", "PIN trop simple. Choisissez-en un autre.");
  } else if (typeof value !== "string" || value.length < 8 || value.length > 100) {
    fail(400, "weak_secret", "Le mot de passe doit contenir au moins 8 caractères.");
  }
}

export async function changeSecret(c) {
  const user = c.user;
  if (user.role === "client") fail(400, "no_secret", "Ce compte n'a pas de mot de passe.");
  const current = str(c.body.current, { max: 200, trim: false, field: "Code actuel" });
  const next = str(c.body.next, { max: 200, trim: false, field: "Nouveau code" });
  const keys = [[`chg:${user.id}`, POLICY.account]];
  const left = await lockLeft(c.env, keys);
  if (left) tooMany(left);
  let validCurrent = user.role === "courier" || user.role === "owner"
    ? await verifySecret(current, user.role === "courier" ? user.pin_hash : user.password_hash)
    : false;
  if (user.role !== "courier" && user.role !== "owner") {
    const result = await authRequest(c.env, "token?grant_type=password", { email: user.email, password: current });
    validCurrent = !!result.ok && result.data.user?.id === user.auth_user_id;
  }
  if (!validCurrent) { await recordFail(c.env, keys); fail(401, "invalid_credentials", "Code actuel incorrect."); }
  validateNewSecret(user.role, next);
  if (next === current) fail(400, "weak_secret", "Le nouveau code doit être différent.");
  await clearFails(c.env, keys);

  let authSession = null;
  if (user.role === "courier" || user.role === "owner") {
    const column = user.role === "courier" ? "pin_hash" : "password_hash";
    await run(c.env, `UPDATE users SET ${column} = ?, must_change = 0, token_version = token_version + 1 WHERE id = ?`, await hashSecret(next), user.id);
  } else {
    await updateAuthUser(c.env, user.auth_user_id, { password: next });
    const result = await authRequest(c.env, "token?grant_type=password", { email: user.email, password: next });
    if (!result.ok || !result.data.access_token) fail(502, "auth_unavailable", "Mot de passe modifié. Connectez-vous à nouveau.");
    authSession = result.data;
    await run(c.env, "UPDATE users SET must_change = 0 WHERE id = ?", user.id);
  }
  const fresh = await first(c.env, "SELECT * FROM users WHERE id = ?", user.id);
  await audit(c.env, fresh, "Code modifié", "Changement de mot de passe/PIN");
  return user.role === "courier" || user.role === "owner"
    ? { token: await issueToken(c.env, fresh), user: publicUser(fresh), branchId: fresh.branch_id || undefined }
    : supabaseLogin(authSession, fresh);
}

export async function revokeAll(c) {
  if (c.user.auth_user_id) await logoutAll(c.env, c.authToken);
  await run(c.env, "UPDATE users SET token_version = token_version + 1 WHERE id = ?", c.user.id);
  return { ok: true };
}



