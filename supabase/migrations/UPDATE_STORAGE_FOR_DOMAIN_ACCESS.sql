-- Update storage policies to support domain-based access
-- This allows users with the same email domain to access documents

-- Drop existing storage view policy
DROP POLICY IF EXISTS "Users can view documents they have access to" ON storage.objects;

-- Create updated storage view policy with domain-based access
CREATE POLICY "Users can view documents they have access to"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'documents'
    AND (
      -- Admins can view everything
      public.has_role(auth.uid(), 'admin')
      -- Users can view regular documents they have access to (including domain-based)
      OR EXISTS (
        SELECT 1 FROM public.vault_permissions vp
        JOIN public.documents d ON d.vault_id = vp.vault_id
        WHERE d.file_path = storage.objects.name
          AND vp.user_id = auth.uid()
          AND vp.can_view = true
      )
      -- Domain-based access: Check if user's domain matches any user with access
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
      -- Users can view documents in vaults where they are the client
      OR EXISTS (
        SELECT 1 FROM public.vaults v
        JOIN public.documents d ON d.vault_id = v.id
        WHERE d.file_path = storage.objects.name
          AND v.client_id = auth.uid()
      )
      -- Domain-based access: Check if vault client has same domain
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
            -- Domain-based access for NDA templates
            OR (
              EXISTS (
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
                -- Domain-based access for sellers
                OR EXISTS (
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
                -- Domain-based access for investors
                OR EXISTS (
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
              )
            )
          )
      )
    )
  );

