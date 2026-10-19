import test from "node:test";
import assert from "node:assert/strict";
import { webcrypto } from "node:crypto";
import app from "../src/index.js";
import { signToken } from "../src/lib.js";
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
          if (sql.includes("SELECT name FROM branches WHERE id = ?")) return branches.find((branch) => branch.id === values[0]) || null;
          if (sql.includes("FROM branches WHERE id = ?")) return branches.find((branch) => branch.id === values[0] && branch.active) || null;
          return null;
        },
        async all() {
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
