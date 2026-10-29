import { fail, now, str } from "./lib.js";
import { first, all, getSetting, setSetting, getOpsMode, audit, notify, need } from "./core.js";
import { tickDispatch, retryFailedOrders } from "./orders.js";

const STARTED = Date.now();
const SURFACES = [
  { id: "api", name: "API", url: "https://gk-api-paris.fly.dev/health", kind: "health" },
  { id: "web", name: "Landing", url: "https://gkfood.store/", probe: "https://gkfood.store/ok.txt" },
  { id: "app", name: "Customer app", url: "https://app.gkfood.store/", probe: "https://app.gkfood.store/ok.txt" },
  { id: "kitchen", name: "Kitchen", url: "https://kitchen.gkfood.store/", probe: "https://kitchen.gkfood.store/ok.txt" },
  { id: "caisse", name: "Caisse", url: "https://caisse.gkfood.store/", probe: "https://caisse.gkfood.store/ok.txt" },
  { id: "courier", name: "Courier", url: "https://courier.gkfood.store/", probe: "https://courier.gkfood.store/ok.txt" },
  { id: "waiter", name: "Waiter", url: "https://serveur.gkfood.store/", probe: "https://serveur.gkfood.store/ok.txt" },
  { id: "menu", name: "QR menu", url: "https://menu.gkfood.store/", probe: "https://menu.gkfood.store/ok.txt" },
  { id: "admin", name: "Admin", url: "https://admin.gkfood.store/" },
  { id: "status", name: "Public status", url: "https://status.gkfood.store/" },
  { id: "ops", name: "Developer ops", url: "https://ops.gkfood.store/", probe: "https://ops.gkfood.store/ok.txt" }
];

function needOps(c) {
  need(c.user, "ops.console");
}

function processInfo(env) {
  const mem = typeof process !== "undefined" && typeof process.memoryUsage === "function" ? process.memoryUsage() : null;
  return {
    runtime: env.GK_API_RUNTIME || "edge",
    node: typeof process !== "undefined" ? process.version : null,
    pid: typeof process !== "undefined" ? process.pid : null,
    uptimeMs: Date.now() - STARTED,
    region: typeof process !== "undefined" ? (process.env.FLY_REGION || null) : null,
    machine: typeof process !== "undefined" ? (process.env.FLY_MACHINE_ID || null) : null,
    rssMb: mem ? Math.round(mem.rss / 1048576) : null,
    heapMb: mem ? Math.round(mem.heapUsed / 1048576) : null,
    bounceable: String(env.GK_API_RUNTIME || "").startsWith("fly-") || env.GK_API_RUNTIME === "node"
  };
}

async function bindBranch(c) {
  const branchId = c.branchId || c.user?.branch_id || "gk-food";
  await c.env.DB.setContext({ actorId: c.user.id, actorRole: c.user.role, branchId });
  return branchId;
}

export async function overview(c) {
  needOps(c);
  await bindBranch(c);
  const t = now();
  const dayStart = t - (t % 86400000);
  const [
    ops, paused, deliveryOn,
    today, live, stuck, census, users, auditRows, pushRow
  ] = await Promise.all([
    getOpsMode(c.env),
    getSetting(c.env, "paused", false),
    getSetting(c.env, "deliveryOn", true),
    first(c.env, `SELECT COUNT(*) AS orders, COALESCE(SUM(total),0) AS revenue,
      SUM(CASE WHEN status IN ('pending','preparing','ready','enroute') THEN 1 ELSE 0 END) AS open
      FROM orders WHERE created_at >= ?`, dayStart),
    first(c.env, `SELECT
      (SELECT COUNT(*) FROM couriers c JOIN users u ON u.id = c.user_id WHERE u.active = 1 AND c.online = 1 AND c.last_seen > ?) AS couriers_online,
      (SELECT COUNT(*) FROM orders WHERE status IN ('pending','preparing')) AS kitchen,
      (SELECT COUNT(*) FROM orders WHERE status = 'enroute') AS enroute,
      (SELECT COUNT(*) FROM waiter_calls WHERE status = 'open') AS waiter_calls`, t - 10 * 60000),
    all(c.env, `SELECT id, seq, status, dispatch_state, mode, total, created_at, updated_at
      FROM orders WHERE status IN ('pending','preparing','ready','enroute')
        AND (dispatch_state IN ('failed','searching') OR updated_at < ?)
      ORDER BY updated_at ASC LIMIT 12`, t - 20 * 60000),
    first(c.env, `SELECT
      (SELECT COUNT(*) FROM menu_items WHERE visible = 1) AS menu_items,
      (SELECT COUNT(*) FROM users WHERE active = 1) AS users,
      (SELECT COUNT(*) FROM users WHERE role = 'courier' AND active = 1) AS couriers,
      (SELECT COUNT(*) FROM users WHERE role = 'client' AND active = 1) AS clients,
      (SELECT COUNT(*) FROM orders) AS orders_all`),
    all(c.env, `SELECT role, COUNT(*) AS n FROM users WHERE active = 1 GROUP BY role ORDER BY role`),
    all(c.env, "SELECT at, actor_name, actor_role, action, detail FROM audit_log ORDER BY id DESC LIMIT 18"),
    first(c.env, "SELECT COUNT(*) AS n FROM push_subscriptions").catch(() => ({ n: 0 }))
  ]);
  return {
    at: t,
    ops,
    switches: { paused: !!paused, deliveryOn: deliveryOn === undefined ? true : !!deliveryOn },
    process: processInfo(c.env),
    today: {
      orders: Number(today?.orders) || 0,
      revenue: Number(today?.revenue) || 0,
      open: Number(today?.open) || 0
    },
    live: {
      couriersOnline: Number(live?.couriers_online) || 0,
      kitchen: Number(live?.kitchen) || 0,
      enroute: Number(live?.enroute) || 0,
      waiterCalls: Number(live?.waiter_calls) || 0
    },
    census: {
      menuItems: Number(census?.menu_items) || 0,
      users: Number(census?.users) || 0,
      couriers: Number(census?.couriers) || 0,
      clients: Number(census?.clients) || 0,
      orders: Number(census?.orders_all) || 0,
      push: Number(pushRow?.n) || 0,
      roles: users.map((row) => ({ role: row.role, n: Number(row.n) || 0 }))
    },
    stuck: stuck.map((row) => ({
      id: row.id, seq: row.seq, status: row.status, dispatch: row.dispatch_state,
      mode: row.mode, total: Number(row.total) || 0, updatedAt: row.updated_at
    })),
    audit: auditRows.map((row) => ({
      at: row.at, user: row.actor_name, role: row.actor_role, action: row.action, detail: row.detail
    })),
    surfaces: SURFACES
  };
}

