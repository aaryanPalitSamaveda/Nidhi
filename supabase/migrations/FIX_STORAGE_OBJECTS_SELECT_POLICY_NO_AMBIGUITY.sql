-- Fix Storage SELECT policy for documents bucket (NO AMBIGUITY)
-- Symptom: non-owner users with can_view=true get StorageUnknownError {} when downloading files
-- Root cause (common): storage.objects SELECT policy references `name` unqualified inside joins/subqueries,
-- causing ambiguity with `vaults.name` / `documents.name`, or evaluating against the wrong column.
--
-- This policy:
-- - Always uses storage.objects.name explicitly
-- - Allows access to regular documents when user is:
--   - admin OR vault client OR has vault_permissions.can_view = true
-- - Allows access to NDA templates when user:
--   - has_vault_access AND get_user_role_for_vault(...) matches nda_templates.role_type
--
-- Run in Supabase SQL Editor (recommended), or include as migration when provisioning a new project.

-- Drop existing policy (safe)
DROP POLICY IF EXISTS "Users can view documents they have access to" ON storage.objects;

-- Recreate policy
CREATE POLICY "Users can view documents they have access to"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'documents'
    AND (
      -- Admins can view everything
      public.has_role(auth.uid(), 'admin')

      -- Regular documents: Vault client (client_id) can view
      OR EXISTS (
        SELECT 1
        FROM public.documents d
        JOIN public.vaults v ON v.id = d.vault_id
        WHERE d.file_path = storage.objects.name
          AND v.client_id = auth.uid()
      )

      -- Regular documents: Users with explicit vault_permissions can view
      OR EXISTS (
        SELECT 1
        FROM public.documents d
        JOIN public.vault_permissions vp ON vp.vault_id = d.vault_id
        WHERE d.file_path = storage.objects.name
          AND vp.user_id = auth.uid()
          AND vp.can_view = true
      )

      -- NDA templates: users can view the NDA template for their (possibly inherited) role
      OR EXISTS (
        SELECT 1
        FROM public.nda_templates nt
        WHERE nt.file_path = storage.objects.name
          AND public.has_vault_access(auth.uid(), nt.vault_id)
          AND public.get_user_role_for_vault(auth.uid(), nt.vault_id) = nt.role_type
      )
    )
  );

