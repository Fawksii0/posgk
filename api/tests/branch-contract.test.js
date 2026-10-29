import test from "node:test";
import assert from "node:assert/strict";
import { can } from "../src/core.js";
import { webcrypto } from "node:crypto";
import app from "../src/index.js";
import { haversineKm, matchDeliveryRing, signToken } from "../src/lib.js";
import { numberedParameters } from "../src/postgres-sql.js";

globalThis.crypto ||= webcrypto;

const branches = [
  { id: "gk-food", slug: "gk-food", name: "G&K Food", cuisine: "Main cuisine", address: "", active: 1 },
  { id: "gk-shawarma-crispy", slug: "gk-shawarma-crispy", name: "G&K Shawarma & Crispy", cuisine: "Shawarma & Crispy", address: "", active: 1 }
];

function mockDb(user = null) {
  return {
    context: {},
    async setContext(next) { this.context = { ...this.context, ...next }; },
    prepare(sql) {
      let values = [];
      const query = {
        bind(...args) { values = args; return query; },
        async first() {
          if (sql.includes("FROM users WHERE id = ?")) return values[0] === user?.id ? user : null;
          if (sql.includes("FROM users WHERE auth_user_id = ?")) return values[0] === user?.auth_user_id ? user : null;
          if (sql.includes("FROM menu_items") && sql.includes("FROM branches WHERE active = 1")) return { branches: 2, n: 62 };
          if (sql.includes("SELECT name FROM branches WHERE id = ?")) return branches.find((branch) => branch.id === values[0]) || null;
          if (sql.includes("FROM branches WHERE id = ?")) return branches.find((branch) => branch.id === values[0] && branch.active) || null;
          return null;
        },
        async all() {
          if (sql.includes("FROM menu_items")) return { results: [{ n: 62 }] };
          if (sql.includes("FROM branches WHERE active = 1")) return { results: branches.filter((branch) => !values.length || branch.id === values[0]) };
          return { results: [] };
        },
        async run() { return { success: true }; }
      };
      return query;
    },
    async batch() { return []; }
  };
}

async function signedInRequest(user, url, branchId) {
  const env = { SESSION_SECRET: "test-session-secret", ALLOWED_ORIGINS: "http://localhost:8800", DB: mockDb(user) };
  const iat = Math.floor(Date.now() / 1000);
  const token = await signToken(env, { sub: user.id, role: user.role, tv: user.token_version, iat, exp: iat + 3600 });
  const headers = new Headers({ Authorization: `Bearer ${token}` });
  if (branchId) headers.set("X-GK-Branch", branchId);
  const response = await app.fetch(new Request(`https://api.test${url}`, { headers }), env);
  return { response, env };
}

test("GET /health reports the API and a live branch query", async () => {
  const env = { ALLOWED_ORIGINS: "", DB: mockDb() };
  const response = await app.fetch(new Request("https://api.test/health"), env);
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.ok, true);
  assert.equal(body.service, "gk-api");
  assert.equal(body.database, "up");
  assert.equal(body.branches, 2);
  assert.equal(body.menuItems, 62);
});

test("CORS allows the public status origin on gkfood.store", async () => {
  const env = { ALLOWED_ORIGINS: "", DB: mockDb() };
  const response = await app.fetch(new Request("https://api.test/health", {
    headers: { Origin: "https://status.gkfood.store" }
  }), env);
  assert.equal(response.headers.get("Access-Control-Allow-Origin"), "https://status.gkfood.store");
});

test("GET /api/branches returns only the requested branch fields", async () => {
  const env = { ALLOWED_ORIGINS: "", DB: mockDb() };
  const response = await app.fetch(new Request("https://api.test/api/branches"), env);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    branches: branches.map(({ id, slug, name, cuisine, address, active }) => ({ id, slug, name, cuisine, address, active: !!active }))
  });
});

