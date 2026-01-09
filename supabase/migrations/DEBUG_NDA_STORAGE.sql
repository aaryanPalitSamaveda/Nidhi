-- Debug: Test if storage RLS works at all for NDA templates
-- This is the absolute simplest check possible

-- Drop existing policy
DROP POLICY IF EXISTS "Users can view documents they have access to" ON storage.objects;

-- Create minimal test policy - just check if file exists in nda_templates and user has investor role
CREATE POLICY "Users can view documents they have access to"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'documents'
    AND (
      -- Admins can view everything
      public.has_role(auth.uid(), 'admin')
      
      -- Regular documents (keep existing logic)
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
      
      -- NDA templates: SIMPLEST POSSIBLE CHECK
      -- Just check if file path exists in nda_templates AND user has investor role
      OR (
        EXISTS (
          SELECT 1 FROM public.nda_templates nt
          WHERE nt.file_path = name
        )
        AND EXISTS (
          SELECT 1 FROM public.user_roles ur
          WHERE ur.user_id = auth.uid() AND ur.role = 'investor'
        )
      )
    )
  );

