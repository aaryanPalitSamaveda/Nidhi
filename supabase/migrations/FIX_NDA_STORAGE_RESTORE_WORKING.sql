-- RESTORE WORKING STRUCTURE - Use exact same pattern as working documents queries
-- This is the EXACT structure that worked before - no changes, just add NDA templates using same pattern

-- Drop existing storage view policy
DROP POLICY IF EXISTS "Users can view documents they have access to" ON storage.objects;

-- Create storage view policy - EXACT SAME STRUCTURE AS FIX_VAULT_PERMISSIONS.sql
CREATE POLICY "Users can view documents they have access to"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'documents'
    AND (
      -- Admins can view everything
      public.has_role(auth.uid(), 'admin')
      
      -- Regular documents: Users are vault clients (EXACT working pattern)
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
      
      -- Regular documents: Users with explicit permission (EXACT working pattern)
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
      
      -- NDA templates: Use EXACT SAME nested EXISTS pattern as documents above
      -- name is in innermost EXISTS with only nda_templates (no name column = no ambiguity)
      -- Role check is outside, just like vp.user_id check is outside
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
          WHERE nt2.vault_id = vp.vault_id
            AND EXISTS (
              SELECT 1 FROM public.user_roles ur
              WHERE ur.user_id = auth.uid() AND ur.role = nt2.role_type
            )
        )
      )
      
      -- NDA templates: Domain-based access (same pattern, check domain match)
      -- Anyone with matching domain can access NDA templates, even if not explicitly added
      OR EXISTS (
        SELECT 1 FROM public.vault_permissions vp
        WHERE EXISTS (
          SELECT 1 FROM public.nda_templates nt
          WHERE nt.vault_id = vp.vault_id
            AND nt.file_path = name
        )
        AND EXISTS (
          SELECT 1 FROM auth.users u1
          JOIN auth.users u2 ON public.get_email_domain(u1.email) = public.get_email_domain(u2.email)
          WHERE u1.id = auth.uid()
            AND u2.id = vp.user_id
        )
        AND EXISTS (
          SELECT 1 FROM public.nda_templates nt2
          WHERE nt2.vault_id = vp.vault_id
            AND EXISTS (
              SELECT 1 FROM public.user_roles ur
              WHERE ur.user_id = auth.uid() AND ur.role = nt2.role_type
            )
        )
      )
    )
  );
