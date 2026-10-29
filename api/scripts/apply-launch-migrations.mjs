import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import postgres from "postgres";

if (!process.env.GK_DATABASE_URL) throw new Error("GK_DATABASE_URL is required.");

const names = [
  "20261028150000_push_subscriptions.sql",
  "20261029110000_owner_audit_policy.sql"
];
const db = postgres(process.env.GK_DATABASE_URL, { max: 1 });
try {
  for (const name of names) {
    const url = new URL(`../supabase/migrations/${name}`, import.meta.url);
    await db.unsafe(await readFile(fileURLToPath(url), "utf8"));
    console.log(`Applied ${name}.`);
  }
} finally {
  await db.end();
}
