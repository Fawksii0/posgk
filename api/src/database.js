import postgres from "postgres";
import { numberedParameters } from "./postgres-sql.js";

function listenConnectionString(connectionString) {
  try {
    const url = new URL(connectionString);
    const user = decodeURIComponent(url.username);
    const project = user.startsWith("postgres.") ? user.slice("postgres.".length) : "";
    if (project && /pooler\.supabase\.com$/i.test(url.hostname)) {
      url.hostname = `db.${project}.supabase.co`;
      url.port = "5432";
      url.username = "postgres";
      return url.toString();
    }
  } catch {
    /* keep the original URL */
  }
  return connectionString;
}

function poolOptions() {
  return {
    max: 8,
    prepare: false,
    fetch_types: false,
    idle_timeout: 30,
    max_lifetime: 60 * 20,
    connect_timeout: 10,
    ssl: "require",
    connection: { application_name: "gk-api" }
  };
}

function contextKey(context) {
  return `${context.actorId || ""}|${context.actorRole || "anonymous"}|${context.branchId || ""}`;
}

export function createDatabase(connectionString) {
  const client = postgres(connectionString, poolOptions());
  const listenClient = postgres(listenConnectionString(connectionString), {
    ...poolOptions(),
    max: 2,
    prepare: false
  });

  const applyContext = (sql, context) => sql.unsafe("SET LOCAL ROLE gk_api").then(() => sql`
    SELECT
      set_config('gk.actor_id', ${context.actorId || ""}, true),
      set_config('gk.actor_role', ${context.actorRole || "anonymous"}, true),
      set_config('gk.branch_id', ${context.branchId || ""}, true)
  `);

  const forRequest = () => {
    let context = { actorId: null, actorRole: "anonymous", branchId: null };
    let applied = "";
    let sql = null;
    let settle = null;
    let begun = null;
    let queue = Promise.resolve();

    const exclusive = (work) => {
      const run = queue.then(work);
      queue = run.then(() => undefined, () => undefined);
      return run;
    };

    const ensureTx = async () => {
      if (sql) return sql;
      let ready;
      const opened = new Promise((resolve, reject) => {
        ready = { resolve, reject };
      });
      begun = client.begin((tx) => {
        sql = tx;
        ready.resolve(tx);
        return new Promise((resolve, reject) => {
          settle = { resolve, reject };
        });
      });
      begun.catch((error) => ready.reject(error));
      await opened;
      applied = "";
      return sql;
    };

    const syncContext = async () => {
      const tx = await ensureTx();
      const key = contextKey(context);
      if (key === applied) return tx;
      await applyContext(tx, context);
      applied = key;
      return tx;
    };

    const execute = (statement) => exclusive(async () => {
      const tx = await syncContext();
      return tx.unsafe(numberedParameters(statement.text), statement.values);
    });

    return {
      setContext(next) { context = { ...context, ...next }; },
      prepare(text) {
        let values = [];
        const statement = () => ({ text, values });
        const bound = {
          bind(...args) { values = args; return bound; },
          asStatement() { return statement(); },
          async all() {
            const rows = await execute(statement());
            return { results: [...rows], success: true };
          },
          async first(column) {
            const rows = await execute(statement());
            const row = rows[0] || null;
            return column && row ? row[column] : row;
          },
          async run() {
            const rows = await execute(statement());
            return { success: true, meta: { changes: rows.count } };
          }
        };
        return bound;
      },
      async batch(statements) {
        const requestContext = context;
        const batchStatements = statements.map((item) => item.asStatement ? item.asStatement() : item);
        return exclusive(async () => {
          const tx = await syncContext();
          context = requestContext;
          const results = [];
          for (const statement of batchStatements) {
            results.push(await tx.unsafe(numberedParameters(statement.text), statement.values));
          }
          return results;
        });
      },
      async waitNotify(channel, timeoutMs, signal) {
        if (signal?.aborted) return null;
        let settled = false;
        let listener = null;
        let timer;
        return await new Promise((resolve) => {
          const finish = (value) => {
            if (settled) return;
            settled = true;
            if (timer) clearTimeout(timer);
            signal?.removeEventListener("abort", onAbort);
            const stop = listener;
            listener = null;
            if (stop) void stop.unlisten().catch(() => {});
            resolve(value);
          };
          const onAbort = () => finish(null);
          signal?.addEventListener("abort", onAbort, { once: true });
          listenClient.listen(channel, (payload) => finish(payload)).then((next) => {
            listener = next;
            if (settled) {
              void next.unlisten().catch(() => {});
              return;
            }
            timer = setTimeout(() => finish(null), Math.max(50, timeoutMs));
          }).catch(() => finish(null));
        });
      },
      async finish(commit = true) {
        return exclusive(async () => {
          if (!sql || !settle) return;
          sql = null;
          applied = "";
          const pending = begun;
          begun = null;
          const end = settle;
          settle = null;
          if (commit) end.resolve();
          else end.reject(Object.assign(new Error("rollback"), { code: "gk_rollback" }));
          await Promise.resolve(pending).catch((error) => {
            if (!commit || error?.code === "gk_rollback") return;
            throw error;
          });
        });
      }
    };
  };

  return { forRequest, close: () => Promise.allSettled([client.end(), listenClient.end()]) };
}
