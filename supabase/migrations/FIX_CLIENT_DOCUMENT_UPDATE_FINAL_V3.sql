-- Final fix for client-side document updates - VERSION 3
-- CRITICAL FIX: PostgreSQL was resolving 'name' as 'd.name' instead of storage.objects.name
-- The issue: When we use JOIN with documents table (which has a 'name' column), PostgreSQL
-- resolves unqualified 'name' to 'd.name' instead of the outer scope 'name' (storage.objects.name).
-- 
-- Solution: Use nested EXISTS without JOINs to avoid the ambiguity, and ensure 'name' 
-- refers to the outer scope by using it directly in the WHERE clause of the inner EXISTS.

-- 1. Fix INSERT policy - Use nested EXISTS to avoid name column ambiguity
DROP POLICY IF EXISTS "Users can upload documents to accessible vaults" ON storage.objects;

CREATE POLICY "Users can upload documents to accessible vaults"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'documents'
    AND (
      public.has_role(auth.uid(), 'admin')
      OR auth.uid()::text = (storage.foldername(name))[1]
      -- Vault creators can upload/replace documents
      -- Note: 'name' here refers to storage.objects.name (the file path being inserted)
      -- We use nested EXISTS to avoid JOIN which causes name ambiguity
      OR EXISTS (
        SELECT 1 
        FROM public.vaults v
        WHERE v.created_by = auth.uid()
          AND EXISTS (
            -- Inner query: check if document exists with matching file_path
            -- The 'name' in the comparison refers to the outer scope (storage.objects.name)
            SELECT 1 
            FROM public.documents doc
            WHERE doc.vault_id = v.id 
              AND doc.file_path = name  -- This should reference outer scope name
          )
      )
      -- Vault clients can upload/replace documents  
      OR EXISTS (
        SELECT 1 
        FROM public.vaults v
        WHERE v.client_id = auth.uid()
          AND EXISTS (
            SELECT 1 
            FROM public.documents doc
            WHERE doc.vault_id = v.id 
              AND doc.file_path = name
          )
      )
      -- Users with edit permission can upload/replace documents
      OR EXISTS (
        SELECT 1 
        FROM public.vault_permissions vp
        WHERE vp.user_id = auth.uid()
          AND vp.can_edit = true
          AND EXISTS (
            SELECT 1 
            FROM public.documents doc
            WHERE doc.vault_id = vp.vault_id 
              AND doc.file_path = name
          )
      )
    )
  );

-- 2. Fix DELETE policy - Same nested EXISTS pattern
DROP POLICY IF EXISTS "Users can delete documents they have access to" ON storage.objects;
DROP POLICY IF EXISTS "Admins can delete documents" ON storage.objects;

CREATE POLICY "Users can delete documents they have access to"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'documents'
    AND (
      public.has_role(auth.uid(), 'admin')
      -- Vault creators and clients can delete documents
      OR EXISTS (
        SELECT 1 
        FROM public.vaults v
        WHERE (v.created_by = auth.uid() OR v.client_id = auth.uid())
          AND EXISTS (
            SELECT 1 
            FROM public.documents doc
            WHERE doc.vault_id = v.id 
              AND doc.file_path = name
          )
      )
      -- Users with edit or delete permission can delete documents
      OR EXISTS (
        SELECT 1 
        FROM public.vault_permissions vp
        WHERE vp.user_id = auth.uid()
          AND (vp.can_edit = true OR vp.can_delete = true)
          AND EXISTS (
            SELECT 1 
            FROM public.documents doc
            WHERE doc.vault_id = vp.vault_id 
              AND doc.file_path = name
          )
      )
    )
  );

