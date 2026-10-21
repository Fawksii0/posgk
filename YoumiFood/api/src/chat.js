// Order chat between a client and the courier assigned to their order.
import { fail, now, str } from "./lib.js";
import { all, first, run } from "./core.js";

export const ACTIVE_STATUSES = ["preparing", "ready", "enroute"];
const MAX_PER_MINUTE = 20;

const isLive = (row) => ACTIVE_STATUSES.includes(row.status) && row.dispatch_state === "assigned" && !!row.courier_id;
export const firstName = (name) => String(name || "").trim().split(/\s+/)[0] || "";

async function chatOrder(c) {
  const role = c.user.role;
  if (role !== "client" && role !== "courier") fail(403, "forbidden", "Messagerie réservée au client et au livreur.");
  const row = await first(c.env, "SELECT id, status, client_id, courier_id, dispatch_state, customer_name, customer_phone FROM orders WHERE id = ?", c.params.id);
  const owns = row && (role === "client" ? row.client_id === c.user.id : row.courier_id === c.user.id);
  if (!owns) fail(404, "not_found", "Commande introuvable.");
  return row;
}

export async function courierContact(env, row) {
  if (!isLive(row)) return null;
  const r = await first(env, "SELECT name, phone FROM gk_order_courier(?)", row.id);
  return r ? { name: firstName(r.name), phone: r.phone || null } : null;
}

export async function messagesList(c) {
  const row = await chatOrder(c);
  const role = c.user.role;
  const after = Math.max(0, Math.floor(Number(c.url.searchParams.get("after")) || 0));
  const rows = await all(c.env, "SELECT id, sender_role, body, created_at FROM order_messages WHERE order_id = ? AND id > ? ORDER BY id LIMIT 200", row.id, after);
  await run(c.env, "UPDATE order_messages SET read = 1 WHERE order_id = ? AND sender_id <> ? AND read = 0", row.id, c.user.id);
  const peer = role === "client"
    ? await courierContact(c.env, row)
    : { name: firstName(row.customer_name), phone: isLive(row) ? row.customer_phone || null : null };
  return {
    messages: rows.map((m) => ({ id: Number(m.id), mine: m.sender_role === role, body: m.body, at: Number(m.created_at) })),
    canSend: isLive(row),
    peer
  };
}

export async function messageSend(c) {
  const row = await chatOrder(c);
  const body = str(c.body.body, { min: 1, max: 500, field: "Message" });
  if (!isLive(row)) fail(409, "chat_closed", "La conversation est fermée.");
  const recent = await first(c.env, "SELECT COUNT(*) AS n FROM order_messages WHERE sender_id = ? AND created_at > ?", c.user.id, now() - 60000);
  if (Number(recent?.n) >= MAX_PER_MINUTE) fail(429, "slow_down", "Trop de messages, patientez un instant.");
  await run(c.env, "INSERT INTO order_messages (order_id, sender_id, sender_role, body, created_at) VALUES (?,?,?,?,?)", row.id, c.user.id, c.user.role, body, now());
  return { ok: true };
}

export async function unreadCounts(c) {
  if (c.user.role !== "client" && c.user.role !== "courier") return { unread: {}, total: 0 };
  const rows = await all(c.env, "SELECT order_id, COUNT(*) AS n FROM order_messages WHERE sender_role <> ? AND read = 0 GROUP BY order_id", c.user.role);
  const unread = Object.fromEntries(rows.map((r) => [r.order_id, Number(r.n)]));
  return { unread, total: Object.values(unread).reduce((a, b) => a + b, 0) };
}
