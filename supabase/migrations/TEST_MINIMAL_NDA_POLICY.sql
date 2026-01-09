-- Minimal test policy to verify storage RLS works at all
-- This should definitely work if storage RLS is functioning

-- Drop existing policy
DROP POLICY IF EXISTS "Users can view documents they have access to" ON storage.objects;

-- Create minimal test policy
CREATE POLICY "Users can view documents they have access to"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'documents'
    AND (
      -- Admins can view everything
      public.has_role(auth.uid(), 'admin')
      
      -- Regular documents: Users with explicit permission
      OR EXISTS (
        SELECT 1 FROM public.vault_permissions vp
        JOIN public.documents d ON d.vault_id = vp.vault_id
        WHERE d.file_path = name
          AND vp.user_id = auth.uid()
          AND vp.can_view = true
      )
      OR EXISTS (
        SELECT 1 FROM public.vaults v
        JOIN public.documents d ON d.vault_id = v.id
        WHERE d.file_path = name
          AND v.client_id = auth.uid()
      )
      
      -- NDA templates: If file path matches AND user has investor role
      -- This is the simplest possible check
      OR (
        name LIKE 'nda_templates/%'
        AND EXISTS (
          SELECT 1 FROM public.user_roles ur
          WHERE ur.user_id = auth.uid() AND ur.role = 'investor'
        )
        AND EXISTS (
          SELECT 1 FROM public.nda_templates nt
          WHERE nt.file_path = name
        )
      )
    )
  );

