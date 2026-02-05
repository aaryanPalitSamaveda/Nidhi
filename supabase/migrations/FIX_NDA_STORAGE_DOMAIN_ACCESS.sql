-- Fix NDA template storage access for domain-based users
-- This allows users with domain-based access (via has_vault_access) to view NDA templates
-- Run this in Supabase SQL Editor

-- Drop existing storage view policy
DROP POLICY IF EXISTS "Users can view documents they have access to" ON storage.objects;

-- Create updated storage view policy with domain-based access for NDA templates
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
      -- NDA templates: If user can SELECT from nda_templates table (RLS handles access), allow storage access
      -- This is simpler and relies on the RLS policies on nda_templates table
      OR EXISTS (
        SELECT 1 FROM public.nda_templates nt
        WHERE nt.file_path = storage.objects.name
          -- Check if user can access this template via RLS (this includes domain-based access)
          -- We do this by checking if the user has vault access and matching role
          AND (
            -- Admin can access all
            public.has_role(auth.uid(), 'admin')
            -- User has vault access (via has_vault_access which includes domain-based)
            OR (
              public.has_vault_access(auth.uid(), nt.vault_id)
              AND (
                -- User has matching role
                EXISTS (
                  SELECT 1 FROM public.user_roles ur
                  WHERE ur.user_id = auth.uid() AND ur.role = nt.role_type
                )
                -- OR user has no role but template is for investor (default role)
                OR (
                  NOT EXISTS (
                    SELECT 1 FROM public.user_roles ur2
                    WHERE ur2.user_id = auth.uid()
                  )
                  AND nt.role_type = 'investor'
                )
              )
            )
          )
      )
    )
  );

