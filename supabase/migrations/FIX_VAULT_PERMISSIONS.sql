-- Fix RLS policies to allow:
-- 1. Admins full access to all vaults
-- 2. Clients assigned to vaults (client_id) to have full access (upload/edit/delete)
-- Run this in Supabase SQL Editor

-- Drop existing policies
DROP POLICY IF EXISTS "Users with edit access can create folders" ON public.folders;
DROP POLICY IF EXISTS "Users with edit access can update folders" ON public.folders;
DROP POLICY IF EXISTS "Users with delete access can delete folders" ON public.folders;
DROP POLICY IF EXISTS "Users with upload access can create documents" ON public.documents;
DROP POLICY IF EXISTS "Users with edit access can update documents" ON public.documents;
DROP POLICY IF EXISTS "Users with delete access can delete documents" ON public.documents;

-- Folders policies - Admins + Clients (client_id) + Users with vault_permissions
CREATE POLICY "Users with edit access can create folders"
  ON public.folders FOR INSERT
  WITH CHECK (
    public.has_role(auth.uid(), 'admin')
    OR EXISTS (
      SELECT 1 FROM public.vaults
      WHERE id = folders.vault_id
        AND client_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM public.vault_permissions
      WHERE vault_id = folders.vault_id
        AND user_id = auth.uid()
        AND can_edit = true
    )
  );

CREATE POLICY "Users with edit access can update folders"
  ON public.folders FOR UPDATE
  USING (
    public.has_role(auth.uid(), 'admin')
    OR EXISTS (
      SELECT 1 FROM public.vaults
      WHERE id = folders.vault_id
        AND client_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM public.vault_permissions
      WHERE vault_id = folders.vault_id
        AND user_id = auth.uid()
        AND can_edit = true
    )
  );

CREATE POLICY "Users with delete access can delete folders"
  ON public.folders FOR DELETE
  USING (
    public.has_role(auth.uid(), 'admin')
    OR EXISTS (
      SELECT 1 FROM public.vaults
      WHERE id = folders.vault_id
        AND client_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM public.vault_permissions
      WHERE vault_id = folders.vault_id
        AND user_id = auth.uid()
        AND can_delete = true
    )
  );

-- Documents policies - Admins + Clients (client_id) + Users with vault_permissions
CREATE POLICY "Users with upload access can create documents"
  ON public.documents FOR INSERT
  WITH CHECK (
    public.has_role(auth.uid(), 'admin')
    OR EXISTS (
      SELECT 1 FROM public.vaults
      WHERE id = documents.vault_id
        AND client_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM public.vault_permissions
      WHERE vault_id = documents.vault_id
        AND user_id = auth.uid()
        AND can_upload = true
    )
  );

CREATE POLICY "Users with edit access can update documents"
  ON public.documents FOR UPDATE
  USING (
    public.has_role(auth.uid(), 'admin')
    OR EXISTS (
      SELECT 1 FROM public.vaults
      WHERE id = documents.vault_id
        AND client_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM public.vault_permissions
      WHERE vault_id = documents.vault_id
        AND user_id = auth.uid()
        AND can_edit = true
    )
  );

CREATE POLICY "Users with delete access can delete documents"
  ON public.documents FOR DELETE
  USING (
    public.has_role(auth.uid(), 'admin')
    OR EXISTS (
      SELECT 1 FROM public.vaults
      WHERE id = documents.vault_id
        AND client_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM public.vault_permissions
      WHERE vault_id = documents.vault_id
        AND user_id = auth.uid()
        AND can_delete = true
    )
  );

-- Update storage policies to allow clients to access their vault documents
DROP POLICY IF EXISTS "Users can view documents they have access to" ON storage.objects;
DROP POLICY IF EXISTS "Users can upload documents to accessible vaults" ON storage.objects;
DROP POLICY IF EXISTS "Admins can delete documents" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete documents they have access to" ON storage.objects;

-- Storage view policy - Admins + Clients (client_id) + Users with vault_permissions
CREATE POLICY "Users can view documents they have access to"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'documents'
    AND (
      public.has_role(auth.uid(), 'admin')
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
    )
  );

-- Storage upload policy - Admins + Clients + Users with upload permission
CREATE POLICY "Users can upload documents to accessible vaults"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'documents'
    AND (
      public.has_role(auth.uid(), 'admin')
      OR auth.uid()::text = (storage.foldername(name))[1]
    )
  );

-- Storage delete policy - Admins + Clients (client_id) + Users with delete permission
CREATE POLICY "Users can delete documents they have access to"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'documents'
    AND (
      public.has_role(auth.uid(), 'admin')
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
      OR EXISTS (
        SELECT 1 FROM public.vault_permissions vp
        WHERE EXISTS (
          SELECT 1 FROM public.documents d
          WHERE d.vault_id = vp.vault_id
            AND d.file_path = name
        )
        AND vp.user_id = auth.uid()
        AND vp.can_delete = true
      )
    )
  );

