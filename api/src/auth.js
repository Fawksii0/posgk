// Authentication endpoints. Supabase Auth owns client/staff credentials; courier and owner checks stay here.
import { fail, now, hashSecret, verifySecret, safeEqual, signToken, randomId, normPhone, str } from "./lib.js";
import { run, first, audit, publicUser, lockLeft, recordFail, clearFails, tooMany, POLICY } from "./core.js";

const TTL = { owner: 4 * 3600, courier: 30 * 86400 };
const STAFF_TTL = 12 * 3600;
const WEAK_PINS = new Set(["0000", "1111", "2222", "3333", "4444", "5555", "6666", "7777", "8888", "9999", "1234", "4321", "0123", "2580"]);

export async function issueToken(env, user) {
  const iat = Math.floor(now() / 1000);
  return signToken(env, { sub: user.id, role: user.role, tv: user.token_version, iat, exp: iat + (TTL[user.role] || STAFF_TTL) });
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
  if (!result.ok || !result.data.id) fail(result.data.status === 422 ? 409 : 502, "auth_user_create_failed", "Impossible de créer le compte Supabase Auth.");
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

async function profileForAuthUser(env, authUser, role, name) {
  await env.DB.setContext({ actorId: authUser.id, actorRole: "anonymous", branchId: null });
  let user = await first(env, "SELECT * FROM users WHERE auth_user_id = ?", authUser.id);
  if (!user && role === "client") {
    const phone = authUser.phone ? normPhone(authUser.phone) : null;
    const id = randomId("u_");
    await run(env, "INSERT INTO users (id, auth_user_id, role, name, phone, active, created_at) VALUES (?, ?, 'client', ?, ?, 1, ?) ON CONFLICT (auth_user_id) DO NOTHING", id, authUser.id, name || "Client", phone, now());
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
  const role = authUser.phone ? "client" : authUser.user_metadata?.gk_role || null;
  const user = await profileForAuthUser(c.env, authUser, role, "");
  return supabaseLogin(result.data, user);
}

/* ---------- Supabase Auth OTP (clients) ---------- */
export async function otpRequest(c) {
  const phone = normPhone(c.body.phone);
  const t = now();
  const recent = await first(c.env, "SELECT COUNT(*) AS n FROM otp_codes WHERE phone = ? AND created_at > ?", phone, t - 10 * 60000);
  if (recent.n >= 3) fail(429, "otp_rate", "Trop de demandes. Réessayez dans quelques minutes.", { retryAfter: 600 });
  await run(c.env, "INSERT INTO otp_codes (phone, code_hash, expires_at, created_at) VALUES (?,?,?,?)", phone, "supabase-auth", t + 5 * 60000, t);
  const result = await authRequest(c.env, "otp", { phone: `+212${phone.slice(1)}`, create_user: true });
  if (!result.ok) fail(502, "otp_failed", "Impossible d'envoyer le code. Réessayez plus tard.");
  return { ok: true, expiresIn: 300 };
}

export async function otpVerify(c) {
  const phone = normPhone(c.body.phone);
  const code = str(c.body.code, { max: 6, min: 6, field: "Code" });
  const keys = [[`otp:${phone}`, POLICY.account], [`ip:${c.ip}`, POLICY.ip]];
  const left = await lockLeft(c.env, keys);
  if (left) tooMany(left);
  const t = now();
  const row = await first(c.env, "SELECT * FROM otp_codes WHERE phone = ? AND used = 0 AND expires_at > ? ORDER BY id DESC LIMIT 1", phone, t);
  if (!row || row.attempts >= 5) { await recordFail(c.env, keys); fail(401, "invalid_code", "Code incorrect ou expiré."); }
  const result = await authRequest(c.env, "verify", { type: "sms", phone: `+212${phone.slice(1)}`, token: code });
  if (!result.ok || !result.data.access_token || !result.data.user) {
    await run(c.env, "UPDATE otp_codes SET attempts = attempts + 1 WHERE id = ?", row.id);
    await recordFail(c.env, keys);
    fail(401, "invalid_code", "Code incorrect ou expiré.");
  }
  await run(c.env, "UPDATE otp_codes SET used = 1 WHERE phone = ?", phone);
  await clearFails(c.env, keys);
  const name = str(c.body.name, { max: 60 }) || "Client";
  const user = await profileForAuthUser(c.env, result.data.user, "client", name);
  if (user.name === "Client" && name !== "Client") {
    await run(c.env, "UPDATE users SET name = ? WHERE id = ?", name, user.id);
    user.name = name;
  }
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
  const left = await lockLeft(env, keys);
  if (left) { await log("locked"); tooMany(left); }
  const email = String(c.body.email || "").trim().toLowerCase().slice(0, 120);
  const password = String(c.body.password ?? "").slice(0, 200);
  const door = String(c.body.door ?? "").slice(0, 300);
  const user = await first(env, "SELECT * FROM users WHERE email = ? AND role = 'owner'", email);
  const [passwordOk, doorOk] = await Promise.all([
    verifySecret(password, user && user.password_hash),
    safeEqual(door, env.OWNER_DOOR_KEY || crypto.randomUUID())
  ]);
  const good = passwordOk && doorOk && !!user && !!user.active && !!env.OWNER_DOOR_KEY;
  if (!good) { await recordFail(env, keys); await log("fail"); BAD(); }
  await clearFails(env, keys);
  await log("ok");
  return finishLogin(env, user);
}

/* ---------- secret change ---------- */
export function validateNewSecret(role, value) {
  if (role === "courier") {
    if (!/^\d{4,6}$/.test(value)) fail(400, "weak_secret", "Le PIN doit contenir 4 à 6 chiffres.");
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
