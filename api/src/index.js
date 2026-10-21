import { HttpError, json, readBody, verifyToken, safeEqual, str } from "./lib.js";
import { first, all } from "./core.js";
import * as auth from "./auth.js";
import * as admin from "./admin.js";
import * as orders from "./orders.js";
import * as chat from "./chat.js";

const routes = [];
const route = (method, path, handler, options = {}) => routes.push({
  method, path: new RegExp(`^${path}$`), handler,
  branchScoped: !["/api/branches", "/api/me/branches", "/api/auth/client/signup", "/api/auth/client/login",
    "/api/auth/courier", "/api/auth/staff", "/api/auth/owner", "/api/auth/refresh", "/api/auth/change-secret",
    "/api/auth/revoke", "/api/me"].includes(path),
  ...options
});

route("GET", "/health", async () => ({ ok: true, service: "gk-api" }), { public: true, branchScoped: false });
route("GET", "/api/branches", async (c) => ({
  branches: (await all(c.env, "SELECT id, slug, name, cuisine, address, active FROM branches WHERE active = 1 ORDER BY id"))
    .map((branch) => ({ ...branch, active: !!branch.active }))
}), { public: true, branchScoped: false });
route("GET", "/api/me/branches", async (c) => {
  const sql = c.user.role === "owner" || c.user.role === "admin"
    ? "SELECT id, slug, name, cuisine, address, active FROM branches WHERE active = 1 ORDER BY id"
    : c.user.branch_id
      ? "SELECT id, slug, name, cuisine, address, active FROM branches WHERE id = ? AND active = 1"
      : "SELECT id, slug, name, cuisine, address, active FROM branches WHERE active = 1 ORDER BY id";
  const branches = c.user.branch_id && c.user.role !== "owner" && c.user.role !== "admin"
    ? await all(c.env, sql, c.user.branch_id) : await all(c.env, sql);
  return { branches: branches.map((branch) => ({ ...branch, active: !!branch.active })) };
}, { branchScoped: false });
route("POST", "/api/auth/client/signup", (c) => auth.clientSignup(c), { public: true, body: true });
route("POST", "/api/auth/client/login", (c) => auth.clientLogin(c), { public: true, body: true });
route("POST", "/api/auth/refresh", (c) => auth.refresh(c), { public: true, body: true, branchScoped: false });
route("POST", "/api/auth/courier", (c) => auth.courierLogin(c), { public: true, body: true });
route("POST", "/api/auth/staff", (c) => auth.staffLogin(c), { public: true, body: true });
route("POST", "/api/auth/owner", (c) => auth.ownerLogin(c), { public: true, body: true });
route("POST", "/api/owner/switch", (c) => auth.ownerSwitch(c), { body: true, branchScoped: false });
route("POST", "/api/auth/change-secret", auth.changeSecret, { body: true });
route("POST", "/api/auth/revoke", auth.revokeAll, { body: true });
route("GET", "/api/me", admin.me);
route("PATCH", "/api/me", admin.meUpdate, { body: true });
route("GET", "/api/menu", admin.publicMenu, { public: true });
route("GET", "/api/admin/menu", admin.menuList);
route("POST", "/api/admin/menu", admin.itemCreate, { body: true });
route("PUT", "/api/admin/menu/(?<id>[^/]+)", admin.itemUpdate, { body: true });
route("PATCH", "/api/admin/menu/(?<id>[^/]+)/availability", admin.itemAvailability, { body: true });
route("DELETE", "/api/admin/menu/(?<id>[^/]+)", admin.itemDelete);
route("POST", "/api/admin/categories", admin.categorySave, { body: true });
route("PUT", "/api/admin/categories/(?<id>[^/]+)", admin.categorySave, { body: true });
route("DELETE", "/api/admin/categories/(?<id>[^/]+)", admin.categoryDelete);
route("GET", "/api/zones", async (c) => ({
  zones: (await all(c.env, 'SELECT id, name, fee, min_order AS "min", eta_min AS "etaMin", eta_max AS "etaMax", free_from AS "freeFrom" FROM zones WHERE enabled = 1 ORDER BY fee, name'))
}), { public: true });
route("GET", "/api/admin/zones", admin.zonesList);
route("POST", "/api/admin/zones", admin.zoneSave, { body: true });
route("PUT", "/api/admin/zones/(?<id>[^/]+)", admin.zoneSave, { body: true });
route("DELETE", "/api/admin/zones/(?<id>[^/]+)", admin.zoneDelete);
route("POST", "/api/promos/validate", admin.promoValidate, { public: true, body: true });
route("GET", "/api/admin/promos", admin.promosList);
route("POST", "/api/admin/promos", admin.promoSave, { body: true });
route("PUT", "/api/admin/promos/(?<id>[^/]+)", admin.promoSave, { body: true });
route("DELETE", "/api/admin/promos/(?<id>[^/]+)", admin.promoDelete);
route("GET", "/api/settings/public", async (c) => {
  const menu = await admin.publicMenu(c);
  return { settings: menu.settings };
}, { public: true });
route("GET", "/api/admin/settings", admin.settingsGet);
route("PUT", "/api/admin/settings", admin.settingsPut, { body: true });
route("PATCH", "/api/admin/settings/operations", admin.settingsOps, { body: true });
route("GET", "/api/admin/users", admin.usersList);
route("POST", "/api/admin/users", admin.userCreate, { body: true });
route("PUT", "/api/admin/users/(?<id>[^/]+)", admin.userUpdate, { body: true });
route("DELETE", "/api/admin/users/(?<id>[^/]+)", admin.userDelete);
route("GET", "/api/admin/couriers", admin.couriersList);
route("GET", "/api/live/couriers", admin.liveCouriers);
route("POST", "/api/admin/couriers", admin.courierCreate, { body: true });
route("PUT", "/api/admin/couriers/(?<id>[^/]+)", admin.courierUpdate, { body: true });
route("POST", "/api/admin/couriers/(?<id>[^/]+)/reset-pin", admin.courierResetPin, { body: true });
route("POST", "/api/admin/couriers/(?<id>[^/]+)/settle", admin.courierSettle, { body: true });
route("DELETE", "/api/admin/couriers/(?<id>[^/]+)", admin.courierDelete);
route("GET", "/api/courier/me", admin.courierMe);
route("PATCH", "/api/courier/online", admin.courierOnline, { body: true });
route("PATCH", "/api/courier/position", admin.courierPosition, { body: true });
route("GET", "/api/courier/history", admin.courierHistory);
route("GET", "/api/admin/clients", admin.clientsList);
route("PATCH", "/api/admin/clients/(?<id>[^/]+)/block", admin.clientBlock, { body: true });
route("GET", "/api/notifications", admin.notificationsList);
route("POST", "/api/notifications/read", admin.notificationsRead, { body: true });
route("GET", "/api/admin/audit", admin.auditList);
route("GET", "/api/owner/audit", admin.ownerAuditList, { branchScoped: false });
route("GET", "/api/admin/stats", admin.stats);

