import { animate, hover, press, stagger } from "https://cdn.jsdelivr.net/npm/motion@12.23.24/+esm";

const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
const spring = { type: "spring", bounce: 0.16, visualDuration: 0.34 };
const tap = { type: "spring", bounce: 0.1, visualDuration: 0.2 };
let lastEnterKey = "";

function skip() {
  return reduced.matches;
}

export function enterView(root, key = "") {
  if (skip() || !root || root.querySelector("section.auth")) return;
  const enterKey = String(key);
  if (enterKey && enterKey === lastEnterKey) return;
  lastEnterKey = enterKey;

  const chrome = [...root.querySelectorAll(".screen-title, .branch-switcher, .top-seller, .restaurant-card, .search-row, .section-heading, .pause-banner, .tracking-card, .eta-row")];
  const list = [...root.querySelectorAll(".house-card, .product-card, .home-tile, .cart-line, .order-card, .profile-card, .profile-menu-button, .delivery-choice, .step-item, .live-scene")].slice(0, 14);
  const chips = [...root.querySelectorAll(".category-chip")].slice(0, 12);

  if (chrome.length) {
    animate(chrome, { opacity: [0, 1], transform: ["translateY(10px)", "translateY(0px)"] }, { duration: 0.28, ease: "easeOut" });
  }
  if (chips.length) {
    animate(chips, { opacity: [0, 1], transform: ["translateY(8px)", "translateY(0px)"] }, { delay: stagger(0.02), duration: 0.24, ease: "easeOut" });
  }
  if (list.length) {
    animate(list, { opacity: [0, 1], transform: ["translateY(16px)", "translateY(0px)"] }, { delay: stagger(0.035), duration: 0.32, ease: "easeOut" });
  } else if (!chrome.length) {
    animate(root, { opacity: [0, 1], transform: ["translateY(8px)", "translateY(0px)"] }, { duration: 0.24, ease: "easeOut" });
  }
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

export async function playSplash() {
  /* Splash is owned by app.js so a blocked Motion CDN cannot cover the login button. */
}

function bindGestures() {
  press("button, a.outline-button, a.round-button", element => {
    if (element.type === "submit" || element.closest("form") || element.classList.contains("category-chip") || element.classList.contains("location-button") || element.classList.contains("brand-lockup")) return;
    animate(element, { scale: 0.96 }, tap);
    return () => animate(element, { scale: 1 }, spring);
  });
  if (window.matchMedia("(hover: hover)").matches) {
    hover(".product-card, .house-card, .top-seller, .order-card", element => {
      animate(element, { y: -3 }, { duration: 0.2, ease: "easeOut" });
      return () => animate(element, { y: 0 }, { duration: 0.2, ease: "easeOut" });
    });
  }
}

if (!skip()) bindGestures();

window.gkMotion = { enterView, overlayIn, overlayOut, toastIn, playSplash };

void playSplash();
const boot = document.querySelector("#app-main");
if (boot?.childElementCount) enterView(boot, "boot");
