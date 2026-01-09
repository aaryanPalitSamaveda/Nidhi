-- PERMANENT FIX - Root cause analysis and FINAL solution
-- ROOT CAUSE: vaults table has a 'name' column. When vault_permissions (which references vaults via FK) 
-- is in the query scope, PostgreSQL sees both storage.objects.name and vaults.name, causing ambiguity.
-- 
-- FINAL SOLUTION: Completely separate the file_path check from the permissions check.
-- Step 1: Check if file is an NDA template using 'name' (vaults NOT in scope = no ambiguity)
-- Step 2: Check permissions using the vault_id from the NDA template (separate query, no 'name' used)
-- This way, 'name' is ONLY used when vaults is completely out of scope.

-- Drop existing storage view policy
DROP POLICY IF EXISTS "Users can view documents they have access to" ON storage.objects;

-- Create storage view policy - PERMANENT FIX
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
      
      -- NDA templates: PERMANENT FIX - Completely separate file_path check from permissions check
      -- Step 1: Check if this file is an NDA template (name used here, vaults NOT in scope = no ambiguity)
      OR (
        EXISTS (
          SELECT 1 FROM public.nda_templates nt
          WHERE nt.file_path = name
        )
        -- Step 2: Check if user has permission for this NDA template's vault
        -- Use vault_id from nda_templates, NOT from vault_permissions (avoids bringing vaults into scope)
        AND EXISTS (
          SELECT 1 FROM public.nda_templates nt2
          WHERE nt2.file_path = name
            AND EXISTS (
              SELECT 1 FROM public.vault_permissions vp
              WHERE vp.vault_id = nt2.vault_id
                AND vp.user_id = auth.uid()
                AND vp.can_view = true
            )
        )
        -- Step 3: Check if user has matching role
        AND EXISTS (
          SELECT 1 FROM public.nda_templates nt3
          WHERE nt3.file_path = name
            AND EXISTS (
              SELECT 1 FROM public.user_roles ur
              WHERE ur.user_id = auth.uid() AND ur.role = nt3.role_type
            )
        )
      )
    )
  );
