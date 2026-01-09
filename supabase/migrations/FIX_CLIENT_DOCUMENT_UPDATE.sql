-- Fix storage INSERT and DELETE policies to allow clients with edit permission to update documents
-- This ensures clients can save edited documents (which uses DELETE + INSERT pattern)

-- 1. Fix INSERT policy
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
        SELECT 1 
        FROM public.vaults v
        WHERE v.created_by = auth.uid()
          AND EXISTS (
            SELECT 1 FROM public.documents d
            WHERE d.vault_id = v.id
              AND d.file_path = name
          )
      )
      -- Vault clients can upload/replace documents in their vaults
      OR EXISTS (
        SELECT 1 
        FROM public.vaults v
        WHERE v.client_id = auth.uid()
          AND EXISTS (
            SELECT 1 FROM public.documents d
            WHERE d.vault_id = v.id
              AND d.file_path = name
          )
      )
      -- Users with edit permission can upload/replace documents they can edit
      OR EXISTS (
        SELECT 1 
        FROM public.vault_permissions vp
        WHERE vp.user_id = auth.uid()
          AND vp.can_edit = true
          AND EXISTS (
            SELECT 1 FROM public.documents d
            WHERE d.vault_id = vp.vault_id
              AND d.file_path = name
          )
      )
    )
  );

-- 2. Fix DELETE policy - CRITICAL: Users with can_edit need to DELETE before INSERT for updates
DROP POLICY IF EXISTS "Users can delete documents they have access to" ON storage.objects;

CREATE POLICY "Users can delete documents they have access to"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'documents'
    AND (
      -- Admins can delete all
      public.has_role(auth.uid(), 'admin')
      -- Vault creators can delete documents in their vaults
      OR EXISTS (
        SELECT 1 
        FROM public.vaults v
        WHERE v.created_by = auth.uid()
          AND EXISTS (
            SELECT 1 FROM public.documents d
            WHERE d.vault_id = v.id
              AND d.file_path = name
          )
      )
      -- Vault clients can delete documents in their vaults
      OR EXISTS (
        SELECT 1 
        FROM public.vaults v
        WHERE v.client_id = auth.uid()
          AND EXISTS (
            SELECT 1 FROM public.documents d
            WHERE d.vault_id = v.id
              AND d.file_path = name
          )
      )
      -- Users with edit permission can delete documents they can edit (needed for updates)
      OR EXISTS (
        SELECT 1 
        FROM public.vault_permissions vp
        WHERE vp.user_id = auth.uid()
          AND vp.can_edit = true
          AND EXISTS (
            SELECT 1 FROM public.documents d
            WHERE d.vault_id = vp.vault_id
              AND d.file_path = name
          )
      )
      -- Users with delete permission can delete documents
      OR EXISTS (
        SELECT 1 
        FROM public.vault_permissions vp
        WHERE vp.user_id = auth.uid()
          AND vp.can_delete = true
          AND EXISTS (
            SELECT 1 FROM public.documents d
            WHERE d.vault_id = vp.vault_id
              AND d.file_path = name
          )
      )
    )
  );

