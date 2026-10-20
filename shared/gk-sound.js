/* Notification sounds for the kitchen and courier apps.
   "order": urgent triple ring (new order / new delivery offer).
   "ready": rising three-note chime (order ready for pick-up). */
(() => {
  const Ctx = window.AudioContext || window.webkitAudioContext;
  let ctx = null;

  function unlock() {
    if (!Ctx) return;
    if (!ctx) { try { ctx = new Ctx(); } catch { ctx = null; return; } }
    if (ctx.state === "suspended") ctx.resume().catch(() => {});
  }
  ["pointerdown", "touchstart", "keydown", "click"].forEach(name => window.addEventListener(name, unlock, { passive: true }));

  function tone(freq, start, length, type, volume) {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(volume, start + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + length);
    osc.connect(gain).connect(ctx.destination);
    osc.start(start);
    osc.stop(start + length + 0.02);
  }

  const SOUNDS = {
    order(t) {
      for (let burst = 0; burst < 3; burst += 1) {
        const at = t + burst * 0.55;
        tone(1046, at, 0.14, "square", 1);
        tone(784, at + 0.16, 0.14, "square", 1);
        tone(1046, at + 0.32, 0.18, "square", 1);
      }
    },
    ready(t) {
      [523, 659, 784, 1046].forEach((freq, i) => tone(freq, t + i * 0.14, 0.34, "sine", 1));
    }
  };

  window.GKSound = {
    unlock,
    ready: () => !!ctx && ctx.state === "running",
    play(name) {
      unlock();
      if (!ctx || !SOUNDS[name]) return false;
      if (ctx.state !== "running") return false;
      SOUNDS[name](ctx.currentTime + 0.02);
      if (navigator.vibrate) navigator.vibrate(name === "order" ? [250, 120, 250, 120, 250] : [200, 100, 200]);
      return true;
    }
  };
})();
