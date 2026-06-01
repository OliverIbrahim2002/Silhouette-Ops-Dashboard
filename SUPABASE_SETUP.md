# Supabase setup — team sync for Silhouette Dashboard

The dashboard can run **offline** (data in each browser only) or **connected** (one shared database, live updates for the whole team).

## 1. Create a Supabase project

1. Go to [https://supabase.com](https://supabase.com) and create a project (free tier is fine).
2. Open **Project Settings → API** and copy:
   - **Project URL**
   - **anon public** key

## 2. Run the database schema

1. Open **SQL Editor** in Supabase → **New query**.
2. On your Mac, open the file `supabase/schema.sql` in Cursor or TextEdit.
3. **Select all** the SQL inside that file (starts with `-- Silhouette Studio` and `create table`) and **paste that into** the Supabase editor.
4. Click **Run**.

Do **not** type or paste `supabase/schema.sql` alone — that is only the file path, not valid SQL.

5. Confirm tables `profiles` and `app_state` appear under **Table Editor**.

If you see an error on the last line about `supabase_realtime`, the tables may already be set up — you can ignore it or enable Realtime manually: **Database → Replication →** turn on `app_state`.

## 3. Connect Vercel / GitHub (no Mac required)

Your app lives on **GitHub** and **Vercel**. Supabase is a third cloud service (database). You only need to tell the deployed site your Supabase URL and anon key.

### Option A — Vercel environment variables (recommended)

1. Open [vercel.com](https://vercel.com) → your **Silhouette-Ops-Dashboard** project.
2. **Settings → Environment Variables** — add for **Production** (and Preview if you want):

   | Name | Value |
   |------|--------|
   | `SUPABASE_URL` | `https://xxxx.supabase.co` (from Supabase → Project Settings → API) |
   | `SUPABASE_ANON_KEY` | the **anon public** key (same page) |

3. **Deployments →** latest deployment → **⋯ → Redeploy** (so the build picks up the vars).

The build script `scripts/generate-supabase-config.js` creates `supabase-config.js` on each deploy. You do **not** need a Mac for this.

### Option B — Add file on GitHub

1. Open your repo on **github.com**.
2. **Add file** → name it `supabase-config.js` (same folder as `index.html`).
3. Paste (with your real values):

```javascript
window.SUPABASE_CONFIG = {
  url: 'https://YOUR_REF.supabase.co',
  anonKey: 'YOUR_ANON_KEY'
};
```

4. Commit — Vercel redeploys automatically.

> The **anon key** is meant to be public in the browser. Security is from RLS in `schema.sql`, not hiding this key.

After deploy, open your Vercel URL and sign in. The header should show **● Live sync** when cloud sync is working.

## 4. Create team logins (Authentication)

For each person:

1. **Authentication → Users → Add user**
2. Email: use `username@silhouette.studio` (e.g. `maria@silhouette.studio`)
3. Set a password (can still be `Silhouette Studio` if you want)
4. Copy the user’s **UUID** from the users list

## 5. Link profiles (roles)

In **SQL Editor**, run (replace UUID and username):

```sql
insert into public.profiles (id, username, role, instructor_name, display_name)
values
  ('PASTE-USER-UUID-HERE', 'maria', 'admin', null, 'Maria'),
  ('PASTE-UUID', 'oliver', 'admin', null, 'Oliver'),
  ('PASTE-UUID', 'maria-instructor', 'instructor', 'Maria', 'Maria'),
  ('PASTE-UUID', 'tonya', 'instructor', 'Tonya', 'Tonya'),
  ('PASTE-UUID', 'clara', 'instructor', 'Clara', 'Clara'),
  ('PASTE-UUID', 'melissa', 'instructor', 'Melissa', 'Melissa')
on conflict (id) do update set
  username = excluded.username,
  role = excluded.role,
  instructor_name = excluded.instructor_name;
```

## 6. Sign in on the dashboard

- **Username:** `maria` (not the email)
- **Password:** whatever you set in Supabase Auth

First login on an empty cloud project will **upload existing browser data** automatically.

## 7. Deploy on Vercel

`supabase-config.js` must exist in the deployed files:

- Either commit it (anon key only — OK with RLS), or
- Add it in your deploy pipeline after copying from secrets

```bash
npx vercel --prod --yes
```

## How sync works

| Piece | Purpose |
|--------|---------|
| `app_state` table | One row per dataset (`sil-sched`, `sil-cdb`, etc.) |
| Saves | Every change writes to Supabase (~400ms debounce) |
| Realtime | Other browsers update within seconds |
| Local fallback | If `supabase-config.js` is missing, app uses localStorage only |

## Troubleshooting

| Issue | Fix |
|--------|-----|
| "User not found in cloud" | Add row in `profiles` with matching `username` |
| Login works but no Live sync | Check `supabase-config.js` URL/key; browser console for errors |
| RLS errors | Re-run `schema.sql` policies; user must be logged in via Supabase Auth |
| Stale data | Click refresh (↻) or hard refresh; check Realtime is enabled on `app_state` |

## Without Supabase

If you skip setup, the app still works exactly as before using **localStorage** only (no team sync).
