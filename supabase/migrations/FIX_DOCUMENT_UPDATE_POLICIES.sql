-- Fix RLS policies to allow document updates (for editing Word documents)
-- This adds missing policies for storage UPDATE and ensures document UPDATE includes vault creators

-- 1. Drop existing documents UPDATE policy
DROP POLICY IF EXISTS "Users with edit access can update documents" ON public.documents;

-- 2. Recreate documents UPDATE policy to include:
--    - Admins
--    - Document uploader (uploaded_by) - users who uploaded can edit their own documents
--    - Vault creators (created_by)
--    - Clients assigned to vault (client_id)
--    - Users with can_edit permission
CREATE POLICY "Users with edit access can update documents"
  ON public.documents FOR UPDATE
  USING (
    public.has_role(auth.uid(), 'admin')
    OR documents.uploaded_by = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.vaults
      WHERE id = documents.vault_id
        AND (
          created_by = auth.uid()
          OR client_id = auth.uid()
        )
    )
    OR EXISTS (
      SELECT 1 FROM public.vault_permissions
      WHERE vault_id = documents.vault_id
        AND user_id = auth.uid()
        AND can_edit = true
    )
  );

-- 3. Update storage INSERT policy to allow re-uploading existing files (for edits)
-- The current INSERT policy should already work, but we'll update it to be more explicit
-- Storage doesn't have UPDATE operations - updates are done via DELETE + INSERT

-- Make sure INSERT policy allows users to upload to existing paths when they have edit access
-- This is already handled by the existing INSERT policy that checks user_id in path
-- But we need to ensure users with edit access can upload to any path in their vault

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
