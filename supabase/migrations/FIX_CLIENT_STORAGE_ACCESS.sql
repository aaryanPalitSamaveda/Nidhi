-- Fix storage policies to allow clients to download/view documents
-- This ensures clients assigned to vaults via vault_permissions can access documents

-- Drop existing storage view policy
DROP POLICY IF EXISTS "Users can view documents they have access to" ON storage.objects;

-- Recreate storage view policy with proper client access
CREATE POLICY "Users can view documents they have access to"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'documents'
    AND (
      -- Admins can view all
      public.has_role(auth.uid(), 'admin')
      -- Vault creators can view documents in their vaults
      OR EXISTS (
        SELECT 1 
        FROM public.vaults v
        JOIN public.documents d ON d.vault_id = v.id
        WHERE d.file_path = storage.objects.name
          AND v.created_by = auth.uid()
      )
      -- Vault clients (client_id) can view documents
      OR EXISTS (
        SELECT 1 
        FROM public.vaults v
        JOIN public.documents d ON d.vault_id = v.id
        WHERE d.file_path = storage.objects.name
          AND v.client_id = auth.uid()
      )
      -- Users with vault_permissions and can_view = true
      OR EXISTS (
        SELECT 1 
        FROM public.vault_permissions vp
        JOIN public.documents d ON d.vault_id = vp.vault_id
        WHERE d.file_path = storage.objects.name
          AND vp.user_id = auth.uid()
          AND vp.can_view = true
      )
    )
  );



