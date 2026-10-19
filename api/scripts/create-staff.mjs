import postgres from "postgres";
import { randomUUID } from "node:crypto";
import { prompt } from "./prompt.mjs";

const env = process.env;
const dbUrl = env.GK_DATABASE_URL || env.SUPABASE_DB_URL;
if (!dbUrl || !env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error("Set GK_DATABASE_URL, SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in the private environment.");
}
const db = postgres(dbUrl, { max: 1, prepare: false });
const ask = (text, options) => prompt(text, options);
const quoteSafeEmail = (value) => String(value || "").trim().toLowerCase();

async function runAsAdmin(action) {
  return await db.begin(async (tx) => {
    await tx.unsafe("SET LOCAL ROLE gk_api");
    await tx`SELECT set_config('gk.actor_id', '', true), set_config('gk.actor_role', 'admin', true), set_config('gk.branch_id', '', true)`;
    return await action(tx);
  });
}

try {
  const role = (await ask("Initial role (admin or manager): ")).trim().toLowerCase();
  if (!["admin", "manager"].includes(role)) throw new Error("Choose admin or manager.");
  const [counts] = await runAsAdmin((tx) => tx`SELECT
    count(*) FILTER (WHERE role = 'admin')::int AS admins,
    count(*) FILTER (WHERE role = 'manager')::int AS managers FROM public.users`);
  if (role === "admin" && counts.admins) throw new Error("A platform admin already exists.");
  if (role === "manager" && !counts.admins) throw new Error("Create the first platform admin first.");

  let branchId = null;
  if (role === "manager") {
    branchId = (await ask("Branch id (gk-food or gk-shawarma-crispy): ")).trim();
    const [branch] = await db`SELECT id FROM public.branches WHERE id = ${branchId} AND active = 1`;
    if (!branch) throw new Error("Choose an active branch.");
  }
  const email = quoteSafeEmail(await ask("E-mail: "));
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 120) throw new Error("Invalid e-mail.");
  const name = (await ask("Name: ")).trim();
  if (!name || name.length > 50) throw new Error("Invalid name.");
  const password = await ask("Password (12 characters minimum): ", { hidden: true });
  if (password.length < 12 || password.length > 100) throw new Error("Password must be 12–100 characters.");
  if (password !== await ask("Confirm password: ", { hidden: true })) throw new Error("Passwords do not match.");
  const [exists] = await runAsAdmin((tx) => tx`SELECT id FROM public.users WHERE email = ${email} LIMIT 1`);
  if (exists) throw new Error("That e-mail is already used.");

  const authResponse = await fetch(`${env.SUPABASE_URL.replace(/\/+$/, "")}/auth/v1/admin/users`, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}` },
    body: JSON.stringify({ email, password, email_confirm: true, user_metadata: { gk_role: role } })
  });
  const authUser = await authResponse.json().catch(() => ({}));
  if (!authResponse.ok || !authUser.id) throw new Error("Supabase Auth account creation failed.");
  const id = `u_${randomUUID().replaceAll("-", "")}`;
  try {
    await runAsAdmin((tx) => tx`INSERT INTO public.users (id, auth_user_id, role, name, email, active, must_change, created_at, branch_id)
      VALUES (${id}, ${authUser.id}, ${role}, ${name}, ${email}, 1, 1, ${Date.now()}, ${branchId})`);
  } catch (error) {
    await fetch(`${env.SUPABASE_URL.replace(/\/+$/, "")}/auth/v1/admin/users/${authUser.id}`, {
      method: "DELETE",
      headers: { apikey: env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}` }
    });
    throw error;
  }
  console.log(`${role} created${branchId ? ` for ${branchId}` : ""}. Sign in and create branch staff from the admin app.`);
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
} finally {
  await db.end();
}
