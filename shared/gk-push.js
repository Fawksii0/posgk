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
  let previousOverflow = null;

  function lockScroll() {
    if (previousOverflow !== null) return;
    previousOverflow = document.documentElement.style.overflow;
    document.documentElement.style.overflow = "hidden";
  }

  function unlockScroll() {
    if (previousOverflow === null) return;
    document.documentElement.style.overflow = previousOverflow;
    previousOverflow = null;
  }

  function removeGate() {
    document.getElementById(GATE_ID)?.remove();
    unlockScroll();
  }

  function gateCopy(reason) {
    if (reason === "denied") return {
      title: "Notifications bloquées",
      text: "Autorisez les notifications pour ce site dans les réglages du navigateur, puis réessayez.",
      action: "Réessayer"
    };
    if (reason === "unsupported") return {
      title: "Installez l'application",
      text: "Les notifications sont obligatoires. Sur iPhone ou iPad, ajoutez l'application à l'écran d'accueil puis ouvrez-la depuis cet icône. Sinon, utilisez un navigateur à jour qui prend en charge les notifications.",
      action: "Vérifier à nouveau"
    };
    if (reason === "subscribe") return {
      title: "Configuration impossible",
      text: "L'application n'a pas pu enregistrer ce téléphone. Vérifiez la connexion puis réessayez.",
      action: "Réessayer"
    };
    return {
      title: "Activez les notifications",
      text: "Les notifications sont nécessaires pour recevoir les nouvelles commandes et les changements de statut, même quand l'application est en arrière-plan.",
      action: "Activer les notifications"
    };
  }

  const BELL_ICON = `<svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="#1b1a17" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M6 17V11a6 6 0 0 1 12 0v6l1.5 2h-15L6 17Z"/><path d="M10 21.5h4"/></svg>`;

  function showGate(options, reason) {
    if (!document.body) return;
    const copy = gateCopy(reason);
    let gate = document.getElementById(GATE_ID);
    if (!gate) {
      gate = document.createElement("div");
      gate.id = GATE_ID;
      gate.setAttribute("role", "dialog");
      gate.setAttribute("aria-modal", "true");
      gate.setAttribute("aria-labelledby", "gk-push-gate-title");
      gate.style.cssText = "position:fixed;inset:0;z-index:2147483647;display:grid;place-items:center;padding:24px;background:rgba(12,10,7,.94);font-family:system-ui,-apple-system,sans-serif";
      gate.innerHTML = `<section style="width:min(100%,420px);padding:28px;border-radius:22px;background:#fff;color:#1b1a17;box-shadow:0 24px 80px rgba(0,0,0,.45);text-align:center">
        <span aria-hidden="true" style="width:56px;height:56px;margin:0 auto 18px;display:grid;place-items:center;border-radius:50%;background:#fff3d1;box-shadow:inset 0 0 0 1px rgba(227,168,31,.32)">${BELL_ICON}</span>
        <h1 id="gk-push-gate-title" data-push-title style="margin:0 0 10px;font-size:22px;line-height:1.25;letter-spacing:-.01em"></h1>
        <p data-push-copy style="margin:0 0 20px;color:#655d50;line-height:1.55"></p>
        <button data-push-enable type="button" style="width:100%;min-height:50px;border:0;border-radius:14px;background:#1b1a17;color:#fff;font:700 15px system-ui;cursor:pointer"></button>
        <button data-push-logout type="button" style="width:100%;min-height:44px;margin-top:8px;border:0;background:none;color:#655d50;font:600 13px system-ui;text-decoration:underline;cursor:pointer">Se déconnecter</button>
        <p data-push-error role="alert" style="min-height:18px;margin:12px 0 0;color:#a1262b;font-size:13px"></p>
      </section>`;
      document.body.appendChild(gate);
    }
    lockScroll();
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
          ? "Les notifications sont toujours bloquées dans les réglages du navigateur."
          : "La configuration n'a pas abouti. Réessayez.";
      }
    };
    gate.querySelector("[data-push-logout]").onclick = () => {
      try { options.api?.clearSession?.(options.scope); } catch { /* ignore */ }
      removeGate();
      location.reload();
    };
    try { button.focus({ preventScroll: true }); } catch { /* ignore */ }
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
