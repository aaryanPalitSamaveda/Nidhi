-- Fix storage access for NDA templates
-- Allow sellers and investors to view NDA template files from storage

-- Drop existing storage view policy if it exists
DROP POLICY IF EXISTS "Users can view documents they have access to" ON storage.objects;

-- Create new storage view policy that includes NDA templates
-- Note: In storage policies, 'name' refers to the object path (file_path)
CREATE POLICY "Users can view documents they have access to"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'documents'
    AND (
      -- Admins can view everything
      public.has_role(auth.uid(), 'admin')
      -- Users can view regular documents they have access to
      OR EXISTS (
        SELECT 1 FROM public.vault_permissions vp
        JOIN public.documents d ON d.vault_id = vp.vault_id
        WHERE d.file_path = storage.objects.name
          AND vp.user_id = auth.uid()
          AND vp.can_view = true
      )
      -- Users can view documents in vaults where they are the client
      OR EXISTS (
        SELECT 1 FROM public.vaults v
        JOIN public.documents d ON d.vault_id = v.id
        WHERE d.file_path = storage.objects.name
          AND v.client_id = auth.uid()
      )
          -- NDA templates: Allow access if user has access to the vault and matches role_type
          OR EXISTS (
            SELECT 1 FROM public.nda_templates nt
            JOIN public.vaults v ON v.id = nt.vault_id
            WHERE nt.file_path = storage.objects.name
              AND (
                -- Admin
                public.has_role(auth.uid(), 'admin')
                -- Vault creator
                OR v.created_by = auth.uid()
                -- Vault client
                OR v.client_id = auth.uid()
                -- User with vault permission and matching role
                OR (
                  EXISTS (
                    SELECT 1 FROM public.vault_permissions vp
                    WHERE vp.vault_id = v.id
                      AND vp.user_id = auth.uid()
                      AND vp.can_view = true
                  )
                  AND EXISTS (
                    SELECT 1 FROM public.user_roles ur
                    WHERE ur.user_id = auth.uid() AND ur.role = nt.role_type
                  )
                )
                -- Seller with access (check role and vault access) and matching role_type
                OR (
                  EXISTS (
                    SELECT 1 FROM public.user_roles ur
                    WHERE ur.user_id = auth.uid() AND ur.role = 'seller'
                  )
                  AND nt.role_type = 'seller'
                  AND (
                    v.client_id = auth.uid()
                    OR EXISTS (
                      SELECT 1 FROM public.vault_permissions vp
                      WHERE vp.vault_id = v.id
                        AND vp.user_id = auth.uid()
                        AND vp.can_view = true
                    )
                  )
                )
                -- Investor with access (check role and vault access) and matching role_type
                OR (
                  EXISTS (
                    SELECT 1 FROM public.user_roles ur
                    WHERE ur.user_id = auth.uid() AND ur.role = 'investor'
                  )
                  AND nt.role_type = 'investor'
                  AND (
                    v.client_id = auth.uid()
                    OR EXISTS (
                      SELECT 1 FROM public.vault_permissions vp
                      WHERE vp.vault_id = v.id
                        AND vp.user_id = auth.uid()
                        AND vp.can_view = true
                    )
                  )
                )
              )
          )
    )
  );

