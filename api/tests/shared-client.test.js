import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";

class MemoryStorage {
  constructor() { this.values = new Map(); }
  getItem(key) { return this.values.has(key) ? this.values.get(key) : null; }
  setItem(key, value) { this.values.set(String(key), String(value)); }
  removeItem(key) { this.values.delete(String(key)); }
}

async function clientWith(localStorage = new MemoryStorage(), sessionStorage = new MemoryStorage()) {
  const source = await readFile(new URL("../../shared/gk-api.js", import.meta.url), "utf8");
  const window = { dispatchEvent() {} };
  runInNewContext(source, {
    window, localStorage, sessionStorage,
    location: { hostname: "app.gkfood.store", hash: "", pathname: "/", search: "" },
    history: { replaceState() {} },
    CustomEvent: class {}, fetch: async () => { throw new Error("not used"); },
    atob, btoa, escape, decodeURIComponent
  });
  return { api: window.GKApi, localStorage, sessionStorage };
}

test("browser sessions and branch selection persist in localStorage", async () => {
  const { api, localStorage, sessionStorage } = await clientWith();
  api.setSession("client", { token: "token", refreshToken: "refresh", user: { id: "u1", role: "client" } });
  api.setBranch("gk-food");
  assert.ok(localStorage.getItem("gk-api-session:client"));
  assert.equal(localStorage.getItem("gk-api-branch"), "gk-food");
  assert.equal(sessionStorage.getItem("gk-api-session:client"), null);
  assert.equal(api.session("client").refreshToken, "refresh");
});

test("legacy sessionStorage sessions migrate to persistent storage", async () => {
  const localStorage = new MemoryStorage();
  const sessionStorage = new MemoryStorage();
  sessionStorage.setItem("gk-api-session:courier", JSON.stringify({ token: "legacy", user: { id: "c1" } }));
  const { api } = await clientWith(localStorage, sessionStorage);
  assert.equal(api.session("courier").token, "legacy");
  assert.ok(localStorage.getItem("gk-api-session:courier"));
  assert.equal(sessionStorage.getItem("gk-api-session:courier"), null);
});

test("clearing a session removes persistent and tab-scoped copies", async () => {
  const { api, localStorage, sessionStorage } = await clientWith();
  localStorage.setItem("gk-api-session:admin", "{}");
  sessionStorage.setItem("gk-api-session:admin", "{}");
  api.clearSession("admin");
  assert.equal(localStorage.getItem("gk-api-session:admin"), null);
  assert.equal(sessionStorage.getItem("gk-api-session:admin"), null);
});
