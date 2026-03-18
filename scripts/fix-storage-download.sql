-- =============================================================================
-- FIX: 400 / StorageUnknownError when viewing or downloading documents
-- Run in Supabase SQL Editor: https://supabase.com/dashboard/project/unyiuyzhteeuoyujqpbf/sql
-- =============================================================================

-- STEP 1: Ensure service_role has full access (for backend operations)
DROP POLICY IF EXISTS "Allow service role full access to documents" ON storage.objects;
CREATE POLICY "Allow service role full access to documents"
  ON storage.objects FOR ALL
  TO service_role
  USING (bucket_id = 'documents')
  WITH CHECK (bucket_id = 'documents');

-- STEP 2: Create/update helper function
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

  -- Document exists and user has vault access (covers client_id, created_by, vault_permissions, domain-based)
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
GRANT EXECUTE ON FUNCTION public.can_user_view_storage_path(text, uuid) TO anon;

-- STEP 3: Drop existing SELECT policy and create a simple one
DROP POLICY IF EXISTS "Users can view documents they have access to" ON storage.objects;
DROP POLICY IF EXISTS "Admins can view all storage documents" ON storage.objects;

-- Separate policy for admins (bypasses function - ensures admins always work)
CREATE POLICY "Admins can view all storage documents"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'documents'
    AND public.has_role(auth.uid(), 'admin')
  );

-- Policy for non-admins (document + has_vault_access)
-- Admins use policy above; this handles clients, vault_permissions, domain-based access
CREATE POLICY "Users can view documents they have access to"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'documents'
    AND public.can_user_view_storage_path(name, auth.uid())
  );

-- =============================================================================
-- DIAGNOSTIC: Run these to verify (optional)
-- =============================================================================
-- Check your user is admin:
--   SELECT id, email FROM auth.users WHERE id = auth.uid();
--   SELECT * FROM user_roles WHERE user_id = auth.uid();
--
-- Check document exists for a path:
--   SELECT id, vault_id, file_path FROM documents WHERE file_path LIKE '%1768224197007%' LIMIT 5;
--
-- Test has_vault_access for a vault:
--   SELECT public.has_vault_access(auth.uid(), 'c9f09380-7010-476b-8c9c-df9f4f74d9ff');
