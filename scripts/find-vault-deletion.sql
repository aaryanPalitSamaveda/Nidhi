-- =============================================================================
-- Find who deleted the "D2C apparels" dataroom
-- Run this in Supabase Dashboard → SQL Editor
-- =============================================================================

-- 1. Check activity_logs for any "delete" action on vaults
-- Note: activity_logs.vault_id has ON DELETE CASCADE, so when a vault is deleted,
-- all activity_logs rows for that vault are also deleted. This query may return
-- nothing if the vault was already deleted.
SELECT 
  al.id,
  al.user_id,
  p.email AS deleted_by_email,
  p.full_name AS deleted_by_name,
  al.vault_id,
  al.action,
  al.resource_type,
  al.resource_name,
  al.created_at
FROM public.activity_logs al
LEFT JOIN public.profiles p ON p.id = al.user_id
WHERE al.resource_type = 'vault' 
  AND al.action = 'delete'
ORDER BY al.created_at DESC
LIMIT 20;

-- 2. Check if "D2C" appears in any remaining activity (view/edit before delete)
SELECT 
  al.id,
  al.user_id,
  p.email AS user_email,
  p.full_name AS user_name,
  al.vault_id,
  al.action,
  al.resource_type,
  al.resource_name,
  al.created_at
FROM public.activity_logs al
LEFT JOIN public.profiles p ON p.id = al.user_id
WHERE al.resource_name ILIKE '%D2C%' 
   OR al.resource_name ILIKE '%d2c apparels%'
ORDER BY al.created_at DESC
LIMIT 50;

-- 3. List all admins (only admins can delete vaults)
SELECT p.id, p.email, p.full_name, ur.role
FROM public.profiles p
JOIN public.user_roles ur ON ur.user_id = p.id
WHERE ur.role = 'admin'
ORDER BY p.email;

-- =============================================================================
-- 4. CHECK STORAGE: Is D2C apparels data still in storage?
-- Storage path format: vault_id/folder_id/filename
-- When a vault is deleted, documents rows are CASCADE deleted but storage blobs
-- may remain as orphans. This finds orphaned storage (vault_ids no longer in vaults).
-- =============================================================================

-- 4a. All storage objects in documents bucket (first 100)
SELECT 
  name AS file_path,
  created_at,
  (metadata->>'size')::bigint AS size_bytes
FROM storage.objects
WHERE bucket_id = 'documents'
ORDER BY created_at DESC
LIMIT 100;

-- 4b. Orphaned storage: files whose vault_id (1st path segment) no longer exists
-- These are leftovers from deleted vaults (possibly including D2C apparels)
SELECT 
  split_part(name, '/', 1) AS vault_id,
  COUNT(*) AS file_count,
  MIN(created_at) AS oldest,
  MAX(created_at) AS newest
FROM storage.objects
WHERE bucket_id = 'documents'
  AND split_part(name, '/', 1) NOT IN (SELECT id::text FROM public.vaults)
GROUP BY split_part(name, '/', 1)
ORDER BY file_count DESC;

-- 4c. D2C APPARELS: Find which orphaned path contains D2C files (anchors deletion timestamp)
-- Path format can be user_id/vault_id/file OR vault_id/folder_id/file
-- D2C vault candidates: 82ff4eac... (under Zubair), 32b24407... (under Prachi)
SELECT 
  split_part(name, '/', 1) AS path_segment_1,
  split_part(name, '/', 2) AS path_segment_2,
  split_part(name, '/', 3) AS filename,
  created_at
FROM storage.objects
WHERE bucket_id = 'documents'
  AND (name ILIKE '%d2c%' OR name ILIKE '%apparels%' OR name ILIKE '%intimate%')
ORDER BY created_at DESC
LIMIT 50;

-- 4d. Files under Prachi's path for vault 32b24407 (D2C Women Intimate Wear - 935 files)
-- SELECT name, created_at FROM storage.objects 
-- WHERE bucket_id = 'documents' AND name LIKE '253c6423-a5ce-41b9-bfbd-d986bce30801/32b24407-cace-495b-a378-1127ab134e6d/%' LIMIT 20;

-- 4e. Files under Zubair's path for vault 82ff4eac (D2C Intimate Wear - 8 files)
-- SELECT name, created_at FROM storage.objects 
-- WHERE bucket_id = 'documents' AND name LIKE 'e78c2ba1-bc0d-40b5-a8c0-939e3354b95c/82ff4eac-3bd5-4300-9d6d-b62ebcf8312a/%';

-- =============================================================================
-- 5. ADMIN USER IDs (for matching JWT 'sub' from Supabase API logs)
-- When you find a DELETE request in Logs → API, decode the Bearer token at jwt.io
-- The 'sub' field = user_id. Match to email below:
-- =============================================================================
-- 071da279-4a60-432a-8bb2-9b6573516d09  → aaryan@samavedacapital.com
-- 253c6423-a5ce-41b9-bfbd-d986bce30801  → prachi@samavedacapital.com
-- 06938a8a-11bf-4dea-a51a-c851583b9717  → pratyaksh@samavedacapital.com
-- c7af71c4-f590-4d29-b960-7308e2cfdd2b  → sahithi@samavedacapital.com
-- 976660a4-8042-4467-ae76-0a8d514e45f5  → srinal@samavedacapital.com
-- 78d06663-2791-4973-b4fe-e861cf7795a5  → sumitra@samavedacapital.com
-- 882bdc9c-20cc-4a18-b765-93a4e9b2061e  → vineeth@samavedacapital.com
-- e78c2ba1-bc0d-40b5-a8c0-939e3354b95c  → zubair@samavedacapital.com