test("Postgres adapter numbers positional parameters without rewriting quoted text", () => {
  assert.equal(
    numberedParameters("SELECT '?' AS literal, \"?\" AS quoted, value FROM settings WHERE key = ? AND branch_id = ?"),
    "SELECT '?' AS literal, \"?\" AS quoted, value FROM settings WHERE key = $1 AND branch_id = $2"
  );
});

test("delivery rings select deterministic boundary prices", () => {
  const rings = [
    { id: "near", enabled: 1, radius_from_km: 0, radius_to_km: 3, fee: 10 },
    { id: "mid", enabled: 1, radius_from_km: 3, radius_to_km: 6, fee: 15 },
    { id: "far", enabled: 1, radius_from_km: 6, radius_to_km: 10, fee: 20 }
  ];
  assert.equal(matchDeliveryRing(rings, 0)?.id, "near");
  assert.equal(matchDeliveryRing(rings, 2.999)?.id, "near");
  assert.equal(matchDeliveryRing(rings, 3)?.id, "mid");
  assert.equal(matchDeliveryRing(rings, 10)?.id, "far");
  assert.equal(matchDeliveryRing(rings, 10.001), null);
  assert.ok(haversineKm({ lat: 33.7895, lng: -7.1597 }, { lat: 33.7895, lng: -7.1597 }) < 0.001);
});

test("delivery order derives its ring, fee, and destination from GPS coordinates", async () => {
  const client = {
    id: "client-gps", role: "client", token_version: 0, active: 1, blocked: 0,
    branch_id: null, name: "Client GPS", phone: "0612345678"
  };
  let storedOrder = null;
  const db = {
    context: {},
    async setContext(next) { this.context = { ...this.context, ...next }; },
    prepare(sql) {
      let values = [];
      const query = {
        bind(...args) { values = args; return query; },
        async first() {
          if (sql.includes("FROM users WHERE id = ?")) return values[0] === client.id ? client : null;
          if (sql.includes("FROM branches WHERE id = ?")) return branches.find((branch) => branch.id === values[0]) || null;
          if (sql.includes("INSERT INTO order_counters")) return { value: 1001 };
          if (sql.includes("FROM orders WHERE id = ?")) return storedOrder?.id === values[0] ? storedOrder : null;
          return null;
        },
        async all() {
          if (sql.includes("FROM settings WHERE key IN")) return { results: [
            { key: "paused", value: "false" },
            { key: "deliveryOn", value: "true" },
            { key: "defaultPrep", value: "20" },
            { key: "maxDeliveryKm", value: "15" }
          ] };
          if (sql.includes("FROM menu_items")) return { results: [{
            id: "pizza", name: "Pizza", price: 50, sizes: "[]", extras: "[]",
            image_url: "", visible: 1, available: 1
          }] };
          if (sql.includes("FROM zones WHERE enabled = 1")) return { results: [
            { id: "ring-0-3", name: "0–3 km", fee: 10, min_order: 0, eta_min: 15, enabled: 1, radius_from_km: 0, radius_to_km: 3 },
            { id: "ring-3-6", name: "3–6 km", fee: 15, min_order: 0, eta_min: 20, enabled: 1, radius_from_km: 3, radius_to_km: 6 }
          ] };
          return { results: [] };
        },
        async run() {
          if (sql.includes("INSERT INTO orders")) {
            storedOrder = {
              id: values[0], seq: values[1], client_id: values[2], customer_name: values[3], customer_phone: values[4],
              mode: values[5], status: "pending", items: values[6], subtotal: values[7], fee: values[8],
              service_fee: values[9], discount: values[10], promo: values[11], total: values[12], payment: values[13],
              zone_id: values[14], zone_name: values[15], address: values[16], address_label: values[17], note: values[18],
              delivery_code: values[19], eta_min: values[20], prep_minutes: values[21], promised_at: values[22],
              dispatch_state: "none", history: values[23], created_at: values[24], updated_at: values[25],
              dest_lat: values[26], dest_lng: values[27], branch_id: "gk-food"
            };
          }
          return { success: true };
        }
      };
      return query;
    },
    async batch() { return []; }
  };
  const env = { SESSION_SECRET: "test-session-secret", ALLOWED_ORIGINS: "", DB: db };
  const iat = Math.floor(Date.now() / 1000);
  const token = await signToken(env, { sub: client.id, role: client.role, tv: 0, iat, exp: iat + 3600 });
  const response = await app.fetch(new Request("https://api.test/api/orders", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", "X-GK-Branch": "gk-food" },
    body: JSON.stringify({
      mode: "delivery", items: [{ id: "pizza", qty: 1, size: "", extras: [] }], payment: "cash",
      address: { street: "Position GPS", label: "GPS", lat: 33.7895, lng: -7.1597 }
    })
  }), env);
  assert.equal(response.status, 200);
  const order = (await response.json()).order;
  assert.equal(order.zone_id, "ring-0-3");
  assert.equal(order.fee, 10);
  assert.equal(order.total, 60);
  assert.equal(order.dest_lat, 33.7895);
  assert.equal(order.dest_lng, -7.1597);
});

