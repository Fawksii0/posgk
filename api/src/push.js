import webpush from "web-push";
import { fail, str, randomId, now } from "./lib.js";
import { run, first, all } from "./core.js";

const APP_URL = {
  client: "https://app.gkfood.store/",
  courier: "https://courier.gkfood.store/",
  waiter: "https://serveur.gkfood.store/",
  serveur: "https://serveur.gkfood.store/",
  staff: "https://kitchen.gkfood.store/",
  caisse: "https://caisse.gkfood.store/",
  cuisine: "https://kitchen.gkfood.store/",
  kitchen: "https://kitchen.gkfood.store/",
  admin: "https://admin.gkfood.store/",
  ops: "https://ops.gkfood.store/"
};

function vapid(env) {
  const publicKey = env.VAPID_PUBLIC_KEY;
  const privateKey = env.VAPID_PRIVATE_KEY;
  if (!publicKey || !privateKey) return null;
  return {
    publicKey,
    privateKey,
    subject: env.VAPID_SUBJECT || "mailto:hello@gkfood.store"
  };
}

function configure(env) {
  const keys = vapid(env);
  if (!keys) return null;
  webpush.setVapidDetails(keys.subject, keys.publicKey, keys.privateKey);
  return keys;
}

export function audienceFor(role, app = "") {
  if (app === "serveur" || role === "waiter") return "waiter";
  if (role === "client") return "client";
  if (role === "courier") return "courier";
  return "staff";
}

export function vapidPublic(c) {
  const keys = vapid(c.env);
  if (!keys) fail(501, "push_unavailable", "Les notifications téléphone ne sont pas configurées.");
  return { publicKey: keys.publicKey };
}

export async function subscribe(c) {
  if (!configure(c.env)) fail(501, "push_unavailable", "Les notifications téléphone ne sont pas configurées.");
  const body = c.body?.subscription || c.body;
  const endpoint = str(body.endpoint, { min: 20, max: 2000, field: "Endpoint" });
  if (!endpoint.startsWith("https://")) fail(400, "invalid", "Abonnement push invalide.");
  const p256dh = str(body.keys?.p256dh || body.p256dh, { min: 20, max: 200, field: "Clé" });
  const auth = str(body.keys?.auth || body.auth, { min: 8, max: 200, field: "Auth" });
  const app = str(c.body.app || "app", { max: 40, field: "App" });
  const audience = audienceFor(c.user.role, app);
  const t = now();
  const existing = await first(c.env, "SELECT id FROM push_subscriptions WHERE endpoint = ?", endpoint);
  if (existing) {
    await run(c.env, "UPDATE push_subscriptions SET user_id = ?, audience = ?, app = ?, p256dh = ?, auth = ?, updated_at = ? WHERE id = ?",
      c.user.id, audience, app, p256dh, auth, t, existing.id);
    return { ok: true, id: existing.id };
  }
  const id = randomId("ps_");
  await run(c.env, "INSERT INTO push_subscriptions (id, user_id, audience, app, endpoint, p256dh, auth, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?)",
    id, c.user.id, audience, app, endpoint, p256dh, auth, t, t);
  return { ok: true, id };
}

export async function unsubscribe(c) {
  const endpoint = str(c.body.endpoint, { min: 20, max: 2000, field: "Endpoint" });
  await run(c.env, "DELETE FROM push_subscriptions WHERE endpoint = ? AND user_id = ?", endpoint, c.user.id);
  return { ok: true };
}

export async function sendPush(env, { audience, userId = null, title, text = "", orderId = null }) {
  const keys = configure(env);
  if (!keys) return;
  const rows = userId
    ? await all(env, "SELECT * FROM push_subscriptions WHERE user_id = ?", userId)
    : await all(env, "SELECT * FROM push_subscriptions WHERE audience = ?", audience);
  if (!rows.length) return;
  await Promise.all(rows.map(async (row) => {
    const url = APP_URL[row.app] || APP_URL[row.audience] || "https://app.gkfood.store/";
    try {
      await webpush.sendNotification({
        endpoint: row.endpoint,
        keys: { p256dh: row.p256dh, auth: row.auth }
      }, JSON.stringify({ title: title || "G&K Food", text: String(text || "").slice(0, 180), orderId, url }), {
        TTL: 120,
        urgency: "high"
      });
    } catch (error) {
      const status = Number(error?.statusCode || 0);
      if (status === 404 || status === 410) {
        await run(env, "DELETE FROM push_subscriptions WHERE id = ?", row.id).catch(() => {});
      }
    }
  }));
}
