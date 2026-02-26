-- ============================================================================
-- PUBLIC AUDITOR: Tables for public audit product at /auditor
-- Users fill name + company, upload docs, generate audit reports.
-- Admin can view all sessions, uploads, and reports.
-- ============================================================================

-- 1) Auditor sessions (one per visitor)
CREATE TABLE IF NOT EXISTS public.auditor_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  company_name TEXT NOT NULL,
  vault_id UUID REFERENCES public.vaults(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS auditor_sessions_created_at_idx ON public.auditor_sessions(created_at DESC);
CREATE INDEX IF NOT EXISTS auditor_sessions_vault_id_idx ON public.auditor_sessions(vault_id);

-- 2) Allow vaults/folders/documents with NULL created_by for auditor (we'll use a system user)
-- First, add a system user for auditor operations
-- We use a placeholder - the edge function will look up an admin user for created_by

-- 3) RLS for auditor_sessions - admins can do everything
ALTER TABLE public.auditor_sessions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can view auditor sessions" ON public.auditor_sessions;
CREATE POLICY "Admins can view auditor sessions"
ON public.auditor_sessions FOR SELECT
USING (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Admins can insert auditor sessions" ON public.auditor_sessions;
CREATE POLICY "Admins can insert auditor sessions"
ON public.auditor_sessions FOR INSERT
WITH CHECK (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Admins can update auditor sessions" ON public.auditor_sessions;
CREATE POLICY "Admins can update auditor sessions"
ON public.auditor_sessions FOR UPDATE
USING (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Admins can delete auditor sessions" ON public.auditor_sessions;
CREATE POLICY "Admins can delete auditor sessions"
ON public.auditor_sessions FOR DELETE
USING (public.has_role(auth.uid(), 'admin'));

-- 4) Service role can do everything (no policy for anon - public auditor uses edge function with service role)
-- Allow anon to read auditor_sessions by id for session lookup (needed for public page to check status)
-- Actually we won't expose that - the edge function will handle all public access. So no anon policy.

-- 5) Trigger for updated_at
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'update_updated_at_column') THEN
    DROP TRIGGER IF EXISTS set_auditor_sessions_updated_at ON public.auditor_sessions;
    CREATE TRIGGER set_auditor_sessions_updated_at
      BEFORE UPDATE ON public.auditor_sessions
      FOR EACH ROW
      EXECUTE FUNCTION public.update_updated_at_column();
  END IF;
END $$;
