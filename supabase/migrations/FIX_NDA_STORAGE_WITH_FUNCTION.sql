-- FINAL WORKING FIX - Use function with CURRENT_QUERY context
-- ROOT CAUSE: vaults table has a 'name' column. When vaults is referenced in the policy,
-- PostgreSQL sees both storage.objects.name and vaults.name, causing ambiguity.
-- 
-- SOLUTION: The function approach should work, but we need to pass name correctly.
-- In storage policy USING clause, 'name' refers to storage.objects.name.
-- The issue is that when we use 'name' directly, PostgreSQL sees vaults.name too.
-- Solution: Don't use 'name' at all in the NDA check - use the function with a different approach.

-- Step 1: Create function that checks NDA access by looking up the file_path from storage.objects
-- This function will be called with the storage object's id, not the name
CREATE OR REPLACE FUNCTION public.can_access_nda_template_by_id(
  p_storage_object_id UUID,
  p_user_id UUID
) RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
AS $$
DECLARE
  v_file_path TEXT;
  v_vault_id UUID;
  v_role_type app_role;
BEGIN
  -- Get file_path from storage.objects using the id
  SELECT name INTO v_file_path
  FROM storage.objects
  WHERE id = p_storage_object_id
  LIMIT 1;
  
  -- If no file found, return false
  IF v_file_path IS NULL THEN
    RETURN FALSE;
  END IF;
  
  -- Get vault_id and role_type for this file_path
  SELECT nt.vault_id, nt.role_type
  INTO v_vault_id, v_role_type
  FROM public.nda_templates nt
  WHERE nt.file_path = v_file_path
  LIMIT 1;
  
  -- If no template found, return false
  IF v_vault_id IS NULL THEN
    RETURN FALSE;
  END IF;
  
  -- Check if user has matching role
  IF NOT EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = p_user_id AND ur.role = v_role_type
  ) THEN
    RETURN FALSE;
  END IF;
  
  -- Check if user has vault permission
  IF NOT EXISTS (
    SELECT 1 FROM public.vault_permissions vp
    WHERE vp.vault_id = v_vault_id
      AND vp.user_id = p_user_id
      AND vp.can_view = true
  ) THEN
    RETURN FALSE;
  END IF;
  
  RETURN TRUE;
END;
$$;

-- Step 2: Drop existing storage view policy
DROP POLICY IF EXISTS "Users can view documents they have access to" ON storage.objects;

-- Step 3: Create storage view policy using the function with id instead of name
-- This avoids the name ambiguity completely
CREATE POLICY "Users can view documents they have access to"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'documents'
    AND (
      -- Admins can view everything
      public.has_role(auth.uid(), 'admin')
      
      -- Regular documents: Users with explicit permission (working pattern - keep as is)
      OR EXISTS (
        SELECT 1 FROM public.vault_permissions vp
        JOIN public.documents d ON d.vault_id = vp.vault_id
        WHERE d.file_path = name
          AND vp.user_id = auth.uid()
          AND vp.can_view = true
      )
      
      -- Regular documents: Users are vault clients (working pattern - keep as is)
      OR EXISTS (
        SELECT 1 FROM public.vaults v
        JOIN public.documents d ON d.vault_id = v.id
        WHERE d.file_path = name
          AND v.client_id = auth.uid()
      )
      
      -- NDA templates: Use function with id instead of name to avoid ambiguity
      -- id is unambiguous (only storage.objects has id in this context)
      OR public.can_access_nda_template_by_id(id, auth.uid())
    )
  );
