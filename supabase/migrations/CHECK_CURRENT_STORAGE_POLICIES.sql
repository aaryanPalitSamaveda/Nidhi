-- Check what storage policies are currently active
-- This will help verify if the policy was applied correctly

SELECT 
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd as operation,
  qual as using_clause,
  with_check as with_check_clause
FROM pg_policies 
WHERE schemaname = 'storage' 
  AND tablename = 'objects'
  AND policyname = 'Users can upload documents to accessible vaults'
ORDER BY policyname, cmd;



