(function (global) {
  "use strict";
  const STORE = { lat: 33.7895, lng: -7.1597 };
  const TILES = "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png";
  const RING_COLORS = ["#e3a81f", "#c48a12", "#8a5a0c", "#3d2a14"];

  function haversineKm(a, b) {
    if (!a || !b || !Number.isFinite(a.lat) || !Number.isFinite(a.lng) || !Number.isFinite(b.lat) || !Number.isFinite(b.lng)) return Infinity;
    const R = 6371, rad = (x) => (x * Math.PI) / 180;
    const dLat = rad(b.lat - a.lat), dLng = rad(b.lng - a.lng);
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(h));
  }

  function fromKm(zone) { return Number(zone?.fromKm ?? zone?.radius_from_km ?? 0); }
  function toKm(zone) { return Number(zone?.toKm ?? zone?.radius_to_km ?? 0); }

  function sortedRings(zones) {
    return (zones || []).filter((zone) => zone && zone.enabled !== false && zone.enabled !== 0 && Number.isFinite(toKm(zone)) && toKm(zone) > 0)
      .slice()
      .sort((a, b) => fromKm(a) - fromKm(b));
  }

  function ringOf(zones, km) {
    const rings = sortedRings(zones);
    for (let i = 0; i < rings.length; i++) {
      const from = fromKm(rings[i]);
      const to = toKm(rings[i]);
      const last = i === rings.length - 1;
      if (Number.isFinite(km) && km >= from && (last ? km <= to : km < to)) return rings[i];
    }
    return null;
  }

  function maxKm(settings, zones) {
    const setting = Number(settings?.maxDeliveryKm);
    if (setting > 0) return setting;
    const rings = sortedRings(zones);
    if (!rings.length) return 15;
    return Math.max(...rings.map(toKm));
  }

  function storeIcon() {
    return window.L.divIcon({
      className: "gkm-marker",
      iconSize: [36, 36],
      iconAnchor: [18, 18],
      html: '<div class="gkm-store">G&amp;K</div>'
    });
  }

  function pinIcon() {
    return window.L.divIcon({
      className: "gkm-marker",
      iconSize: [28, 36],
      iconAnchor: [14, 34],
      html: '<div class="gk-pin"></div>'
    });
  }

  function mount(el, options = {}) {
    if (!el || !window.L) return null;
    if (el._gkRings) {
      el._gkRings.remove();
      el._gkRings = null;
    }
    const store = options.store || STORE;
    const rings = sortedRings(options.zones);
    const map = window.L.map(el, { zoomControl: true, attributionControl: true, dragging: options.interactive !== false, scrollWheelZoom: options.interactive !== false });
    window.L.tileLayer(TILES, { maxZoom: 19, attribution: "&copy; OpenStreetMap" }).addTo(map);
    window.L.marker([store.lat, store.lng], { icon: storeIcon(), keyboard: false, zIndexOffset: -400 }).addTo(map);
    rings.forEach((zone, index) => {
      window.L.circle([store.lat, store.lng], {
        radius: toKm(zone) * 1000,
        color: RING_COLORS[index % RING_COLORS.length],
        weight: 2,
        fillColor: RING_COLORS[index % RING_COLORS.length],
        fillOpacity: 0.08
      }).addTo(map);
    });
    let marker = null;
    function setPin(lat, lng) {
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
      if (marker) marker.setLatLng([lat, lng]);
      else marker = window.L.marker([lat, lng], { icon: pinIcon(), draggable: !!options.onPick, keyboard: false }).addTo(map);
      if (options.onPick && marker && !marker._gkBound) {
        marker._gkBound = true;
        marker.on("dragend", () => {
          const pos = marker.getLatLng();
          options.onPick(pos.lat, pos.lng);
        });
      }
    }
    if (Number.isFinite(options.lat) && Number.isFinite(options.lng)) setPin(options.lat, options.lng);
    if (options.onPick) {
      map.on("click", (event) => {
        setPin(event.latlng.lat, event.latlng.lng);
        options.onPick(event.latlng.lat, event.latlng.lng);
      });
    }
    const pts = [[store.lat, store.lng]];
    if (Number.isFinite(options.lat) && Number.isFinite(options.lng)) pts.push([options.lat, options.lng]);
    const farthest = rings.length ? toKm(rings[rings.length - 1]) : 15;
    window.L.circle([store.lat, store.lng], { radius: farthest * 1000, stroke: false, fill: false }).addTo(map);
    map.fitBounds(window.L.latLng(store.lat, store.lng).toBounds(farthest * 1000 * 2.05), { padding: [24, 24], maxZoom: 13 });
    requestAnimationFrame(() => map.invalidateSize());
    el._gkRings = map;
    el._gkSetPin = setPin;
    return map;
  }

  global.GKDelivery = { STORE, haversineKm, ringOf, maxKm, fromKm, toKm, sortedRings, mount };
})(typeof window !== "undefined" ? window : globalThis);