route("GET", "/api/chat/unread", chat.unreadCounts);
route("GET", "/api/orders/(?<id>[^/]+)/messages", chat.messagesList);
route("POST", "/api/orders/(?<id>[^/]+)/messages", chat.messageSend, { body: true });
route("GET", "/api/orders", orders.ordersList);
route("POST", "/api/orders", orders.orderCreate, { body: true });
route("GET", "/api/orders/(?<id>[^/]+)", orders.orderGet);
route("POST", "/api/orders/(?<id>[^/]+)/cancel", orders.orderCancel, { body: true });
route("POST", "/api/orders/(?<id>[^/]+)/accept", orders.orderAccept, { body: true });
route("POST", "/api/orders/(?<id>[^/]+)/refuse", orders.orderRefuse, { body: true });
route("PATCH", "/api/orders/(?<id>[^/]+)/prep", orders.orderAdjust, { body: true });
route("POST", "/api/orders/(?<id>[^/]+)/ready", orders.orderReady, { body: true });
route("POST", "/api/orders/(?<id>[^/]+)/handover", orders.orderHandover, { body: true });
route("POST", "/api/orders/(?<id>[^/]+)/assign", orders.courierAssign, { body: true });
route("POST", "/api/orders/(?<id>[^/]+)/dispatch/retry", orders.orderDispatchRetry, { body: true });
route("GET", "/api/courier/offers", orders.courierOffers);
route("POST", "/api/courier/orders/(?<id>[^/]+)/accept", orders.courierOfferAccept, { body: true });
route("POST", "/api/courier/orders/(?<id>[^/]+)/refuse", orders.courierOfferRefuse, { body: true });
route("POST", "/api/courier/orders/(?<id>[^/]+)/(?<step>arrived|picked-up|delivered)", orders.courierStep, { body: true });
route("POST", "/api/internal/dispatch", async (c) => {
  if (!c.env.DISPATCH_SECRET || !(await safeEqual(c.req.headers.get("X-GK-Cron-Secret") || "", c.env.DISPATCH_SECRET))) {
    throw new HttpError(401, "unauthorized", "Accès refusé.");
  }
  const branches = await all(c.env, "SELECT id FROM branches WHERE active = 1");
  for (const branch of branches) {
    await c.env.DB.setContext({ actorId: null, actorRole: "admin", branchId: branch.id });
    await orders.cronDispatch(c.env);
  }
  return { ok: true };
}, { public: true, body: true, branchScoped: false });

