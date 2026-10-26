// Shared helpers: crypto, tokens, HTTP, validation.
const enc = new TextEncoder();
export const ITER = 100000; // Workers WebCrypto caps PBKDF2 at 100000 iterations.

export const now = () => Date.now();

/* ---------- bytes ---------- */
export const b64 = (buf) => { let s = ""; const a = new Uint8Array(buf); for (let i = 0; i < a.length; i++) s += String.fromCharCode(a[i]); return btoa(s); };
export const unb64 = (s) => { const bin = atob(s); const a = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) a[i] = bin.charCodeAt(i); return a; };
export const b64u = (buf) => b64(buf).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
export const unb64u = (s) => unb64(s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4));

export function randomBytes(n) { const a = new Uint8Array(n); crypto.getRandomValues(a); return a; }
export const randomId = (prefix = "") => prefix + b64u(randomBytes(12));
export function randomDigits(n) {
  let out = "";
  while (out.length < n) { const v = randomBytes(4); out += String(new DataView(v.buffer).getUint32(0) % 10000).padStart(4, "0"); }
  return out.slice(0, n);
}

/* Constant-time comparison (length is hashed away first). */
export async function safeEqual(a, b) {
  const key = await crypto.subtle.importKey("raw", randomBytes(32), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
  const ha = new Uint8Array(await crypto.subtle.sign("HMAC", key, enc.encode(String(a))));
  const hb = new Uint8Array(await crypto.subtle.sign("HMAC", key, enc.encode(String(b))));
  let d = 0;
  for (let i = 0; i < ha.length; i++) d |= ha[i] ^ hb[i];
  return d === 0;
}

/* ---------- PBKDF2 ---------- */
async function pbkdf2(secret, salt, iter) {
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), "PBKDF2", false, ["deriveBits"]);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt, iterations: iter }, key, 256));
}
export async function hashSecret(secret) {
  const salt = randomBytes(16);
  const h = await pbkdf2(secret, salt, ITER);
  return `pbkdf2$${ITER}$${b64(salt)}$${b64(h)}`;
}
const DUMMY = "pbkdf2$100000$AAAAAAAAAAAAAAAAAAAAAA==$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=";
/* Always performs a full derivation, even when no hash exists. Returns a boolean. */
export async function verifySecret(secret, stored) {
  const parts = String(stored || DUMMY).split("$");
  const valid = parts.length === 4 && parts[0] === "pbkdf2";
  const p = valid ? parts : DUMMY.split("$");
  const iter = Math.min(ITER, Math.max(1, parseInt(p[1], 10) || ITER));
  const h = await pbkdf2(String(secret), unb64(p[2]), iter);
  const expected = unb64(p[3]);
  let d = h.length ^ expected.length;
  for (let i = 0; i < h.length; i++) d |= h[i] ^ (expected[i] ?? 0);
  return d === 0 && valid && !!stored;
}

/* ---------- HMAC tokens ---------- */
async function hmacKey(secret) { return crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]); }
export async function hmacHex(secret, text) {
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", await hmacKey(secret), enc.encode(text)));
  return [...sig].map((x) => x.toString(16).padStart(2, "0")).join("");
}
export async function signToken(env, payload) {
  const head = b64u(enc.encode(JSON.stringify({ alg: "HS256", typ: "JWT" })));
  const body = b64u(enc.encode(JSON.stringify(payload)));
  const sig = await crypto.subtle.sign("HMAC", await hmacKey(env.SESSION_SECRET), enc.encode(`${head}.${body}`));
  return `${head}.${body}.${b64u(sig)}`;
}
export async function verifyToken(env, token) {
  const parts = String(token || "").split(".");
  if (parts.length !== 3) return null;
  try {
    const ok = await crypto.subtle.verify("HMAC", await hmacKey(env.SESSION_SECRET), unb64u(parts[2]), enc.encode(`${parts[0]}.${parts[1]}`));
    if (!ok) return null;
    const payload = JSON.parse(new TextDecoder().decode(unb64u(parts[1])));
    if (!payload.exp || payload.exp < Math.floor(now() / 1000)) return null;
    return payload;
  } catch { return null; }
}

