# G&K API — Supabase backend

The G&K backend is hosted in this folder and is separate from the POS application. It runs as a Supabase Edge Function, uses Supabase Auth email/password for clients and staff, and uses branch-scoped Postgres tables for G&K data. No operational data or demo accounts are seeded. The only migration data is the two branch records.

## Local, no-data setup

Prerequisites: Node.js, Docker, and the Supabase CLI.

1. From `api/`, run `npm install`.
2. Start the private Supabase stack and apply the migration:

   ```powershell
   npm run dev
   npm run migrate:local
   ```

   `migrate:local` resets the local Supabase database, so it is destructive to local API data. The migration creates `G&K Food` (`gk-food`) and `G&K Shawarma & Crispy` (`gk-shawarma-crispy`), and no other data.
3. Copy `.env.example` to `.env.local`. Fill in the keys printed by `supabase status --workdir supabase`, and set `GK_DATABASE_URL` to the local Postgres connection. For Edge Function serving in Docker on Windows, use `host.docker.internal:54322`; when running a bootstrap script on the host, use `127.0.0.1:54322`.
4. Serve the Edge Function in another terminal:

   ```powershell
   npm run functions:serve
   ```

   The function URL is `http://127.0.0.1:54321/functions/v1/gk-api`. It returns a safe `503 configuration_required` response until its private keys and database URL are set. API errors do not turn into successful/demo responses.
5. No SMS provider is needed: clients register with name, phone, e-mail and password, and e-mail confirmation is disabled.

The local stack contains no users, menus, orders, couriers, zones, promotions, or settings. Create an initial platform administrator and one branch manager with the bootstrap scripts below, then add operational data through the Admin app.

## Bootstrap accounts

Set the required private environment variables in the terminal running the scripts: `GK_DATABASE_URL`, `SUPABASE_URL`, and `SUPABASE_SERVICE_ROLE_KEY`. Staff passwords are created in Supabase Auth; the service-role key is only used by private bootstrap/admin operations and must never be sent to the browser.

```powershell
npm run create-staff
```

Choose `admin` for the global platform administrator, then run it again and choose `manager`, assigning that manager to `gk-food` or `gk-shawarma-crispy`. Branch staff and couriers are assigned to their active branch by the API/database and cannot be moved by sending another branch header.

The owner is not created automatically. First configure `OWNER_DOOR_KEY` as an Edge Function secret, then create the owner account:

```powershell
npm run create-owner
```

The bootstrap script prevents creating a second owner and stores only a PBKDF2 password hash. An administrator and managers are not required first and can be added later. Owner sign-in still requires both that password and the private door key; owner audit remains separate from ordinary audit.

## API and branch contract

- `GET /api/branches` returns `{ branches: [{ id, slug, name, cuisine, address, active }] }`.
- `GET /api/me/branches` returns branch choices for a signed-in client or global owner/admin; branch-bound staff/couriers receive only their assigned branch.
- Client routes: `POST /api/auth/client/signup` (`name`, `phone`, `email`, `password`; no SMS or e-mail verification) and `POST /api/auth/client/login` (`identifier` = e-mail or phone, `password`).
- Staff credentials use Supabase Auth email/password: `POST /api/auth/staff`.
- `POST /api/auth/refresh` accepts `{ "refreshToken": "..." }` and returns `{ token, refreshToken, user, branchId? }`; `token` is the Supabase Auth access token. Client/staff sessions include `user.branchId` when account-bound and `user.branchName` when available.
- Courier phone+PIN and owner email/password+door-key continue through `POST /api/auth/courier` and `/api/auth/owner`, respectively, with short-lived API-signed tokens and no Supabase refresh token.
- Existing menu, zones, public settings, orders, courier, admin and audit routes retain their JSON shapes as far as possible.

Branch-scoped calls send `X-GK-Branch: <branch id>`. Clients and global owner/admin must select an active branch for branch operations. The server validates every requested branch. For branch-bound staff and couriers, the server uses the profile's branch and rejects a different supplied header. The selected branch's `branchId` and `branchName` are included in the `user` payload returned by `/api/me`; global owner/admin profiles remain unbound at rest and can select either branch for a request.

Menus, categories, zones, promotions, settings, notifications, audit entries, couriers and orders are partitioned by branch. Order creation reads only that branch's menu/prices/zones/promotions and writes the order into the selected branch. Database triggers reject inserts or updates with a mismatched branch. Public clients have no table grants; Edge Function data access uses a private Postgres role with RLS, and the service-role key/database URL are never exposed in API responses or CORS.

## Hosted project setup

1. Create a dedicated Supabase project for G&K. Do not use the POS app's Supabase schema/project setup.
2. Set/link the project and apply the migration:

   ```powershell
   supabase link --project-ref <project-ref> --workdir supabase
   supabase db push --workdir supabase
   ```

3. In Supabase Auth > Sign In / Providers, keep **Email** enabled and turn **Confirm email** off (clients and staff sign in with email/password; no SMS provider is required). Leave Phone disabled. No Auth account is seeded.
4. Set Edge Function secrets through Supabase CLI or Dashboard. Required secrets: `GK_DATABASE_URL` (private database direct/session-pooler connection), `SESSION_SECRET`, `OWNER_DOOR_KEY`, and `DISPATCH_SECRET`. The function also uses Supabase's server-side `SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY`; verify these are available as Edge Function secrets in the project. Set `ALLOWED_ORIGINS` to the exact G&K app origins.
5. Deploy the Edge Function:

   ```powershell
   supabase functions deploy gk-api --no-verify-jwt --workdir supabase
   ```

   Supabase gateway JWT verification is disabled because this function accepts both Supabase Auth tokens and the separate courier/owner API tokens. The API itself validates each protected request. Do not expose the database URL, service-role key, session signing key, door key or dispatch secret.
6. Bootstrap the administrator and branch manager, then the owner as described above. Add menus, zones, hours and all other operational records through the Admin app.
7. Configure a once-per-minute Supabase Cron invocation for `POST /api/internal/dispatch`, with `X-GK-Cron-Secret` set to `DISPATCH_SECRET`. Keep the URL and header secret in Supabase Vault; do not put them in source control. This replaces the old Worker cron trigger and preserves expiry/retry dispatch processing.

There are no project credentials in this repository, so hosted migration, Auth/DB grants, and deployment have not been tested here. Never deploy until credentials, origins, branch selection and the frontend API URL have been configured and verified.
