document.getElementById("yr").textContent = new Date().getFullYear();

function applyOpsMode(settings) {
  const mode = settings?.opsMode || "live";
  const message = String(settings?.opsMessage || "").trim();
  const screen = document.getElementById("construction-screen");
  const copy = document.getElementById("construction-copy");
  const banner = document.getElementById("ops-banner");
  const construction = mode === "construction";
  document.body.classList.toggle("is-construction", construction);
  if (screen) {
    screen.hidden = !construction;
    if (copy) copy.textContent = message || "G&K Food est en construction. Le site commande est temporairement fermé.";
  }
  if (banner) {
    if (mode === "incident") {
      banner.hidden = false;
      banner.textContent = message || "Incident en cours — les commandes peuvent être ralenties.";
    } else {
      banner.hidden = true;
    }
  }
}

function loadOpsMode() {
  fetch("https://api.gkfood.store/api/settings/public", { cache: "no-store", headers: { "X-GK-Branch": "gk-food" } })
    .then((response) => response.json())
    .then((body) => applyOpsMode(body?.settings || {}))
    .catch(() => {});
}

loadOpsMode();
setInterval(loadOpsMode, 20000);

const PHOTOS = [];
const gallery = document.getElementById("gallery");
PHOTOS.forEach((name) => {
  const img = new Image();
  img.alt = "G&K Food";
  img.loading = "lazy";
  img.addEventListener("load", () => { gallery.hidden = false; gallery.appendChild(img); });
  img.src = `assets/gallery/${name}`;
});
