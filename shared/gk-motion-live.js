import { animate, stagger } from "https://cdn.jsdelivr.net/npm/motion@12.23.24/+esm";

const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
let running = [];

function stopLiveScenes() {
  running.forEach(control => {
    try { control.stop(); } catch {}
  });
  running = [];
}

function track(control) {
  if (control) running.push(control);
}

export function liveSceneHtml(kind, caption, compact = false) {
  const scenes = {
    wait: `<div class="scene-canvas"><span class="scene-ring"></span><span class="scene-clock"></span></div>`,
    cook: `<div class="scene-canvas"><div class="scene-skillet"><span class="scene-steam s1"></span><span class="scene-steam s2"></span><span class="scene-steam s3"></span><span class="scene-pan"></span><span class="scene-handle"></span><span class="scene-flame f1"></span><span class="scene-flame f2"></span><span class="scene-flame f3"></span></div></div>`,
    ready: `<div class="scene-canvas"><span class="scene-bag"></span></div>`,
    ride: `<div class="scene-canvas scene-road"><span class="scene-dash"></span><span class="scene-scooter"><span class="body"></span><span class="stem"></span><span class="wheel w1"></span><span class="wheel w2"></span></span></div>`
  };
  const canvas = scenes[kind];
  if (!canvas) return "";
  return `<div class="live-scene${compact ? " compact" : ""}" data-scene="${kind}" aria-hidden="true">${canvas}${caption ? `<p class="scene-caption">${caption}</p>` : ""}</div>`;
}

function playCook(scene) {
  const skillet = scene.querySelector(".scene-skillet");
  const steams = scene.querySelectorAll(".scene-steam");
  const flames = scene.querySelectorAll(".scene-flame");
  if (skillet) {
    track(animate(skillet, { transform: ["rotate(-6deg)", "rotate(6deg)"] }, { duration: 0.85, repeat: Infinity, repeatType: "mirror", ease: "easeInOut" }));
  }
  if (steams.length) {
    track(animate(steams, { transform: ["translateY(6px) scaleY(0.55)", "translateY(-16px) scaleY(1)"], opacity: [0.12, 0.7, 0] }, { duration: 1.55, delay: stagger(0.2), repeat: Infinity, ease: "easeOut" }));
  }
  if (flames.length) {
    track(animate(flames, { transform: ["scaleY(0.85)", "scaleY(1.18)"], opacity: [0.7, 1] }, { duration: 0.38, delay: stagger(0.08), repeat: Infinity, repeatType: "mirror", ease: "easeInOut" }));
  }
}

function playWait(scene) {
  const ring = scene.querySelector(".scene-ring");
  const clock = scene.querySelector(".scene-clock");
  if (ring) track(animate(ring, { transform: ["translate(-50%, -50%) rotate(0deg)", "translate(-50%, -50%) rotate(360deg)"] }, { duration: 1.4, repeat: Infinity, ease: "linear" }));
  if (clock) track(animate(clock, { transform: ["translate(-50%, -50%) rotate(-8deg)", "translate(-50%, -50%) rotate(8deg)"] }, { duration: 0.9, repeat: Infinity, repeatType: "mirror", ease: "easeInOut" }));
}

function playReady(scene) {
  const bag = scene.querySelector(".scene-bag");
  if (bag) track(animate(bag, { transform: ["translateY(0px)", "translateY(-9px)"] }, { duration: 0.72, repeat: Infinity, repeatType: "mirror", ease: "easeInOut" }));
}

function playRide(scene) {
  const scooter = scene.querySelector(".scene-scooter");
  const dash = scene.querySelector(".scene-dash");
  const wheels = scene.querySelectorAll(".wheel");
  if (scooter) {
    track(animate(scooter, { transform: ["translateX(0px) translateY(0px)", "translateX(210px) translateY(-4px)", "translateX(0px) translateY(0px)"] }, { duration: 3.4, repeat: Infinity, ease: "easeInOut" }));
  }
  if (dash) {
    track(animate(dash, { transform: ["translateX(0px)", "translateX(-22px)"] }, { duration: 0.45, repeat: Infinity, ease: "linear" }));
  }
  if (wheels.length) {
    track(animate(wheels, { transform: ["rotate(0deg)", "rotate(360deg)"] }, { duration: 0.7, repeat: Infinity, ease: "linear" }));
  }
}

export function playLiveScenes(root = document) {
  stopLiveScenes();
  if (!root || reduced.matches) return;
  root.querySelectorAll("[data-scene]").forEach(scene => {
    const kind = scene.dataset.scene;
    if (kind === "cook") playCook(scene);
    else if (kind === "wait") playWait(scene);
    else if (kind === "ready") playReady(scene);
    else if (kind === "ride") playRide(scene);
  });
  const current = root.querySelector(".step-item.current .step-dot, .step.current .step-dot");
  if (current) {
    track(animate(current, { transform: ["scale(1)", "scale(1.08)"] }, { duration: 0.7, repeat: Infinity, repeatType: "mirror", ease: "easeInOut" }));
  }
}

window.gkMotionLive = { playLiveScenes, liveSceneHtml, stopLiveScenes };
