# Migration to New Supabase – Your Action Required

Config files are updated. Complete the migration with these steps:

---

## 1. Add Service Role Key to .env

1. Open: **https://supabase.com/dashboard/project/unyiuyzhteeuoyujqpbf/settings/api**
2. Copy the **Secret key** (or **service_role** under Legacy API Keys)
3. In `.env`, replace:
   ```
   SUPABASE_SERVICE_ROLE_KEY="REPLACE_WITH_NEW_SERVICE_ROLE_KEY"
   ```
   with:
   ```
   SUPABASE_SERVICE_ROLE_KEY="your_copied_secret_key"
   ```

---

## 2. Migrate Database

**Option A – Restore to new project (if old project has backups)**  
- Old project → Database → Backups → **Restore to New Project**

**Option B – Manual export/import**  
- Old project → SQL Editor → run schema/data export, or use `pg_dump`  
- New project → SQL Editor → paste and run the SQL

---

## 3. Run Storage Migration

```bash
npm run migrate-storage
```

This copies all files from the old `documents` bucket to the new project.

---

## 4. Deploy Edge Functions

Log in with the account that owns the new project, then:

```bash
supabase login
supabase link --project-ref unyiuyzhteeuoyujqpbf
supabase secrets set OPENAI_API_KEY=sk-your-openai-key
supabase secrets set FRAUD_BACKEND_URL=https://nidhi-backends.onrender.com
supabase functions deploy auditor-public --no-verify-jwt
supabase functions deploy audit-vault --no-verify-jwt
```

---

## 5. Enable Anonymous Auth

New project → **Authentication** → **Providers** → enable **Anonymous sign-ins**.

---

## 6. Update Render (Fraud Backend)

In Render → your service → **Environment**:

- `SUPABASE_URL` = `https://unyiuyzhteeuoyujqpbf.supabase.co`
- `SUPABASE_SERVICE_ROLE_KEY` = (same secret key as in `.env`)

---

## 7. Update Vercel (Frontend)

In Vercel → project → **Settings** → **Environment Variables**:

- `VITE_SUPABASE_URL` = `https://unyiuyzhteeuoyujqpbf.supabase.co`
- `VITE_SUPABASE_PROJECT_ID` = `unyiuyzhteeuoyujqpbf`
- `VITE_SUPABASE_PUBLISHABLE_KEY` = `sb_publishable_-TegCKLGqZONJQCgKG1fWg_7vXASl7S`

---

## Already Done

- `.env` updated with new URL and publishable key  
- `supabase/config.toml` updated with new project ID  
- Storage migration script ready  
- Old project credentials kept in `.env` for migration
