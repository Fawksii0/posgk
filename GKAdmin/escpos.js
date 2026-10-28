/* ESC/POS ticket builder + Web Bluetooth (BLE only) printer wrapper. */
const BLE_SERVICES = [
  "000018f0-0000-1000-8000-00805f9b34fb",
  "0000ffe0-0000-1000-8000-00805f9b34fb",
  "0000ffe1-0000-1000-8000-00805f9b34fb",
  "0000fff0-0000-1000-8000-00805f9b34fb",
  "0000ff00-0000-1000-8000-00805f9b34fb",
  "0000ae30-0000-1000-8000-00805f9b34fb",
  "0000ff10-0000-1000-8000-00805f9b34fb",
  "e7810a71-73ae-499d-8c15-faa9aef0c3f2",
  "49535343-fe7d-4ae5-8fa9-9fafd205e455",
  "6e400001-b5a3-f393-e0a9-e50e24dcca9e"
];
const BLE_CHUNK = 20;
const BLE_DELAY = 4;

const ESCPOS = {
  init: [0x1b, 0x40],
  align: n => [0x1b, 0x61, n],
  bold: on => [0x1b, 0x45, on ? 1 : 0],
  size: n => [0x1d, 0x21, n],
  feed: n => [0x1b, 0x64, n],
  cut: [0x1d, 0x56, 0x42, 0x03]
};

const MODE_LABELS = { delivery: "LIVRAISON", pickup: "A EMPORTER", dinein: "SUR PLACE" };
const SPECIALS = { "œ": "oe", "Œ": "OE", "æ": "ae", "×": "x", "″": '"', "·": "-", "–": "-", "—": "-", "’": "'", "‘": "'", "“": '"', "”": '"', "…": "...", "•": "*", "€": "EUR" };

// ASCII-safe transliteration: every printer code page agrees on 0x20-0x7E.
function toAscii(text) {
  return String(text ?? "")
    .replace(/[œŒæ×″·–—’‘“”…•€]/g, ch => SPECIALS[ch])
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\x20-\x7e]/g, "?");
}

function wrap(text, width, indent = "") {
  const lines = [];
  let line = indent;
  for (const word of toAscii(text).split(/\s+/).filter(Boolean)) {
    const candidate = line.trim() ? `${line} ${word}` : `${indent}${word}`;
    if (candidate.length > width && line.trim()) { lines.push(line); line = `${indent}${word}`; }
    else line = candidate;
  }
  if (line.trim()) lines.push(line);
  return lines;
}

const pair = (left, right, cols) => {
  const l = toAscii(left);
  const r = toAscii(right);
  const room = cols - r.length - 1;
  return `${l.length > room ? l.slice(0, room) : l.padEnd(room)} ${r}`;
};

const dotted = (left, right, cols) => {
  const l = toAscii(left);
  const r = toAscii(right);
  const room = Math.max(1, cols - r.length);
  const head = l.length >= room ? l.slice(0, Math.max(1, room - 1)) : l;
  return `${head}${"".padEnd(Math.max(1, room - head.length), ".")}${r}`;
};

function itemLabel(item) {
  let label = "";
  if (typeof GKItemName !== "undefined") label = GKItemName.ticketName(item);
  else {
    const size = String(item?.size || "").trim();
    const name = item?.name || "";
    label = size ? `${name} ${size}` : name;
  }
  return String(label || "").toLocaleUpperCase("fr-FR");
}

function toTicket(order) {
  const items = Array.isArray(order?.items) ? order.items.map(item => {
    const qty = Number(item.qty) || 1;
    const unit = Number(item.unit ?? item.price ?? 0);
    return {
      id: item.id,
      qty,
      name: item.name || "",
      size: item.size || "",
      extras: item.extras || [],
      price: unit,
      category: item.category || item.categoryName || (typeof GKItemName !== "undefined" ? GKItemName.categoryFromId(item.id) : "")
    };
  }) : [];
  const street = order?.address?.street || "";
  const zone = order?.address?.zone || order?.address?.label || "";
  return {
    id: order?.seq || order?.id || "?",
    createdAt: order?.createdAt || Date.now(),
    mode: order?.mode || "pickup",
    customer: order?.customer || { name: "", phone: "" },
    address: { street, zone },
    tableNo: Number(order?.tableNo) || 0,
    items,
    note: order?.note || "",
    subtotal: Number(order?.subtotal) || 0,
    fee: Number(order?.fee) || 0,
    total: Number(order?.total) || 0,
    payment: order?.payment || "",
    paymentType: order?.paymentType || "",
    promisedAt: order?.promisedAt || 0,
    cashierName: order?.cashierName || order?.cashier || "",
    rawId: order?.rawId || order?.id || "",
    deliveryCode: order?.deliveryCode || order?.delivery_code || ""
  };
}

