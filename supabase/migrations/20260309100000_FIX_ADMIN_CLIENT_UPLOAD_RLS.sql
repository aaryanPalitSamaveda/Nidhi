-- Fix admin/client dataroom uploads failing with 400 and "new row violates row-level security policy"
-- Root cause: documents INSERT policy missing vault client_id/created_by; storage policy may be missing
-- Run in Supabase SQL Editor: https://supabase.com/dashboard/project/unyiuyzhteeuoyujqpbf/sql

-- 1. Create helper for storage INSERT: check vault access from path WITHOUT requiring document to exist
-- Path format: user_id/vault_id/timestamp_filename
CREATE OR REPLACE FUNCTION public.can_user_upload_to_path(p_path text, p_user_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_segments text[];
  v_vault_id uuid;
  v_is_admin boolean;
BEGIN
  -- Admin can always upload
  SELECT public.has_role(p_user_id, 'admin') INTO v_is_admin;
  IF v_is_admin THEN
    RETURN true;
  END IF;

  -- Path must be user_id/vault_id/... (first segment = uploading user)
  v_segments := string_to_array(p_path, '/');
  IF array_length(v_segments, 1) < 2 THEN
    RETURN false;
  END IF;

  -- First segment must match user (they upload to their own folder)
  IF v_segments[1] != p_user_id::text THEN
    RETURN false;
  END IF;

  -- Extract vault_id from second segment
  BEGIN
    v_vault_id := v_segments[2]::uuid;
  EXCEPTION WHEN OTHERS THEN
    RETURN false;
  END;

  -- Vault creator or client can upload
  IF EXISTS (
    SELECT 1 FROM public.vaults v
    WHERE v.id = v_vault_id
      AND (v.created_by = p_user_id OR v.client_id = p_user_id)
  ) THEN
    RETURN true;
  END IF;

  -- vault_permissions with can_upload or can_edit
  IF EXISTS (
    SELECT 1 FROM public.vault_permissions vp
    WHERE vp.vault_id = v_vault_id
      AND vp.user_id = p_user_id
      AND (vp.can_upload = true OR vp.can_edit = true)
  ) THEN
    RETURN true;
  END IF;

  RETURN false;
END;
$$;

-- 2. Fix documents INSERT: add vault client_id, created_by, and can_edit
DROP POLICY IF EXISTS "Users with upload access can create documents" ON public.documents;

CREATE POLICY "Users with upload access can create documents"
  ON public.documents FOR INSERT
  WITH CHECK (
    public.has_role(auth.uid(), 'admin')
    OR EXISTS (
      SELECT 1 FROM public.vaults
      WHERE id = documents.vault_id
        AND (client_id = auth.uid() OR created_by = auth.uid())
    )
    OR EXISTS (
      SELECT 1 FROM public.vault_permissions
      WHERE vault_id = documents.vault_id
        AND user_id = auth.uid()
        AND (can_upload = true OR can_edit = true)
    )
  );

-- 3. Fix storage INSERT: ensure policy exists and allows uploads for path format
DROP POLICY IF EXISTS "Users can upload documents to accessible vaults" ON storage.objects;

CREATE POLICY "Users can upload documents to accessible vaults"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'documents'
    AND (
      public.has_role(auth.uid(), 'admin')
      OR auth.uid()::text = (storage.foldername(name))[1]
      OR public.can_user_upload_to_path(name, auth.uid())
    )
  );
