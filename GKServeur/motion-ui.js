import { animate, press, stagger } from "https://cdn.jsdelivr.net/npm/motion@12.23.24/+esm";

const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
const spring = { type: "spring", bounce: 0.16, visualDuration: 0.34 };
const tap = { type: "spring", bounce: 0.1, visualDuration: 0.2 };
let lastEnterKey = "";

function skip() {
  return reduced.matches;
}

export function enterView(root, key = "") {
  if (skip() || !root) return;
  const enterKey = String(key);
  if (enterKey && enterKey === lastEnterKey) return;
  lastEnterKey = enterKey;
  const chrome = [...root.querySelectorAll(".screen-title, .table-chip, .search-row, .track-card")];
  const list = [...root.querySelectorAll(".product-card, .table-pad button, .branch-card, .ticket")].slice(0, 16);
  if (chrome.length) animate(chrome, { opacity: [0, 1], transform: ["translateY(10px)", "translateY(0px)"] }, { duration: 0.28, ease: "easeOut" });
  if (list.length) animate(list, { opacity: [0, 1], transform: ["translateY(14px)", "translateY(0px)"] }, { delay: stagger(0.03), duration: 0.3, ease: "easeOut" });
}

export function overlayIn(overlayEl, sheetEl) {
  if (skip()) return;
  animate(overlayEl, { opacity: [0, 1] }, { duration: 0.2, ease: "easeOut" });
  animate(sheetEl, { opacity: [0, 1], transform: ["translateY(28px)", "translateY(0px)"] }, spring);
}

export function overlayOut(overlayEl, sheetEl) {
  if (skip()) return Promise.resolve();
  return Promise.all([
    animate(overlayEl, { opacity: 0 }, { duration: 0.16, ease: "easeIn" }).finished,
    animate(sheetEl, { opacity: 0, transform: "translateY(22px)" }, { duration: 0.18, ease: "easeIn" }).finished
  ]);
}

export function toastIn(el) {
  if (skip() || !el) return;
  animate(el, { opacity: [0, 1], transform: ["translate(-50%, 10px)", "translate(-50%, 0px)"] }, { duration: 0.22, ease: "easeOut" });
}

function bindGestures() {
  press("button", element => {
    if (element.classList.contains("category-chip")) return;
    animate(element, { scale: 0.96 }, tap);
    return () => animate(element, { scale: 1 }, spring);
  });
}

if (!skip()) bindGestures();
window.gkMotion = { enterView, overlayIn, overlayOut, toastIn };
