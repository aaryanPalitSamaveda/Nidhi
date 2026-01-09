-- Simplified NDA storage policy that should definitely work
-- This version uses a simpler approach that's more reliable for storage RLS

-- Drop existing storage view policy
DROP POLICY IF EXISTS "Users can view documents they have access to" ON storage.objects;

-- Create simplified storage view policy
CREATE POLICY "Users can view documents they have access to"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'documents'
    AND (
      -- Admins can view everything
      public.has_role(auth.uid(), 'admin')
      
      -- Regular documents: Users with explicit or domain-based access
      OR EXISTS (
        SELECT 1 FROM public.vault_permissions vp
        JOIN public.documents d ON d.vault_id = vp.vault_id
        WHERE d.file_path = storage.objects.name
          AND vp.user_id = auth.uid()
          AND vp.can_view = true
      )
      OR EXISTS (
        SELECT 1 
        FROM public.vault_permissions vp
        JOIN public.documents d ON d.vault_id = vp.vault_id
        JOIN auth.users au ON au.id = vp.user_id
        JOIN auth.users cu ON cu.id = auth.uid()
        WHERE d.file_path = storage.objects.name
          AND vp.can_view = true
          AND public.get_email_domain(au.email) = public.get_email_domain(cu.email)
          AND public.get_email_domain(au.email) IS NOT NULL
          AND public.get_email_domain(au.email) != ''
      )
      OR EXISTS (
        SELECT 1 FROM public.vaults v
        JOIN public.documents d ON d.vault_id = v.id
        WHERE d.file_path = storage.objects.name
          AND v.client_id = auth.uid()
      )
      OR EXISTS (
        SELECT 1 
        FROM public.vaults v
        JOIN public.documents d ON d.vault_id = v.id
        JOIN auth.users au ON au.id = v.client_id
        JOIN auth.users cu ON cu.id = auth.uid()
        WHERE d.file_path = storage.objects.name
          AND v.client_id IS NOT NULL
          AND public.get_email_domain(au.email) = public.get_email_domain(cu.email)
          AND public.get_email_domain(au.email) IS NOT NULL
          AND public.get_email_domain(au.email) != ''
      )
      
      -- NDA templates: Direct check - user has explicit permission OR domain-based access
      OR EXISTS (
        SELECT 1 FROM public.nda_templates nt
        JOIN public.vaults v ON v.id = nt.vault_id
        WHERE nt.file_path = storage.objects.name
          -- User has explicit vault permission
          AND EXISTS (
            SELECT 1 FROM public.vault_permissions vp
            WHERE vp.vault_id = v.id
              AND vp.user_id = auth.uid()
              AND vp.can_view = true
          )
          -- AND user has matching role
          AND EXISTS (
            SELECT 1 FROM public.user_roles ur
            WHERE ur.user_id = auth.uid() AND ur.role = nt.role_type
          )
      )
      -- NDA templates: Domain-based access via vault_permissions
      OR EXISTS (
        SELECT 1 FROM public.nda_templates nt
        JOIN public.vaults v ON v.id = nt.vault_id
        WHERE nt.file_path = storage.objects.name
          -- Someone with same domain has vault permission
          AND EXISTS (
            SELECT 1 
            FROM public.vault_permissions vp
            JOIN auth.users au ON au.id = vp.user_id
            JOIN auth.users cu ON cu.id = auth.uid()
            WHERE vp.vault_id = v.id
              AND vp.can_view = true
              AND public.get_email_domain(au.email) = public.get_email_domain(cu.email)
              AND public.get_email_domain(au.email) IS NOT NULL
              AND public.get_email_domain(au.email) != ''
          )
          -- AND user has matching role
          AND EXISTS (
            SELECT 1 FROM public.user_roles ur
            WHERE ur.user_id = auth.uid() AND ur.role = nt.role_type
          )
      )
    )
  );