function deliveryQrData(ticket) {
  if (!ticket.deliveryCode || ticket.mode !== "delivery") return "";
  return `GK1|${ticket.rawId || ticket.id}|${ticket.deliveryCode}`;
}

/* QR as GS v 0 bitmap — cheap BLE printers ignore native GS ( k QR. ECC L, versions 1–5. */
const QR_L = [
  { v: 1, size: 21, data: 19, ec: 7, align: [] },
  { v: 2, size: 25, data: 34, ec: 10, align: [6, 18] },
  { v: 3, size: 29, data: 55, ec: 15, align: [6, 22] },
  { v: 4, size: 33, data: 80, ec: 20, align: [6, 26] },
  { v: 5, size: 37, data: 108, ec: 26, align: [6, 30] }
];
const QR_EXP = new Uint8Array(512);
const QR_LOG = new Uint8Array(256);
{
  let x = 1;
  for (let i = 0; i < 255; i += 1) {
    QR_EXP[i] = x;
    QR_LOG[x] = i;
    x <<= 1;
    if (x & 256) x ^= 0x11d;
  }
  for (let i = 255; i < 512; i += 1) QR_EXP[i] = QR_EXP[i - 255];
}
const qrMul = (a, b) => (a && b ? QR_EXP[QR_LOG[a] + QR_LOG[b]] : 0);

function qrRs(data, ecCount) {
  const gen = [1];
  for (let i = 0; i < ecCount; i += 1) {
    const next = new Array(gen.length + 1).fill(0);
    for (let j = 0; j < gen.length; j += 1) {
      next[j] ^= gen[j];
      next[j + 1] ^= qrMul(gen[j], QR_EXP[i]);
    }
    gen.splice(0, gen.length, ...next);
  }
  const ec = new Array(ecCount).fill(0);
  for (const byte of data) {
    const factor = byte ^ ec[0];
    ec.shift();
    ec.push(0);
    if (!factor) continue;
    for (let j = 0; j < ecCount; j += 1) ec[j] ^= qrMul(gen[j + 1], factor);
  }
  return ec;
}

function qrFormatBits(mask) {
  const data = (0b01 << 3) | mask;
  let rem = data << 10;
  for (let i = 14; i >= 10; i -= 1) if ((rem >> i) & 1) rem ^= 0x537 << (i - 10);
  return (data << 10 | rem) ^ 0x5412;
}

function qrMaskBit(mask, row, col) {
  if (mask === 0) return (row + col) % 2 === 0;
  if (mask === 1) return row % 2 === 0;
  if (mask === 2) return col % 3 === 0;
  if (mask === 3) return (row + col) % 3 === 0;
  if (mask === 4) return (Math.floor(row / 2) + Math.floor(col / 3)) % 2 === 0;
  if (mask === 5) return (row * col) % 2 + (row * col) % 3 === 0;
  if (mask === 6) return ((row * col) % 2 + (row * col) % 3) % 2 === 0;
  return ((row + col) % 2 + (row * col) % 3) % 2 === 0;
}

function qrMatrix(text) {
  if (typeof qrcode !== "function") return null;
  const qr = qrcode(0, "M");
  qr.addData(String(text));
  qr.make();
  const n = qr.getModuleCount();
  return Array.from({ length: n }, (_, row) => Array.from({ length: n }, (__, col) => (qr.isDark(row, col) ? 1 : 0)));
}

