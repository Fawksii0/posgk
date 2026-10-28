(() => {
  "use strict";

  function bytesFromBase64Url(value) {
    const pad = "=".repeat((4 - (value.length % 4)) % 4);
    const raw = atob((value + pad).replace(/-/g, "+").replace(/_/g, "/"));
    const out = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i += 1) out[i] = raw.charCodeAt(i);
    return out;
  }

  function supported() {
    return typeof window !== "undefined"
      && window.isSecureContext
      && "serviceWorker" in navigator
      && "PushManager" in window
      && "Notification" in window;
  }

  async function enable({ api, scope, app, prompt = true }) {
    if (!supported() || !api || !scope) return { ok: false, reason: "unsupported" };
    if (!api.session(scope)?.token) return { ok: false, reason: "session" };
    let permission = Notification.permission;
    if (permission === "default") {
      if (!prompt) return { ok: false, reason: "default" };
      try { permission = await Notification.requestPermission(); } catch { permission = "denied"; }
    }
    if (permission !== "granted") return { ok: false, reason: permission };
    try {
      const vapid = await api.get("/api/push/vapid", scope);
      const registration = await navigator.serviceWorker.ready;
      let subscription = await registration.pushManager.getSubscription();
      if (!subscription) {
        subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: bytesFromBase64Url(vapid.publicKey)
        });
      }
      await api.post("/api/push/subscribe", { ...subscription.toJSON(), app }, scope);
      return { ok: true };
    } catch {
      return { ok: false, reason: "subscribe" };
    }
  }

  window.GKPush = { supported, enable };
})();
