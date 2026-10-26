(() => {
  "use strict";

  const API_URL = window.GK_API_URL || (
    ["localhost", "127.0.0.1"].includes(location.hostname)
      ? "https://oxqfnhnxdnwnftduikkh.supabase.co/functions/v1/gk-api"
      : /(^|\.)gkfood\.store$/.test(location.hostname)
        ? "https://oxqfnhnxdnwnftduikkh.supabase.co/functions/v1/gk-api"
        : "https://oxqfnhnxdnwnftduikkh.supabase.co/functions/v1/gk-api"
  );

  const CHECKS = [
    { id: "api", name: "API G&K", hint: "Edge Function · /health", kind: "json", url: `${API_URL}/health`, ok: body => body?.ok === true && body?.service === "gk-api" },
    { id: "db", name: "Base de données", hint: "Postgres · restaurants", kind: "json", url: `${API_URL}/api/branches`, ok: body => Array.isArray(body?.branches) && body.branches.length > 0, detail: body => `${body.branches.length} restaurant${body.branches.length > 1 ? "s" : ""}` },
    { id: "menu", name: "Menu public", hint: "Carte G&K Food", kind: "json", url: `${API_URL}/api/menu`, headers: { "X-GK-Branch": "gk-food" }, ok: body => Array.isArray(body?.items), detail: body => `${body.items.length} plats` },
    { id: "web", name: "Site vitrine", hint: "gkfood.store", kind: "site", url: "https://gkfood.store/", probe: "https://gkfood.store/assets/emblem.png" },
    { id: "app", name: "Application client", hint: "app.gkfood.store", kind: "site", url: "https://app.gkfood.store/", probe: "https://app.gkfood.store/assets/emblem-reference.png" },
    { id: "kitchen", name: "Cuisine", hint: "kitchen.gkfood.store", kind: "site", url: "https://kitchen.gkfood.store/", probe: "https://kitchen.gkfood.store/assets/emblem-reference.png" },
    { id: "courier", name: "Livreurs", hint: "courier.gkfood.store", kind: "site", url: "https://courier.gkfood.store/", probe: "https://courier.gkfood.store/assets/emblem-reference.png" }
  ];

  const STATUS_FR = {
    investigating: "En cours d'analyse",
    identified: "Identifié",
    monitoring: "Surveillance",
    resolved: "Résolu"
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

  function pingImage(url) {
    return new Promise(resolve => {
      const img = new Image();
      const started = performance.now();
      const finish = ok => {
        img.onload = img.onerror = null;
        resolve({ ok, ms: Math.round(performance.now() - started) });
      };
      const watchdog = setTimeout(() => finish(false), 8000);
      img.onload = () => { clearTimeout(watchdog); finish(true); };
      img.onerror = () => { clearTimeout(watchdog); finish(false); };
      img.src = `${url}${url.includes("?") ? "&" : "?"}cb=${Date.now()}`;
    });
  }

  function timeout(ms) {
    return new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), ms));
  }

  async function pingSite(check) {
    const started = performance.now();
    const image = check.probe ? pingImage(check.probe) : Promise.resolve({ ok: false, ms: 0 });
    const page = (async () => {
      const controller = new AbortController();
      try {
        await Promise.race([
          fetch(check.url, { method: "GET", mode: "no-cors", cache: "no-store", signal: controller.signal }),
          timeout(5000)
        ]);
        return { ok: true, ms: Math.round(performance.now() - started) };
      } finally {
        controller.abort();
      }
    })();
    const settled = await Promise.allSettled([image, page]);
    const hit = settled.map(entry => entry.status === "fulfilled" ? entry.value : null).find(value => value?.ok);
    return hit || { ok: false, ms: Math.round(performance.now() - started) };
  }

  function rowHtml(check, state) {
    const tone = state === "checking" ? "checking" : state.ok ? "ok" : "down";
    const meta = state === "checking" ? "…" : state.ok ? `${state.detail ? esc(state.detail) + " · " : ""}${state.ms} ms` : (state.error || "Indisponible");
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
    headline.textContent = tone === "ok" ? "Tous les systèmes opérationnels" : tone === "warn" ? "Perturbation partielle" : tone === "down" ? "Panne en cours" : "Vérification…";
    lede.textContent = extra || (tone === "ok" ? "API, données et applications répondent." : tone === "checking" ? "Contrôle en cours des services G&K." : "Un ou plusieurs services ne répondent pas correctement.");
    checkedEl.textContent = when ? `Dernière vérification : ${when.toLocaleString("fr-FR")}` : "—";
  }

  async function runCheck(check) {
    try {
      if (check.kind === "site") {
        const result = await pingSite(check);
        return { ok: result.ok, ms: result.ms, error: result.ok ? "" : "Pas de réponse" };
      }
      const { body, ms } = await fetchJson(check.url, check.headers);
      const ok = check.ok(body);
      return { ok, ms, detail: ok && check.detail ? check.detail(body) : "", error: ok ? "" : "Réponse inattendue" };
    } catch (error) {
      return { ok: false, ms: error.ms || 0, error: error.message || "Erreur réseau" };
    }
  }

  async function probe() {
    refreshBtn.disabled = true;
    const states = Object.fromEntries(CHECKS.map(check => [check.id, "checking"]));
    renderChecks(states);
    paintSummary("checking");
    await Promise.all(CHECKS.map(async check => {
      states[check.id] = await runCheck(check);
      renderChecks(states);
    }));
    const tone = overall(states);
    const failed = CHECKS.filter(check => states[check.id] && !states[check.id].ok).map(check => check.name);
    paintSummary(tone, new Date(), failed.length ? `Hors service : ${failed.join(", ")}.` : "");
    refreshBtn.disabled = false;
  }

  function incidentCard(item) {
    const status = STATUS_FR[item.status] || item.status;
    return `<article class="card ${esc(item.status || "")}">
      <header><h3>${esc(item.title)}</h3><span class="pill ${esc(item.severity || item.status)}">${esc(item.severity || status)}</span></header>
      <p>${esc(item.detail || "")}</p>
      <p>${esc(status)}${item.startedAt ? ` · depuis ${new Date(item.startedAt).toLocaleString("fr-FR")}` : ""}${item.updatedAt ? ` · maj ${new Date(item.updatedAt).toLocaleString("fr-FR")}` : ""}</p>
    </article>`;
  }

  function bugCard(item) {
    const open = item.open !== false;
    return `<article class="card ${open ? "open" : "closed"}">
      <header><h3>${esc(item.title)}</h3><span class="pill ${open ? "minor" : "closed"}">${open ? "Ouvert" : "Corrigé"}</span></header>
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
        : `<p class="empty">Aucun incident déclaré.</p>`;
      bugsEl.innerHTML = bugs.length
        ? `<div class="feed">${bugs.map(bugCard).join("")}</div>`
        : `<p class="empty">Aucune anomalie connue pour le moment.</p>`;
    } catch {
      incidentsEl.innerHTML = `<p class="empty">Impossible de charger le journal d'incidents.</p>`;
      bugsEl.innerHTML = `<p class="empty">Impossible de charger les anomalies.</p>`;
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
