(() => {
  "use strict";

  const API_URL = window.GK_API_URL || "https://gk-api-paris.fly.dev";

  const CHECKS = [
    { id: "api", name: "G&K API", hint: "Always-on Node · /health", kind: "health" },
    { id: "db", name: "Database", hint: "Postgres · restaurants", kind: "health" },
    { id: "menu", name: "Public menu", hint: "G&K Food catalog", kind: "health" },
    { id: "web", name: "Landing site", hint: "gkfood.store", kind: "site", url: "https://gkfood.store/", probe: "https://gkfood.store/ok.txt" },
    { id: "app", name: "Customer app", hint: "app.gkfood.store", kind: "site", url: "https://app.gkfood.store/", probe: "https://app.gkfood.store/ok.txt" },
    { id: "kitchen", name: "Kitchen", hint: "kitchen.gkfood.store", kind: "site", url: "https://kitchen.gkfood.store/", probe: "https://kitchen.gkfood.store/ok.txt" },
    { id: "courier", name: "Couriers", hint: "courier.gkfood.store", kind: "site", url: "https://courier.gkfood.store/", probe: "https://courier.gkfood.store/ok.txt" },
    { id: "waiter", name: "Waiter", hint: "serveur.gkfood.store", kind: "site", url: "https://serveur.gkfood.store/", probe: "https://serveur.gkfood.store/ok.txt" },
    { id: "qr", name: "QR menu", hint: "menu.gkfood.store", kind: "site", url: "https://menu.gkfood.store/", probe: "https://menu.gkfood.store/ok.txt" }
  ];

  const STATUS_EN = {
    investigating: "Investigating",
    identified: "Identified",
    monitoring: "Monitoring",
    resolved: "Resolved"
  };

  const checksEl = document.querySelector("#checks");
  const incidentsEl = document.querySelector("#incidents");
  const bugsEl = document.querySelector("#bugs");
  const headline = document.querySelector("#headline");
  const lede = document.querySelector("#lede");
  const checkedEl = document.querySelector("#checked");
  const summary = document.querySelector("#summary");
  const refreshBtn = document.querySelector("#refresh");
  let timer = 0;

  const esc = value => String(value ?? "").replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));

  function headers(extra = {}) {
    return { Accept: "application/json", "x-region": "eu-west-3", ...extra };
  }

  async function fetchJson(url, extra = {}) {
    const started = performance.now();
    const response = await fetch(url, { cache: "no-store", headers: headers(extra) });
    const ms = Math.round(performance.now() - started);
    let body = null;
    try { body = await response.json(); } catch { body = null; }
    if (!response.ok) throw Object.assign(new Error("HTTP " + response.status), { ms });
    return { body, ms };
  }

  function timeout(ms) {
    return new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), ms));
  }

  async function pingSite(check) {
    const url = check.probe || check.url;
    const started = performance.now();
    const controller = new AbortController();
    try {
      await Promise.race([
        fetch(url, { method: "GET", mode: "no-cors", cache: "no-store", signal: controller.signal }),
        timeout(4000)
      ]);
      return { ok: true, ms: Math.round(performance.now() - started) };
    } catch {
      return { ok: false, ms: Math.round(performance.now() - started) };
    } finally {
      controller.abort();
    }
  }

  function rowHtml(check, state) {
    const tone = state === "checking" ? "checking" : state.ok ? "ok" : "down";
    const meta = state === "checking" ? "…" : state.ok ? `${state.detail ? esc(state.detail) + " · " : ""}${state.ms} ms` : (state.error || "Unavailable");
    return `<li class="check" data-id="${esc(check.id)}"><i class="dot ${tone}" aria-hidden="true"></i><div><b>${esc(check.name)}</b><small>${esc(check.hint)}</small></div><span class="meta">${esc(meta)}</span></li>`;
  }

  function renderChecks(states) {
    checksEl.innerHTML = CHECKS.map(check => rowHtml(check, states[check.id] || "checking")).join("");
  }

  function overall(states) {
    const values = CHECKS.map(check => states[check.id]).filter(state => state && state !== "checking");
    if (!values.length) return "checking";
    const down = values.filter(state => !state.ok).length;
    if (down === 0) return "ok";
    if (down === values.length) return "down";
    return "warn";
  }

  function paintSummary(tone, when, extra) {
    summary.className = `hero ${tone === "checking" ? "" : tone}`.trim();
    headline.textContent = tone === "ok" ? "All systems operational" : tone === "warn" ? "Partial disruption" : tone === "down" ? "Outage in progress" : "Checking…";
    lede.textContent = extra || (tone === "ok" ? "API, data, and apps are responding." : tone === "checking" ? "Running live checks on G&K services." : "One or more services are not responding correctly.");
    checkedEl.textContent = when ? `Last check: ${when.toLocaleString("en-GB")}` : "—";
  }

  function healthStates(body, ms) {
    const up = body?.ok === true && body?.service === "gk-api" && body?.database === "up";
    const host = body?.host ? `${body.host} · ` : "";
    return {
      api: { ok: up, ms, detail: `${host}server ${body?.ms ?? ms} ms`, error: up ? "" : (body?.database === "down" ? "Database down" : "API down") },
      db: { ok: up && Number(body?.branches) > 0, ms, detail: `${body?.branches || 0} restaurant${Number(body?.branches) === 1 ? "" : "s"}`, error: "No restaurants" },
      menu: { ok: up && Number(body?.menuItems) > 0, ms, detail: `${body?.menuItems || 0} items`, error: "Empty menu" }
    };
  }

  async function runCheck(check) {
    try {
      const result = await pingSite(check);
      return { ok: result.ok, ms: result.ms, error: result.ok ? "" : "No response" };
    } catch (error) {
      return { ok: false, ms: error.ms || 0, error: error.message || "Network error" };
    }
  }

  async function probe() {
    refreshBtn.disabled = true;
    const states = Object.fromEntries(CHECKS.map(check => [check.id, "checking"]));
    renderChecks(states);
    paintSummary("checking");
    try {
      const { body, ms } = await fetchJson(`${API_URL}/health`);
      Object.assign(states, healthStates(body, ms));
    } catch (error) {
      const failed = { ok: false, ms: error.ms || 0, error: error.message || "Network error" };
      states.api = states.db = states.menu = failed;
    }
    renderChecks(states);
    const siteChecks = CHECKS.filter(check => check.kind === "site");
    for (const check of siteChecks) {
      states[check.id] = await runCheck(check);
      renderChecks(states);
    }
    const tone = overall(states);
    const failed = CHECKS.filter(check => states[check.id] && !states[check.id].ok).map(check => check.name);
    paintSummary(tone, new Date(), failed.length ? `Down: ${failed.join(", ")}.` : "");
    refreshBtn.disabled = false;
  }

  function incidentCard(item) {
    const status = STATUS_EN[item.status] || item.status;
    return `<article class="card ${esc(item.status || "")}">
      <header><h3>${esc(item.title)}</h3><span class="pill ${esc(item.severity || item.status)}">${esc(item.severity || status)}</span></header>
      <p>${esc(item.detail || "")}</p>
      <p>${esc(status)}${item.startedAt ? ` · since ${new Date(item.startedAt).toLocaleString("en-GB")}` : ""}${item.updatedAt ? ` · updated ${new Date(item.updatedAt).toLocaleString("en-GB")}` : ""}</p>
    </article>`;
  }

  function bugCard(item) {
    const open = item.open !== false;
    return `<article class="card ${open ? "open" : "closed"}">
      <header><h3>${esc(item.title)}</h3><span class="pill ${open ? "minor" : "closed"}">${open ? "Open" : "Fixed"}</span></header>
      <p>${esc(item.detail || "")}</p>
    </article>`;
  }

  async function loadFeed() {
    try {
      const response = await fetch(`./incidents.json?v=${Date.now()}`, { cache: "no-store" });
      const data = await response.json();
      const openIncidents = (data.incidents || []).filter(item => item.status && item.status !== "resolved");
      const resolved = (data.incidents || []).filter(item => item.status === "resolved").slice(0, 5);
      const bugs = data.bugs || [];
      incidentsEl.innerHTML = openIncidents.length || resolved.length
        ? `<div class="feed">${[...openIncidents, ...resolved].map(incidentCard).join("")}</div>`
        : `<p class="empty">No incidents reported.</p>`;
      bugsEl.innerHTML = bugs.length
        ? `<div class="feed">${bugs.map(bugCard).join("")}</div>`
        : `<p class="empty">No known issues right now.</p>`;
    } catch {
      incidentsEl.innerHTML = `<p class="empty">Could not load the incident log.</p>`;
      bugsEl.innerHTML = `<p class="empty">Could not load known issues.</p>`;
    }
  }

  function start() {
    probe();
    loadFeed();
    clearInterval(timer);
    timer = setInterval(probe, 60000);
  }

  refreshBtn.addEventListener("click", () => { start(); });
  start();
})();
