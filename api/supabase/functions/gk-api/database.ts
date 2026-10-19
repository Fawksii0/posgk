import postgres from "npm:postgres@3.4.7";
import { numberedParameters } from "../../../src/postgres-sql.js";

type Context = { actorId: string | null; actorRole: string; branchId: string | null };
type BoundStatement = { text: string; values: unknown[] };

export function createDatabase(connectionString: string) {
  const client = postgres(connectionString, { max: 8, prepare: false });
  const execute = async (statement: BoundStatement, context: Context) =>
    await client.begin(async (tx) => {
      await tx.unsafe("SET LOCAL ROLE gk_api");
      await tx`SELECT
        set_config('gk.actor_id', ${context.actorId || ""}, true),
        set_config('gk.actor_role', ${context.actorRole || "anonymous"}, true),
        set_config('gk.branch_id', ${context.branchId || ""}, true)`;
      return await tx.unsafe(numberedParameters(statement.text), statement.values as any[]);
    });

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
          await tx.unsafe("SET LOCAL ROLE gk_api");
          await tx`SELECT
            set_config('gk.actor_id', ${requestContext.actorId || ""}, true),
            set_config('gk.actor_role', ${requestContext.actorRole || "anonymous"}, true),
            set_config('gk.branch_id', ${requestContext.branchId || ""}, true)`;
          const results = [];
          for (const statement of batchStatements) results.push(await tx.unsafe(numberedParameters(statement.text), statement.values as any[]));
          return results;
        });
      }
    };
  };

  return { forRequest, close: () => client.end() };
}
