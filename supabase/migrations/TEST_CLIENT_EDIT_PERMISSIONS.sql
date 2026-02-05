-- Test query to check if a specific user has edit permissions for a document
-- Replace 'YOUR_USER_ID' and 'YOUR_DOCUMENT_ID' with actual values
-- This helps debug permission issues

-- Check if user has edit permission via vault_permissions
SELECT 
  vp.user_id,
  vp.vault_id,
  vp.can_edit,
  d.id as document_id,
  d.file_path,
  d.vault_id as doc_vault_id,
  v.name as vault_name,
  v.client_id,
  v.created_by
FROM vault_permissions vp
JOIN documents d ON d.vault_id = vp.vault_id
JOIN vaults v ON v.id = vp.vault_id
WHERE vp.user_id = auth.uid()  -- Use current user
  AND vp.can_edit = true
  AND d.id = 'YOUR_DOCUMENT_ID';  -- Replace with actual document ID

-- Check if user is vault client
SELECT 
  v.id as vault_id,
  v.name as vault_name,
  v.client_id,
  d.id as document_id,
  d.file_path
FROM vaults v
JOIN documents d ON d.vault_id = v.id
WHERE v.client_id = auth.uid()
  AND d.id = 'YOUR_DOCUMENT_ID';  -- Replace with actual document ID

-- Check if user is vault creator
SELECT 
  v.id as vault_id,
  v.name as vault_name,
  v.created_by,
  d.id as document_id,
  d.file_path
FROM vaults v
JOIN documents d ON d.vault_id = v.id
WHERE v.created_by = auth.uid()
  AND d.id = 'YOUR_DOCUMENT_ID';  -- Replace with actual document ID



