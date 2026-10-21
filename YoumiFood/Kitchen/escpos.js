/* ESC/POS ticket builder + Web Bluetooth (BLE only) printer wrapper. */
const BLE_SERVICES = [
  "000018f0-0000-1000-8000-00805f9b34fb",
  "0000ffe0-0000-1000-8000-00805f9b34fb",
  "e7810a71-73ae-499d-8c15-faa9aef0c3f2",
  "49535343-fe7d-4ae5-8fa9-9fafd205e455"
];
const CHUNK = 100;
const CHUNK_DELAY = 25;

const ESCPOS = {
  init: [0x1b, 0x40],
  align: n => [0x1b, 0x61, n],
  bold: on => [0x1b, 0x45, on ? 1 : 0],
  size: n => [0x1d, 0x21, n],
  feed: n => [0x1b, 0x64, n],
  cut: [0x1d, 0x56, 0x42, 0x03]
};

const MODE_LABELS = { delivery: "LIVRAISON", pickup: "A EMPORTER" };
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

function ticketRows(order, { cols = 32, reprint = false } = {}) {
  const rows = [];
  const add = (text, opts = {}) => rows.push({ text: toAscii(text), align: "left", bold: false, size: 1, ...opts });
  const rule = () => add("-".repeat(cols));
  const money = amount => `${Math.round(amount)}`;
  const stamp = new Date(order.createdAt);
  const when = `${stamp.toLocaleDateString("fr-FR")} ${stamp.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}`;

  add("Youmi FOOD", { align: "center", bold: true, size: 2 });
  add("Bouznika", { align: "center" });
  rule();
  add(`#${order.id}`, { align: "center", bold: true, size: 2 });
  add(when, { align: "center" });
  add(MODE_LABELS[order.mode] || order.mode, { align: "center", bold: true });
  if (reprint) add("*** DUPLICATA ***", { align: "center" });
  rule();
  add(`Client : ${order.customer?.name || ""}`);
  if (order.mode === "delivery") {
    add(`Tel : ${order.customer?.phone || ""}`);
    wrap(`Adresse : ${order.address?.street || ""}${order.address?.zone ? ` (${ZONE_NAMES[order.address.zone] || order.address.zone})` : ""}`, cols).forEach(line => add(line));
  }
  rule();
  order.items.forEach(item => {
    add(pair(`${item.qty}x ${item.name}`, money(item.price * item.qty), cols), { bold: true });
    if (item.size) add(`   ${item.size}`);
    (item.extras || []).forEach(extra => add(`   + ${extra}`));
  });
  if (order.note) wrap(`Note : ${order.note}`, cols).forEach(line => add(line, { bold: true }));
  rule();
  add(pair("Sous-total", money(order.subtotal), cols));
  if (order.mode === "delivery") add(pair("Livraison", money(order.fee), cols));
  add(pair("TOTAL MAD", money(order.total), cols), { bold: true });
  wrap(`Paiement : ${order.payment || ""}${order.paymentType === "cash" ? " - a encaisser" : ""}`, cols).forEach(line => add(line));
  if (order.promisedAt) add(`Prete vers : ${new Date(order.promisedAt).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}`, { bold: true });
  rule();
  add("Merci !", { align: "center", bold: true });
  return rows;
}

const colsFor = paper => (Number(paper) === 58 ? 32 : 48);

function ticketText(order, options) {
  const cols = options?.cols ?? 32;
  return ticketRows(order, options).map(row => {
    const width = row.text.length * row.size;
    const pad = row.align === "center" ? Math.max(0, Math.floor((cols - width) / 2)) : 0;
    return " ".repeat(pad) + row.text;
  }).join("\n");
}

function buildTicket(order, { paper = 80, reprint = false } = {}) {
  const bytes = [...ESCPOS.init];
  ticketRows(order, { cols: colsFor(paper), reprint }).forEach(row => {
    bytes.push(...ESCPOS.align(row.align === "center" ? 1 : 0), ...ESCPOS.bold(row.bold), ...ESCPOS.size(row.size === 2 ? 0x11 : 0));
    for (const ch of row.text) bytes.push(ch.charCodeAt(0));
    bytes.push(0x0a);
  });
  bytes.push(...ESCPOS.size(0), ...ESCPOS.bold(false), ...ESCPOS.align(0), ...ESCPOS.feed(3), ...ESCPOS.cut);
  return new Uint8Array(bytes);
}

function buildTestTicket(paper = 80) {
  return buildTicket({
    id: "TEST", createdAt: Date.now(), mode: "pickup", customer: { name: "Ticket de test" },
    items: [{ qty: 1, name: "Impression OK", size: "Éàç œ 123", extras: [], price: 0 }], subtotal: 0, fee: 0, total: 0, payment: "-", paymentType: "card"
  }, { paper });
}

/* ---------- Web Bluetooth printer ---------- */

const GKPrinter = (() => {
  let device = null;
  let characteristic = null;
  const listeners = new Set();
  const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
  const emit = () => listeners.forEach(cb => cb());

  const supported = () => typeof navigator !== "undefined" && "bluetooth" in navigator && window.isSecureContext;

  async function findCharacteristic(server) {
    for (const service of await server.getPrimaryServices()) {
      for (const candidate of await service.getCharacteristics()) {
        if (candidate.properties.writeWithoutResponse || candidate.properties.write) return candidate;
      }
    }
    throw new Error("Aucune caractéristique d'écriture trouvée sur cet appareil.");
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
    if (!supported()) throw new Error("Web Bluetooth indisponible (Chrome/Edge en https ou localhost requis).");
    const chosen = await navigator.bluetooth.requestDevice({ acceptAllDevices: true, optionalServices: BLE_SERVICES });
    await attach(chosen);
    return chosen.name || "Imprimante";
  }

  // Silent reconnection to a previously authorised printer (needs navigator.bluetooth.getDevices).
  async function reconnect(preferredName = "") {
    if (!supported() || typeof navigator.bluetooth.getDevices !== "function" || characteristic) return false;
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

  function disconnect() {
    if (device?.gatt?.connected) device.gatt.disconnect();
    characteristic = null;
    emit();
  }

  async function write(bytes) {
    if (!characteristic) throw new Error("Imprimante non connectée.");
    const withoutResponse = characteristic.properties.writeWithoutResponse;
    for (let offset = 0; offset < bytes.length; offset += CHUNK) {
      const chunk = bytes.slice(offset, offset + CHUNK);
      if (withoutResponse) await characteristic.writeValueWithoutResponse(chunk);
      else await characteristic.writeValue(chunk);
      await wait(CHUNK_DELAY);
    }
  }

  return {
    supported, connect, reconnect, disconnect, write,
    connected: () => !!characteristic,
    name: () => device?.name || "",
    onChange: cb => { listeners.add(cb); }
  };
})();
