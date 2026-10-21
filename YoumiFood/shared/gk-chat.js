// Order chat sheet shared by the client and courier apps (needs GKApi).
(function () {
  "use strict";
  const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const hhmm = (ts) => new Date(ts).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
  const ICON = {
    send: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 3 10 14M21 3l-7 18-4-7-7-4z"/></svg>',
    phone: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 4.5h4l1.5 4-2.2 1.4a11 11 0 0 0 5.8 5.8l1.4-2.2 4 1.5v4a2 2 0 0 1-2 2A15.5 15.5 0 0 1 3 6.5a2 2 0 0 1 2-2Z"/></svg>',
    wa: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 20l1.2-4A8 8 0 1 1 8 18.8z"/><path d="M9 9c0 3 3 6 6 6l1-1.5-2-1-1 .7a4 4 0 0 1-2-2l.7-1-1-2z"/></svg>',
    close: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg>'
  };

  // Moroccan numbers: 06… / 07… become +212…
  function international(phone) {
    const digits = String(phone || "").replace(/[^\d+]/g, "");
    if (digits.startsWith("+")) return digits;
    if (digits.startsWith("00")) return `+${digits.slice(2)}`;
    if (digits.startsWith("0")) return `+212${digits.slice(1)}`;
    return digits ? `+${digits}` : "";
  }
  function contactLinks(phone) {
    const n = international(phone);
    return n.length > 6 ? { tel: `tel:${n}`, wa: `https://wa.me/${n.slice(1)}` } : null;
  }

  let current = null;

  // options: { scope, orderId, title, quick?: string[], onClose?, onMessage? }
  function open(options) {
    if (current) current.close();
    const root = document.createElement("div");
    root.className = "gkc-overlay";
    root.innerHTML = `<div class="gkc-sheet" role="dialog" aria-modal="true" aria-label="Messagerie">
      <header class="gkc-head"><span class="gkc-avatar"></span><div class="gkc-who"><b></b><small></small></div><div class="gkc-actions"></div><button type="button" class="gkc-x" aria-label="Fermer">${ICON.close}</button></header>
      <div class="gkc-list" aria-live="polite"></div>
      <p class="gkc-error" role="alert" hidden></p>
      <p class="gkc-closed" hidden>La conversation est terminée.</p>
      <div class="gkc-quick"></div>
      <form class="gkc-form" autocomplete="off"><input type="text" maxlength="500" placeholder="Écrire un message…" aria-label="Message" enterkeyhint="send"><button type="submit" aria-label="Envoyer">${ICON.send}</button></form>
    </div>`;
    document.body.appendChild(root);
    const $ = (s) => root.querySelector(s);
    const list = $(".gkc-list"), form = $(".gkc-form"), input = form.querySelector("input"), errorEl = $(".gkc-error");
    $(".gkc-who b").textContent = options.title || "Messagerie";

    let lastId = 0, messages = [], peer = null, canSend = true, first = true, busy = false, closed = false, sending = false;

    function renderHeader() {
      const name = peer?.name || options.title || "";
      $(".gkc-avatar").textContent = (name[0] || "?").toUpperCase();
      $(".gkc-who b").textContent = name || options.title || "Messagerie";
      $(".gkc-who small").textContent = options.subtitle || "";
      const links = contactLinks(peer?.phone);
      $(".gkc-actions").innerHTML = links
        ? `<a class="gkc-act" href="${esc(links.tel)}" aria-label="Appeler">${ICON.phone}<span>Appeler</span></a><a class="gkc-act" href="${esc(links.wa)}" target="_blank" rel="noopener" aria-label="WhatsApp">${ICON.wa}<span>WhatsApp</span></a>`
        : "";
    }
    function renderList(stick) {
      list.innerHTML = messages.length
        ? messages.map((m) => `<div class="gkc-msg ${m.mine ? "mine" : "theirs"}"><p>${esc(m.body)}</p><time>${hhmm(m.at)}</time></div>`).join("")
        : `<p class="gkc-empty">Aucun message pour l'instant.<br>Écrivez pour vous coordonner.</p>`;
      if (stick) list.scrollTop = list.scrollHeight;
    }
    function renderState() {
      form.hidden = !canSend;
      $(".gkc-closed").hidden = canSend;
      const quick = canSend ? options.quick || [] : [];
      $(".gkc-quick").innerHTML = quick.map((q) => `<button type="button" class="gkc-chip">${esc(q)}</button>`).join("");
    }

    async function poll() {
      if (closed || busy || document.hidden) return;
      busy = true;
      try {
        const res = await window.GKApi.get(`/api/orders/${encodeURIComponent(options.orderId)}/messages?after=${lastId}`, options.scope);
        peer = res.peer || peer;
        const changed = canSend !== !!res.canSend;
        canSend = !!res.canSend;
        const fresh = res.messages || [];
        if (fresh.length || first) {
          const nearBottom = list.scrollHeight - list.scrollTop - list.clientHeight < 80;
          messages = messages.concat(fresh);
          lastId = messages.length ? messages[messages.length - 1].id : lastId;
          renderList(first || nearBottom || fresh.some((m) => m.mine));
          if (!first && fresh.some((m) => !m.mine) && options.onMessage) options.onMessage();
        }
        renderHeader();
        if (first || changed) renderState();
        first = false;
        errorEl.hidden = true;
      } catch (error) {
        errorEl.textContent = error.message || "Messagerie indisponible.";
        errorEl.hidden = false;
      } finally { busy = false; }
    }

    async function send(text) {
      const body = String(text || "").trim();
      if (!body || sending) return;
      sending = true;
      form.querySelector("button").disabled = true;
      try {
        await window.GKApi.post(`/api/orders/${encodeURIComponent(options.orderId)}/messages`, { body }, options.scope);
        input.value = "";
        errorEl.hidden = true;
        await poll();
      } catch (error) {
        errorEl.textContent = error.message || "Message non envoyé.";
        errorEl.hidden = false;
        if (error.status === 409) { canSend = false; renderState(); }
      } finally {
        sending = false;
        form.querySelector("button").disabled = false;
        input.focus();
      }
    }

    form.addEventListener("submit", (e) => { e.preventDefault(); send(input.value); });
    root.addEventListener("click", (e) => {
      if (e.target === root || e.target.closest(".gkc-x")) close();
      const chip = e.target.closest(".gkc-chip");
      if (chip) send(chip.textContent);
    });
    const onKey = (e) => { if (e.key === "Escape") close(); };
    document.addEventListener("keydown", onKey);
    const timer = setInterval(poll, 3000);
    const onVisible = () => { if (!document.hidden) poll(); };
    document.addEventListener("visibilitychange", onVisible);

    function close() {
      if (closed) return;
      closed = true;
      clearInterval(timer);
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("visibilitychange", onVisible);
      root.remove();
      current = null;
      if (options.onClose) options.onClose();
    }

    renderHeader(); renderList(); renderState();
    current = { close };
    poll().then(() => input.focus());
    return current;
  }

  window.GKChat = Object.freeze({ open, contactLinks, close: () => current && current.close() });
})();
