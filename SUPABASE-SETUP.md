# Supabase Cloud Sync Setup Guide

## Overview

Your POSGK POS app now supports Supabase cloud synchronization for:
- ✅ Real-time order syncing across devices
- ✅ User account management (signup, login, role assignment)
- ✅ Automatic fallback to localStorage if offline

---

## Step 1: Run the SQL Schema

Your Supabase project is configured at:
```
https://inpvplphywoirnyeybwg.supabase.co
```

### Option A: SQL Editor (Recommended)

1. Go to your Supabase Dashboard
2. Click **SQL Editor** in the left sidebar
3. Click **New Query**
4. Copy and paste the entire contents of `supabase-schema.sql`
5. Click **Run**

This creates:
- `pos_state` table (for order/menu/table data)
- `pos_users` table (for user management)
- RLS policies (access control)
- Indexes (for performance)

### Option B: Using Migration File

If your Supabase CLI is set up:
```bash
supabase db push
```

---

## Step 2: Environment Variables

Your `.env.local` file is already configured with:
```env
VITE_SUPABASE_URL=https://inpvplphywoirnyeybwg.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

**⚠️ Important**: Never commit `.env.local` to git. It's already in `.gitignore`.

---

## Step 3: Start the Dev Server

```bash
npm run dev
```

The app will automatically:
1. Detect your Supabase credentials
2. Connect to the cloud
3. Show sync status in the header (Syncing → Synced)

---

## How It Works

### Sync Status Indicators

The header shows your sync status:
- **Local**: No Supabase configured (using localStorage only)
- **Syncing**: Connecting to Supabase
- **Synced**: Cloud sync active ✅
- **Offline**: Supabase unreachable (falls back to localStorage)

### Data Flow

```
User Action → Local State → localStorage → Supabase (if connected)
                                ↓
Device B polls every 2.5s → Reads from Supabase → Updates local
```

### Offline Behavior

If Supabase goes offline:
1. App switches to **Offline** mode
2. All changes saved to localStorage
3. When online again, syncs changes automatically

---

## User Management

### Signup Flow

1. User fills: Name, Email, Password
2. Account created in `pos_users` table with:
   - `status: 'pending'`
   - `role: null`
3. User sees: "Manager must assign your role"

### Manager Assignment Flow

1. Manager logs in (demo: manager@gk.com / manager123)
2. Goes to **Manager Portal → Users**
3. Searches for user
4. Assigns role (Waiter, Cashier, Manager)
5. User now has `status: 'active'` and can login

### Account Controls

**Pause Orders**: User can login but cannot create new orders
**Ban**: User completely blocked from system
**Resume**: Restore paused account

---

## Demo Accounts

These bypass role assignment and work immediately:

```
Manager:  manager@gk.com / manager123
Cashier:  cashier@gk.com / cashier123
Waiter:   waiter@gk.com / waiter123
```

---

## Data Storage

### pos_state Table
Stores app state (orders, menus, tables, categories, notifications):
```
key: 'orders' | 'menu_items' | 'categories' | etc.
value: JSONB data
updated_at: timestamp
```

### pos_users Table
Stores user accounts:
```
id: uuid
name: string
email: string (unique)
password_hash: string (plain text for now - upgrade to bcrypt in production)
role: 'waiter' | 'cashier' | 'manager' | null
status: 'pending' | 'active' | 'paused' | 'banned'
created_at: timestamp
updated_at: timestamp
```

---

## Row-Level Security (RLS)

All tables have RLS enabled with open policies:

- **Read**: Anyone can read all data
- **Insert**: Anyone can create new records
- **Update**: Anyone can update records

**⚠️ Production Note**: These open policies are suitable for internal restaurant use only. Before public deployment, implement proper authentication with Supabase Auth and tighter RLS rules.

---

## Troubleshooting

### Sync Status Stuck on "Syncing"

1. Check your internet connection
2. Verify Supabase credentials in `.env.local`
3. Check browser console (F12) for errors
4. Restart dev server: `npm run dev`

### Users Not Loading in Manager Portal

1. Verify `pos_users` table exists (check SQL Editor)
2. Check RLS policies are created
3. Look for errors in browser console
4. Try refreshing the page

### Offline Mode Not Saving

1. Check browser localStorage is enabled
2. Clear localStorage and try again:
   ```javascript
   localStorage.clear()
   // Then refresh the page
   ```

### Authentication Errors

Ensure your Supabase project:
1. Has RLS enabled on tables ✅
2. Has open policies for all operations ✅
3. Anon key has read/write permissions ✅

---

## Next Steps: Production Hardening

Before going live, consider:

1. **Password Hashing**: Implement bcrypt instead of plain text
   ```bash
   npm install bcryptjs
   ```

2. **Supabase Auth**: Use Supabase's built-in auth for better security
   - Email/password signup and login
   - Email verification
   - Password recovery

3. **Tighter RLS Policies**: Restrict who can read/write what
   ```sql
   -- Example: Only let managers modify user roles
   create policy "Managers only" on pos_users
   for update using (auth.jwt() ->> 'role' = 'manager')
   ```

4. **Database Backups**: Enable automatic backups in Supabase
   - Settings → Backups → Enable

5. **SSL/TLS**: All HTTPS in production (automatic with Supabase)

---

## Support

- 📚 [Supabase Docs](https://supabase.com/docs)
- 🐛 [Report Issues](https://github.com/supabase/supabase/issues)
- 💬 [Supabase Community](https://discord.supabase.io)

---

## Quick Reference Commands

```bash
# Start dev server with cloud sync
npm run dev

# Run production build
npm run build

# Check linting
npm run lint

# Verify Supabase connection
# Look for "Synced" status in the header
```

---

**Last Updated**: May 30, 2026  
**Version**: 1.0 (Cloud Sync Foundation)
