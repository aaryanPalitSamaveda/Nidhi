-- Test query to verify INSERT permission would work
-- Replace the values with actual data from your browser console

-- Test if a client user with can_edit can INSERT a file
-- This simulates what the RLS policy checks

-- Replace these values:
-- USER_ID: The client user ID trying to save (from browser console, e.g., 'e6330b27-095e-4816-89f7-3fd0e3a3d348')
-- FILE_PATH: The document file_path (from browser console, e.g., 'defd77ec-520f-4516-95bc-fdc521575564/7137d1de-df9b-4f34-95fe-f115276e2d7b/1767816178451_BUSINESS_DASHBOARD_DATA_TEMPLATE.docx')
-- VAULT_ID: The vault ID (from browser console, e.g., '7137d1de-df9b-4f34-95fe-f115276e2d7b')

/*
-- Step 1: Check if user has can_edit permission
SELECT 
  'Permission Check' as check_type,
  CASE 
    WHEN EXISTS (
      SELECT 1 FROM public.vault_permissions vp
      WHERE vp.user_id = 'USER_ID_HERE'::uuid  -- Replace with actual user_id
        AND vp.vault_id = 'VAULT_ID_HERE'::uuid  -- Replace with actual vault_id
        AND vp.can_edit = true
    ) THEN 'YES - User has can_edit permission'
    ELSE 'NO - User does NOT have can_edit permission'
  END as result;

-- Step 2: Check if document exists with this file_path
SELECT 
  'Document Exists Check' as check_type,
  CASE 
    WHEN EXISTS (
      SELECT 1 FROM public.documents d
      WHERE d.file_path = 'FILE_PATH_HERE'  -- Replace with actual file_path
        AND d.vault_id = 'VAULT_ID_HERE'::uuid  -- Replace with actual vault_id
    ) THEN 'YES - Document exists in database'
    ELSE 'NO - Document does NOT exist in database'
  END as result;

-- Step 3: Combined check (what the policy does)
SELECT 
  'Policy Logic Check' as check_type,
  CASE 
    WHEN EXISTS (
      SELECT 1 FROM public.vault_permissions vp
      WHERE EXISTS (
        SELECT 1 FROM public.documents d
        WHERE d.vault_id = vp.vault_id
          AND d.file_path = 'FILE_PATH_HERE'  -- Replace with actual file_path
      )
      AND vp.user_id = 'USER_ID_HERE'::uuid  -- Replace with actual user_id
      AND vp.can_edit = true
    ) THEN 'YES - Policy check would PASS'
    ELSE 'NO - Policy check would FAIL'
  END as result;
*/

-- Quick check: List all vault_permissions for a user
SELECT 
  vp.id,
  vp.user_id,
  vp.vault_id,
  v.name as vault_name,
  vp.can_view,
  vp.can_edit,
  vp.can_upload,
  vp.can_delete,
  COUNT(d.id) as document_count
FROM public.vault_permissions vp
JOIN public.vaults v ON v.id = vp.vault_id
LEFT JOIN public.documents d ON d.vault_id = vp.vault_id
WHERE vp.user_id = 'e6330b27-095e-4816-89f7-3fd0e3a3d348'::uuid  -- Replace with actual user_id
GROUP BY vp.id, vp.user_id, vp.vault_id, v.name, vp.can_view, vp.can_edit, vp.can_upload, vp.can_delete
ORDER BY vp.vault_id;

