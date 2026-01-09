-- Final fix - avoid all ambiguity by using explicit table references
-- This version ensures 'name' always refers to storage.objects.name

-- Drop existing storage view policy
DROP POLICY IF EXISTS "Users can view documents they have access to" ON storage.objects;

-- Create storage view policy with explicit name qualification
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
      
      -- NDA templates: Check file_path match first, then check permissions
      -- This avoids ambiguity by checking name before joining to other tables
      OR (
        EXISTS (
          SELECT 1 FROM public.nda_templates nt
          WHERE nt.file_path = name
        )
        AND EXISTS (
          SELECT 1 FROM public.nda_templates nt2
          JOIN public.vault_permissions vp ON vp.vault_id = nt2.vault_id
          WHERE nt2.file_path = name
            AND vp.user_id = auth.uid()
            AND vp.can_view = true
        )
        AND EXISTS (
          SELECT 1 FROM public.nda_templates nt3
          JOIN public.user_roles ur ON ur.user_id = auth.uid()
          WHERE nt3.file_path = name
            AND ur.role = nt3.role_type
        )
      )
      
      -- NDA templates: Domain-based access
      OR (
        EXISTS (
          SELECT 1 FROM public.nda_templates nt
          WHERE nt.file_path = name
        )
        AND EXISTS (
          SELECT 1 FROM public.nda_templates nt2
          JOIN public.vault_permissions vp ON vp.vault_id = nt2.vault_id
          JOIN auth.users au ON au.id = vp.user_id
          JOIN auth.users cu ON cu.id = auth.uid()
          WHERE nt2.file_path = name
            AND vp.can_view = true
            AND public.get_email_domain(au.email) = public.get_email_domain(cu.email)
            AND public.get_email_domain(au.email) IS NOT NULL
            AND public.get_email_domain(au.email) != ''
        )
        AND EXISTS (
          SELECT 1 FROM public.nda_templates nt3
          JOIN public.user_roles ur ON ur.user_id = auth.uid()
          WHERE nt3.file_path = name
            AND ur.role = nt3.role_type
        )
      )
    )
  );

