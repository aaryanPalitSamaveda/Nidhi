-- Fix 400 error when previewing/downloading documents
-- Symptom: StorageUnknownError {} / 400 when accessing any document
-- Causes: 1) Storage policy missing vault created_by  2) Column name ambiguity in subqueries
--
-- Run in Supabase SQL Editor: https://supabase.com/dashboard/project/unyiuyzhteeuoyujqpbf/sql

-- Helper: check if user can view a storage path (avoids policy ambiguity)
CREATE OR REPLACE FUNCTION public.can_user_view_storage_path(p_path text, p_user_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_path IS NULL OR p_user_id IS NULL THEN
    RETURN false;
  END IF;

  -- Admins can view everything
  IF public.has_role(p_user_id, 'admin') THEN
    RETURN true;
  END IF;

  -- Regular documents: document exists and user has vault access
  IF EXISTS (
    SELECT 1 FROM public.documents d
    JOIN public.vaults v ON v.id = d.vault_id
    WHERE d.file_path = p_path
      AND (v.client_id = p_user_id OR v.created_by = p_user_id)
  ) THEN
    RETURN true;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.documents d
    JOIN public.vault_permissions vp ON vp.vault_id = d.vault_id
    WHERE d.file_path = p_path
      AND vp.user_id = p_user_id
      AND vp.can_view = true
  ) THEN
    RETURN true;
  END IF;

  -- Fallback: has_vault_access (covers domain-based and other cases)
  IF EXISTS (
    SELECT 1 FROM public.documents d
    WHERE d.file_path = p_path
      AND public.has_vault_access(p_user_id, d.vault_id)
  ) THEN
    RETURN true;
  END IF;

  -- NDA templates
  IF EXISTS (
    SELECT 1 FROM public.nda_templates nt
    WHERE nt.file_path = p_path
      AND public.has_vault_access(p_user_id, nt.vault_id)
  ) THEN
    RETURN true;
  END IF;

  RETURN false;
END;
$$;

GRANT EXECUTE ON FUNCTION public.can_user_view_storage_path(text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_user_view_storage_path(text, uuid) TO service_role;

DROP POLICY IF EXISTS "Users can view documents they have access to" ON storage.objects;

CREATE POLICY "Users can view documents they have access to"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'documents'
    AND public.can_user_view_storage_path(name, auth.uid())
  );
