-- Fix NDA access: Domain-based users inherit role from explicitly assigned user
-- If aditya@larsentoubro.com is assigned as "Investor", all @larsentoubro.com users get "Investor" NDA
-- This removes ambiguity about which NDA template to show

-- Step 1: Create helper function to get user's role for a vault (with domain fallback)
CREATE OR REPLACE FUNCTION public.get_user_role_for_vault(
  p_user_id UUID,
  p_vault_id UUID
) RETURNS app_role
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_role app_role;
  v_user_email TEXT;
  v_user_domain TEXT;
BEGIN
  -- First, check if user has explicit role assignment
  SELECT ur.role INTO v_role
  FROM public.user_roles ur
  WHERE ur.user_id = p_user_id
  LIMIT 1;
  
  -- If user has explicit role, return it
  IF v_role IS NOT NULL THEN
    RETURN v_role;
  END IF;
  
  -- If no explicit role, check domain-based: find role of any user with same domain who has vault access
  SELECT email INTO v_user_email
  FROM auth.users
  WHERE id = p_user_id;
  
  IF v_user_email IS NULL THEN
    RETURN NULL;
  END IF;
  
  v_user_domain := public.get_email_domain(v_user_email);
  
  -- Find role of any user with same domain who has access to this vault
  SELECT ur.role INTO v_role
  FROM public.user_roles ur
  JOIN auth.users au ON au.id = ur.user_id
  WHERE public.get_email_domain(au.email) = v_user_domain
    AND EXISTS (
      SELECT 1 FROM public.vault_permissions vp
      WHERE vp.vault_id = p_vault_id
        AND vp.user_id = ur.user_id
        AND vp.can_view = true
    )
  LIMIT 1;
  
  RETURN v_role;
END;
$$;

-- Step 2: Grant execute permission
GRANT EXECUTE ON FUNCTION public.get_user_role_for_vault(UUID, UUID) TO authenticated;

-- Step 3: Update storage policy to use role inheritance
DROP POLICY IF EXISTS "Users can view documents they have access to" ON storage.objects;

CREATE POLICY "Users can view documents they have access to"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'documents'
    AND (
      -- Admins can view everything
      public.has_role(auth.uid(), 'admin')
      
      -- Regular documents: Users are vault clients (EXACT working pattern)
      OR EXISTS (
        SELECT 1 
        FROM public.vaults v
        WHERE EXISTS (
          SELECT 1 FROM public.documents d
          WHERE d.vault_id = v.id
            AND d.file_path = name
        )
        AND v.client_id = auth.uid()
      )
      
      -- Regular documents: Users with explicit permission (EXACT working pattern)
      OR EXISTS (
        SELECT 1 FROM public.vault_permissions vp
        WHERE EXISTS (
          SELECT 1 FROM public.documents d
          WHERE d.vault_id = vp.vault_id
            AND d.file_path = name
        )
        AND vp.user_id = auth.uid()
        AND vp.can_view = true
      )
      
      -- NDA templates: Use has_vault_access + role inheritance
      -- name is in innermost EXISTS with only nda_templates (no ambiguity)
      -- Role is determined by get_user_role_for_vault which handles domain inheritance
      OR EXISTS (
        SELECT 1 FROM public.nda_templates nt
        WHERE nt.file_path = name
          AND public.has_vault_access(auth.uid(), nt.vault_id)
          AND public.get_user_role_for_vault(auth.uid(), nt.vault_id) = nt.role_type
      )
    )
  );

