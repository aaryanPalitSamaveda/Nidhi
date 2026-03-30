-- Add user_id to auditor_sessions so an authenticated auditor user
-- can look up their own active session after sign-out / sign-in.

ALTER TABLE public.auditor_sessions
  ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS auditor_sessions_user_id_idx
  ON public.auditor_sessions(user_id);