function qrMatrixLegacy(text) {
  const bytes = [...new TextEncoder().encode(String(text))];
  const spec = QR_L.find(item => item.data >= bytes.length + 3) || QR_L[QR_L.length - 1];
  const bits = [];
  const push = (value, n) => {
    for (let i = n - 1; i >= 0; i -= 1) bits.push((value >> i) & 1);
  };
  push(0b0100, 4);
  push(bytes.length, 8);
  bytes.forEach(byte => push(byte, 8));
  push(0, Math.min(4, spec.data * 8 - bits.length));
  while (bits.length % 8) bits.push(0);
  const data = [];
  for (let i = 0; i < bits.length; i += 8) {
    let byte = 0;
    for (let j = 0; j < 8; j += 1) byte = (byte << 1) | bits[i + j];
    data.push(byte);
  }
  const pads = [0xec, 0x11];
  while (data.length < spec.data) data.push(pads[data.length % 2]);
  const codewords = data.concat(qrRs(data, spec.ec));
  const n = spec.size;
  const reserved = Array.from({ length: n }, () => Array(n).fill(false));
  const mark = (r, c) => { if (r >= 0 && c >= 0 && r < n && c < n) reserved[r][c] = true; };
  const finder = (r0, c0) => {
    for (let r = -1; r <= 7; r += 1) for (let c = -1; c <= 7; c += 1) mark(r0 + r, c0 + c);
  };
  finder(0, 0); finder(0, n - 7); finder(n - 7, 0);
  spec.align.forEach(r => spec.align.forEach(c => {
    if ((r < 10 && c < 10) || (r < 10 && c > n - 11) || (r > n - 11 && c < 10)) return;
    for (let y = -2; y <= 2; y += 1) for (let x = -2; x <= 2; x += 1) mark(r + y, c + x);
  }));
  for (let i = 0; i < n; i += 1) { mark(6, i); mark(i, 6); }
  for (let i = 0; i < 9; i += 1) { mark(8, i); mark(i, 8); mark(8, n - 1 - i); mark(n - 1 - i, 8); }
  mark(n - 8, 8);

  const pattern = Array.from({ length: n }, () => Array(n).fill(0));
  const setPat = (r, c, dark) => { if (r >= 0 && c >= 0 && r < n && c < n) pattern[r][c] = dark ? 1 : 0; };
  const drawFinder = (r0, c0) => {
    for (let r = 0; r < 7; r += 1) for (let c = 0; c < 7; c += 1) {
      const edge = r === 0 || r === 6 || c === 0 || c === 6;
      const core = r >= 2 && r <= 4 && c >= 2 && c <= 4;
      setPat(r0 + r, c0 + c, edge || core);
    }
  };
  drawFinder(0, 0); drawFinder(0, n - 7); drawFinder(n - 7, 0);
  spec.align.forEach(r => spec.align.forEach(c => {
    if ((r < 10 && c < 10) || (r < 10 && c > n - 11) || (r > n - 11 && c < 10)) return;
    for (let y = -2; y <= 2; y += 1) for (let x = -2; x <= 2; x += 1) {
      setPat(r + y, c + x, Math.max(Math.abs(y), Math.abs(x)) !== 1);
    }
  }));
  for (let i = 8; i < n - 8; i += 1) { setPat(6, i, i % 2 === 0); setPat(i, 6, i % 2 === 0); }
  setPat(n - 8, 8, true);

  const stream = [];
  codewords.forEach(byte => { for (let i = 7; i >= 0; i -= 1) stream.push((byte >> i) & 1); });
  const positions = [];
  let bit = 0;
  let goingUp = true;
  for (let col = n - 1; col > 0; col -= 2) {
    if (col === 6) col -= 1;
    for (let i = 0; i < n; i += 1) {
      const row = goingUp ? n - 1 - i : i;
      for (const c of [col, col - 1]) {
        if (!reserved[row][c]) {
          positions.push([row, c]);
          bit += 1;
        }
      }
    }
    goingUp = !goingUp;
  }

  const score = grid => {
    let total = 0;
    for (let r = 0; r < n; r += 1) {
      let run = 1;
      for (let c = 1; c <= n; c += 1) {
        if (c < n && grid[r][c] === grid[r][c - 1]) run += 1;
        else { if (run >= 5) total += run - 2; run = 1; }
      }
    }
    for (let c = 0; c < n; c += 1) {
      let run = 1;
      for (let r = 1; r <= n; r += 1) {
        if (r < n && grid[r][c] === grid[r - 1][c]) run += 1;
        else { if (run >= 5) total += run - 2; run = 1; }
      }
    }
    return total;
  };

  let best = null;
  let bestScore = Infinity;
  for (let mask = 0; mask < 8; mask += 1) {
    const grid = pattern.map(row => row.slice());
    positions.forEach(([r, c], i) => {
      const dark = (stream[i] || 0) ^ (qrMaskBit(mask, r, c) ? 1 : 0);
      grid[r][c] = dark;
    });
    const fmt = qrFormatBits(mask);
    const bit = i => (fmt >> i) & 1;
    for (let i = 0; i <= 5; i += 1) grid[i][8] = bit(i);
    grid[7][8] = bit(6);
    grid[8][8] = bit(7);
    grid[8][7] = bit(8);
    for (let i = 9; i < 15; i += 1) grid[8][14 - i] = bit(i);
    for (let i = 0; i < 8; i += 1) grid[8][n - 1 - i] = bit(i);
    for (let i = 8; i < 15; i += 1) grid[n - 15 + i][8] = bit(i);
    grid[n - 8][8] = 1;
    const penalty = score(grid);
    if (penalty < bestScore) { bestScore = penalty; best = grid; }
  }
  return best;
}

