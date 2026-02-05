## Audit Module Setup (Admin-only)

This repo includes a new Supabase **Edge Function**: `audit-vault` and database tables for resumable audit jobs.

### What it does
- Adds an **“Audit Documents”** button in the admin dataroom page (`/admin/vaults/:vaultId`).
- Starts an audit job that snapshots all rows in `public.documents` for that vault.
- Processes documents in **small batches** per invocation (so it avoids Edge Function timeouts).
- Produces a **downloadable Markdown report** with evidence quotes/citations.

### 1) Run the migration
Run the SQL migration in Supabase SQL editor:
- `supabase/migrations/ADD_AUDIT_MODULE.sql`

### 2) Deploy the Edge Function
Create/deploy the function directory:
- `supabase/functions/audit-vault/index.ts`

Deploy using Supabase CLI (example):
- `supabase functions deploy audit-vault`

### 3) Set function secrets (required for AI)
Set these secrets in Supabase (Edge Functions secrets):
- `OPENAI_API_KEY`: your ChatGPT/OpenAI API key

Optional:
- `OPENAI_BASE_URL`: defaults to `https://api.openai.com`
- `OPENAI_MODEL_TEXT`: defaults to `gpt-4o-mini`
- `OPENAI_MODEL_VISION`: defaults to `gpt-4o-mini`

**Note**: The following are automatically injected by Supabase into Edge Functions (you don't need to set them manually):
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `SUPABASE_ANON_KEY` (required for JWT token validation)

If you see these in your secrets list, that's fine - Supabase manages them automatically. The function will use them for token validation and database operations.

### 4) Notes on “no hallucination”
This implementation enforces an evidence-only approach:
- Per-file extraction requires **verifiable quoted citations**
- Any fact/red-flag without a quote that exists in the extracted snippet is **dropped**

This improves safety, but it still depends on:
- Text extraction quality (PDFs/images can be messy)
- OCR/model accuracy for images

