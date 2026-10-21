// Live courier map shared by the Admin portal and the Kitchen. Needs shared/vendor/leaflet and GKApi.
(function () {
  "use strict";
  const TILES = "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png";
  const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const initials = (name) => String(name || "?").trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join("").toUpperCase();
  const STEP = { preparing: "En préparation", ready: "Prête", enroute: "En route" };

  function ago(ms) {
    const s = Math.max(0, Math.round(ms / 1000));
    if (s < 45) return "à l'instant";
    const m = Math.round(s / 60);
    return m < 60 ? `il y a ${m} min` : `il y a ${Math.round(m / 60)} h`;
  }

  function courierIcon(c, stale) {
    return L.divIcon({
      className: "gkm-marker", iconSize: [44, 52], iconAnchor: [22, 48],
      html: `<div class="gkm-pin${c.orders.length ? " busy" : ""}${stale ? " stale" : ""}"><span>${esc(initials(c.name))}</span></div><div class="gkm-name">${esc(c.name)}</div>`
    });
  }

  // options: { scope, orderId?, list?: boolean, interval?: ms, logo?: url }
  function mount(options = {}) {
    if (!window.L) throw new Error("La bibliothèque de carte n'est pas chargée.");
    const el = document.createElement("div");
    el.className = "gkmap-wrap";
    el.innerHTML = `<div class="gkmap"></div>${options.list ? `<aside class="gkm-list" aria-label="Livreurs"></aside>` : ""}<div class="gkm-status" role="status"></div>`;
    const mapEl = el.querySelector(".gkmap");
    const listEl = el.querySelector(".gkm-list");
    const statusEl = el.querySelector(".gkm-status");
    const map = L.map(mapEl, { zoomControl: true, attributionControl: true }).setView([33.7895, -7.1597], 14);
    L.tileLayer(TILES, { maxZoom: 19, attribution: "&copy; OpenStreetMap" }).addTo(map);

    const markers = new Map();
    let storeMarker = null, timer = null, fitted = false, destroyed = false, loading = false, last = null, focusId = null;

    function render(data) {
      last = data;
      const now = data.now || Date.now();
      let couriers = data.couriers;
      if (options.orderId) couriers = couriers.filter((c) => c.orders.some((o) => String(o.id) === String(options.orderId)));
      if (data.store && !storeMarker) {
        storeMarker = L.marker([data.store.lat, data.store.lng], {
          icon: L.divIcon({ className: "gkm-marker", iconSize: [40, 40], iconAnchor: [20, 20], html: `<div class="gkm-store">${options.logo ? `<img src="${esc(options.logo)}" alt="Restaurant">` : "Youmi"}</div>` }),
          zIndexOffset: -500, keyboard: false
        }).addTo(map);
      }
      const seen = new Set();
      couriers.forEach((c) => {
        seen.add(c.id);
        const stale = now - (c.lastSeen || 0) > 90000;
        const tip = `<b>${esc(c.name)}</b>${c.vehicle ? ` · ${esc(c.vehicle)}` : ""}<br>${ago(now - (c.lastSeen || 0))}${c.orders.map((o) => `<br>#${esc(o.seq || o.id)} · ${esc(STEP[o.status] || o.status)}${o.zone ? ` · ${esc(o.zone)}` : ""}`).join("")}`;
        let m = markers.get(c.id);
        if (!m) {
          m = L.marker([c.lat, c.lng], { icon: courierIcon(c, stale), keyboard: false }).addTo(map).bindPopup(tip);
          markers.set(c.id, m);
        } else {
          m.setLatLng([c.lat, c.lng]); m.setIcon(courierIcon(c, stale)); m.setPopupContent(tip);
        }
      });
      for (const [id, m] of markers) if (!seen.has(id)) { m.remove(); markers.delete(id); }

      if (!fitted || (options.orderId && couriers.length)) {
        const pts = couriers.map((c) => [c.lat, c.lng]);
        if (data.store) pts.push([data.store.lat, data.store.lng]);
        if (pts.length > 1) map.fitBounds(pts, { padding: [60, 60], maxZoom: 16, animate: fitted });
        else if (pts.length) map.setView(pts[0], 15);
        fitted = !!pts.length || fitted;
      }
      statusEl.textContent = couriers.length ? "" : (options.orderId ? "Position du livreur indisponible pour le moment." : "Aucun livreur en ligne avec une position.");
      statusEl.hidden = !!couriers.length;

      if (listEl) {
        listEl.innerHTML = `<h4>Livreurs en ligne <span>${couriers.length}</span></h4>` + (couriers.length ? couriers.map((c) => {
          const stale = now - (c.lastSeen || 0) > 90000;
          return `<button type="button" class="gkm-row${focusId === c.id ? " on" : ""}" data-courier="${esc(c.id)}"><span class="gkm-dot${c.orders.length ? " busy" : ""}${stale ? " stale" : ""}"></span><span><b>${esc(c.name)}</b><small>${c.orders.length ? c.orders.map((o) => "#" + esc(o.seq || o.id)).join(", ") + " · en mission" : "Disponible"} · ${ago(now - (c.lastSeen || 0))}</small></span></button>`;
        }).join("") : `<p class="gkm-empty">Personne n'est en ligne.</p>`);
      }
    }

    async function poll() {
      if (destroyed || loading || document.hidden) return;
      loading = true;
      try { render(await window.GKApi.get("/api/live/couriers", options.scope)); }
      catch (error) { statusEl.hidden = false; statusEl.textContent = error.message || "Carte indisponible."; }
      finally { loading = false; }
    }

    el.addEventListener("click", (event) => {
      const row = event.target.closest("[data-courier]");
      if (!row) return;
      focusId = row.dataset.courier;
      const m = markers.get(focusId);
      if (m) { map.setView(m.getLatLng(), Math.max(map.getZoom(), 16)); m.openPopup(); }
      if (last) render(last);
    });

    poll();
    timer = setInterval(poll, options.interval || 5000);
    const onVisible = () => { if (!document.hidden) poll(); };
    document.addEventListener("visibilitychange", onVisible);

    // The element is created detached and sized later, so fit again once it has a real size.
    let interacted = false;
    map.on("dragstart zoomstart", (e) => { if (e.originalEvent || e.type === "dragstart") interacted = true; });
    const ro = new ResizeObserver(() => {
      map.invalidateSize();
      if (!interacted && last) { fitted = false; render(last); }
    });
    ro.observe(el);

    return {
      el,
      refresh: poll,
      invalidate() { map.invalidateSize(); },
      destroy() { destroyed = true; clearInterval(timer); ro.disconnect(); document.removeEventListener("visibilitychange", onVisible); map.remove(); el.remove(); }
    };
  }

  window.GKMap = Object.freeze({ mount });
})();
