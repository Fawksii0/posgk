# POSGK Database Sync Setup

This app supports localStorage fallback and Supabase cloud sync.

## 1. Create Supabase Project

Create a Supabase project, then open the SQL editor and run:

```sql
-- paste the contents of supabase-schema.sql
```

This creates the `pos_state` table used by the app.

## 2. Add Environment Variables

Copy `.env.example` to `.env.local` and fill in:

```env
VITE_SUPABASE_URL=https://your-project-ref.supabase.co
VITE_SUPABASE_ANON_KEY=your-supabase-anon-key
```

Restart the dev server after changing env vars.

## 3. How Sync Works

- If env vars are missing, the app runs in `Local` mode with localStorage.
- If env vars are present, phones share state through Supabase.
- The app syncs orders, notifications, waiters, tables, categories, and menu items.
- Every device polls for updates every 2.5 seconds.

## 4. Sync Status Badge

The header shows:

- `Local`: no Supabase env vars configured.
- `Syncing`: connecting to Supabase.
- `Synced`: cloud sync is active.
- `Offline`: Supabase is configured but unreachable.

## 5. Production Note

The current schema allows read/write access with the anon key so phones can sync without account login. Before public production use, add real auth and tighter row-level security policies.
