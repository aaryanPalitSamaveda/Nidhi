-- Verify that the document file_path matches what's being uploaded
-- This will help identify if there's a file_path mismatch

-- Check all documents in the vault and their file_paths
SELECT 
  d.id,
  d.name as document_name,
  d.file_path,
  d.vault_id,
  v.name as vault_name,
  v.client_id,
  v.created_by,
  CASE 
    WHEN d.file_path = 'defd77ec-520f-4516-95bc-fdc521575564/7137d1de-df9b-4f34-95fe-f115276e2d7b/1767816178451_BUSINESS_DASHBOARD_DATA_TEMPLATE.docx' 
    THEN 'MATCHES the file being uploaded'
    ELSE 'Different file_path'
  END as path_match
FROM public.documents d
JOIN public.vaults v ON v.id = d.vault_id
WHERE d.vault_id = '7137d1de-df9b-4f34-95fe-f115276e2d7b'::uuid
ORDER BY d.created_at DESC;

-- Test the exact policy logic manually - check if user is client_id
SELECT 
  'Client ID Check' as test,
  CASE 
    WHEN EXISTS (
      SELECT 1 FROM public.vaults v
      WHERE EXISTS (
        SELECT 1 FROM public.documents d
        WHERE d.vault_id = v.id
          AND d.file_path = 'defd77ec-520f-4516-95bc-fdc521575564/7137d1de-df9b-4f34-95fe-f115276e2d7b/1767816178451_BUSINESS_DASHBOARD_DATA_TEMPLATE.docx'
      )
      AND v.client_id = 'e6330b27-095e-4816-89f7-3fd0e3a3d348'::uuid
    ) THEN 'YES - User is client_id, should be able to upload'
    ELSE 'NO - User is NOT client_id'
  END as result;

-- Test the exact policy logic manually - check vault_permissions
SELECT 
  'Vault Permissions Check' as test,
  CASE 
    WHEN EXISTS (
      SELECT 1 FROM public.vault_permissions vp
      WHERE EXISTS (
        SELECT 1 FROM public.documents d
        WHERE d.vault_id = vp.vault_id
          AND d.file_path = 'defd77ec-520f-4516-95bc-fdc521575564/7137d1de-df9b-4f34-95fe-f115276e2d7b/1767816178451_BUSINESS_DASHBOARD_DATA_TEMPLATE.docx'
      )
      AND vp.user_id = 'e6330b27-095e-4816-89f7-3fd0e3a3d348'::uuid
      AND vp.can_edit = true
    ) THEN 'YES - User has can_edit via vault_permissions, should be able to upload'
    ELSE 'NO - Policy check would FAIL'
  END as result;

