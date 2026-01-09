-- Final fix for client-side document updates
-- This ensures users with can_edit permission can update documents via DELETE + INSERT
-- Using nested EXISTS pattern to avoid ambiguous column references

-- 1. Ensure INSERT policy allows users with can_edit to upload/replace documents
-- Note: WITH CHECK is evaluated for INSERT operations, including upsert
DROP POLICY IF EXISTS "Users can upload documents to accessible vaults" ON storage.objects;

CREATE POLICY "Users can upload documents to accessible vaults"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'documents'
    AND (
      -- Admins can upload all
      public.has_role(auth.uid(), 'admin')
      -- Users can upload to their own paths (path contains their user_id)
      OR auth.uid()::text = (storage.foldername(name))[1]
      -- Vault creators can upload/replace documents in their vaults
      OR EXISTS (
        SELECT 1 FROM public.vaults v
        WHERE EXISTS (
          SELECT 1 FROM public.documents d
          WHERE d.vault_id = v.id
            AND d.file_path = name
        )
        AND v.created_by = auth.uid()
      )
      -- Vault clients can upload/replace documents in their vaults
      OR EXISTS (
        SELECT 1 FROM public.vaults v
        WHERE EXISTS (
          SELECT 1 FROM public.documents d
          WHERE d.vault_id = v.id
            AND d.file_path = name
        )
        AND v.client_id = auth.uid()
      )
      -- Users with edit permission via vault_permissions can upload/replace documents they can edit
      OR EXISTS (
        SELECT 1 FROM public.vault_permissions vp
        WHERE EXISTS (
          SELECT 1 FROM public.documents d
          WHERE d.vault_id = vp.vault_id
            AND d.file_path = name
        )
        AND vp.user_id = auth.uid()
        AND vp.can_edit = true
      )
    )
  );

-- 2. Ensure DELETE policy allows users with can_edit to delete documents (needed for updates)
DROP POLICY IF EXISTS "Users can delete documents they have access to" ON storage.objects;
DROP POLICY IF EXISTS "Admins can delete documents" ON storage.objects;

CREATE POLICY "Users can delete documents they have access to"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'documents'
    AND (
      -- Admins can delete all
      public.has_role(auth.uid(), 'admin')
      -- Vault creators and clients can delete documents in their vaults
      OR EXISTS (
        SELECT 1 FROM public.vaults v
        WHERE EXISTS (
          SELECT 1 FROM public.documents d
          WHERE d.vault_id = v.id
            AND d.file_path = name
        )
        AND (
          v.created_by = auth.uid()
          OR v.client_id = auth.uid()
        )
      )
      -- Users with edit or delete permission via vault_permissions can delete documents
      OR EXISTS (
        SELECT 1 FROM public.vault_permissions vp
        WHERE EXISTS (
          SELECT 1 FROM public.documents d
          WHERE d.vault_id = vp.vault_id
            AND d.file_path = name
        )
        AND vp.user_id = auth.uid()
        AND (
          vp.can_edit = true
          OR vp.can_delete = true
        )
      )
    )
  );

