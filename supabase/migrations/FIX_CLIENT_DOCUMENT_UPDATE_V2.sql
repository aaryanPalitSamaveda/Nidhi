-- Fix storage INSERT and DELETE policies to allow clients with edit permission to update documents
-- Using EXACT pattern from FIX_DOCUMENT_UPDATE_POLICIES.sql that worked for admin

-- 1. Fix INSERT policy - Allow uploads if user has edit permission on the vault
DROP POLICY IF EXISTS "Users can upload documents to accessible vaults" ON storage.objects;

CREATE POLICY "Users can upload documents to accessible vaults"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'documents'
    AND (
      public.has_role(auth.uid(), 'admin')
      OR auth.uid()::text = (storage.foldername(name))[1]
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

-- 2. Fix DELETE policy - Allow deletes if user has edit permission on the vault
-- This is CRITICAL for document updates (DELETE + INSERT pattern)
DROP POLICY IF EXISTS "Users can delete documents they have access to" ON storage.objects;
DROP POLICY IF EXISTS "Admins can delete documents" ON storage.objects;

CREATE POLICY "Users can delete documents they have access to"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'documents'
    AND (
      public.has_role(auth.uid(), 'admin')
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

