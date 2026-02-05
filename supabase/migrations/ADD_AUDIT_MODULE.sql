-- ============================================================================
-- AUDIT MODULE (Admin-only)
-- Creates tables to run long-running, forensic-style AI audits as resumable jobs.
-- Edge Functions (or backend) can update these tables using service role.
-- Frontend (admin) can poll progress and download the final report.
-- ============================================================================

-- 1) Enums
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'audit_job_status') THEN
    CREATE TYPE public.audit_job_status AS ENUM ('queued', 'running', 'completed', 'failed', 'cancelled');
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'audit_file_status') THEN
    CREATE TYPE public.audit_file_status AS ENUM ('pending', 'processing', 'done', 'failed', 'skipped');
  END IF;
END $$;

-- 2) Tables
CREATE TABLE IF NOT EXISTS public.audit_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vault_id UUID NOT NULL REFERENCES public.vaults(id) ON DELETE CASCADE,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  status public.audit_job_status NOT NULL DEFAULT 'queued',
  progress NUMERIC NOT NULL DEFAULT 0, -- 0..100
  total_files INTEGER NOT NULL DEFAULT 0,
  processed_files INTEGER NOT NULL DEFAULT 0,
  current_step TEXT NULL,
  started_at TIMESTAMPTZ NULL,
  completed_at TIMESTAMPTZ NULL,
  estimated_remaining_seconds INTEGER NULL,
  report_markdown TEXT NULL,
  report_json JSONB NULL,
  error TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS audit_jobs_vault_id_idx ON public.audit_jobs(vault_id);
CREATE INDEX IF NOT EXISTS audit_jobs_status_idx ON public.audit_jobs(status);

CREATE TABLE IF NOT EXISTS public.audit_job_files (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID NOT NULL REFERENCES public.audit_jobs(id) ON DELETE CASCADE,
  document_id UUID NULL REFERENCES public.documents(id) ON DELETE SET NULL,
  vault_id UUID NOT NULL REFERENCES public.vaults(id) ON DELETE CASCADE,
  folder_id UUID NULL REFERENCES public.folders(id) ON DELETE SET NULL,
  file_path TEXT NOT NULL,
  file_name TEXT NOT NULL,
  file_type TEXT NULL,
  file_size BIGINT NULL,
  status public.audit_file_status NOT NULL DEFAULT 'pending',
  started_at TIMESTAMPTZ NULL,
  completed_at TIMESTAMPTZ NULL,
  -- facts_json: normalized facts extracted from the file (with citations)
  facts_json JSONB NULL,
  -- evidence_json: small excerpts / citations used to justify findings (never the whole file)
  evidence_json JSONB NULL,
  error TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS audit_job_files_job_id_idx ON public.audit_job_files(job_id);
CREATE INDEX IF NOT EXISTS audit_job_files_vault_id_idx ON public.audit_job_files(vault_id);
CREATE INDEX IF NOT EXISTS audit_job_files_status_idx ON public.audit_job_files(status);

-- 3) Triggers (updated_at)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'update_updated_at_column') THEN
    DROP TRIGGER IF EXISTS set_audit_jobs_updated_at ON public.audit_jobs;
    CREATE TRIGGER set_audit_jobs_updated_at
      BEFORE UPDATE ON public.audit_jobs
      FOR EACH ROW
      EXECUTE FUNCTION public.update_updated_at_column();

    DROP TRIGGER IF EXISTS set_audit_job_files_updated_at ON public.audit_job_files;
    CREATE TRIGGER set_audit_job_files_updated_at
      BEFORE UPDATE ON public.audit_job_files
      FOR EACH ROW
      EXECUTE FUNCTION public.update_updated_at_column();
  END IF;
END $$;

-- 4) RLS
ALTER TABLE public.audit_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_job_files ENABLE ROW LEVEL SECURITY;

-- Only admins can view/insert/update/delete audit data
DROP POLICY IF EXISTS "Admins can view audit jobs" ON public.audit_jobs;
CREATE POLICY "Admins can view audit jobs"
ON public.audit_jobs
FOR SELECT
USING (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Admins can create audit jobs" ON public.audit_jobs;
CREATE POLICY "Admins can create audit jobs"
ON public.audit_jobs
FOR INSERT
WITH CHECK (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Admins can update audit jobs" ON public.audit_jobs;
CREATE POLICY "Admins can update audit jobs"
ON public.audit_jobs
FOR UPDATE
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Admins can delete audit jobs" ON public.audit_jobs;
CREATE POLICY "Admins can delete audit jobs"
ON public.audit_jobs
FOR DELETE
USING (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Admins can view audit job files" ON public.audit_job_files;
CREATE POLICY "Admins can view audit job files"
ON public.audit_job_files
FOR SELECT
USING (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Admins can create audit job files" ON public.audit_job_files;
CREATE POLICY "Admins can create audit job files"
ON public.audit_job_files
FOR INSERT
WITH CHECK (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Admins can update audit job files" ON public.audit_job_files;
CREATE POLICY "Admins can update audit job files"
ON public.audit_job_files
FOR UPDATE
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Admins can delete audit job files" ON public.audit_job_files;
CREATE POLICY "Admins can delete audit job files"
ON public.audit_job_files
FOR DELETE
USING (public.has_role(auth.uid(), 'admin'));

