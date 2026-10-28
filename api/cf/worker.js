const ORIGIN = "https://gk-api-paris.fly.dev";

function corsHeaders(request) {
  const origin = request.headers.get("Origin") || "";
  let allow = false;
  try {
    const url = new URL(origin);
    const host = url.hostname;
    allow = (url.protocol === "https:" && (host === "gkfood.store" || host.endsWith(".gkfood.store")))
      || (url.protocol === "https:" && /^gk-[\w-]+\.pages\.dev$/.test(host))
      || (url.protocol === "http:" && (host === "localhost" || host === "127.0.0.1"));
  } catch {
    allow = false;
  }
  if (!allow) return { Vary: "Origin" };
  return {
    Vary: "Origin",
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "GET,POST,PUT,PATCH,DELETE,OPTIONS",
    "Access-Control-Allow-Headers": "Authorization, Content-Type, X-GK-Branch, x-region",
    "Access-Control-Max-Age": "7200"
  };
}

export default {
  async fetch(request) {
    const cors = corsHeaders(request);
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: cors });
    }
    const incoming = new URL(request.url);
    const target = new URL(incoming.pathname + incoming.search, ORIGIN);
    const headers = new Headers(request.headers);
    headers.delete("host");
    headers.set("X-Forwarded-Host", incoming.host);
    headers.set("X-Forwarded-Proto", "https");
    const init = {
      method: request.method,
      headers,
      redirect: "manual"
    };
    if (request.method !== "GET" && request.method !== "HEAD") {
      init.body = await request.arrayBuffer();
    }
    const response = await fetch(target, init);
    const out = new Headers(response.headers);
    for (const [key, value] of Object.entries(cors)) out.set(key, value);
    return new Response(response.body, { status: response.status, headers: out });
  }
};
