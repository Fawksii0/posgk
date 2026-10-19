import app from "../../../src/index.js";
import { createDatabase } from "./database.ts";

let sharedDatabase: ReturnType<typeof createDatabase> | null = null;

Deno.serve(async (request: Request) => {
  const databaseUrl = Deno.env.get("GK_DATABASE_URL") || Deno.env.get("SUPABASE_DB_URL");
  const required = ["SUPABASE_URL", "SUPABASE_ANON_KEY", "SUPABASE_SERVICE_ROLE_KEY", "SESSION_SECRET", "OWNER_DOOR_KEY", "DISPATCH_SECRET"];
  const missing = required.filter((name) => !Deno.env.get(name));
  if (!databaseUrl || missing.length) {
    return new Response(JSON.stringify({
      error: {
        code: "configuration_required",
        message: "Configurez les secrets Supabase privés avant d'utiliser l'API.",
        missing: [...missing, ...(!databaseUrl ? ["GK_DATABASE_URL"] : [])]
      }
    }), { status: 503, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" } });
  }
  sharedDatabase ||= createDatabase(databaseUrl);
  const env = {
    SUPABASE_URL: Deno.env.get("SUPABASE_URL"),
    SUPABASE_ANON_KEY: Deno.env.get("SUPABASE_ANON_KEY"),
    SUPABASE_SERVICE_ROLE_KEY: Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"),
    SESSION_SECRET: Deno.env.get("SESSION_SECRET"),
    OWNER_DOOR_KEY: Deno.env.get("OWNER_DOOR_KEY"),
    DISPATCH_SECRET: Deno.env.get("DISPATCH_SECRET"),
    ALLOWED_ORIGINS: Deno.env.get("ALLOWED_ORIGINS") || "",
    DB: sharedDatabase.forRequest()
  };
  const url = new URL(request.url);
  const stripped = url.pathname.replace(/^(?:\/functions\/v1)?\/gk-api(?=\/|$)/, "") || "/";
  if (stripped !== url.pathname) {
    url.pathname = stripped;
    request = new Request(url, request);
  }
  return await app.fetch(request, env);
});
