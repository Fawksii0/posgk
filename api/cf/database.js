import postgres from "postgres";
import { numberedParameters } from "../src/postgres-sql.js";

export function createDatabase(connectionString) {
  const client = postgres(connectionString, {
    max: 1,
    fetch_types: false,
    connect_timeout: 10
  });
  const contextQueries = (tx, context) => [
    tx.unsafe("SET LOCAL ROLE gk_api"),
    tx`SELECT
      set_config('gk.actor_id', ${context.actorId || ""}, true),
      set_config('gk.actor_role', ${context.actorRole || "anonymous"}, true),
      set_config('gk.branch_id', ${context.branchId || ""}, true)`
  ];
  const execute = async (statement, context) => {
    const results = await client.begin((tx) => [
      ...contextQueries(tx, context),
      tx.unsafe(numberedParameters(statement.text), statement.values)
    ]);
    return results[2];
  };

  const forRequest = () => {
    let context = { actorId: null, actorRole: "anonymous", branchId: null };
    return {
      setContext(next) { context = { ...context, ...next }; },
      prepare(text) {
        let values = [];
        const statement = () => ({ text, values });
        const bound = {
          bind(...args) { values = args; return bound; },
          asStatement() { return statement(); },
          async all() {
            const rows = await execute(statement(), context);
            return { results: [...rows], success: true };
          },
          async first(column) {
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
      async batch(statements) {
        const requestContext = context;
        const batchStatements = statements.map((item) => item.asStatement ? item.asStatement() : item);
        return await client.begin(async (tx) => {
          const results = await Promise.all([
            ...contextQueries(tx, requestContext),
            ...batchStatements.map((statement) => tx.unsafe(numberedParameters(statement.text), statement.values))
          ]);
          return results.slice(2);
        });
      },
      async waitNotify(_channel, timeoutMs, signal) {
        const ms = Math.min(Math.max(Number(timeoutMs) || 1000, 50), 4000);
        await new Promise((resolve) => {
          const timer = setTimeout(resolve, ms);
          signal?.addEventListener("abort", () => {
            clearTimeout(timer);
            resolve();
          }, { once: true });
        });
        return null;
      }
    };
  };

  return { forRequest, close: () => client.end() };
}