test("branch-scoped public menu calls require an active X-GK-Branch", async () => {
  const env = { ALLOWED_ORIGINS: "", DB: mockDb() };
  const response = await app.fetch(new Request("https://api.test/api/menu"), env);
  assert.equal(response.status, 400);
  assert.equal((await response.json()).error.code, "branch_required");
});

test("branch-bound staff cannot switch branches with a request header", async () => {
  const user = { id: "staff-1", role: "manager", token_version: 0, active: 1, blocked: 0, branch_id: "gk-food", name: "Manager" };
  const { response } = await signedInRequest(user, "/api/me", "gk-shawarma-crispy");
  assert.equal(response.status, 403);
  assert.equal((await response.json()).error.code, "branch_forbidden");
});

test("global admin profile includes the selected branch name", async () => {
  const user = { id: "admin-1", role: "admin", token_version: 0, active: 1, blocked: 0, branch_id: null, name: "Platform admin" };
  const { response } = await signedInRequest(user, "/api/me", "gk-shawarma-crispy");
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.user.branchId, "gk-shawarma-crispy");
  assert.equal(body.user.branchName, "G&K Shawarma & Crispy");
});

test("global admins must select a branch for branch-scoped operations", async () => {
  const user = { id: "admin-2", role: "admin", token_version: 0, active: 1, blocked: 0, branch_id: null, name: "Platform admin" };
  const { response } = await signedInRequest(user, "/api/admin/menu");
  assert.equal(response.status, 400);
  assert.equal((await response.json()).error.code, "branch_required");
});

test("client sign-in by phone resolves the e-mail and returns a session; wrong password is rejected", async (t) => {
  const client = { id: "c-1", auth_user_id: "auth-c-1", role: "client", token_version: 0, active: 1, blocked: 0, branch_id: null, name: "Client", email: "a@b.co", phone: "0612345678" };
  const db = mockDb(client);
  const baseFirst = db.prepare.bind(db);
  db.prepare = (sql) => {
    const q = baseFirst(sql);
    if (sql.includes("SELECT email FROM users WHERE role = 'client' AND phone = ?")) q.first = async () => ({ email: "a@b.co" });
    return q;
  };
  let good = true;
  t.mock.method(globalThis, "fetch", async (url, init) => {
    const body = JSON.parse(init.body);
    assert.equal(body.email, "a@b.co");
    return good
      ? new Response(JSON.stringify({ access_token: "tok", refresh_token: "ref", user: { id: "auth-c-1", email: "a@b.co" } }), { status: 200 })
      : new Response(JSON.stringify({ error: "invalid_grant" }), { status: 400 });
  });
  const env = { SUPABASE_URL: "https://p.supabase.co", SUPABASE_ANON_KEY: "anon", DB: db, ALLOWED_ORIGINS: "" };
  const send = (password) => app.fetch(new Request("https://api.test/api/auth/client/login", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ identifier: "06 12 34 56 78", password })
  }), env);
  const ok = await send("secret-pass");
  assert.equal(ok.status, 200);
  const session = await ok.json();
  assert.equal(session.token, "tok");
  assert.equal(session.refreshToken, "ref");
  good = false;
  assert.equal((await send("wrong")).status, 401);
});

