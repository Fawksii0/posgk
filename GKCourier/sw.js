const VERSION = "gk-courier-v38";
const SHELL = [
  "./", "./index.html", "./styles.css", "./data.js", "./store.js", "./app.js", "./manifest.webmanifest",
  "./assets/emblem-reference.png", "./icons/icon-192.png", "./icons/icon-512.png", "./icons/apple-touch-icon.png",
  "../shared/gk-api.js", "../shared/gk-sound.js", "../shared/gk-live-scene.css", "../shared/gk-motion-live.js"
];

self.addEventListener("install", event => {
  event.waitUntil(caches.open(VERSION).then(cache => cache.addAll(SHELL.map(u => new Request(u, { cache: "reload" })))).then(() => self.skipWaiting()));
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(key => key.startsWith("gk-courier-") && key !== VERSION).map(key => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

// Stale-while-revalidate for the shell, images and fonts.
self.addEventListener("fetch", event => {
  const { request } = event;
  if (request.method !== "GET" || !request.url.startsWith("http")) return;
  const url = new URL(request.url);
  const lottieAsset = url.pathname.includes("/shared/animations/") || url.pathname.includes("/shared/vendor/dotlottie/");
  const live = request.mode === "navigate" || /(?:\/|index\.html|sw\.js)$/.test(url.pathname);
  if (live || (url.pathname.includes("/shared/") && !lottieAsset)) {
    event.respondWith(fetch(request).then(response => {
      if (response.ok && request.mode === "navigate") {
        caches.open(VERSION).then(cache => cache.put(request, response.clone())).catch(() => {});
      }
      return response;
    }).catch(() => caches.match(request).then(hit => hit || Response.error())));
    return;
  }
  event.respondWith(
    caches.open(VERSION).then(async cache => {
      const cached = await cache.match(request);
      const network = fetch(request).then(response => {
        if (response.ok || response.type === "opaque") cache.put(request, response.clone());
        return response;
      }).catch(() => cached || Response.error());
      return cached || network;
    })
  );
});

self.addEventListener("push", event => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch { data = {}; }
  event.waitUntil(self.registration.showNotification(data.title || "G&K Food", {
    body: data.text || "",
    icon: "./icons/icon-192.png",
    badge: "./icons/icon-192.png",
    data: { url: data.url || "./" }
  }));
});
self.addEventListener("notificationclick", event => {
  event.notification.close();
  const target = (event.notification.data && event.notification.data.url) || "./";
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const client of windows) { if ("focus" in client) { await client.focus(); return; } }
    if (self.clients.openWindow) await self.clients.openWindow(target);
  })());
});

