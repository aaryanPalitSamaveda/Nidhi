-- FINAL WORKING FIX - Single EXISTS with name used ONLY in innermost subquery
-- ROOT CAUSE: vaults table has a 'name' column. When vault_permissions (which references vaults) 
-- is in scope, PostgreSQL sees both storage.objects.name and vaults.name.
-- 
-- SOLUTION: Use a single EXISTS where name is used ONLY in a subquery that selects from
-- nda_templates WITHOUT any reference to vault_permissions. Then check permissions using
-- the vault_id from that subquery result.

-- Drop existing storage view policy
DROP POLICY IF EXISTS "Users can view documents they have access to" ON storage.objects;

-- Create storage view policy - FINAL WORKING FIX
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
      
      -- NDA templates: FINAL FIX - Single EXISTS, name used ONLY in subquery selecting from nda_templates
      -- The subquery gets the vault_id, then we check permissions using that vault_id (no name used)
      OR EXISTS (
        SELECT 1 FROM (
          -- Subquery: Get vault_id for this NDA template file (name used here, vaults NOT in scope)
          SELECT nt.vault_id, nt.role_type
          FROM public.nda_templates nt
          WHERE nt.file_path = name
        ) nda_match
        -- Check user has matching role
        WHERE EXISTS (
          SELECT 1 FROM public.user_roles ur
          WHERE ur.user_id = auth.uid() AND ur.role = nda_match.role_type
        )
        -- Check user has vault permission (using vault_id from subquery, NOT name)
        AND EXISTS (
          SELECT 1 FROM public.vault_permissions vp
          WHERE vp.vault_id = nda_match.vault_id
            AND vp.user_id = auth.uid()
            AND vp.can_view = true
        )
      )
    )
  );