function qrRaster(text, paper = 80) {
  const matrix = qrMatrix(text);
  if (!matrix) return null;
  const quiet = 4;
  const scale = Number(paper) === 58 ? 5 : 6;
  const modules = matrix.length + quiet * 2;
  const raw = modules * scale;
  const width = Math.ceil(raw / 8) * 8;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = raw;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, width, raw);
  ctx.fillStyle = "#000";
  const ox = Math.floor((width - raw) / 2) + quiet * scale;
  const oy = quiet * scale;
  for (let y = 0; y < matrix.length; y += 1) {
    for (let x = 0; x < matrix.length; x += 1) {
      if (matrix[y][x]) ctx.fillRect(ox + x * scale, oy + y * scale, scale, scale);
    }
  }
  return canvasRaster(canvas, false);
}

function qrDataUrl(text, paper = 80) {
  const image = qrRaster(text, paper);
  if (!image) return "";
  const canvas = document.createElement("canvas");
  const w = image.widthBytes * 8;
  canvas.width = w;
  canvas.height = image.height;
  const ctx = canvas.getContext("2d");
  const pixels = ctx.createImageData(w, image.height);
  for (let y = 0; y < image.height; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const bit = image.raster[y * image.widthBytes + (x >> 3)] & (0x80 >> (x & 7));
      const i = (y * w + x) * 4;
      const v = bit ? 0 : 255;
      pixels.data[i] = pixels.data[i + 1] = pixels.data[i + 2] = v;
      pixels.data[i + 3] = 255;
    }
  }
  ctx.putImageData(pixels, 0, 0);
  return canvas.toDataURL("image/png");
}

function ticketRows(order, { cols = 32, reprint = false, kind } = {}) {
  const ticket = toTicket(order);
  const copy = kind || (reprint ? "duplicata" : "original");
  const rows = [];
  const add = (text, opts = {}) => rows.push({ text: toAscii(text), align: "left", bold: false, size: 1, ...opts });
  const rule = () => add("-".repeat(cols));
  const money = amount => `${Math.round(Number(amount) || 0)} DH`;
  const stamp = new Date(ticket.createdAt);
  const date = stamp.toLocaleDateString("fr-FR");
  const hour = stamp.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
  const kitchenMode = { pickup: "EMPORTE", dinein: "SUR PLACE", delivery: "LIVRAISON" };

  if (copy === "kitchen") {
    add(`#${ticket.id}`, { align: "center", bold: true, size: 2 });
    add(kitchenMode[ticket.mode] || ticket.mode, { align: "center", bold: true, size: 2 });
    if (ticket.mode === "dinein" && ticket.tableNo) add(`Table ${ticket.tableNo}`, { align: "center", bold: true, size: 2 });
    add(`Date : ${date}`, { align: "center" });
    add(`Heure : ${hour}`, { align: "center" });
    rule();
    add(dotted("PRODUITS", "QTE", cols), { bold: true });
    ticket.items.forEach(item => {
      add(dotted(itemLabel(item), String(item.qty), cols), { bold: true });
      (item.extras || []).forEach(extra => add(`   + ${String(extra).toLocaleUpperCase("fr-FR")}`));
    });
    if (ticket.note) {
      rule();
      wrap(`Note : ${ticket.note}`, cols).forEach(line => add(line, { bold: true }));
    }
    return rows;
  }

  add("G&K FOOD", { align: "center", bold: true, size: 2 });
  add("Bouznika", { align: "center" });
  rule();
  if (copy === "duplicata") add("*** DUPLICATA ***", { align: "center", bold: true });
  if (copy === "delivery") add("TICKET LIVRAISON", { align: "center", bold: true, size: 2 });
  add(`#${ticket.id}`, { align: "center", bold: true, size: 2 });
  add(`Date : ${date}`, { align: "center" });
  add(`Heure : ${hour}`, { align: "center" });
  add(MODE_LABELS[ticket.mode] || ticket.mode, { align: "center", bold: true });
  if (ticket.mode === "dinein" && ticket.tableNo) add(`Table ${ticket.tableNo}`, { align: "center", bold: true, size: 2 });
  if (ticket.cashierName) add(`Caissier : ${ticket.cashierName}`, { align: "center" });
  rule();
  add(`Client : ${ticket.customer.name || "Client"}`);
  if (ticket.customer.phone) add(`Tel : ${ticket.customer.phone}`);
  if (ticket.mode === "delivery") {
    wrap(`Adresse : ${ticket.address.street}${ticket.address.zone ? ` (${ticket.address.zone})` : ""}`, cols).forEach(line => add(line));
  }
  rule();
  add(dotted("PRODUITS", "QTE", cols), { bold: true });
  ticket.items.forEach(item => {
    add(dotted(itemLabel(item), String(item.qty), cols), { bold: true });
    (item.extras || []).forEach(extra => add(`   + ${String(extra).toLocaleUpperCase("fr-FR")}`));
    add(pair("", money(item.price * item.qty), cols));
  });
  if (ticket.note) wrap(`Note : ${ticket.note}`, cols).forEach(line => add(line, { bold: true }));
  rule();
  add(pair("Sous-total", money(ticket.subtotal), cols));
  if (ticket.mode === "delivery") add(pair("Livraison", money(ticket.fee), cols));
  add(pair("TOTAL", money(ticket.total), cols), { bold: true });
  wrap(`Paiement : ${ticket.payment || ""}${ticket.paymentType === "cash" ? " - a encaisser" : ""}`, cols).forEach(line => add(line));
  if (ticket.promisedAt) add(`Prete vers : ${new Date(ticket.promisedAt).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}`, { bold: true });
  if (ticket.mode === "delivery" && ticket.deliveryCode) {
    rule();
    add("Code livreur", { align: "center", bold: true });
    add(ticket.deliveryCode, { align: "center", bold: true, size: 2 });
  }
  rule();
  add("* * *  G & K  * * *", { align: "center", bold: true });
  add("Merci et a bientot", { align: "center" });
  add("Bouznika", { align: "center" });
  return rows;
}

