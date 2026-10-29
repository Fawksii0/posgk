// Builds one G&K app for Cloudflare Pages: node scripts/build-pages.mjs <GKMobile|GKAdmin|GKCuisine|GKCourier>
// Output goes to gk-dist (never the POS "dist"). The app lands at the site root and the shared client at
// /shared, so the apps' "../shared/gk-api.js" references still resolve.
import { cpSync, rmSync, mkdirSync, writeFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const apps = ["GKMobile", "GKAdmin", "GKCuisine", "GKCourier", "GKServeur", "GKMenu", "GKCaisse", "GKOps"];
const app = process.argv[2];
if (!apps.includes(app)) {
  console.error(`Usage: node scripts/build-pages.mjs <${apps.join("|")}>`);
  process.exit(1);
}

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const out = resolve(root, "gk-dist");
if (!existsSync(resolve(root, app))) throw new Error(`${app} folder not found.`);

rmSync(out, { recursive: true, force: true });
cpSync(resolve(root, app), out, { recursive: true, filter: (src) => !/README\.md$/i.test(src) && !/[\\/]references([\\/]|$)/.test(src) });
// GKMenu reads its dish photos from ./assets/menu on the deployed site; keep a single copy in GKMobile.
if (app === "GKMenu") {
  const menuAssets = resolve(root, "GKMobile", "assets", "menu");
  if (existsSync(menuAssets)) {
    mkdirSync(resolve(out, "assets"), { recursive: true });
    cpSync(menuAssets, resolve(out, "assets", "menu"), { recursive: true });
  }
}
mkdirSync(resolve(out, "shared"), { recursive: true });
cpSync(resolve(root, "shared"), resolve(out, "shared"), { recursive: true });

writeFileSync(resolve(out, "ok.txt"), "ok\n");
writeFileSync(resolve(out, "_headers"), `/*
  Strict-Transport-Security: max-age=31536000; includeSubDomains
  Content-Security-Policy: default-src 'self'; script-src 'self' https://cdn.jsdelivr.net https://static.cloudflareinsights.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' data: https://fonts.gstatic.com; img-src 'self' data: blob: https:; connect-src 'self' https://gk-api-paris.fly.dev https://api.gkfood.store https://*.supabase.co; frame-src https://maps.google.com; worker-src 'self' blob:; manifest-src 'self'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'; object-src 'none'
  X-Content-Type-Options: nosniff
  X-Frame-Options: DENY
  Cross-Origin-Opener-Policy: same-origin
  Referrer-Policy: strict-origin-when-cross-origin
  Permissions-Policy: camera=(), microphone=(), geolocation=(self), payment=()

/sw.js
  Cache-Control: no-cache
`);
// Same rules for Apache/cPanel hosting (ignored by Cloudflare Pages).
writeFileSync(resolve(out, ".htaccess"), `RewriteEngine On
RewriteCond %{HTTPS} off
RewriteRule ^ https://%{HTTP_HOST}%{REQUEST_URI} [L,R=301]

<IfModule mod_headers.c>
  Header always set Strict-Transport-Security "max-age=31536000; includeSubDomains"
  Header always set Content-Security-Policy "default-src 'self'; script-src 'self' https://cdn.jsdelivr.net https://static.cloudflareinsights.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' data: https://fonts.gstatic.com; img-src 'self' data: blob: https:; connect-src 'self' https://gk-api-paris.fly.dev https://api.gkfood.store https://*.supabase.co; frame-src https://maps.google.com; worker-src 'self' blob:; manifest-src 'self'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'; object-src 'none'"
  Header always set X-Content-Type-Options "nosniff"
  Header always set X-Frame-Options "DENY"
  Header always set Cross-Origin-Opener-Policy "same-origin"
  Header always set Referrer-Policy "strict-origin-when-cross-origin"
  Header always set Permissions-Policy "camera=(), microphone=(), geolocation=(self), payment=()"
  <Files "sw.js">
    Header set Cache-Control "no-cache"
  </Files>
</IfModule>

AddType application/manifest+json .webmanifest
Options -Indexes
`);
console.log(`Built ${app} -> gk-dist`);
