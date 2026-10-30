(function () {
  "use strict";

  const escapeHtml = value => String(value ?? "").replace(/[&<>"']/g, char => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[char]);

  function animation(name, { loop = true, className = "" } = {}) {
    const reduceMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    return `<dotlottie-wc class="gk-lottie ${className}" src="../shared/animations/${name}.json" ${reduceMotion ? "" : "autoplay"} ${loop ? "loop" : ""} aria-hidden="true"></dotlottie-wc>`;
  }

  function loading(label, density = "") {
    return `<div class="gk-lottie-state ${density}" role="status">${animation("gk-loader", { className: "gk-lottie-loader" })}<strong>${escapeHtml(label)}</strong></div>`;
  }

  function empty(title, detail = "", density = "") {
    return `<div class="gk-lottie-state gk-lottie-empty-state ${density}">${animation("gk-empty-bag", { className: "gk-lottie-empty" })}<strong>${escapeHtml(title)}</strong>${detail ? `<span>${escapeHtml(detail)}</span>` : ""}</div>`;
  }

  window.GKLottie = { animation, loading, empty };
})();