const colsFor = paper => (Number(paper) === 58 ? 32 : 48);
const LOGO_SRC = "assets/emblem-reference.png";
const TICKET_ART = { logo: null };

function ticketText(order, options) {
  const cols = options?.cols ?? 32;
  return ticketRows(order, options).filter(row => row.type !== "qr").map(row => {
    const width = row.text.length * row.size;
    const pad = row.align === "center" ? Math.max(0, Math.floor((cols - width) / 2)) : 0;
    return " ".repeat(pad) + row.text;
  }).join("\n");
}

function ticketPreview(order, { paper = 80, reprint = false, kind } = {}) {
  const cols = colsFor(paper);
  return ticketText(order, { cols, reprint, kind });
}

function canvasRaster(canvas, inkLight) {
  const w = canvas.width;
  const h = canvas.height;
  const { data } = canvas.getContext("2d").getImageData(0, 0, w, h);
  const widthBytes = w / 8;
  const raster = new Uint8Array(widthBytes * h);
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const i = (y * w + x) * 4;
      const lum = (data[i] + data[i + 1] + data[i + 2]) / 3;
      const ink = inkLight ? data[i + 3] > 40 && lum > 90 : data[i + 3] > 40 && lum < 140;
      if (ink) raster[y * widthBytes + (x >> 3)] |= 0x80 >> (x & 7);
    }
  }
  return { widthBytes, height: h, raster };
}

function appendRaster(bytes, image) {
  bytes.push(0x1d, 0x76, 0x30, 0, image.widthBytes & 255, image.widthBytes >> 8, image.height & 255, image.height >> 8);
  for (let i = 0; i < image.raster.length; i += 1) bytes.push(image.raster[i]);
}

async function ensureTicketArt() {
  if (TICKET_ART.logo && TICKET_ART.logo.widthBytes === 20) return TICKET_ART;
  try {
    const img = await new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error("logo"));
      image.src = LOGO_SRC;
    });
    const w = 160;
    const h = Math.min(128, Math.max(8, Math.round(Math.round(img.height * (w / img.width)) / 8) * 8));
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    ctx.imageSmoothingEnabled = true;
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, w, h);
    ctx.drawImage(img, 0, 0, w, h);
    TICKET_ART.logo = canvasRaster(canvas, true);
  } catch {
    TICKET_ART.logo = null;
  }
  return TICKET_ART;
}