test("Supabase refresh returns the access token, rotated refresh token and branch identity", async (t) => {
  const user = {
    id: "staff-2", auth_user_id: "auth-staff-2", role: "manager", token_version: 0,
    active: 1, blocked: 0, branch_id: "gk-food", name: "Branch manager"
  };
  t.mock.method(globalThis, "fetch", async () => new Response(JSON.stringify({
    access_token: "new-access", refresh_token: "rotated-refresh",
    user: { id: "auth-staff-2", user_metadata: { gk_role: "manager" } }
  }), { status: 200, headers: { "Content-Type": "application/json" } }));
  const env = {
    SUPABASE_URL: "https://project.supabase.co", SUPABASE_ANON_KEY: "public-anon",
    DB: mockDb(user), ALLOWED_ORIGINS: ""
  };
  const response = await app.fetch(new Request("https://api.test/api/auth/refresh", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refreshToken: "old-refresh" })
  }), env);
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.token, "new-access");
  assert.equal(body.refreshToken, "rotated-refresh");
  assert.equal(body.user.branchId, "gk-food");
  assert.equal(body.user.branchName, "G&K Food");
});

test("waiters act on dine-in tickets; chefs stay on kitchen orders", () => {
  assert.equal(can({ role: "waiter" }, "orders.dinein"), true);
  assert.equal(can({ role: "waiter" }, "orders.act"), false);
  assert.equal(can({ role: "chef" }, "orders.dinein"), false);
  assert.equal(can({ role: "cashier" }, "orders.dinein"), true);
});

