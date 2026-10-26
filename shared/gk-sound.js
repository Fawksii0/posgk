/* Notification sounds for kitchen, waiter and courier apps.
   "order": urgent triple ring (new order / new delivery offer).
   "call": two-tone bell (table asking for a waiter).
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
    message(t) {
      tone(880, t, 0.12, "sine", 1);
      tone(1318, t + 0.12, 0.22, "sine", 1);
    },
    call(t) {
      tone(988, t, 0.16, "triangle", 1);
      tone(1318, t + 0.2, 0.28, "triangle", 1);
      tone(988, t + 0.52, 0.16, "triangle", 1);
      tone(1318, t + 0.72, 0.32, "triangle", 1);
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
      const go = () => {
        if (ctx.state !== "running") return false;
        SOUNDS[name](ctx.currentTime + 0.02);
        if (navigator.vibrate) navigator.vibrate(name === "order" ? [250, 120, 250, 120, 250] : name === "call" ? [180, 80, 180] : [200, 100, 200]);
        return true;
      };
      if (ctx.state === "running") return go();
      ctx.resume().then(go).catch(() => {});
      return true;
    }
  };
})();
