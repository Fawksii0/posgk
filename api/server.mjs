import { createServer } from "node:http";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import app from "./src/index.js";
import { createDatabase } from "./src/database.js";

const required = ["GK_DATABASE_URL", "SUPABASE_URL", "SUPABASE_ANON_KEY", "SUPABASE_SERVICE_ROLE_KEY", "SESSION_SECRET", "OWNER_DOOR_KEY", "DISPATCH_SECRET"];
const missing = required.filter((name) => !process.env[name]);
if (missing.length) {
  console.error("Missing env:", missing.join(", "));
  process.exit(1);
}

const port = Number(process.env.PORT) || 8080;
const database = createDatabase(process.env.GK_DATABASE_URL);
const runtime = process.env.FLY_REGION ? `fly-${process.env.FLY_REGION}` : "node";

function envForRequest() {
  return {
    SUPABASE_URL: process.env.SUPABASE_URL,
    SUPABASE_ANON_KEY: process.env.SUPABASE_ANON_KEY,
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
    SESSION_SECRET: process.env.SESSION_SECRET,
    OWNER_DOOR_KEY: process.env.OWNER_DOOR_KEY,
    DISPATCH_SECRET: process.env.DISPATCH_SECRET,
    ALLOWED_ORIGINS: process.env.ALLOWED_ORIGINS || "",
    GK_API_RUNTIME: runtime,
    DB: database.forRequest()
  };
}

function toRequest(req) {
  const host = req.headers.host || "localhost";
  const proto = req.headers["x-forwarded-proto"] || "http";
  const url = `${proto}://${host}${req.url}`;
  const headers = new Headers();
  for (const [key, value] of Object.entries(req.headers)) {
    if (value == null) continue;
    headers.set(key, Array.isArray(value) ? value.join(", ") : String(value));
  }
  const method = req.method || "GET";
  if (method === "GET" || method === "HEAD") return new Request(url, { method, headers });
  return new Request(url, { method, headers, body: req, duplex: "half" });
}

const server = createServer(async (req, res) => {
  try {
    const response = await app.fetch(toRequest(req), envForRequest());
    const outHeaders = {};
    response.headers.forEach((value, key) => { outHeaders[key] = value; });
    res.writeHead(response.status, outHeaders);
    if (!response.body) {
      res.end();
      return;
    }
    await pipeline(Readable.fromWeb(response.body), res);
  } catch (error) {
    console.error("Unhandled API error", error);
    if (!res.headersSent) {
      res.writeHead(500, { "Content-Type": "application/json; charset=utf-8" });
      res.end(JSON.stringify({ error: { code: "internal", message: "Erreur interne." } }));
    } else {
      res.destroy(error);
    }
  }
});

server.keepAliveTimeout = 65000;
server.headersTimeout = 66000;
server.requestTimeout = 120000;
server.maxHeadersCount = 50;

server.listen(port, "0.0.0.0", () => {
  console.log(`gk-api ${runtime} listening on ${port}`);
});

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    server.close(() => {
      database.close().finally(() => process.exit(0));
    });
  });
}
