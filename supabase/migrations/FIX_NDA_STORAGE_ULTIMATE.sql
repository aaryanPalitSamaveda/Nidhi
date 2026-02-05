-- Ultimate fix - completely isolate name reference to avoid any ambiguity
-- This uses a two-step approach: first check file path, then check permissions

-- Drop existing storage view policy
DROP POLICY IF EXISTS "Users can view documents they have access to" ON storage.objects;

-- Create storage view policy with isolated name reference
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
      
      -- NDA templates: Use exact nested EXISTS pattern from FIX_VAULT_PERMISSIONS.sql
      -- name is used in innermost EXISTS with only nda_templates (no JOINs = no ambiguity)
      -- Check both file_path match AND role match in the same nested EXISTS
      OR EXISTS (
        SELECT 1 FROM public.vault_permissions vp
        WHERE EXISTS (
          SELECT 1 FROM public.nda_templates nt
          WHERE nt.vault_id = vp.vault_id
            AND nt.file_path = name
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

