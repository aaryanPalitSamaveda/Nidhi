-- Test the exact policy logic manually
-- This simulates what happens when user e6330b27-095e-4816-89f7-3fd0e3a3d348 tries to INSERT
-- the file_path 'defd77ec-520f-4516-95bc-fdc521575564/7137d1de-df9b-4f34-95fe-f115276e2d7b/1767816178451_BUSINESS_DASHBOARD_DATA_TEMPLATE.docx'

-- Test 1: Check if user is client_id (should be TRUE)
SELECT 
  'Test 1: User is client_id' as test,
  CASE 
    WHEN EXISTS (
      SELECT 1 FROM public.vaults v
      WHERE EXISTS (
        SELECT 1 FROM public.documents d
        WHERE d.vault_id = v.id
          AND d.file_path = 'defd77ec-520f-4516-95bc-fdc521575564/7137d1de-df9b-4f34-95fe-f115276e2d7b/1767816178451_BUSINESS_DASHBOARD_DATA_TEMPLATE.docx'
      )
      AND v.client_id = 'e6330b27-095e-4816-89f7-3fd0e3a3d348'::uuid
    ) THEN 'PASS - User IS client_id'
    ELSE 'FAIL - User is NOT client_id'
  END as result;

-- Test 2: Check if user has can_edit via vault_permissions (should be TRUE)
SELECT 
  'Test 2: User has can_edit permission' as test,
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
    ) THEN 'PASS - User HAS can_edit'
    ELSE 'FAIL - User does NOT have can_edit'
  END as result;



