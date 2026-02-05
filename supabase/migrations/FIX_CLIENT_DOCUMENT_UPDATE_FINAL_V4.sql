-- Final fix for client-side document updates - VERSION 4
-- CRITICAL FIX: PostgreSQL resolves 'name' as 'd.name' in subqueries
-- Solution: Create a helper function that explicitly checks permissions
-- This avoids the ambiguous column reference by isolating the file_path comparison

-- Create helper function to check if user can edit/upload a document
CREATE OR REPLACE FUNCTION public.can_user_edit_document(
  p_file_path text,
  p_user_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
AS $$
DECLARE
  v_vault_id uuid;
  v_is_admin boolean;
BEGIN
  -- Check if user is admin
  SELECT public.has_role(p_user_id, 'admin') INTO v_is_admin;
  IF v_is_admin THEN
    RETURN true;
  END IF;
  
  -- Get vault_id from document
  SELECT d.vault_id INTO v_vault_id
  FROM public.documents d
  WHERE d.file_path = p_file_path
  LIMIT 1;
  
  IF v_vault_id IS NULL THEN
    RETURN false;
  END IF;
  
  -- Check if user is vault creator or client
  IF EXISTS (
    SELECT 1 
    FROM public.vaults v
    WHERE v.id = v_vault_id
      AND (v.created_by = p_user_id OR v.client_id = p_user_id)
  ) THEN
    RETURN true;
  END IF;
  
  -- Check if user has edit permission via vault_permissions
  IF EXISTS (
    SELECT 1 
    FROM public.vault_permissions vp
    WHERE vp.vault_id = v_vault_id
      AND vp.user_id = p_user_id
      AND vp.can_edit = true
  ) THEN
    RETURN true;
  END IF;
  
  RETURN false;
END;
$$;

-- Create helper function to check if user can delete a document
CREATE OR REPLACE FUNCTION public.can_user_delete_document(
  p_file_path text,
  p_user_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
AS $$
DECLARE
  v_vault_id uuid;
  v_is_admin boolean;
BEGIN
  -- Check if user is admin
  SELECT public.has_role(p_user_id, 'admin') INTO v_is_admin;
  IF v_is_admin THEN
    RETURN true;
  END IF;
  
  -- Get vault_id from document
  SELECT d.vault_id INTO v_vault_id
  FROM public.documents d
  WHERE d.file_path = p_file_path
  LIMIT 1;
  
  IF v_vault_id IS NULL THEN
    RETURN false;
  END IF;
  
  -- Check if user is vault creator or client
  IF EXISTS (
    SELECT 1 
    FROM public.vaults v
    WHERE v.id = v_vault_id
      AND (v.created_by = p_user_id OR v.client_id = p_user_id)
  ) THEN
    RETURN true;
  END IF;
  
  -- Check if user has edit or delete permission via vault_permissions
  IF EXISTS (
    SELECT 1 
    FROM public.vault_permissions vp
    WHERE vp.vault_id = v_vault_id
      AND vp.user_id = p_user_id
      AND (vp.can_edit = true OR vp.can_delete = true)
  ) THEN
    RETURN true;
  END IF;
  
  RETURN false;
END;
$$;

-- 1. Fix INSERT policy - Use helper function to avoid ambiguous column reference
DROP POLICY IF EXISTS "Users can upload documents to accessible vaults" ON storage.objects;

CREATE POLICY "Users can upload documents to accessible vaults"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'documents'
    AND (
      public.has_role(auth.uid(), 'admin')
      OR auth.uid()::text = (storage.foldername(name))[1]
      OR public.can_user_edit_document(name, auth.uid())
    )
  );

-- 2. Fix DELETE policy - Use helper function
DROP POLICY IF EXISTS "Users can delete documents they have access to" ON storage.objects;
DROP POLICY IF EXISTS "Admins can delete documents" ON storage.objects;

CREATE POLICY "Users can delete documents they have access to"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'documents'
    AND (
      public.has_role(auth.uid(), 'admin')
      OR public.can_user_delete_document(name, auth.uid())
    )
  );



