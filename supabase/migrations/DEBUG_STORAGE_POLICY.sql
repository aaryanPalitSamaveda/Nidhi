-- Diagnostic query to check file paths and permissions
-- Run this to verify the file path format and user permissions

-- 1. Check document file paths format
SELECT 
  d.id,
  d.name as doc_name,
  d.file_path,
  v.id as vault_id,
  v.name as vault_name,
  v.created_by,
  v.client_id
FROM public.documents d
JOIN public.vaults v ON v.id = d.vault_id
LIMIT 10;

-- 2. Check vault permissions for a specific user (replace with actual user_id)
-- SELECT 
--   vp.user_id,
--   vp.vault_id,
--   vp.can_edit,
--   vp.can_delete,
--   v.name as vault_name,
--   d.file_path
-- FROM public.vault_permissions vp
-- JOIN public.vaults v ON v.id = vp.vault_id
-- LEFT JOIN public.documents d ON d.vault_id = vp.vault_id
-- WHERE vp.user_id = 'e6330b27-095e-4816-89f7-3fd0e3a3d348'  -- Replace with actual user_id
-- LIMIT 20;

-- 3. Test if a specific file path exists in documents table
-- Replace with actual file path from error
-- SELECT * FROM public.documents 
-- WHERE file_path = 'defd77ec-520f-4516-95bc-fdc521575564/7137d1de-df9b-4f34-95fe-f115276e2d7b/1767816178451_BUSINESS_DASHBOARD_DATA_TEMPLATE.docx';



