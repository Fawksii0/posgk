// Core: DB helpers, permissions, throttling, audit, notifications.
import { fail, now, jparse } from "./lib.js";

export const STAFF = ["cashier", "chef", "waiter", "manager", "admin", "owner"];
export const MANAGED_STAFF = ["cashier", "chef", "waiter", "manager", "admin"];

const ALL_STAFF = STAFF;
const MGR = ["manager", "admin", "owner"];
const ADM = ["admin", "owner"];
const FRONT = ["cashier", "manager", "admin", "owner"];

export const PERMS = {
  "orders.view": ALL_STAFF,
  "orders.act": FRONT, // accept, refuse, adjust prep, cancel, assign, retry dispatch
  "orders.dinein": ["waiter", "cashier", "manager", "admin", "owner"],
  "orders.ready": ["cashier", "chef", "manager", "admin", "owner"],
  "orders.handover": ["cashier", "waiter", "manager", "admin", "owner"],
  "orders.advance": MGR,
  "menu.view": ALL_STAFF,
  "menu.write": MGR,
  "menu.delete": ADM,
  "menu.stock": FRONT,
  "couriers.view": FRONT,
  "couriers.write": MGR,
  "clients.view": MGR,
  "zones.write": MGR,
  "promos.manage": MGR,
  "settings.view": ALL_STAFF,
  "settings.write": ADM,
  "settings.ops": FRONT,
  "users.manage": ADM,
  "audit.view": ADM,
  "stats.view": MGR,
  "ops.console": ADM
};
export const can = (u, perm) => !!u && (PERMS[perm] || []).includes(u.role);
export function need(u, perm) { if (!can(u, perm)) fail(403, "forbidden", "Accès refusé."); }

/* ---------- DB ---------- */
export const run = (env, sql, ...a) => env.DB.prepare(sql).bind(...a).run();
export const first = (env, sql, ...a) => env.DB.prepare(sql).bind(...a).first();
export async function all(env, sql, ...a) { return (await env.DB.prepare(sql).bind(...a).all()).results || []; }
export const stmt = (env, sql, ...a) => env.DB.prepare(sql).bind(...a);
export const batch = (env, stmts) => env.DB.batch(stmts);

export async function getSetting(env, key, def) {
  const r = await first(env, "SELECT value FROM settings WHERE key = ?", key);
  return r ? jparse(r.value, def) : def;
}
export const setSetting = (env, key, value) => run(env, "INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT (branch_id, key) DO UPDATE SET value = excluded.value", key, JSON.stringify(value));

export async function getOpsMode(env) {
  const mode = await getSetting(env, "opsMode", "live");
  const message = await getSetting(env, "opsMessage", "");
  return {
    mode: ["live", "construction", "incident"].includes(mode) ? mode : "live",
    message: String(message || "")
  };
}

/* ---------- audit / notifications ---------- */
export async function audit(env, actor, action, detail = "", target = null) {
  await run(env, "INSERT INTO audit_log (at, actor_id, actor_name, actor_role, action, detail, target_id, target_role) VALUES (?,?,?,?,?,?,?,?)",
    now(), actor?.id || null, actor?.name || "Système", actor?.role || "system", action, String(detail).slice(0, 300), target?.id || null, target?.role || null);
}
export async function notify(env, { audience, userId = null, title, text = "", orderId = null }) {
  await run(env, "INSERT INTO notifications (audience, user_id, title, text, order_id, created_at) VALUES (?,?,?,?,?,?)", audience, userId, title, text, orderId, now());
  try {
    const { sendPush } = await import("./push.js");
    await sendPush(env, { audience, userId, title, text, orderId });
  } catch { /* push is optional; in-app inbox still works */ }
}

/* ---------- login throttling ---------- */
const DAY = 86400000;
export const POLICY = {
  account: { threshold: 5, base: 30, cap: 3600 },
  ip: { threshold: 25, base: 30, cap: 3600 },
  owner: { threshold: 3, base: 300, cap: 86400 },
  ownerAll: { threshold: 20, base: 60, cap: 3600 },
  code: { threshold: 5, base: 30, cap: 600 }
};

export async function lockLeft(env, keys) {
  const t = now(); let left = 0;
  for (const [key] of keys) {
    const r = await first(env, "SELECT locked_until FROM login_attempts WHERE key = ?", key);
    if (r && r.locked_until > t) left = Math.max(left, Math.ceil((r.locked_until - t) / 1000));
  }
  return left;
}
export async function recordFail(env, keys) {
  const t = now();
  for (const [key, pol] of keys) {
    const r = await first(env, "SELECT fails, updated_at FROM login_attempts WHERE key = ?", key);
    const fails = (r && t - r.updated_at < DAY ? r.fails : 0) + 1;
    const lock = fails >= pol.threshold ? t + Math.min(pol.cap, pol.base * 2 ** Math.min(20, fails - pol.threshold)) * 1000 : 0;
    await run(env, "INSERT INTO login_attempts (key, fails, locked_until, updated_at) VALUES (?,?,?,?) ON CONFLICT(key) DO UPDATE SET fails = excluded.fails, locked_until = excluded.locked_until, updated_at = excluded.updated_at", key, fails, lock, t);
  }
}
export async function clearFails(env, keys) {
  for (const [key] of keys) await run(env, "DELETE FROM login_attempts WHERE key = ?", key);
}
export function tooMany(left) {
  fail(429, "locked", `Trop de tentatives. Réessayez dans ${left} s.`, { retryAfter: left });
}

/* ---------- users ---------- */
export function publicUser(u) {
  return {
    id: u.id, role: u.role, name: u.name, email: u.email || null, phone: u.phone || null,
    active: !!u.active, blocked: !!u.blocked, mustChange: !!u.must_change,
    branchId: u.branch_id || u.active_branch_id || null,
    branchName: u.branch_name || u.active_branch_name || null,
    loginCode: u.login_code || null,
    createdAt: u.created_at, lastLogin: u.last_login || null
  };
}
