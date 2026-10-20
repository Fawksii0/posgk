// Builds one G&K app for Cloudflare Pages: node scripts/build-pages.mjs <GKMobile|GKAdmin|GKCuisine|GKCourier>
// Output goes to gk-dist (never the POS "dist"). The app lands at the site root and the shared client at
// /shared, so the apps' "../shared/gk-api.js" references still resolve.
import { cpSync, rmSync, mkdirSync, writeFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const apps = ["GKMobile", "GKAdmin", "GKCuisine", "GKCourier"];
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
mkdirSync(resolve(out, "shared"), { recursive: true });
cpSync(resolve(root, "shared"), resolve(out, "shared"), { recursive: true });

writeFileSync(resolve(out, "_headers"), `/*
  X-Content-Type-Options: nosniff
  X-Frame-Options: DENY
  Referrer-Policy: strict-origin-when-cross-origin
  Permissions-Policy: camera=(), microphone=(), payment=()

/sw.js
  Cache-Control: no-cache
`);
// Same rules for Apache/cPanel hosting (ignored by Cloudflare Pages).
writeFileSync(resolve(out, ".htaccess"), `RewriteEngine On
RewriteCond %{HTTPS} off
RewriteRule ^ https://%{HTTP_HOST}%{REQUEST_URI} [L,R=301]

<IfModule mod_headers.c>
  Header always set X-Content-Type-Options "nosniff"
  Header always set X-Frame-Options "DENY"
  Header always set Referrer-Policy "strict-origin-when-cross-origin"
  Header always set Permissions-Policy "camera=(), microphone=(), payment=()"
  <Files "sw.js">
    Header set Cache-Control "no-cache"
  </Files>
</IfModule>

AddType application/manifest+json .webmanifest
Options -Indexes
`);
console.log(`Built ${app} -> gk-dist`);