function ticketMarkup(order, { paper = 80, reprint = false, kind } = {}) {
  const width = Number(paper) === 58 ? "58mm" : "80mm";
  const copy = kind || (reprint ? "duplicata" : "original");
  const ticket = toTicket(order);
  const text = ticketPreview(order, { paper, reprint, kind }).replace(/[&<>]/g, ch => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[ch]));
  const qrImg = "";
  const logo = `<img class="escpos-logo" alt="G&amp;K" src="${LOGO_SRC}" />`;
  const foot = copy === "kitchen" ? "" : `<div class="escpos-foot">
      <svg viewBox="0 0 240 32" aria-hidden="true"><path fill="none" stroke="#000" stroke-width="1.3" d="M6 6h228M12 10h216"/><path fill="#000" d="M28 22 36 12l8 10-8 10zm32 0 8-10 8 10-8 10zm32 0 8-10 8 10-8 10zm32 0 8-10 8 10-8 10zm32 0 8-10 8 10-8 10zm32 0 8-10 8 10-8 10zm32 0 8-10 8 10-8 10z"/></svg>
    </div>`;
  return `<div class="escpos-ticket" style="width:${width}">
    ${logo}
    <pre>${text}</pre>
    ${qrImg}
    ${foot}
  </div>`;
}

function printEscposHtml(order, { paper = 80, reprint = false, kind } = {}) {
  const width = Number(paper) === 58 ? "58mm" : "80mm";
  const frame = document.createElement("iframe");
  frame.setAttribute("aria-hidden", "true");
  frame.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0;";
  document.body.appendChild(frame);
  const doc = frame.contentDocument;
  doc.open();
  doc.write(`<!doctype html><html><head><meta charset="utf-8"><title>Ticket</title>
<style>
@page { size: ${width} auto; margin: 0; }
html, body { margin: 0; background: #fff; color: #000; }
.escpos-ticket { width: ${width}; padding: 3mm; color: #000; background: #fff; }
.escpos-logo { display: block; width: 32mm; margin: 0 auto 2mm; filter: grayscale(1) contrast(1.4) invert(1); }
.escpos-ticket pre { margin: 0; font: 12px/1.25 ui-monospace, Consolas, "Courier New", monospace; white-space: pre-wrap; }
.escpos-qr { display: block; width: 40mm; height: 40mm; margin: 2mm auto; image-rendering: pixelated; }
.escpos-foot svg { display: block; width: 100%; height: 10mm; margin-top: 2mm; }
</style></head><body>${ticketMarkup(order, { paper, reprint, kind })}</body></html>`);
  doc.close();
  const done = () => { try { frame.remove(); } catch { /* ignore */ } };
  setTimeout(() => {
    try {
      frame.contentWindow.focus();
      frame.contentWindow.print();
    } finally {
      setTimeout(done, 800);
    }
  }, 50);
}

function buildTicket(order, { paper = 80, reprint = false, kind } = {}) {
  const copy = kind || (reprint ? "duplicata" : "original");
  const ticket = toTicket(order);
  const bytes = [...ESCPOS.init, ...ESCPOS.align(1)];
  if (TICKET_ART.logo) {
    appendRaster(bytes, TICKET_ART.logo);
    bytes.push(0x0a);
  }
  ticketRows(ticket, { cols: colsFor(paper), kind: copy }).forEach(row => {
    if (row.type === "qr") {
      const image = qrRaster(row.data, paper);
      if (image) {
        bytes.push(...ESCPOS.size(0), ...ESCPOS.bold(false), ...ESCPOS.align(1));
        appendRaster(bytes, image);
        bytes.push(0x0a);
      }
      return;
    }
    bytes.push(...ESCPOS.align(row.align === "center" ? 1 : 0), ...ESCPOS.bold(row.bold), ...ESCPOS.size(row.size === 2 ? 0x11 : 0));
    for (const ch of row.text) bytes.push(ch.charCodeAt(0));
    bytes.push(0x0a);
  });
  bytes.push(...ESCPOS.size(0), ...ESCPOS.bold(false), ...ESCPOS.align(0), ...ESCPOS.feed(2), ...ESCPOS.cut);
  return new Uint8Array(bytes);
}

function buildTestTicket(paper = 80) {
  return buildTicket({
    id: "TEST", createdAt: Date.now(), mode: "pickup", customer: { name: "Ticket de test" },
    items: [{ qty: 1, name: "Impression OK", size: "Éàç œ 123", extras: [], price: 0 }], subtotal: 0, fee: 0, total: 0, payment: "-", paymentType: "card"
  }, { paper });
}