async function authorize(request, env, isPublic) {
  if (isPublic) return null;
  const header = request.headers.get("Authorization") || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  const payload = await verifyToken(env, token);
  if (!payload?.sub && !token) throw new HttpError(401, "unauthorized", "Connexion requise.");
  let authId = payload?.sub || null;
  let supabaseUser = null;
  if (!payload?.sub) {
    supabaseUser = await auth.verifySupabaseAccessToken(env, token);
    if (!supabaseUser?.id) throw new HttpError(401, "unauthorized", "Connexion requise.");
    authId = supabaseUser.id;
  }
  await env.DB.setContext({ actorId: authId, actorRole: "anonymous", branchId: request.headers.get("X-GK-Branch") || null });
  const user = payload
    ? await first(env, "SELECT * FROM users WHERE id = ?", payload.sub)
    : await first(env, "SELECT * FROM users WHERE auth_user_id = ?", authId);
  if (!user || !user.active || user.blocked || (payload && (user.token_version !== payload.tv || user.role !== payload.role))) {
    throw new HttpError(401, "unauthorized", "Session expirée.");
  }
  await env.DB.setContext({ actorId: user.id, actorRole: user.role, branchId: user.branch_id || null });
  return user;
}

const branchCache = new Map();
// Active-branch lookups repeat on every request; branches change rarely, so keep them for 30 s.
async function activeBranch(env, id) {
  const hit = branchCache.get(id);
  if (hit && hit.until > Date.now()) return hit.value;
  const value = await first(env, "SELECT id, name FROM branches WHERE id = ? AND active = 1", id);
  if (value) branchCache.set(id, { value, until: Date.now() + 30000 });
  return value;
}

async function selectBranch(request, env, user, branchScoped) {
  const requested = request.headers.get("X-GK-Branch");
  if (user && user.role !== "client" && user.role !== "admin" && user.role !== "owner") {
    if (!user.branch_id) throw new HttpError(403, "branch_unassigned", "Ce compte n'est associé à aucune succursale.");
    if (requested && requested !== user.branch_id) throw new HttpError(403, "branch_forbidden", "Accès à cette succursale refusé.");
    const branch = await activeBranch(env, user.branch_id);
    if (!branch) throw new HttpError(403, "branch_inactive", "Cette succursale est inactive.");
    return user.branch_id;
  }
  if (!branchScoped) {
    if (requested && user && ["client", "admin", "owner"].includes(user.role)) {
      const branch = await activeBranch(env, str(requested, { max: 80, min: 1, field: "Succursale" }));
      if (!branch) throw new HttpError(400, "invalid_branch", "Succursale inconnue ou inactive.");
      return branch.id;
    }
    return user?.branch_id || null;
  }
  if (!requested) throw new HttpError(400, "branch_required", "Choisissez une succursale avec X-GK-Branch.");
  const id = str(requested, { max: 80, min: 1, field: "Succursale" });
  const branch = await activeBranch(env, id);
  if (!branch) throw new HttpError(400, "invalid_branch", "Succursale inconnue ou inactive.");
  return branch.id;
}

export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") return json(env, request, { ok: true });
    const url = new URL(request.url);
    if (!url.pathname.startsWith("/api/") && url.pathname !== "/health") return json(env, request, { error: { code: "not_found", message: "Introuvable." } }, 404);
    const match = routes.map((r) => [r, r.path.exec(url.pathname)]).find(([r, m]) => r.method === request.method && m);
    if (!match) return json(env, request, { error: { code: "not_found", message: "Route introuvable." } }, 404);
    const [r, m] = match;
    try {
      const c = {
        env, req: request, url, ip: request.headers.get("CF-Connecting-IP") || "local",
        params: m.groups || {}, body: r.body ? await readBody(request) : {},
        user: await authorize(request, env, !!r.public)
      };
      c.branchId = await selectBranch(request, env, c.user, r.branchScoped);
      if (c.user && c.branchId) {
        const branch = await activeBranch(env, c.branchId);
        c.user.active_branch_id = c.branchId;
        c.user.active_branch_name = branch?.name || null;
        if (c.user.branch_id) c.user.branch_name = branch?.name || null;
      }
      await env.DB.setContext({ actorId: c.user?.id || null, actorRole: c.user?.role || "anonymous", branchId: c.branchId });
      if (c.user && !c.user.auth_user_id) c.authToken = null;
      if (c.user?.auth_user_id && request.headers.get("Authorization")?.startsWith("Bearer ")) {
        c.authToken = request.headers.get("Authorization").slice(7);
      }
      return json(env, request, await r.handler(c));
    } catch (error) {
      if (error instanceof HttpError) return json(env, request, { error: { code: error.code, message: error.message, ...(error.extra || {}) } }, error.status);
      console.error("Unhandled API error", error);
      return json(env, request, { error: { code: "internal", message: "Erreur interne." } }, 500);
    }
  }
};
