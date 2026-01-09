-- Diagnostic queries to check why client save is failing
-- Run these queries to verify permissions and document paths

-- 1. Check if the user has can_edit permission for the vault
-- Replace USER_ID and VAULT_ID with actual values from browser console
/*
SELECT 
  vp.id,
  vp.user_id,
  vp.vault_id,
  vp.can_view,
  vp.can_edit,
  vp.can_upload,
  vp.can_delete,
  v.name as vault_name,
  d.id as document_id,
  d.name as document_name,
  d.file_path
FROM public.vault_permissions vp
JOIN public.vaults v ON v.id = vp.vault_id
LEFT JOIN public.documents d ON d.vault_id = vp.vault_id
WHERE vp.user_id = 'e6330b27-095e-4816-89f7-3fd0e3a3d348'::uuid  -- Replace with actual user_id
  AND vp.can_edit = true
LIMIT 20;
*/

-- 2. Check documents in a specific vault to see file_paths
/*
SELECT 
  d.id,
  d.name,
  d.file_path,
  d.vault_id,
  v.name as vault_name,
  v.client_id,
  v.created_by
FROM public.documents d
JOIN public.vaults v ON v.id = d.vault_id
WHERE v.id = '7137d1de-df9b-4f34-95fe-f115276e2d7b'::uuid  -- Replace with actual vault_id
ORDER BY d.created_at DESC
LIMIT 20;
*/

-- 3. Test if a specific file_path exists and user has permission
-- Replace USER_ID, VAULT_ID, and FILE_PATH with actual values
/*
SELECT 
  CASE 
    WHEN EXISTS (
      SELECT 1 FROM public.vault_permissions vp
      WHERE vp.user_id = 'e6330b27-095e-4816-89f7-3fd0e3a3d348'::uuid  -- Replace with user_id
        AND vp.vault_id = '7137d1de-df9b-4f34-95fe-f115276e2d7b'::uuid  -- Replace with vault_id
        AND vp.can_edit = true
    ) THEN 'User HAS can_edit permission'
    ELSE 'User DOES NOT have can_edit permission'
  END as edit_permission_status,
  CASE 
    WHEN EXISTS (
      SELECT 1 FROM public.documents d
      WHERE d.vault_id = '7137d1de-df9b-4f34-95fe-f115276e2d7b'::uuid  -- Replace with vault_id
        AND d.file_path = 'defd77ec-520f-4516-95bc-fdc521575564/7137d1de-df9b-4f34-95fe-f115276e2d7b/1767816178451_BUSINESS_DASHBOARD_DATA_TEMPLATE.docx'  -- Replace with file_path
    ) THEN 'Document EXISTS in database'
    ELSE 'Document DOES NOT exist in database'
  END as document_exists_status;
*/

-- 4. Check all current storage policies
SELECT 
  policyname,
  cmd as operation,
  CASE 
    WHEN qual IS NOT NULL THEN substring(qual, 1, 200)
    ELSE NULL
  END as using_clause_preview,
  CASE 
    WHEN with_check IS NOT NULL THEN substring(with_check, 1, 200)
    ELSE NULL
  END as with_check_preview
FROM pg_policies 
WHERE schemaname = 'storage' 
  AND tablename = 'objects'
ORDER BY policyname, cmd;


