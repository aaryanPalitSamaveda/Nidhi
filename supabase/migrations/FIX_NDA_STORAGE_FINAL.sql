-- FINAL FIX - Use has_vault_access function which already includes domain-based access
-- This function checks explicit permissions AND domain-based access automatically
-- This is the simplest and most reliable approach

-- Drop existing storage view policy
DROP POLICY IF EXISTS "Users can view documents they have access to" ON storage.objects;

-- Create storage view policy - Use has_vault_access for NDA templates
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
      
      -- NDA templates: Use has_vault_access which includes domain-based access
      -- This function already checks explicit permissions AND domain matching
      -- name is in innermost EXISTS with only nda_templates (no ambiguity)
      OR EXISTS (
        SELECT 1 FROM public.nda_templates nt
        WHERE nt.file_path = name
          AND public.has_vault_access(auth.uid(), nt.vault_id)
          AND EXISTS (
            SELECT 1 FROM public.user_roles ur
            WHERE ur.user_id = auth.uid() AND ur.role = nt.role_type
          )
      )
    )
  );
