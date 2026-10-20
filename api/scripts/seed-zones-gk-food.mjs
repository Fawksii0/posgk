// Seeds starter delivery zones for G&K Food. Safe to re-run; fees can then be edited in the Admin app.
import postgres from "postgres";

const BRANCH = "gk-food";
const url = process.env.GK_DATABASE_URL;
if (!url) throw new Error("Set GK_DATABASE_URL in the private environment first.");

const ZONES = [
  ["Centre-ville Bouznika", 10, 40, 15, 30, 150],
  ["Bouznika Plage", 15, 50, 20, 35, 200],
  ["Quartiers périphériques", 20, 60, 25, 45, 250]
];

const sql = postgres(url, { max: 1, prepare: false });
try {
  await sql.begin(async (tx) => {
    await tx`SELECT set_config('gk.actor_id', '', true), set_config('gk.actor_role', 'admin', true), set_config('gk.branch_id', ${BRANCH}, true)`;
    for (const [name, fee, minOrder, etaMin, etaMax, freeFrom] of ZONES) {
      const id = `z_${BRANCH}_${name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}`;
      await tx`INSERT INTO public.zones (id, branch_id, name, fee, min_order, eta_min, eta_max, free_from, enabled)
        VALUES (${id}, ${BRANCH}, ${name}, ${fee}, ${minOrder}, ${etaMin}, ${etaMax}, ${freeFrom}, 1)
        ON CONFLICT (id) DO NOTHING`;
    }
  });
  console.log(`Zones ready for ${BRANCH}.`);
} finally {
  await sql.end();
}
