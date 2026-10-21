import postgres from "postgres";
import { randomUUID, webcrypto } from "node:crypto";
import { hashSecret } from "../src/lib.js";
import { prompt } from "./prompt.mjs";

globalThis.crypto ||= webcrypto;
const env = process.env;
const dbUrl = env.GK_DATABASE_URL || env.SUPABASE_DB_URL;
if (!dbUrl || !env.OWNER_DOOR_KEY) {
  throw new Error("Set GK_DATABASE_URL and OWNER_DOOR_KEY in the private environment before bootstrapping the owner.");
}
const db = postgres(dbUrl, { max: 1, prepare: false });

async function runAsAdmin(action) {
  return await db.begin(async (tx) => {
    await tx.unsafe("SET LOCAL ROLE gk_api");
    await tx`SELECT set_config('gk.actor_id', '', true), set_config('gk.actor_role', 'admin', true), set_config('gk.branch_id', '', true)`;
    return await action(tx);
  });
}

try {
  const [counts] = await runAsAdmin((tx) => tx`SELECT
    count(*) FILTER (WHERE role = 'admin')::int AS admins,
    count(*) FILTER (WHERE role = 'manager')::int AS managers,
    count(*) FILTER (WHERE role = 'owner')::int AS owners FROM public.users`);
  if (counts.owners) throw new Error("An owner already exists.");
  const email = (await prompt("Owner e-mail: ")).trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 120) throw new Error("Invalid e-mail.");
  const [exists] = await runAsAdmin((tx) => tx`SELECT id FROM public.users WHERE email = ${email} LIMIT 1`);
  if (exists) throw new Error("That e-mail is already used.");
  const password = await prompt("Owner password (12 characters minimum): ", { hidden: true });
  if (password.length < 12 || password.length > 100) throw new Error("Password must be 12–100 characters.");
  if (password !== await prompt("Confirm password: ", { hidden: true })) throw new Error("Passwords do not match.");
  const hash = await hashSecret(password);
  const id = `u_${randomUUID().replaceAll("-", "")}`;
  await runAsAdmin((tx) => tx`INSERT INTO public.users (id, role, name, email, password_hash, active, created_at)
    VALUES (${id}, 'owner', 'Othmane Elazaar', ${email}, ${hash}, 1, ${Date.now()})`);
  console.log("Owner account created. Store OWNER_DOOR_KEY as a Supabase Edge Function secret.");
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
} finally {
  await db.end();
}