function clotureRows(report, cols) {
  const rows = [];
  const add = (text, opts = {}) => rows.push({ text: toAscii(text), align: "left", bold: false, size: 1, ...opts });
  const rule = () => add("-".repeat(cols));
  const dh = amount => `${Math.round(Number(amount) || 0)} DH`;
  const day = new Date(report.dayStart || Date.now());
  const printed = new Date(report.printedAt || Date.now());
  add("G&K FOOD", { align: "center", bold: true, size: 2 });
  add("CLOTURE", { align: "center", bold: true, size: 2 });
  add(`Date : ${day.toLocaleDateString("fr-FR")}`, { align: "center" });
  add(`Heure : ${printed.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}`, { align: "center" });
  rule();
  add(dotted("LIVRAISON", `${Number(report.byMode?.delivery?.count || 0)}  ${dh(report.byMode?.delivery?.total)}`, cols));
  add(dotted("EMPORTE", `${Number(report.byMode?.pickup?.count || 0)}  ${dh(report.byMode?.pickup?.total)}`, cols));
  add(dotted("SUR PLACE", `${Number(report.byMode?.dinein?.count || 0)}  ${dh(report.byMode?.dinein?.total)}`, cols));
  rule();
  add(dotted("COMMANDES", String(Number(report.orders || 0)), cols));
  if (report.cancelled) add(dotted("ANNULEES / REFUSEES", String(Number(report.cancelled)), cols));
  const staff = report.byStaff || [];
  if (staff.length) {
    rule();
    add(dotted("PAR PERSONNE", "CA", cols), { bold: true });
    staff.forEach(entry => {
      const tag = entry.role === "waiter" ? "SRV " : entry.role === "cashier" ? "CAI " : "";
      add(dotted(`${tag}${String(entry.name || "Personnel")}`.toLocaleUpperCase("fr-FR"), `${Number(entry.count || 0)}  ${dh(entry.total)}`, cols));
    });
  }
  rule();
  add(dotted("CATEGORIES", "QTE", cols), { bold: true });
  const categories = report.categories || report.products || [];
  if (!categories.length) add("AUCUNE VENTE");
  else categories.forEach(item => add(dotted(String(item.name || "").toLocaleUpperCase("fr-FR"), String(item.qty), cols), { bold: true }));
  rule();
  add(dotted("TOTAL", dh(report.total), cols), { bold: true, size: 2 });
  return rows;
}

function encodeTicketRows(bytes, rows, paper) {
  rows.forEach(row => {
    if (row.type === "qr") {
      const image = qrRaster(row.data, paper);
      if (image) {
        bytes.push(...ESCPOS.size(0), ...ESCPOS.bold(false), ...ESCPOS.align(1));
        appendRaster(bytes, image);
        bytes.push(0x0a);
      }
      return;
    }
    bytes.push(...ESCPOS.align(row.align === "center" ? 1 : 0), ...ESCPOS.bold(row.bold), ...ESCPOS.size(row.size === 2 ? 0x11 : 0));
    for (const ch of row.text) bytes.push(ch.charCodeAt(0));
    bytes.push(0x0a);
  });
}

function buildClotureTicket(report, { paper = 80 } = {}) {
  const bytes = [...ESCPOS.init, ...ESCPOS.align(1)];
  if (TICKET_ART.logo) {
    appendRaster(bytes, TICKET_ART.logo);
    bytes.push(0x0a);
  }
  encodeTicketRows(bytes, clotureRows(report, colsFor(paper)), paper);
  bytes.push(...ESCPOS.size(0), ...ESCPOS.bold(false), ...ESCPOS.align(0), ...ESCPOS.feed(2), ...ESCPOS.cut);
  return new Uint8Array(bytes);
}

/* ---------- Web Bluetooth / Web Serial printer ---------- */

