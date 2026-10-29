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

  const GATE_ID = "gk-required-notifications";

  function removeGate() {
    document.getElementById(GATE_ID)?.remove();
  }

  function gateCopy(reason) {
    if (reason === "denied") return {
      title: "Notifications required",
      text: "Notifications are blocked. Open this site's browser settings, allow notifications, then retry.",
      action: "Retry"
    };
    if (reason === "unsupported") return {
      title: "Install the app",
      text: "Push notifications are required. On iPhone or iPad, add this app to the Home Screen and open it there. Otherwise use an up-to-date browser that supports notifications.",
      action: "Check again"
    };
    if (reason === "subscribe") return {
      title: "Notification setup failed",
      text: "The app could not register this phone. Check the connection and retry before continuing.",
      action: "Retry"
    };
    return {
      title: "Enable notifications",
      text: "Notifications are required so new orders and status changes reach this phone even when the app is in the background.",
      action: "Enable notifications"
    };
  }

  function showGate(options, reason) {
    if (!document.body) return;
    const copy = gateCopy(reason);
    let gate = document.getElementById(GATE_ID);
    if (!gate) {
      gate = document.createElement("div");
      gate.id = GATE_ID;
      gate.setAttribute("role", "dialog");
      gate.setAttribute("aria-modal", "true");
      gate.style.cssText = "position:fixed;inset:0;z-index:2147483647;display:grid;place-items:center;padding:24px;background:rgba(12,10,7,.94);font-family:system-ui,-apple-system,sans-serif";
      gate.innerHTML = `<section style="width:min(100%,420px);padding:28px;border-radius:22px;background:#fff;color:#17130d;box-shadow:0 24px 80px rgba(0,0,0,.45);text-align:center">
        <div aria-hidden="true" style="width:58px;height:58px;margin:0 auto 16px;display:grid;place-items:center;border-radius:50%;background:#fff3cf;font-size:28px">🔔</div>
        <h1 data-push-title style="margin:0 0 10px;font-size:23px;line-height:1.2"></h1>
        <p data-push-copy style="margin:0 0 20px;color:#655d50;line-height:1.5"></p>
        <button data-push-enable type="button" style="width:100%;min-height:50px;border:0;border-radius:14px;background:#17130d;color:#fff;font:700 15px system-ui;cursor:pointer"></button>
        <p data-push-error role="alert" style="min-height:18px;margin:12px 0 0;color:#a1262b;font-size:13px"></p>
      </section>`;
      document.body.appendChild(gate);
    }
    gate.querySelector("[data-push-title]").textContent = copy.title;
    gate.querySelector("[data-push-copy]").textContent = copy.text;
    const button = gate.querySelector("[data-push-enable]");
    button.textContent = copy.action;
    button.disabled = false;
    button.onclick = async () => {
      button.disabled = true;
      gate.querySelector("[data-push-error]").textContent = "";
      if (reason === "unsupported") {
        location.reload();
        return;
      }
      const result = await enable({ ...options, prompt: true, fromGate: true });
      if (!result.ok) {
        button.disabled = false;
        gate.querySelector("[data-push-error]").textContent = result.reason === "denied"
          ? "Notifications are still blocked in browser settings."
          : "Setup did not complete. Please retry.";
      }
    };
  }

  async function enable({ api, scope, app, prompt = true, fromGate = false }) {
    const options = { api, scope, app };
    if (!supported() || !api || !scope) {
      if (prompt) showGate(options, "unsupported");
      return { ok: false, reason: "unsupported" };
    }
    if (!api.session(scope)?.token) {
      removeGate();
      return { ok: false, reason: "session" };
    }
    let permission = Notification.permission;
    if (permission === "default") {
      if (!prompt) return { ok: false, reason: "default" };
      if (!fromGate && !navigator.userActivation?.isActive) {
        showGate(options, "default");
        return { ok: false, reason: "default" };
      }
      try { permission = await Notification.requestPermission(); } catch { permission = "denied"; }
    }
    if (permission !== "granted") {
      if (prompt) showGate(options, permission);
      return { ok: false, reason: permission };
    }
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
      removeGate();
      return { ok: true };
    } catch {
      if (prompt) showGate(options, "subscribe");
      return { ok: false, reason: "subscribe" };
    }
  }

  window.GKPush = { supported, enable, require: (options) => enable({ ...options, prompt: true }) };
})();
