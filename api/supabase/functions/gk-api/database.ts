import postgres from "npm:postgres@3.4.7";
import { numberedParameters } from "../../../src/postgres-sql.js";

type Context = { actorId: string | null; actorRole: string; branchId: string | null };
type BoundStatement = { text: string; values: unknown[] };

function listenConnectionString(connectionString: string) {
  try {
    const url = new URL(connectionString);
    const user = decodeURIComponent(url.username);
    const project = user.startsWith("postgres.") ? user.slice("postgres.".length) : "";
    // Transaction poolers drop LISTEN; prefer the direct db host for the notify waiter.
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

export function createDatabase(connectionString: string) {
  const client = postgres(connectionString, { max: 6, prepare: false, idle_timeout: 20, connect_timeout: 15 });
  const listenClient = postgres(listenConnectionString(connectionString), { max: 2, prepare: false, idle_timeout: 30, connect_timeout: 15 });
  // Role + actor context + statement are pipelined in one transaction to cut database round trips.
  const contextQueries = (tx: any, context: Context) => [
    tx.unsafe("SET LOCAL ROLE gk_api"),
    tx`SELECT
      set_config('gk.actor_id', ${context.actorId || ""}, true),
      set_config('gk.actor_role', ${context.actorRole || "anonymous"}, true),
      set_config('gk.branch_id', ${context.branchId || ""}, true)`
  ];
  const execute = async (statement: BoundStatement, context: Context) => {
    const results: any[] = await client.begin((tx: any) => [
      ...contextQueries(tx, context),
      tx.unsafe(numberedParameters(statement.text), statement.values as any[])
    ]);
    return results[2];
  };

  const forRequest = () => {
    let context: Context = { actorId: null, actorRole: "anonymous", branchId: null };
    return {
      setContext(next: Partial<Context>) { context = { ...context, ...next }; },
      prepare(text: string) {
        let values: unknown[] = [];
        const statement = () => ({ text, values });
        const bound = {
          bind(...args: unknown[]) { values = args; return bound; },
          asStatement() { return statement(); },
          async all() {
            const rows = await execute(statement(), context);
            return { results: [...rows], success: true };
          },
          async first(column?: string) {
            const rows = await execute(statement(), context);
            const row = rows[0] || null;
            return column && row ? row[column] : row;
          },
          async run() {
            const rows = await execute(statement(), context);
            return { success: true, meta: { changes: rows.count } };
          }
        };
        return bound;
      },
      async batch(statements: Array<BoundStatement | { asStatement: () => BoundStatement }>) {
        const requestContext = context;
        const batchStatements = statements.map((item: any) => item.asStatement ? item.asStatement() : item);
        return await client.begin(async (tx) => {
          const results: any[] = await Promise.all([
            ...contextQueries(tx, requestContext),
            ...batchStatements.map((statement: BoundStatement) => tx.unsafe(numberedParameters(statement.text), statement.values as any[]))
          ]);
          return results.slice(2);
        });
      },
      // Dedicated LISTEN connection; the waiter/kitchen long-poll sits here until Postgres notifies.
      async waitNotify(channel: string, timeoutMs: number, signal?: AbortSignal) {
        if (signal?.aborted) return null;
        let settled = false;
        let listener: { unlisten: () => Promise<void> } | null = null;
        let timer: ReturnType<typeof setTimeout> | undefined;
        return await new Promise<string | null>((resolve) => {
          const finish = (value: string | null) => {
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
          listenClient.listen(channel, (payload: string) => finish(payload)).then((next) => {
            listener = next;
            if (settled) {
              void next.unlisten().catch(() => {});
              return;
            }
            timer = setTimeout(() => finish(null), Math.max(50, timeoutMs));
          }).catch(() => finish(null));
        });
      }
    };
  };

  return { forRequest, close: () => Promise.allSettled([client.end(), listenClient.end()]) };
}
