import postgres from "postgres";

if (!process.env.GK_DATABASE_URL) throw new Error("GK_DATABASE_URL is required.");

const db = postgres(process.env.GK_DATABASE_URL, { max: 1 });
try {
  const rows = await db.unsafe(
    "SELECT column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'push_subscriptions' ORDER BY ordinal_position"
  );
  const [nulls, policies, tables, broadPolicies] = await Promise.all([
    db.unsafe("SELECT COUNT(*) AS n FROM public.push_subscriptions WHERE branch_id IS NULL"),
    db.unsafe("SELECT policyname, qual, with_check FROM pg_policies WHERE schemaname = 'public' AND tablename = 'push_subscriptions' ORDER BY policyname"),
    db.unsafe(`SELECT c.relname AS table_name, c.relrowsecurity AS rls_enabled
      FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relkind = 'r' ORDER BY c.relname`),
    db.unsafe(`SELECT tablename, policyname, cmd, qual, with_check
      FROM pg_policies WHERE schemaname = 'public'
      AND (coalesce(qual, '') IN ('true', '(true)') OR coalesce(with_check, '') IN ('true', '(true)'))
      ORDER BY tablename, policyname`)
  ]);
  console.log(JSON.stringify({
    columns: rows.map((row) => row.column_name),
    nullBranches: Number(nulls[0]?.n || 0),
    policies,
    rlsDisabled: tables.filter((row) => !row.rls_enabled).map((row) => row.table_name),
    broadPolicies
  }));
} finally {
  await db.end();
}
