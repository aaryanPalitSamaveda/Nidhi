-- Explicit fix - use subquery to explicitly reference storage.objects.name
-- This avoids all ambiguity by explicitly selecting from storage.objects

-- Drop existing storage view policy
DROP POLICY IF EXISTS "Users can view documents they have access to" ON storage.objects;

-- Create storage view policy with explicit name reference
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
        WHERE d.file_path = (SELECT so.name FROM storage.objects so WHERE so.id = storage.objects.id)
          AND vp.user_id = auth.uid()
          AND vp.can_view = true
      )
      
      -- Regular documents: Users are vault clients
      OR EXISTS (
        SELECT 1 FROM public.vaults v
        JOIN public.documents d ON d.vault_id = v.id
        WHERE d.file_path = (SELECT so.name FROM storage.objects so WHERE so.id = storage.objects.id)
          AND v.client_id = auth.uid()
      )
      
      -- NDA templates: Use subquery to explicitly reference storage.objects.name
      OR EXISTS (
        SELECT 1 FROM public.vault_permissions vp
        WHERE EXISTS (
          SELECT 1 FROM public.nda_templates nt
          WHERE nt.vault_id = vp.vault_id
            AND nt.file_path = (SELECT so.name FROM storage.objects so WHERE so.id = storage.objects.id)
            AND EXISTS (
              SELECT 1 FROM public.user_roles ur
              WHERE ur.user_id = auth.uid() AND ur.role = nt.role_type
            )
        )
        AND vp.user_id = auth.uid()
        AND vp.can_view = true
      )
    )
  );

