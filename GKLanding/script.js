document.getElementById("yr").textContent = new Date().getFullYear();

function applyOpsMode(settings) {
  const mode = settings?.opsMode || "live";
  const message = String(settings?.opsMessage || "").trim();
  const screen = document.getElementById("construction-screen");
  const copy = document.getElementById("construction-copy");
  const banner = document.getElementById("ops-banner");
  const construction = mode === "construction";
  document.body.classList.toggle("is-construction", construction);
  screen.hidden = !construction;
  if (copy) copy.textContent = message || "G&K Food is temporarily unavailable while we prepare the restaurant.";
  if (mode === "incident") {
    banner.hidden = false;
    banner.textContent = message || "Service disruption: orders may be delayed.";
  } else {
    banner.hidden = true;
  }
}

function loadOpsMode() {
  fetch("https://gk-api-paris.fly.dev/api/settings/public", { cache: "no-store", headers: { "X-GK-Branch": "gk-food" } })
    .then((response) => {
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return response.json();
    })
    .then((body) => applyOpsMode(body?.settings || {}))
    .catch(() => {});
}

loadOpsMode();
setInterval(loadOpsMode, 20000);

// Add photos to assets/gallery/ and list their file names here (e.g. "plat1.jpg"); the gallery appears once one loads.
const PHOTOS = [];
const gallery = document.getElementById("gallery");
PHOTOS.forEach((name) => {
  const img = new Image();
  img.alt = "G&K Food";
  img.loading = "lazy";
  img.addEventListener("load", () => { gallery.hidden = false; gallery.appendChild(img); });
  img.src = `assets/gallery/${name}`;
});
