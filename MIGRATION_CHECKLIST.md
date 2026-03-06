# Supabase Migration Checklist

**Storage done ✓** — Next: Database (schemas + tables) and Edge Functions.

---

## 1. Database Migration (Schemas + Tables + Data)

### Step 1: Run schema SQL in NEW project

1. Open: https://supabase.com/dashboard/project/unyiuyzhteeuoyujqpbf/sql  
2. Copy the contents of `supabase/migrations/FULL_SCHEMA_FOR_NEW_PROJECT.sql`  
3. Paste into SQL Editor and click **Run**

### Step 2: Run data migration script

Ensure `.env` has:
- `OLD_SUPABASE_SERVICE_ROLE_KEY` = service_role key from **old** project
- `SUPABASE_SERVICE_ROLE_KEY` = service_role key from **new** project

```bash
npm run migrate-database
```

This copies auth users, profiles, vaults, folders, documents, NDA data, audit jobs, etc.  
**Note:** Users get temporary passwords; they should use "Forgot password" to reset.

### Alternative: pg_dump (if you have PostgreSQL installed)

```powershell
pg_dump "postgresql://postgres:YOUR_OLD_PASSWORD@db.iqwqgamoiuejsauisfvf.supabase.co:5432/postgres" --no-owner --no-acl -F c -f nidhi_backup.dump
pg_restore -d "postgresql://postgres:YOUR_NEW_PASSWORD@db.unyiuyzhteeuoyujqpbf.supabase.co:5432/postgres" --no-owner --no-acl -F c nidhi_backup.dump
```

---

## 2. Deploy Edge Functions

Two functions: `auditor-public` and `audit-vault`.

```powershell
# 1. Login and link to NEW project
supabase login
supabase link --project-ref unyiuyzhteeuoyujqpbf

# 2. Set secrets (required for functions to work)
supabase secrets set OPENAI_API_KEY=sk-your-openai-key
supabase secrets set FRAUD_BACKEND_URL=https://nidhi-backends.onrender.com
supabase secrets set SUPABASE_URL=https://unyiuyzhteeuoyujqpbf.supabase.co
supabase secrets set SUPABASE_SERVICE_ROLE_KEY=your-new-service-role-key

# 3. Deploy both functions
supabase functions deploy auditor-public --no-verify-jwt
supabase functions deploy audit-vault --no-verify-jwt
```

---

## 3. Auth Settings

New project → **Authentication** → **Providers** → enable **Anonymous sign-ins** (needed for `/auditor`).

---

## 4. Run Storage Policies (if not done)

In new project SQL Editor: https://supabase.com/dashboard/project/unyiuyzhteeuoyujqpbf/sql

```sql
DROP POLICY IF EXISTS "Allow service role full access to documents" ON storage.objects;
CREATE POLICY "Allow service role full access to documents"
ON storage.objects FOR ALL TO service_role
USING (bucket_id = 'documents') WITH CHECK (bucket_id = 'documents');
```

---

## Summary

| Task | Status |
|------|--------|
| Storage migration | ✓ (or re-run with correct OLD service role key if 0 files) |
| Database (schema + data) | ⬜ pg_dump/restore or Restore to New Project |
| Edge functions | ⬜ `supabase functions deploy` |
| Secrets | ⬜ `supabase secrets set` |
| Anonymous auth | ⬜ Enable in dashboard |
| Vercel/Render env | ⬜ Update with new project URL + keys |
