-- Use the JOIN pattern from FIX_STORAGE_POLICIES.sql which works
-- This matches the exact pattern that works for regular documents

-- Drop existing storage view policy
DROP POLICY IF EXISTS "Users can view documents they have access to" ON storage.objects;

-- Create storage view policy using JOIN pattern (like FIX_STORAGE_POLICIES.sql)
CREATE POLICY "Users can view documents they have access to"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'documents'
    AND (
      -- Admins can view everything
      public.has_role(auth.uid(), 'admin')
      
      -- Regular documents: Users with explicit permission (JOIN pattern)
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
      
      -- NDA templates: Use nested EXISTS pattern (like FIX_VAULT_PERMISSIONS.sql)
      -- Compare name in outer WHERE clause to avoid ambiguity
      OR EXISTS (
        SELECT 1 FROM public.nda_templates nt
        WHERE nt.file_path = name
          AND EXISTS (
            SELECT 1 FROM public.vault_permissions vp
            WHERE vp.vault_id = nt.vault_id
              AND vp.user_id = auth.uid()
              AND vp.can_view = true
          )
          AND EXISTS (
            SELECT 1 FROM public.user_roles ur
            WHERE ur.user_id = auth.uid() AND ur.role = nt.role_type
          )
      )
      
      -- NDA templates: Domain-based access via vault_permissions
      -- Compare name in outer WHERE to avoid ambiguity with JOINs in nested EXISTS
      OR EXISTS (
        SELECT 1 FROM public.nda_templates nt
        WHERE nt.file_path = name
          AND EXISTS (
            SELECT 1 
            FROM public.vault_permissions vp
            WHERE vp.vault_id = nt.vault_id
              AND vp.can_view = true
              AND EXISTS (
                SELECT 1 FROM auth.users au
                WHERE au.id = vp.user_id
                  AND EXISTS (
                    SELECT 1 FROM auth.users cu
                    WHERE cu.id = auth.uid()
                      AND public.get_email_domain(au.email) = public.get_email_domain(cu.email)
                      AND public.get_email_domain(au.email) IS NOT NULL
                      AND public.get_email_domain(au.email) != ''
                  )
              )
          )
          AND EXISTS (
            SELECT 1 FROM public.user_roles ur
            WHERE ur.user_id = auth.uid() AND ur.role = nt.role_type
          )
      )
    )
  );