export async function setMode(c) {
  needOps(c);
  await bindBranch(c);
  const mode = oneMode(c.body.mode);
  const message = str(c.body.message ?? "", { max: 240, field: "Message" });
  await setSetting(c.env, "opsMode", mode);
  await setSetting(c.env, "opsMessage", message);
  await audit(c.env, c.user, "Ops mode", `${mode}${message ? ` · ${message}` : ""}`);
  return { ok: true, ops: { mode, message } };
}

export async function setSwitches(c) {
  needOps(c);
  await bindBranch(c);
  const body = c.body || {};
  const done = [];
  if (body.paused !== undefined) {
    await setSetting(c.env, "paused", !!body.paused);
    done.push(body.paused ? "paused" : "open");
  }
  if (body.deliveryOn !== undefined) {
    await setSetting(c.env, "deliveryOn", !!body.deliveryOn);
    done.push(body.deliveryOn ? "delivery-on" : "delivery-off");
  }
  if (done.length) await audit(c.env, c.user, "Ops switches", done.join(", "));
  return {
    ok: true,
    switches: {
      paused: !!(await getSetting(c.env, "paused", false)),
      deliveryOn: !!(await getSetting(c.env, "deliveryOn", true))
    }
  };
}

export async function warmup(c) {
  needOps(c);
  await bindBranch(c);
  const started = Date.now();
  const row = await first(c.env, "SELECT COUNT(*) AS n FROM orders");
  return { ok: true, orders: Number(row?.n) || 0, ms: Date.now() - started, process: processInfo(c.env) };
}

export async function bounce(c) {
  needOps(c);
  await bindBranch(c);
  if (c.user.role !== "owner") fail(403, "forbidden", "Seul le propriétaire peut relancer l'API.");
  const info = processInfo(c.env);
  if (!info.bounceable) fail(409, "unsupported", "Relance disponible uniquement sur l'API Fly.");
  await audit(c.env, c.user, "Ops bounce", info.runtime);
  setTimeout(() => {
    try { process.exit(0); } catch { /* ignore */ }
  }, 1400);
  return { ok: true, restarting: true, inMs: 1400, process: info };
}

export async function dispatchTick(c) {
  needOps(c);
  await bindBranch(c);
  const expired = await tickDispatch(c.env);
  const retried = await retryFailedOrders(c.env);
  await audit(c.env, c.user, "Ops dispatch tick", `expired ${expired} · retried ${retried}`);
  return { ok: true, expired, retried };
}

export async function broadcast(c) {
  needOps(c);
  await bindBranch(c);
  const title = str(c.body.title, { max: 80, min: 1, field: "Titre" });
  const text = str(c.body.text, { max: 240, field: "Texte" });
  await notify(c.env, { audience: "staff", title, text });
  await audit(c.env, c.user, "Ops broadcast", title);
  return { ok: true };
}

function oneMode(value) {
  const mode = String(value || "");
  if (!["live", "construction", "incident"].includes(mode)) fail(400, "invalid", "Mode invalide.");
  return mode;
}