const GKPrinter = (() => {
  let device = null;
  let characteristic = null;
  let serialPort = null;
  let serialWriter = null;
  const listeners = new Set();
  const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
  const emit = () => listeners.forEach(cb => cb());

  const platform = () => {
    const ua = navigator.userAgent || "";
    const iOS = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
    const android = /Android/i.test(ua);
    return { iOS, android, desktop: !iOS && !android };
  };
  const bleSupported = () => typeof navigator !== "undefined" && "bluetooth" in navigator && window.isSecureContext && !platform().iOS;
  const serialSupported = () => typeof navigator !== "undefined" && "serial" in navigator && window.isSecureContext && platform().desktop;
  const supported = () => bleSupported() || serialSupported();

  async function listServices(server) {
    try {
      return [...await server.getPrimaryServices()];
    } catch {
      const found = [];
      for (const uuid of BLE_SERVICES) {
        try { found.push(await server.getPrimaryService(uuid)); } catch { /* not on this printer */ }
      }
      return found;
    }
  }

  async function findCharacteristic(server) {
    const services = await listServices(server);
    for (const service of services) {
      for (const candidate of await service.getCharacteristics()) {
        if (candidate.properties.writeWithoutResponse || candidate.properties.write) return candidate;
      }
    }
    throw new Error("Cet appareil BLE n'a pas de port d'écriture. Les imprimantes Bluetooth classiques Windows doivent utiliser « Port série ».");
  }

  async function attach(chosen) {
    device = chosen;
    device.removeEventListener("gattserverdisconnected", onDisconnect);
    device.addEventListener("gattserverdisconnected", onDisconnect);
    const server = await device.gatt.connect();
    characteristic = await findCharacteristic(server);
    emit();
  }

  function onDisconnect() {
    characteristic = null;
    emit();
  }

  async function connect() {
    if (platform().iOS) {
      throw new Error("iPhone / iPad : Chrome iOS ne peut pas se connecter en Bluetooth (restriction Apple). Imprimez l'aperçu, ou utilisez un Android / un PC.");
    }
    if (!bleSupported()) {
      throw new Error("Bluetooth web absent. Sur téléphone, ouvrez Chrome Android (pas Safari, pas Facebook, pas Instagram).");
    }
    // requestDevice must be the first await or Chrome swallows the chooser.
    const chosen = await navigator.bluetooth.requestDevice({
      acceptAllDevices: true,
      optionalServices: BLE_SERVICES
    });
    await attach(chosen);
    return chosen.name || "Imprimante BLE";
  }

  async function connectSerial(baudRate = 9600) {
    if (!serialSupported()) {
      throw new Error("Port série web absent. Utilisez Chrome ou Edge, puis couplez l'imprimante dans Windows (elle apparaît en COM).");
    }
    const port = await navigator.serial.requestPort();
    if (serialPort) {
      try { await serialWriter?.releaseLock(); } catch { /* ignore */ }
      try { await serialPort.close(); } catch { /* ignore */ }
    }
    await port.open({ baudRate: Number(baudRate) || 9600 });
    serialPort = port;
    serialWriter = port.writable.getWriter();
    port.addEventListener("disconnect", () => {
      serialWriter = null;
      serialPort = null;
      emit();
    });
    emit();
    return port.getInfo?.().usbProductId ? `Série USB ${port.getInfo().usbProductId}` : "Port série";
  }

  async function reconnect(preferredName = "") {
    if (!bleSupported() || typeof navigator.bluetooth.getDevices !== "function" || characteristic) return false;
    try {
      const known = await navigator.bluetooth.getDevices();
      const target = known.find(item => item.name === preferredName) || known[0];
      if (!target) return false;
      await attach(target);
      return true;
    } catch {
      return false;
    }
  }

  async function disconnect() {
    if (device?.gatt?.connected) device.gatt.disconnect();
    characteristic = null;
    if (serialWriter) {
      try { serialWriter.releaseLock(); } catch { /* ignore */ }
      serialWriter = null;
    }
    if (serialPort) {
      try { await serialPort.close(); } catch { /* ignore */ }
      serialPort = null;
    }
    emit();
  }

  async function write(bytes) {
    const payload = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
    if (serialWriter) {
      await serialWriter.write(payload);
      return;
    }
    if (!characteristic) throw new Error("Imprimante non connectée.");
    const withoutResponse = characteristic.properties.writeWithoutResponse;
    for (let offset = 0; offset < payload.length; offset += BLE_CHUNK) {
      const chunk = payload.slice(offset, offset + BLE_CHUNK);
      if (withoutResponse) await characteristic.writeValueWithoutResponse(chunk);
      else await characteristic.writeValue(chunk);
      if (BLE_DELAY) await wait(BLE_DELAY);
    }
  }

  return {
    supported, bleSupported, serialSupported, platform, connect, connectSerial, reconnect, disconnect, write,
    connected: () => !!characteristic || !!serialWriter,
    name: () => device?.name || (serialWriter ? "Port série" : ""),
    onChange: cb => { listeners.add(cb); }
  };
})();
