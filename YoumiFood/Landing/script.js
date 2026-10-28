(() => {
  const $ = (s) => document.querySelector(s);
  $("#yr").textContent = new Date().getFullYear();

  const toggle = $(".menu-toggle");
  const links = $("#nav-links");
  toggle.addEventListener("click", () => {
    const open = links.classList.toggle("open");
    toggle.setAttribute("aria-expanded", String(open));
  });
  links.addEventListener("click", (e) => {
    if (e.target.closest("a")) { links.classList.remove("open"); toggle.setAttribute("aria-expanded", "false"); }
  });

  document.querySelectorAll('[data-focus="email"]').forEach((a) =>
    a.addEventListener("click", () => setTimeout(() => $("#email").focus({ preventScroll: true }), 500)));

  // Waitlist: set window.YOUMI_WAITLIST_URL (any endpoint accepting a JSON POST) to collect signups for real.
  // Until then, emails are kept only in this browser.
  const form = $("#notify");
  const msg = $("#form-msg");
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const email = $("#email").value.trim();
    msg.className = "form-msg";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
      msg.classList.add("err");
      msg.textContent = "Please enter a valid email address.";
      return;
    }
    try {
      if (window.YOUMI_WAITLIST_URL) {
        const res = await fetch(window.YOUMI_WAITLIST_URL, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email }) });
        if (!res.ok) throw new Error("request failed");
      } else {
        const list = JSON.parse(localStorage.getItem("youmi-waitlist") || "[]");
        if (!list.includes(email)) list.push(email);
        localStorage.setItem("youmi-waitlist", JSON.stringify(list));
      }
      msg.classList.add("ok");
      msg.textContent = "You're on the list. We'll let you know when Youmi launches!";
      form.reset();
    } catch {
      msg.classList.add("err");
      msg.textContent = "Something went wrong. Please try again.";
    }
  });
})();
