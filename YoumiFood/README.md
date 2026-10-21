# Youmi Food

A food-delivery platform (Glovo / Talabat / Deliveroo style), forked from G&K and fully separate from it.

| Folder | App | Brand |
|---|---|---|
| `Food/` | Client ordering app | Youmi Food (coral) |
| `Partners/` | Restaurant back-office | Youmi Partners (lime/green) |
| `Kitchen/` | Kitchen display | Youmi Kitchen (cream/coral) |
| `Rider/` | Courier app | Youmi Rider (deep green) |
| `shared/` | API client, chat, map, receipt, sound | |
| `api/` | Supabase edge function + migrations | |

Brand colors: coral `#FF6547`, lime `#B9EF78`, cream `#FFF3E9`, ink `#171717`, green `#00613D`, deep green `#063F30`.

## Status

Front-ends are rebranded. The backend is **not connected**: the apps have no API URL until a dedicated Youmi
Supabase project exists, so they never touch the G&K data.

## Next steps

1. Create a new Supabase project for Youmi and link `api/` to it.
2. Apply `api/supabase/migrations/*`, set the function secrets, deploy `gk-api`.
3. Point the apps at it: set `window.YOUMI_API_URL` (or edit `shared/gk-api.js`).
4. Create the owner account and seed restaurants, menus and zones (`api/scripts/`; the `seed-*-gk-food` scripts are G&K-specific examples).
5. Create four Cloudflare Pages projects and deploy with `node scripts/build-pages.mjs <Food|Partners|Kitchen|Rider>` then `npx wrangler pages deploy youmi-dist`.

Internal identifiers (`gk-api`, `gk-*.js`, the `gk_*` database functions and `gk-food` branch ids in the examples) were kept
from the G&K codebase to avoid breaking the backend; only visible branding was changed.