/* ---------- HTTP ---------- */
export class HttpError extends Error {
  constructor(status, code, message, extra) { super(message || code); this.status = status; this.code = code; this.extra = extra; }
}
export const fail = (status, code, message, extra) => { throw new HttpError(status, code, message, extra); };

const SECURITY_HEADERS = {
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Referrer-Policy": "no-referrer",
  "Cache-Control": "no-store",
  "Content-Security-Policy": "default-src 'none'; frame-ancestors 'none'",
  "Strict-Transport-Security": "max-age=31536000; includeSubDomains"
};

export function originAllowed(env, origin) {
  if (!origin) return false;
  const allowed = String(env.ALLOWED_ORIGINS || "").split(",").map((s) => s.trim()).filter(Boolean);
  if (allowed.includes(origin)) return true;
  try {
    const url = new URL(origin);
    const host = url.hostname;
    if (url.protocol === "https:" && (host === "gkfood.store" || host.endsWith(".gkfood.store"))) return true;
    if (url.protocol === "http:" && (host === "localhost" || host === "127.0.0.1") && (url.port === "8800" || url.port === "")) return true;
  } catch {
    return false;
  }
  return false;
}

export function corsHeaders(env, req) {
  const origin = req.headers.get("Origin");
  const h = { Vary: "Origin" };
  if (originAllowed(env, origin)) {
    h["Access-Control-Allow-Origin"] = origin;
    h["Access-Control-Allow-Methods"] = "GET,POST,PUT,PATCH,DELETE,OPTIONS";
    h["Access-Control-Allow-Headers"] = "Authorization, Content-Type, X-GK-Branch, x-region";
    h["Access-Control-Max-Age"] = "7200";
  }
  return h;
}

export function json(env, req, data, status = 200, extra = {}) {
  return new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json; charset=utf-8", ...SECURITY_HEADERS, ...corsHeaders(env, req), ...extra } });
}

export async function readBody(req, limit = 65536) {
  const text = await req.text();
  if (text.length > limit) fail(413, "too_large", "Requête trop volumineuse.");
  if (!text) return {};
  try { const v = JSON.parse(text); if (v === null || typeof v !== "object" || Array.isArray(v)) throw new Error(); return v; } catch { return fail(400, "bad_json", "JSON invalide."); }
}

/* ---------- validation ---------- */
export function str(v, { max = 120, min = 0, field = "champ", trim = true } = {}) {
  if (v === undefined || v === null) v = "";
  if (typeof v !== "string") fail(400, "invalid", `${field} invalide.`);
  const s = trim ? v.trim() : v;
  if (s.length < min) fail(400, "invalid", `${field} requis.`);
  if (s.length > max) fail(400, "invalid", `${field} trop long (max ${max}).`);
  return s;
}
export function numv(v, { min = 0, max = 1e6, field = "valeur", int = false, def } = {}) {
  if ((v === undefined || v === null || v === "") && def !== undefined) return def;
  const n = typeof v === "number" ? v : Number(String(v).replace(",", "."));
  if (!Number.isFinite(n) || n < min || n > max || (int && !Number.isInteger(n))) fail(400, "invalid", `${field} invalide.`);
  return n;
}
export const bool = (v) => (v === true || v === 1 || v === "1" || v === "true" ? 1 : 0);
export function oneOf(v, list, field = "valeur") { if (!list.includes(v)) fail(400, "invalid", `${field} invalide.`); return v; }

export function normPhone(raw) {
  let d = String(raw || "").replace(/[^\d+]/g, "");
  if (d.startsWith("+212")) d = "0" + d.slice(4);
  else if (d.startsWith("00212")) d = "0" + d.slice(5);
  else if (d.startsWith("212") && d.length === 12) d = "0" + d.slice(3);
  else if (/^[5-7]\d{8}$/.test(d)) d = "0" + d;
  if (!/^0[5-7]\d{8}$/.test(d)) fail(400, "invalid_phone", "Numéro de téléphone invalide.");
  return d;
}
export function normEmail(raw) {
  const e = String(raw || "").trim().toLowerCase();
  if (e.length > 120 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) fail(400, "invalid_email", "E-mail invalide.");
  return e;
}

export const jparse = (s, def) => { try { return JSON.parse(s); } catch { return def; } };

export function haversineKm(a, b) {
  const R = 6371, rad = (x) => (x * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat), dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