test("waiter POS publishes and settles a dine-in table", async () => {
  const waiter = {
    id: "waiter-pos", role: "waiter", token_version: 0, active: 1, blocked: 0,
    branch_id: "gk-food", name: "Waiter POS"
  };
  let storedOrder = null;
  let settled = false;
  const db = {
    context: {},
    async setContext(next) { this.context = { ...this.context, ...next }; },
    prepare(sql) {
      let values = [];
      const query = {
        bind(...args) { values = args; return query; },
        async first() {
          if (sql.includes("FROM users WHERE id = ?")) return values[0] === waiter.id ? waiter : null;
          if (sql.includes("FROM branches WHERE id = ?")) return branches.find((branch) => branch.id === values[0]) || null;
          if (sql.includes("INSERT INTO order_counters")) return { value: 1051 };
          if (sql.includes("FROM orders WHERE id = ?")) return storedOrder?.id === values[0] ? storedOrder : null;
          if (sql.startsWith("UPDATE orders SET status = ?")) {
            storedOrder = {
              ...storedOrder, status: values[0], updated_at: values[1], history: values[2],
              accepted_at: values[3], prep_minutes: values[4], promised_at: values[5], eta_min: values[6],
              dispatch_state: values[7]
            };
            return storedOrder;
          }
          if (sql.includes("status IN ('pending','preparing','ready')")) {
            return ["pending", "preparing", "ready"].includes(storedOrder?.status) ? { id: storedOrder.id } : null;
          }
          if (sql.includes("COUNT(*) AS n") && sql.includes("cash_settled = 0")) {
            return storedOrder?.status === "delivered" && !storedOrder.cash_settled
              ? { n: 1, total: storedOrder.total } : { n: 0, total: 0 };
          }
          return null;
        },
        async all() {
          if (sql.includes("FROM settings WHERE key IN")) return { results: [
            { key: "paused", value: "false" }, { key: "defaultPrep", value: "20" }, { key: "tableCount", value: "24" }
          ] };
          if (sql.includes("FROM menu_items")) return { results: [{
            id: "construction", name: "Construction", price: 45, dine_price: 45,
            sizes: "[]", extras: "[]", image_url: "", visible: 1, available: 1
          }] };
          return { results: [] };
        },
        async run() {
          if (sql.includes("INSERT INTO orders")) {
            storedOrder = {
              id: values[0], seq: values[1], client_id: null, customer_name: values[2], customer_phone: values[3],
              mode: "dinein", status: "pending", items: values[4], subtotal: values[5], fee: 0,
              service_fee: 0, discount: 0, promo: null, total: values[6], payment: "cash",
              zone_id: null, zone_name: "", address: values[7], address_label: values[8], table_no: values[9],
              note: values[10], delivery_code: values[11], eta_min: values[12], prep_minutes: values[13],
              promised_at: values[14], dispatch_state: "none", history: values[15], created_at: values[16],
              updated_at: values[17], cash_settled: 0, branch_id: "gk-food"
            };
          }
          if (sql.startsWith("UPDATE orders SET cash_settled = 1")) {
            storedOrder.cash_settled = 1;
            settled = true;
          }
          return { success: true };
        }
      };
      return query;
    },
    async batch() { return []; }
  };
  const env = { SESSION_SECRET: "test-session-secret", ALLOWED_ORIGINS: "", DB: db };
  const iat = Math.floor(Date.now() / 1000);
  const token = await signToken(env, { sub: waiter.id, role: waiter.role, tv: 0, iat, exp: iat + 3600 });
  const headers = { Authorization: `Bearer ${token}`, "Content-Type": "application/json", "X-GK-Branch": "gk-food" };

  const publish = await app.fetch(new Request("https://api.test/api/pos/orders", {
    method: "POST", headers,
    body: JSON.stringify({ mode: "dinein", table: 4, items: [{ id: "construction", qty: 1 }], note: "", accept: true })
  }), env);
  assert.equal(publish.status, 200);
  const published = (await publish.json()).order;
  assert.equal(published.status, "preparing");
  assert.equal(published.table_no, 4);
  assert.equal(published.total, 45);

  storedOrder.status = "delivered";
  const settle = await app.fetch(new Request("https://api.test/api/dinein/tables/4/settle", {
    method: "POST", headers, body: "{}"
  }), env);
  assert.equal(settle.status, 200);
  assert.deepEqual(await settle.json(), { ok: true, table: 4, total: 45, orders: 1 });
  assert.equal(settled, true);
});

test("public dine-in order lookup requires the table number and stays on that branch", async () => {
  const order = {
    id: "112345678", seq: 1042, mode: "dinein", status: "preparing", table_no: 4,
    items: "[]", history: "[]", prep_minutes: 15, promised_at: Date.now() + 15 * 60000,
    accepted_at: Date.now(), created_at: Date.now(), updated_at: Date.now(), branch_id: "gk-food"
  };
  const db = mockDb();
  const baseFirst = db.prepare.bind(db);
  db.prepare = (sql) => {
    const query = baseFirst(sql);
    const original = query.first.bind(query);
    query.first = async () => {
      if (sql.includes("FROM orders WHERE id = ?")) return order;
      return original();
    };
    return query;
  };
  const env = { ALLOWED_ORIGINS: "http://localhost:8800", DB: db };
  const headers = { "X-GK-Branch": "gk-food" };
  const ok = await app.fetch(new Request("https://api.test/api/dinein/orders/112345678?table=4", { headers }), env);
  assert.equal(ok.status, 200);
  assert.equal((await ok.json()).order.status, "preparing");
  const wrongTable = await app.fetch(new Request("https://api.test/api/dinein/orders/112345678?table=9", { headers }), env);
  assert.equal(wrongTable.status, 404);
});
