-- Diagnostic query to verify client save permissions
-- Run this to check if policies are correctly applied

-- 1. Check what storage policies exist
SELECT 
  policyname,
  cmd,
  qual,
  with_check
FROM pg_policies 
WHERE schemaname = 'storage' 
  AND tablename = 'objects'
  AND policyname IN ('Users can upload documents to accessible vaults', 'Users can delete documents they have access to')
ORDER BY policyname, cmd;

-- 2. Check if a specific user has can_edit permission
-- Replace USER_ID with the actual user ID trying to save
-- Replace VAULT_ID with the vault ID
-- Replace FILE_PATH with the document file_path
/*
SELECT 
  vp.user_id,
  vp.vault_id,
  vp.can_edit,
  vp.can_delete,
  d.id as document_id,
  d.file_path,
  d.name as document_name,
  v.id as vault_id,
  v.client_id,
  v.created_by
FROM public.vault_permissions vp
JOIN public.vaults v ON v.id = vp.vault_id
LEFT JOIN public.documents d ON d.vault_id = vp.vault_id
WHERE vp.user_id = 'USER_ID_HERE'::uuid
  AND d.file_path = 'FILE_PATH_HERE'
LIMIT 10;
*/

-- 3. Check all documents in a vault to see file_paths
/*
SELECT 
  d.id,
  d.name,
  d.file_path,
  d.vault_id,
  v.client_id,
  v.created_by
FROM public.documents d
JOIN public.vaults v ON v.id = d.vault_id
WHERE v.id = 'VAULT_ID_HERE'::uuid
LIMIT 20;
*/


