import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const ACCOUNT = "740160cbb99e8ac6b6f8437a7e14d0df";
const PROJECT = "gk-caisse";
const DOMAIN = "caisse.gkfood.store";
const CNAME_TARGET = "gk-caisse.pages.dev";

function token() {
  const file = join(homedir(), "AppData/Roaming/xdg.config/.wrangler/config/default.toml");
  const text = readFileSync(file, "utf8");
  const match = text.match(/oauth_token\s*=\s*["']([^"']+)["']/);
  if (!match) throw new Error("Wrangler OAuth token not found.");
  return match[1];
}

async function cf(path, { method = "GET", body } = {}) {
  const response = await fetch(`https://api.cloudflare.com/client/v4${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token()}`,
      "Content-Type": "application/json"
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) })
  });
  const data = await response.json();
  return { ok: response.ok, status: response.status, success: data.success, errors: data.errors, result: data.result };
}

const domainAdd = await cf(`/accounts/${ACCOUNT}/pages/projects/${PROJECT}/domains`, {
  method: "POST",
  body: { name: DOMAIN }
});
console.log("pages-domain", JSON.stringify({
  ok: domainAdd.ok,
  success: domainAdd.success,
  status: domainAdd.status,
  errors: domainAdd.errors?.map((e) => e.message) || []
}));

const zones = await cf("/zones?name=gkfood.store");
const zone = Array.isArray(zones.result) ? zones.result[0] : null;
if (!zone?.id) {
  console.log("dns", JSON.stringify({ ok: false, reason: "zone not found" }));
  process.exit(domainAdd.success ? 0 : 1);
}

const existing = await cf(`/zones/${zone.id}/dns_records?name=${DOMAIN}`);
const rec = { type: "CNAME", name: "caisse", content: CNAME_TARGET, ttl: 1, proxied: true };
let dns;
if (existing.result?.[0]?.id) {
  dns = await cf(`/zones/${zone.id}/dns_records/${existing.result[0].id}`, { method: "PATCH", body: rec });
} else {
  dns = await cf(`/zones/${zone.id}/dns_records`, { method: "POST", body: rec });
}
console.log("dns", JSON.stringify({
  ok: dns.ok,
  success: dns.success,
  status: dns.status,
  errors: dns.errors?.map((e) => e.message) || [],
  content: dns.result?.content,
  proxied: dns.result?.proxied
}));

const check = await cf(`/accounts/${ACCOUNT}/pages/projects/${PROJECT}/domains/${DOMAIN}`);
console.log("pages-status", JSON.stringify({
  success: check.success,
  status: check.result?.status,
  domain: check.result?.name
}));
process.exit(domainAdd.success || dns.success ? 0 : 1);
