(() => {
  "use strict";

  let stream = null;
  let timer = 0;
  let video = null;
  let busy = false;
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d", { willReadFrequently: true });

  function stop() {
    if (timer) clearTimeout(timer);
    timer = 0;
    busy = false;
    if (stream) stream.getTracks().forEach((track) => track.stop());
    stream = null;
    if (video) {
      video.pause();
      video.srcObject = null;
    }
  }

  function supported() {
    return !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
  }

  function drawVideo(maxEdge) {
    if (!video || video.readyState < 2 || !video.videoWidth) return false;
    const w = video.videoWidth;
    const h = video.videoHeight;
    const scale = Math.min(1, maxEdge / Math.max(w, h));
    canvas.width = Math.max(1, Math.round(w * scale));
    canvas.height = Math.max(1, Math.round(h * scale));
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    return true;
  }

  function jsQrRead(imageData) {
    if (typeof window.jsQR !== "function") return "";
    const found = window.jsQR(imageData.data, imageData.width, imageData.height, { inversionAttempts: "attemptBoth" });
    return found?.data ? String(found.data) : "";
  }

  async function detectSource(source) {
    if (typeof BarcodeDetector === "function") {
      try {
        const detector = new BarcodeDetector({ formats: ["qr_code"] });
        const codes = await detector.detect(source);
        if (codes[0]?.rawValue) return String(codes[0].rawValue);
      } catch { /* jsQR next */ }
    }
    return "";
  }

  async function decodeCanvas() {
    let raw = await detectSource(canvas);
    if (raw) return raw;
    raw = jsQrRead(ctx.getImageData(0, 0, canvas.width, canvas.height));
    if (raw) return raw;
    const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height);
    for (let i = 0; i < pixels.data.length; i += 4) {
      pixels.data[i] = 255 - pixels.data[i];
      pixels.data[i + 1] = 255 - pixels.data[i + 1];
      pixels.data[i + 2] = 255 - pixels.data[i + 2];
    }
    ctx.putImageData(pixels, 0, 0);
    raw = await detectSource(canvas);
    if (raw) return raw;
    return jsQrRead(pixels);
  }

  async function readFrame() {
    const track = stream?.getVideoTracks?.()[0];
    if (track && typeof ImageCapture === "function") {
      try {
        const bitmap = await new ImageCapture(track).grabFrame();
        const raw = await detectSource(bitmap);
        bitmap.close?.();
        if (raw) return raw;
      } catch { /* canvas fallback */ }
    }
    if (!drawVideo(900)) return "";
    let raw = await decodeCanvas();
    if (raw) return raw;
    if (!drawVideo(480)) return "";
    return decodeCanvas();
  }

  async function start({ video: videoEl, onCode, onError }) {
    stop();
    if (!supported()) {
      onError?.(new Error("Caméra indisponible sur cet appareil."));
      return;
    }
    video = videoEl;
    video.setAttribute("playsinline", "true");
    video.setAttribute("webkit-playsinline", "true");
    video.playsInline = true;
    video.muted = true;
    video.autoplay = true;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          facingMode: { ideal: "environment" },
          width: { ideal: 1280 },
          height: { ideal: 720 }
        }
      });
    } catch {
      onError?.(new Error("Autorisez la caméra pour scanner le QR."));
      return;
    }
    video.srcObject = stream;
    try { await video.play(); } catch { /* muted autoplay */ }
    const tick = async () => {
      if (!stream || busy) {
        if (stream) timer = setTimeout(() => { void tick(); }, 450);
        return;
      }
      try {
        const raw = await readFrame();
        if (raw) {
          stop();
          onCode?.(raw);
          return;
        }
      } catch { /* keep preview */ }
      timer = setTimeout(() => { void tick(); }, 450);
    };
    timer = setTimeout(() => { void tick(); }, 600);
  }

  async function capture() {
    if (busy) return "";
    busy = true;
    try {
      return await readFrame();
    } finally {
      busy = false;
    }
  }

  window.GKQrScan = { supported, start, capture, stop };
})();
