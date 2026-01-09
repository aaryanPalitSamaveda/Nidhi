-- Simple fix - use exact same pattern as working regular documents
-- Just add NDA template check using the same JOIN pattern

-- Drop existing storage view policy
DROP POLICY IF EXISTS "Users can view documents they have access to" ON storage.objects;

-- Create storage view policy - same pattern as FIX_STORAGE_POLICIES.sql
CREATE POLICY "Users can view documents they have access to"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'documents'
    AND (
      -- Admins can view everything
      public.has_role(auth.uid(), 'admin')
      
      -- Regular documents: Users with explicit permission (working pattern)
      OR EXISTS (
        SELECT 1 FROM public.vault_permissions vp
        JOIN public.documents d ON d.vault_id = vp.vault_id
        WHERE d.file_path = name
          AND vp.user_id = auth.uid()
          AND vp.can_view = true
      )
      
      -- Regular documents: Users are vault clients
      OR EXISTS (
        SELECT 1 FROM public.vaults v
        JOIN public.documents d ON d.vault_id = v.id
        WHERE d.file_path = name
          AND v.client_id = auth.uid()
      )
      
      -- NDA templates: Use nested EXISTS pattern (exact same as FIX_VAULT_PERMISSIONS.sql)
      -- name is used in innermost EXISTS with only nda_templates (no name column = no ambiguity)
      OR EXISTS (
        SELECT 1 FROM public.vault_permissions vp
        WHERE EXISTS (
          SELECT 1 FROM public.nda_templates nt
          WHERE nt.vault_id = vp.vault_id
            AND nt.file_path = name
        )
        AND vp.user_id = auth.uid()
        AND vp.can_view = true
        AND EXISTS (
          SELECT 1 FROM public.nda_templates nt2
          JOIN public.vault_permissions vp2 ON vp2.vault_id = nt2.vault_id
          WHERE vp2.vault_id = vp.vault_id
            AND EXISTS (
              SELECT 1 FROM public.user_roles ur
              WHERE ur.user_id = auth.uid() AND ur.role = nt2.role_type
            )
        )
      )
    )
  );

