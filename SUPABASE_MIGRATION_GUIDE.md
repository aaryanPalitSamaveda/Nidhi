# Nidhi Supabase Migration Guide

**Migrate from old project (iqwqgamoiuejsauisfvf) to new Supabase project (premium)**

---

## Overview

| Component | Method |
|-----------|--------|
| Database (schema + data + auth users) | pg_dump → restore OR Restore to New Project (if source has backups) |
| Storage (documents bucket, PDFs, files) | **Manual** – run migration script |
| Edge Functions | Redeploy with `supabase functions deploy` |
| Secrets | Set in new project dashboard |
| Auth settings | Enable Anonymous sign-ins in new project |

---

## Step 1: Create New Supabase Project

1. Log in to [Supabase Dashboard](https://supabase.com/dashboard) with your **new** account (premium).
2. Create a new project.
3. Note down:
   - **Project URL** (e.g. `https://xxxxx.supabase.co`)
   - **Project ID** (from URL or Settings → General)
   - **Anon key** (Settings → API)
   - **Service role key** (Settings → API)

---

## Step 2: Database Migration

### Option A: Restore to New Project (requires paid plan + physical backups on OLD project)

1. In **old project** dashboard: Database → Backups → **Restore to a New Project**.
2. If available, select a backup and restore. (Free plan often has no physical backups.)
3. **Storage is NOT copied** – you must run the storage migration script (Step 4).

### Option B: pg_dump + Restore (manual)

**Connection strings:** Supabase Dashboard → Project → Settings → Database → Connection string (URI). Use **Direct connection** (not Transaction pooler). Replace `[YOUR-PASSWORD]` with your database password (Settings → Database → Database password).

**On old project:**

pg_dump "postgresql://postgres:[PASSWORD]@db.iqwqgamoiuejsauisfvf.supabase.co:5432/postgres" \
  --no-owner \
  --no-acl \
  -F c \
  -f nidhi_backup.dump
```

**On new project:**

```bash
# Get connection string from new project
pg_restore -d "postgresql://postgres:[NEW_PASSWORD]@db.[NEW_PROJECT_REF].supabase.co:5432/postgres" \
  --no-owner \
  --no-acl \
  -F c \
  nidhi_backup.dump
```

**Or use SQL dump (simpler):**

```bash
# Export from old project
pg_dump "postgresql://postgres:[PASSWORD]@db.iqwqgamoiuejsauisfvf.supabase.co:5432/postgres" \
  --no-owner \
  --no-acl \
  -f nidhi_backup.sql

# Import to new project (run in Supabase SQL Editor or via psql)
psql "postgresql://postgres:[NEW_PASSWORD]@db.[NEW_PROJECT_REF].supabase.co:5432/postgres" -f nidhi_backup.sql
```

---

## Step 3: Create Storage Bucket in New Project

1. New project → **Storage** → **New bucket**.
2. Name: `documents`
3. **Public bucket**: OFF (private)
4. File size limit: Set to match old project (e.g. 200MB) – Storage → documents → Settings.

---

## Step 4: Migrate Storage (Documents/PDFs)

**Ensure the `documents` bucket exists in the new project** (Step 3) before running.

```bash
# From project root - set env vars then run
OLD_SUPABASE_SERVICE_ROLE_KEY=eyJ... \
NEW_SUPABASE_URL=https://YOUR_NEW_REF.supabase.co \
NEW_SUPABASE_SERVICE_ROLE_KEY=eyJ... \
npm run migrate-storage
```

Or with a `.env.migrate` file (do not commit):

```
OLD_SUPABASE_SERVICE_ROLE_KEY=eyJ...
NEW_SUPABASE_URL=https://YOUR_NEW_REF.supabase.co
NEW_SUPABASE_SERVICE_ROLE_KEY=eyJ...
```

Then: `dotenv -e .env.migrate -- npm run migrate-storage`

---

## Step 5: Deploy Edge Functions

```bash
# Link to NEW project
supabase link --project-ref [NEW_PROJECT_REF]

# Set secrets for new project
supabase secrets set OPENAI_API_KEY=sk-xxx
supabase secrets set FRAUD_BACKEND_URL=https://nidhi-backends.onrender.com

# Deploy all functions
supabase functions deploy auditor-public --no-verify-jwt
supabase functions deploy audit-vault --no-verify-jwt
```

---

## Step 6: Auth Settings

1. New project → **Authentication** → **Providers**.
2. Enable **Anonymous sign-ins** (required for /auditor).
3. Configure Email provider if needed.
4. Add your domain to **URL Configuration** if using custom domain.

---

## Step 7: Update Environment Variables

Update `.env` and all deployment configs (Vercel, Render):

```
VITE_SUPABASE_PROJECT_ID=[NEW_PROJECT_ID]
VITE_SUPABASE_PUBLISHABLE_KEY=[NEW_ANON_KEY]
VITE_SUPABASE_URL=https://[NEW_PROJECT_REF].supabase.co
SUPABASE_SERVICE_ROLE_KEY=[NEW_SERVICE_ROLE_KEY]
```

**Render (fraud backend):** Add/update `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`.

**Supabase Edge Function secrets:** Already set in Step 5.

---

## Step 8: Update supabase/config.toml

```toml
project_id = "[NEW_PROJECT_REF]"
```

The script is at `scripts/migrate-storage.js` – it recursively lists all files in the `documents` bucket, downloads from the old project, and uploads to the new one.

---

## Checklist

- [ ] New Supabase project created
- [ ] Database migrated (schema + data + auth users)
- [ ] `documents` bucket created in new project
- [ ] Storage migration script run
- [ ] Edge functions deployed
- [ ] Secrets set (OPENAI_API_KEY, FRAUD_BACKEND_URL)
- [ ] Anonymous auth enabled
- [ ] .env updated
- [ ] Vercel env vars updated
- [ ] Render env vars updated
- [ ] config.toml project_id updated
- [ ] Test: login, datarooms, document view, auditor flow

---

## Rollback

Keep the old project running until you have verified the new one. Do not delete the old project until migration is confirmed.
