(() => {
  "use strict";
  const SCOPE = "ops";
  const api = window.GKApi;
  const app = document.getElementById("app");
  const state = { user: api.session(SCOPE)?.user || null, overview: null, probes: {}, busy: false, error: "", toast: "", pendingMode: "" };
  let timer = 0;

  const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]));
  const fmtTime = (ms) => {
    const s = Math.max(0, Math.floor(Number(ms) / 1000));
    const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60);
    return h ? `${h}h ${m}m` : `${m}m ${s % 60}s`;
  };
  const money = (n) => `${Math.round(Number(n) || 0)} MAD`;
  const toast = (text) => {
    state.toast = text;
    render();
    setTimeout(() => { if (state.toast === text) { state.toast = ""; render(); } }, 2400);
  };

  function loginView() {
    return `<section class="gate">
      <p class="mono" style="color:var(--green);letter-spacing:.2em;font-size:11px">OPS.GKFOOD.STORE</p>
      <h1>Developer console</h1>
      <p>Owner or admin only. This is not the restaurant admin panel.</p>
      <form id="login">
        <div class="field"><label for="email">Email</label><input id="email" name="email" type="email" autocomplete="username" required></div>
        <div class="field"><label for="password">Password</label><input id="password" name="password" type="password" autocomplete="current-password" required></div>
        <label class="check"><input id="as-owner" type="checkbox"> Owner door key</label>
        <div class="field" id="door-wrap" hidden><label for="door">Door key</label><input id="door" name="door" type="password" autocomplete="off"></div>
        <p class="error" id="login-error">${esc(state.error)}</p>
        <button class="btn" type="submit">Enter ops</button>
      </form>
    </section>`;
  }

  function dash() {
    const o = state.overview;
    const ops = o?.ops || { mode: "live", message: "" };
    const proc = o?.process || {};
    const today = o?.today || {};
    const live = o?.live || {};
    const census = o?.census || {};
    const switches = o?.switches || {};
    return `<div class="app">
      <header class="top">
        <div class="brand">
          <img src="./assets/emblem-reference.png" alt="">
          <div><small>Developer ops</small><strong>G&amp;K control</strong></div>
        </div>
        <div style="text-align:right">
          <span class="pill ${esc(ops.mode)}">${esc(ops.mode)}</span>
          <div class="clock mono" id="clock"></div>
          <div class="clock">${esc(state.user?.name || "")} · ${esc(state.user?.role || "")}</div>
        </div>
      </header>

      <section class="panel" style="margin-bottom:14px">
        <h2>Site mode</h2>
        <div class="modes">
          ${[["live", "Live", "Customers order normally"], ["construction", "Construction", "Public apps show works page"], ["incident", "Incident", "Banner only, orders still open"]].map(([id, label, hint]) =>
            `<button class="mode ${id}${(state.pendingMode || ops.mode) === id ? " on" : ""}" type="button" data-act="mode" data-mode="${id}"><b>${label}</b><span class="clock">${hint}</span></button>`
          ).join("")}
        </div>
        <div class="field" style="margin-top:12px"><label for="ops-message">Public message</label>
          <input id="ops-message" value="${esc(ops.message)}" placeholder="We’re upgrading the kitchen printers…"></div>
        <div class="row">
          <button class="btn" type="button" data-act="save-mode">Publish mode</button>
          <button class="btn ghost" type="button" data-act="toggle-pause">${switches.paused ? "Resume orders" : "Pause orders"}</button>
          <button class="btn ghost" type="button" data-act="toggle-delivery">${switches.deliveryOn === false ? "Enable delivery" : "Disable delivery"}</button>
        </div>
      </section>

      <section class="grid metrics" style="margin-bottom:14px">
        ${metric("Today", today.orders ?? "—", "orders")}
        ${metric("Revenue", money(today.revenue), "today")}
        ${metric("Open tickets", today.open ?? "—", "live kitchen")}
        ${metric("Couriers", live.couriersOnline ?? "—", "online now")}
      </section>

      <section class="grid two">
        <div class="panel">
          <h2>Surfaces</h2>
          ${(o?.surfaces || []).map(surfaceRow).join("") || "<p class='clock'>Loading probes…</p>"}
          <div class="row"><button class="btn ghost" type="button" data-act="probe">Re-probe frontends</button></div>
        </div>
        <div class="panel">
          <h2>Runtime</h2>
          <div class="surface"><span>Host</span><b class="mono">${esc(proc.runtime || "—")}</b></div>
          <div class="surface"><span>Region</span><b class="mono">${esc(proc.region || "—")}</b></div>
          <div class="surface"><span>Uptime</span><b class="mono">${fmtTime(proc.uptimeMs)}</b></div>
          <div class="surface"><span>Heap</span><b class="mono">${proc.heapMb != null ? proc.heapMb + " MB" : "—"}</b></div>
          <div class="surface"><span>PID</span><b class="mono">${esc(proc.pid || "—")}</b></div>
          <div class="row">
            <button class="btn ghost" type="button" data-act="warmup">Warm API</button>
            <button class="btn ghost" type="button" data-act="dispatch">Tick dispatch</button>
            <button class="btn danger" type="button" data-act="bounce" ${proc.bounceable ? "" : "disabled"}>Bounce API</button>
          </div>
          <p class="clock">Bounce exits the Fly process so the machine comes back clean. Owner only.</p>
        </div>
      </section>

      <section class="grid two" style="margin-top:14px">
        <div class="panel">
          <h2>Census</h2>
          <div class="surface"><span>Menu items</span><b>${esc(census.menuItems)}</b></div>
          <div class="surface"><span>Staff + clients</span><b>${esc(census.users)}</b></div>
          <div class="surface"><span>Couriers</span><b>${esc(census.couriers)}</b></div>
          <div class="surface"><span>Push devices</span><b>${esc(census.push)}</b></div>
          <div class="surface"><span>Kitchen / en route</span><b>${esc(live.kitchen)} / ${esc(live.enroute)}</b></div>
          <div class="surface"><span>Waiter calls</span><b>${esc(live.waiterCalls)}</b></div>
        </div>
        <div class="panel">
          <h2>Stuck / aging tickets</h2>
          ${(o?.stuck || []).length
            ? o.stuck.map((row) => `<div class="surface"><span>#${esc(row.seq)} · ${esc(row.status)} · ${esc(row.dispatch || "—")}</span><b>${money(row.total)}</b></div>`).join("")
            : "<p class='clock'>Nothing aging out.</p>"}
        </div>
      </section>

      <section class="grid two" style="margin-top:14px">
        <div class="panel">
          <h2>Audit stream</h2>
          <div class="log">${(o?.audit || []).map((row) => `<div><b>${esc(row.action)}</b> · ${esc(row.user)} <span class="mono">${esc(row.detail || "")}</span></div>`).join("") || "—"}</div>
        </div>
        <div class="panel">
          <h2>Staff broadcast</h2>
          <div class="field"><label for="bc-title">Title</label><input id="bc-title" placeholder="Printers back online"></div>
          <div class="field"><label for="bc-text">Text</label><textarea id="bc-text" rows="3" placeholder="Shown in staff notifications"></textarea></div>
          <div class="row">
            <button class="btn" type="button" data-act="broadcast">Send to staff</button>
            <button class="btn ghost" type="button" data-act="logout">Sign out</button>
            <a class="btn ghost" href="https://admin.gkfood.store/">Restaurant admin</a>
            <a class="btn ghost" href="https://status.gkfood.store/">Public status</a>
          </div>
        </div>
      </section>
      <div class="toast${state.toast ? " on" : ""}">${esc(state.toast)}</div>
    </div>`;
  }

  function metric(label, value, hint) {
    return `<div class="panel metric"><span>${esc(label)}</span><b>${esc(value)}</b><span>${esc(hint)}</span></div>`;
  }

  function surfaceRow(surface) {
    const probe = state.probes[surface.id];
    const tone = !probe ? "" : probe.ok ? "ok" : "down";
    const meta = !probe ? "—" : probe.ok ? `${probe.ms} ms` : (probe.error || "down");
    return `<div class="surface"><span><i class="dot ${tone}"></i>${esc(surface.name)}</span><span class="latency mono">${esc(meta)} · <a href="${esc(surface.url)}" target="_blank" rel="noopener">open</a></span></div>`;
  }

  function render() {
    app.innerHTML = state.user ? dash() : loginView();
    const clock = document.getElementById("clock");
    if (clock) clock.textContent = new Date().toLocaleString("fr-FR");
    const owner = document.getElementById("as-owner");
    const wrap = document.getElementById("door-wrap");
    if (owner && wrap) owner.addEventListener("change", () => { wrap.hidden = !owner.checked; });
  }

  async function load() {
    if (!state.user) return render();
    try {
      if (!api.getBranch()) api.setBranch("gk-food");
      state.overview = await api.get("/api/ops/overview", SCOPE);
      state.error = "";
    } catch (error) {
      if (error.status === 401) { state.user = null; }
      state.error = error.message || "Overview failed.";
    }
    render();
    void probeAll();
  }

  async function probeAll() {
    const surfaces = state.overview?.surfaces || [];
    await Promise.all(surfaces.map(async (surface) => {
      const url = surface.probe || surface.url;
      const started = performance.now();
      try {
        if (surface.kind === "health") {
          const response = await fetch(url, { cache: "no-store" });
          const body = await response.json().catch(() => ({}));
          state.probes[surface.id] = { ok: response.ok && body.ok !== false, ms: Math.round(performance.now() - started), error: response.ok ? "" : "HTTP " + response.status };
        } else {
          await fetch(url, { method: "GET", mode: "no-cors", cache: "no-store" });
          state.probes[surface.id] = { ok: true, ms: Math.round(performance.now() - started) };
        }
      } catch {
        state.probes[surface.id] = { ok: false, ms: Math.round(performance.now() - started), error: "unreachable" };
      }
    }));
    if (state.user) render();
  }

  async function run(task, okMessage) {
    if (state.busy) return;
    state.busy = true;
    try {
      await task();
      if (okMessage) toast(okMessage);
      await load();
    } catch (error) {
      toast(error.message || "Failed");
    } finally {
      state.busy = false;
    }
  }

  document.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (event.target.id !== "login") return;
    const form = event.target;
    const owner = form.querySelector("#as-owner")?.checked;
    try {
      const result = await api.post(owner ? "/api/auth/owner" : "/api/auth/staff", {
        email: form.email.value.trim(),
        password: form.password.value,
        ...(owner ? { door: form.door.value } : {})
      });
      if (!["owner", "admin"].includes(result.user?.role)) {
        throw new Error("Ops is reserved for owner and admin.");
      }
      api.setSession(SCOPE, result);
      if (result.branchId) api.setBranch(result.branchId);
      else api.setBranch("gk-food");
      state.user = result.user;
      state.error = "";
      await load();
    } catch (error) {
      state.error = error.message || "Sign-in failed.";
      render();
    }
  });

  document.addEventListener("click", (event) => {
    const el = event.target.closest("[data-act]");
    if (!el) return;
    const act = el.dataset.act;
    if (act === "mode") {
      state.pendingMode = el.dataset.mode;
      render();
      return;
    }
    if (act === "save-mode") {
      const selected = state.pendingMode || state.overview?.ops?.mode || "live";
      const message = document.getElementById("ops-message")?.value || "";
      return run(async () => {
        await api.post("/api/ops/mode", { mode: selected, message }, SCOPE);
        state.pendingMode = "";
      }, `Mode ${selected}`);
    }
    if (act === "toggle-pause") {
      return run(() => api.post("/api/ops/switches", { paused: !state.overview?.switches?.paused }, SCOPE), "Orders switch updated");
    }
    if (act === "toggle-delivery") {
      return run(() => api.post("/api/ops/switches", { deliveryOn: state.overview?.switches?.deliveryOn === false }, SCOPE), "Delivery switch updated");
    }
    if (act === "warmup") return run(() => api.post("/api/ops/warmup", {}, SCOPE), "API warmed");
    if (act === "dispatch") return run(() => api.post("/api/ops/dispatch-tick", {}, SCOPE), "Dispatch ticked");
    if (act === "bounce") {
      if (!window.confirm("Bounce the Fly API process? It will reconnect in a few seconds.")) return;
      return run(async () => {
        await api.post("/api/ops/bounce", {}, SCOPE);
        await new Promise((resolve) => setTimeout(resolve, 2500));
      }, "API bouncing");
    }
    if (act === "probe") return void probeAll();
    if (act === "broadcast") {
      const title = document.getElementById("bc-title")?.value || "";
      const text = document.getElementById("bc-text")?.value || "";
      return run(() => api.post("/api/ops/broadcast", { title, text }, SCOPE), "Broadcast sent");
    }
    if (act === "logout") {
      void api.logout(SCOPE).catch(() => {});
      state.user = null;
      render();
    }
  });

  if (state.user && !["owner", "admin"].includes(state.user.role)) {
    api.clearSession(SCOPE);
    state.user = null;
  }
  render();
  void load();
  timer = setInterval(() => { if (state.user) void load(); }, 20000);
  window.addEventListener("beforeunload", () => clearInterval(timer));
})();
